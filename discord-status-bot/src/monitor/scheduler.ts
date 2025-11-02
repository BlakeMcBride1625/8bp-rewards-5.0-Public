import { Client, TextChannel } from "discord.js";
import { ServiceChecker } from "./checkService";
import { EmbedBuilder } from "./buildEmbed";
import { BotConfig } from "../utils/env";
import { ServiceCheckResult, StatusSummary, AlertData, DailyReportData, ServiceStatus } from "../types/service";
import { Logger } from "../utils/logger";
import { WebhookService } from "../utils/webhook";

export class Scheduler {
	private client: Client;
	private serviceChecker: ServiceChecker;
	private embedBuilder: EmbedBuilder;
	private webhookService?: WebhookService;
	private config: BotConfig;
	private logger: Logger;
	
	private checkInterval: NodeJS.Timeout | null = null;
	private dailyReportInterval: NodeJS.Timeout | null = null;
	private previousDailyMessageId: string | null = null;
	private lastServiceStates: Map<string, "online" | "slow" | "offline"> = new Map();
	private serviceDownTime: Map<string, Date> = new Map();

	constructor(client: Client, serviceChecker: ServiceChecker, embedBuilder: EmbedBuilder, config: BotConfig) {
		this.client = client;
		this.serviceChecker = serviceChecker;
		this.embedBuilder = embedBuilder;
		this.config = config;
		this.logger = Logger.getInstance();
		
		// Initialize webhook service if URL is provided
		if (config.webhookUrl) {
			this.webhookService = new WebhookService(config.webhookUrl);
			this.logger.info("Webhook service initialized");
		}
	}

	public start(): void {
		this.logger.info("Starting scheduler...");
		
		// Start service monitoring
		this.startServiceMonitoring();
		
		// Start daily reports
		this.startDailyReports();
		
		this.logger.info("Scheduler started successfully");
	}

	public stop(): void {
		this.logger.info("Stopping scheduler...");
		
		if (this.checkInterval) {
			clearInterval(this.checkInterval);
			this.checkInterval = null;
		}
		
		if (this.dailyReportInterval) {
			clearInterval(this.dailyReportInterval);
			this.dailyReportInterval = null;
		}
		
		this.logger.info("Scheduler stopped");
	}

	private startServiceMonitoring(): void {
		this.logger.info(`Starting service monitoring (interval: ${this.config.checkInterval / 1000}s)`);
		
		// Run initial check
		this.performServiceCheck();
		
		// Set up interval
		this.checkInterval = setInterval(() => {
			this.performServiceCheck();
		}, this.config.checkInterval);
	}

	private startDailyReports(): void {
		this.logger.info(`Starting status updates (interval: ${this.config.checkInterval / 1000 / 60} minutes)`);
		
		// Send first status update immediately
		this.sendDailyReport();
		
		// Then send updates every check interval (1 minute)
		this.dailyReportInterval = setInterval(() => {
			this.sendDailyReport();
		}, this.config.checkInterval);
	}

	private async performServiceCheck(): Promise<void> {
		try {
			this.logger.debug("Performing service check...");
			
			const results = await this.serviceChecker.checkAllServices(this.config.services);
			await this.processServiceResults(results);
			
		} catch (error) {
			this.logger.error("Error during service check:", error);
		}
	}

	private async processServiceResults(results: ServiceCheckResult[]): Promise<void> {
		const alerts: AlertData[] = [];
		
		for (const result of results) {
			const previousState = this.lastServiceStates.get(result.name);
			const currentState = result.status;
			
			// Update last known state
			this.lastServiceStates.set(result.name, currentState);
			
			// Check for state changes
			if (previousState && previousState !== currentState) {
				if (currentState === "offline") {
					// Service went down
					this.serviceDownTime.set(result.name, result.timestamp);
					const serviceStatus = this.convertToServiceStatus(result);
					alerts.push({
						type: "service_down",
						services: [serviceStatus],
						timestamp: result.timestamp,
						message: `Service ${result.name} is now offline`
					});
				} else if (previousState === "offline" && (currentState === "online" || currentState === "slow")) {
					// Service came back online
					const downTime = this.serviceDownTime.get(result.name);
					const duration = downTime ? this.formatDuration(result.timestamp.getTime() - downTime.getTime()) : "unknown";
					
					this.serviceDownTime.delete(result.name);
					
					if (this.config.notifyRestore) {
						const serviceStatus = this.convertToServiceStatus(result);
						alerts.push({
							type: "service_restored",
							services: [serviceStatus],
							timestamp: result.timestamp,
							message: `Service ${result.name} is back online (was down for ${duration})`
						});
					}
				}
			}
		}
		
		// Check for multiple services down
		const offlineServices = results.filter(r => r.status === "offline");
		if (offlineServices.length >= 3) {
			const serviceStatuses = offlineServices.map(r => this.convertToServiceStatus(r));
			alerts.push({
				type: "multiple_down",
				services: serviceStatuses,
				timestamp: new Date(),
				message: `Multiple services are offline (${offlineServices.length} services down)`
			});
		}
		
		// Send alerts
		for (const alert of alerts) {
			await this.sendAlert(alert);
		}
	}

