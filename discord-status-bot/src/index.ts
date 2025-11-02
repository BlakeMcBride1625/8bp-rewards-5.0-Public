import { 
	Client, 
	GatewayIntentBits, 
	SlashCommandBuilder, 
	CommandInteraction, 
	EmbedBuilder as DiscordEmbedBuilder,
	PermissionFlagsBits
} from "discord.js";
import { ServiceChecker } from "./monitor/checkService";
import { EmbedBuilder } from "./monitor/buildEmbed";
import { Scheduler } from "./monitor/scheduler";
import { BotConfig, loadConfig } from "./utils/env";
import { Logger } from "./utils/logger";
import { ServiceCheckResult, ServiceStatus } from "./types/service";

export class DiscordBot {
	private client: Client;
	private serviceChecker: ServiceChecker;
	private embedBuilder: EmbedBuilder;
	private scheduler: Scheduler;
	private config: BotConfig;
	private logger: Logger;
	private startTime: Date;

	constructor() {
		this.client = new Client({
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMessages,
				GatewayIntentBits.MessageContent
			]
		});
		
		this.serviceChecker = new ServiceChecker();
		this.embedBuilder = new EmbedBuilder(this.serviceChecker);
		this.config = loadConfig();
		this.scheduler = new Scheduler(this.client, this.serviceChecker, this.embedBuilder, this.config);
		this.logger = Logger.getInstance();
		this.startTime = new Date();
		
		this.setupEventHandlers();
		this.setupSlashCommands();
	}

	private setupEventHandlers(): void {
		this.client.once("ready", () => {
			this.logger.info(`Bot logged in as ${this.client.user?.tag}`);
			this.logger.info(`Monitoring ${this.config.services.length} services`);
			this.logger.info(`Guild: ${this.config.guildId}, Channel: ${this.config.statusChannelId}`);
			
			// Start the scheduler
			this.scheduler.start();
		});

		this.client.on("error", (error) => {
			this.logger.error("Discord client error:", error);
		});

		this.client.on("warn", (warning) => {
			this.logger.warn("Discord client warning:", warning);
		});
	}

	private setupSlashCommands(): void {
		// Register commands
		this.client.on("interactionCreate", async (interaction) => {
			if (!interaction.isChatInputCommand()) return;

			try {
				switch (interaction.commandName) {
					case "status":
						await this.handleStatusCommand(interaction);
						break;
					case "uptime":
						await this.handleUptimeCommand(interaction);
						break;
					case "botuptime":
						await this.handleBotUptimeCommand(interaction);
						break;
					case "dailyreport":
						await this.handleDailyReportCommand(interaction);
						break;
					default:
						await interaction.reply({ content: "Unknown command", ephemeral: true });
				}
			} catch (error) {
				this.logger.error(`Error handling command ${interaction.commandName}:`, error);
				await interaction.reply({ 
					content: "An error occurred while processing the command", 
					ephemeral: true 
				});
			}
		});
	}

	private async handleStatusCommand(interaction: CommandInteraction): Promise<void> {
		await interaction.deferReply();
		
		try {
			const results = await this.scheduler.triggerServiceCheck();
			const serviceStatuses = results.map(r => this.convertToServiceStatus(r));
			const embed = this.embedBuilder.buildDailyReportEmbed({
				summary: this.calculateSummary(results),
				services: serviceStatuses,
				timestamp: new Date()
			});
			
			await interaction.editReply({ embeds: [embed] });
		} catch (error) {
			this.logger.error("Error in status command:", error);
			await interaction.editReply({ content: "Failed to check service status" });
		}
	}

	private async handleUptimeCommand(interaction: CommandInteraction): Promise<void> {
		await interaction.deferReply();
		
		try {
			const results = await this.scheduler.triggerServiceCheck();
			const serviceStatuses = results.map(r => this.convertToServiceStatus(r));
			const embed = this.embedBuilder.buildUptimeEmbed(serviceStatuses);
			
			await interaction.editReply({ embeds: [embed] });
		} catch (error) {
			this.logger.error("Error in uptime command:", error);
			await interaction.editReply({ content: "Failed to get uptime statistics" });
		}
	}

	private async handleBotUptimeCommand(interaction: CommandInteraction): Promise<void> {
		const uptime = Date.now() - this.startTime.getTime();
		const uptimeString = this.formatUptime(uptime);
		
		const embed = new DiscordEmbedBuilder()
			.setTitle("🤖 Bot Status")
			.setColor(0x00FF00)
			.setThumbnail(this.client.user?.displayAvatarURL() || "")
			.addFields(
				{
					name: "Uptime",
					value: uptimeString,
					inline: true
				},
				{
					name: "Services Monitored",
					value: this.config.services.length.toString(),
					inline: true
				},
				{
					name: "Check Interval",
					value: `${this.config.checkInterval / 1000}s`,
					inline: true
				},
				{
					name: "Daily Report Interval",
					value: `${this.config.dailyReportInterval / 1000 / 60 / 60}h`,
					inline: true
				},
				{
					name: "Node.js Version",
					value: process.version,
					inline: true
				},
				{
					name: "Memory Usage",
					value: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
					inline: true
				}
			)
			.setTimestamp()
			.setFooter({ text: "Discord Status Bot v1.0" });

		await interaction.reply({ embeds: [embed] });
	}

	private async handleDailyReportCommand(interaction: CommandInteraction): Promise<void> {
		await interaction.deferReply();
		
		try {
			await this.scheduler.triggerDailyReport();
			await interaction.editReply({ content: "Daily report sent successfully" });
		} catch (error) {
			this.logger.error("Error in daily report command:", error);
			await interaction.editReply({ content: "Failed to send daily report" });
		}
	}

	private calculateSummary(results: ServiceCheckResult[]): {
		totalServices: number;
		online: number;
		slow: number;
		offline: number;
		overallStatus: "operational" | "partial" | "major_outage";
		lastChecked: Date;
	} {
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

	private formatUptime(ms: number): string {
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

	public async start(): Promise<void> {
		try {
			this.logger.info("Starting Discord bot...");
			await this.client.login(this.config.token);
		} catch (error) {
			this.logger.error("Failed to start Discord bot:", error);
			throw error;
		}
	}

	public async stop(): Promise<void> {
		this.logger.info("Stopping Discord bot...");
		this.scheduler.stop();
		await this.client.destroy();
		this.logger.info("Discord bot stopped");
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

	public async registerSlashCommands(): Promise<void> {
		try {
			const commands = [
				new SlashCommandBuilder()
					.setName("status")
					.setDescription("Check the current status of all monitored services")
					.setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
				
				new SlashCommandBuilder()
					.setName("uptime")
					.setDescription("Display uptime statistics for all services")
					.setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
				
				new SlashCommandBuilder()
					.setName("botuptime")
					.setDescription("Display bot uptime and system information")
					.setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
				
				new SlashCommandBuilder()
					.setName("dailyreport")
					.setDescription("Manually trigger a daily status report")
					.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
			];

			const guild = await this.client.guilds.fetch(this.config.guildId);
			await guild.commands.set(commands);
			
			this.logger.info("Slash commands registered successfully");
		} catch (error) {
			this.logger.error("Failed to register slash commands:", error);
			throw error;
		}
	}
}
