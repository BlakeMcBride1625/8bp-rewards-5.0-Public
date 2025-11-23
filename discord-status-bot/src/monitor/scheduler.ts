import { Client, TextChannel } from "discord.js";
import { ServiceChecker } from "./checkService";
import { EmbedBuilder } from "./buildEmbed";
import { BotConfig } from "../utils/env";
import { ServiceCheckResult, StatusSummary, DailyReportData, ServiceStatus } from "../types/service";
import { Logger } from "../utils/logger";

export class Scheduler {
	private client: Client;
	private serviceChecker: ServiceChecker;
	private embedBuilder: EmbedBuilder;
	private config: BotConfig;
	private logger: Logger;
	
	private checkInterval: NodeJS.Timeout | null = null;
	private dailyReportInterval: NodeJS.Timeout | null = null;
	private lastServiceStates: Map<string, "online" | "slow" | "offline"> = new Map();
	private serviceDownTime: Map<string, Date> = new Map();
	private statusMessageId: string | null = null; // Main status message ID

	constructor(client: Client, serviceChecker: ServiceChecker, embedBuilder: EmbedBuilder, config: BotConfig) {
		this.client = client;
		this.serviceChecker = serviceChecker;
		this.embedBuilder = embedBuilder;
		this.config = config;
		this.logger = Logger.getInstance();
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
		let hasStateChange = false;
		
		for (const result of results) {
			const previousState = this.lastServiceStates.get(result.name);
			const currentState = result.status;
			
			// Check for state changes
			if (previousState && previousState !== currentState) {
				hasStateChange = true;
				
				if (currentState === "offline") {
					// Service went down
					this.serviceDownTime.set(result.name, result.timestamp);
				} else if (previousState === "offline" && (currentState === "online" || currentState === "slow")) {
					// Service came back online
					this.serviceDownTime.delete(result.name);
				}
			}
			
			// Update last known state
			this.lastServiceStates.set(result.name, currentState);
		}
		
		// If there's a state change, update the main status message instead of sending alerts
		if (hasStateChange) {
			await this.updateStatusMessage(results);
		}
	}

	private async updateStatusMessage(results: ServiceCheckResult[]): Promise<void> {
		try {
			// Get current service statuses
			const serviceStatuses = results.map(r => this.convertToServiceStatus(r));
			const summary = this.calculateSummary(results);
			
			const reportData: DailyReportData = {
				summary,
				services: serviceStatuses,
				timestamp: new Date(),
				previousMessageId: this.statusMessageId || undefined
			};
			
			const embed = this.embedBuilder.buildDailyReportEmbed(reportData);
			
			// Always use Discord channel for message editing (webhooks can't edit)
			const channel = await this.getStatusChannel();
			if (!channel) return;
			
			// Always try to edit the existing message - never create new ones
			if (this.statusMessageId) {
				try {
					// Try to edit the existing status message
					const statusMessage = await channel.messages.fetch(this.statusMessageId);
					await statusMessage.edit({ embeds: [embed] });
					this.logger.info("Status message updated successfully");
				} catch (error) {
					// If message doesn't exist, try to find the last message from this bot
					this.logger.warn("Could not edit status message, searching for existing message:", error);
					await this.findAndSetStatusMessage(channel, embed);
				}
			} else {
				// No message ID stored - find existing message or create one
				await this.findAndSetStatusMessage(channel, embed);
			}
			
		} catch (error) {
			this.logger.error("Failed to update status message:", error);
		}
	}

	private async findAndSetStatusMessage(channel: TextChannel, embed: any): Promise<void> {
		try {
			// Search for the last message from this bot (check last 50 messages)
			const messages = await channel.messages.fetch({ limit: 50 });
			const botMessages = messages.filter(msg => {
				if (!this.client.user) return false;
				return msg.author.id === this.client.user.id && 
					msg.embeds.length > 0 &&
					msg.embeds[0]?.footer?.text === "Service monitoring system";
			});
			
			if (botMessages.size > 0) {
				// Found existing message - use the most recent one
				const lastMessage = botMessages.first();
				if (lastMessage) {
					this.statusMessageId = lastMessage.id;
					await lastMessage.edit({ embeds: [embed] });
					this.logger.info("Found and updated existing status message");
					return;
				}
			}
			
			// No existing message found - create one (only if we don't have a message ID)
			if (!this.statusMessageId) {
				const message = await channel.send({ embeds: [embed] });
				this.statusMessageId = message.id;
				this.logger.info("Created new status message (first time)");
			}
		} catch (error) {
			this.logger.error("Failed to find or create status message:", error);
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
				previousMessageId: this.statusMessageId || undefined
			};
			
			const embed = this.embedBuilder.buildDailyReportEmbed(reportData);
			
			// Always use Discord channel for message editing (webhooks can't edit)
			const channel = await this.getStatusChannel();
			if (!channel) return;
			
			// Always try to edit the existing message - never create new ones
			if (this.statusMessageId) {
				try {
					// Try to edit the existing message
					const statusMessage = await channel.messages.fetch(this.statusMessageId);
					await statusMessage.edit({ embeds: [embed] });
					this.logger.info("Status update edited successfully");
				} catch (error) {
					// If message doesn't exist, try to find the last message from this bot
					this.logger.warn("Could not edit status message, searching for existing message:", error);
					await this.findAndSetStatusMessage(channel, embed);
				}
			} else {
				// No message ID stored - find existing message or create one
				await this.findAndSetStatusMessage(channel, embed);
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