	private async sendAlert(alert: AlertData): Promise<void> {
		try {
			const embed = this.embedBuilder.buildAlertEmbed(alert);
			
			if (this.webhookService) {
				await this.webhookService.sendEmbed(embed);
			} else {
				const channel = await this.getStatusChannel();
				if (!channel) return;
				await channel.send({ embeds: [embed] });
			}
			
			this.logger.alert(alert.type, alert.services.map(s => s.name));
			
		} catch (error) {
			this.logger.error("Failed to send alert:", error);
		}
	}

	private async sendDailyReport(): Promise<void> {
		try {
			this.logger.info("Sending status update...");
			
			// Get current service statuses
			const results = await this.serviceChecker.checkAllServices(this.config.services);
			const serviceStatuses = results.map(r => this.convertToServiceStatus(r));
			const summary = this.calculateSummary(results);
			
			const reportData: DailyReportData = {
				summary,
				services: serviceStatuses,
				timestamp: new Date(),
				previousMessageId: this.previousDailyMessageId || undefined
			};
			
			const embed = this.embedBuilder.buildDailyReportEmbed(reportData);
			
			// Always use Discord channel for message editing (webhooks can't edit)
			const channel = await this.getStatusChannel();
			if (!channel) return;
			
			if (this.previousDailyMessageId) {
				try {
					// Try to edit the existing message
					const previousMessage = await channel.messages.fetch(this.previousDailyMessageId);
					await previousMessage.edit({ embeds: [embed] });
					this.logger.info("Status update edited successfully");
				} catch (error) {
					this.logger.warn("Could not edit previous message, sending new one:", error);
					// If editing fails, send a new message
					const message = await channel.send({ embeds: [embed] });
					this.previousDailyMessageId = message.id;
					this.logger.info("Status update sent successfully (new message)");
				}
			} else {
				// Send new message
				const message = await channel.send({ embeds: [embed] });
				this.previousDailyMessageId = message.id;
				this.logger.info("Status update sent successfully");
			}
			
			this.logger.dailyReport({
				online: summary.online,
				slow: summary.slow,
				offline: summary.offline
			});
			
		} catch (error) {
			this.logger.error("Failed to send status update:", error);
		}
	}

	private calculateSummary(results: ServiceCheckResult[]): StatusSummary {
		const online = results.filter(r => r.status === "online").length;
		const slow = results.filter(r => r.status === "slow").length;
		const offline = results.filter(r => r.status === "offline").length;
		
		let overallStatus: "operational" | "partial" | "major_outage";
		if (offline === 0) {
			overallStatus = "operational";
		} else if (offline <= results.length * 0.3) {
			overallStatus = "partial";
		} else {
			overallStatus = "major_outage";
		}
		
		return {
			totalServices: results.length,
			online,
			slow,
			offline,
			overallStatus,
			lastChecked: new Date()
		};
	}

	private async getStatusChannel(): Promise<TextChannel | null> {
		try {
			const guild = await this.client.guilds.fetch(this.config.guildId);
			const channel = await guild.channels.fetch(this.config.statusChannelId);
			
			if (channel && channel.isTextBased()) {
				return channel as TextChannel;
			}
			
			this.logger.error("Status channel not found or not a text channel");
			return null;
			
		} catch (error) {
			this.logger.error("Failed to get status channel:", error);
			return null;
		}
	}

	private formatDuration(ms: number): string {
		const seconds = Math.floor(ms / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);
		
		if (days > 0) {
			return `${days}d ${hours % 24}h ${minutes % 60}m`;
		} else if (hours > 0) {
			return `${hours}h ${minutes % 60}m`;
		} else if (minutes > 0) {
			return `${minutes}m ${seconds % 60}s`;
		} else {
			return `${seconds}s`;
		}
	}

	private convertToServiceStatus(result: ServiceCheckResult): ServiceStatus {
		const uptimePercentage = this.serviceChecker.getUptimePercentage(result.name);
		const averageResponseTime = this.serviceChecker.getAverageResponseTime(result.name);
		const uptimeData = this.serviceChecker["uptimeData"].get(result.name);
		
		return {
			name: result.name,
			url: result.url,
			category: result.category,
			status: result.status,
			responseTime: result.responseTime,
			httpStatus: result.httpStatus,
			error: result.error,
			lastChecked: result.timestamp,
			uptimePercentage,
			averageResponseTime,
			totalChecks: uptimeData?.totalChecks || 0,
			successfulChecks: uptimeData?.successfulChecks || 0,
			lastFailure: result.status === "offline" ? result.timestamp : undefined,
			lastSuccess: result.status !== "offline" ? result.timestamp : undefined
		};
	}

	// Public methods for manual triggers
	public async triggerServiceCheck(): Promise<ServiceCheckResult[]> {
		this.logger.info("Manual service check triggered");
		return await this.serviceChecker.checkAllServices(this.config.services);
	}

	public async triggerDailyReport(): Promise<void> {
		this.logger.info("Manual daily report triggered");
		await this.sendDailyReport();
	}
}
