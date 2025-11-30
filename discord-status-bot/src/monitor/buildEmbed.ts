import { EmbedBuilder as DiscordEmbedBuilder, ColorResolvable } from "discord.js";
import { AlertData, DailyReportData, ServiceStatus } from "../types/service";
import { ServiceChecker } from "./checkService";

export class EmbedBuilder {
	private serviceChecker: ServiceChecker;

	constructor(serviceChecker: ServiceChecker) {
		this.serviceChecker = serviceChecker;
	}

	public buildDailyReportEmbed(data: DailyReportData): DiscordEmbedBuilder {
		const { services } = data;
		
		// Organise services into specific groups with custom ordering
		const serviceGroups = this.organizeServicesIntoGroups(services);
		
		// Build description with grouped service statuses
		let description = "";
		
		// Group 1: System Status (standalone)
		if (serviceGroups.systemStatus) {
			const service = serviceGroups.systemStatus;
			const statusEmoji = this.getStatusEmoji(service.status);
			const statusText = this.getFriendlyStatusText(service.status);
			const serviceName = this.formatServiceName(service.name);
			description += `${statusEmoji} [${serviceName}](${service.url}) **${statusText}**\n\n`;
		}
		
		// Group 2: Website (standalone)
		if (serviceGroups.website) {
			const service = serviceGroups.website;
			const statusEmoji = this.getStatusEmoji(service.status);
			const statusText = this.getFriendlyStatusText(service.status);
			const serviceName = this.formatServiceName(service.name);
			description += `${statusEmoji} [${serviceName}](${service.url}) **${statusText}**\n\n`;
		}
		
		// Group 3: Main Services (Registration, Contact, Leaderboard, User Dashboard, Discord Bot)
		if (serviceGroups.mainServices.length > 0) {
			for (let i = 0; i < serviceGroups.mainServices.length; i++) {
				const service = serviceGroups.mainServices[i];
				if (!service) continue;
				
				const statusEmoji = this.getStatusEmoji(service.status);
				const statusText = this.getFriendlyStatusText(service.status);
				const serviceName = this.formatServiceName(service.name);
				description += `${statusEmoji} [${serviceName}](${service.url}) **${statusText}**\n`;
				
				// Add extra space after User Dashboard (before Discord BOTs API)
				if (service.name.toLowerCase() === 'user dashboard') {
					description += "\n";
				}
			}
			description += "\n";
		}
		
		// Group 4: External Services (8 Ball Pool Shop, Admin Dashboard)
		if (serviceGroups.externalServices.length > 0) {
			for (const service of serviceGroups.externalServices) {
				const statusEmoji = this.getStatusEmoji(service.status);
				const statusText = this.getFriendlyStatusText(service.status);
				const serviceName = this.formatServiceName(service.name);
				description += `${statusEmoji} [${serviceName}](${service.url}) **${statusText}**\n`;
			}
		}

		const embed = new DiscordEmbedBuilder()
			.setTitle("8BP Rewards Services Status")
			.setDescription(description.trim())
			.setColor(0x2f3136) // Discord dark gray
			.addFields({
				name: "\u200b", // Zero-width space for spacing
				value: "",
				inline: false
			})
			.addFields({
				name: "All Operational",
				value: "",
				inline: false
			})
		.setFooter({ 
			text: "For more information, visit our status page."
		});

		return embed;
	}

	public buildAlertEmbed(alert: AlertData): DiscordEmbedBuilder {
		const { type, services, message } = alert;
		
		let title: string;
		let color: ColorResolvable;
		let thumbnail: string;
		
		switch (type) {
			case "service_down":
				title = "🚨 Service Alert";
				color = 0xFF0000; // Red
				thumbnail = "https://cdn.discordapp.com/emojis/1234567890.png"; // Red alert emoji
				break;
			case "service_restored":
				title = "✅ Service Restored";
				color = 0x00FF00; // Green
				thumbnail = "https://cdn.discordapp.com/emojis/1234567891.png"; // Green check emoji
				break;
			case "multiple_down":
				title = "🚨 Multiple Services Down";
				color = 0xFF4500; // Orange red
				thumbnail = "https://cdn.discordapp.com/emojis/1234567892.png"; // Warning emoji
				break;
			default:
				title = "⚠️ Service Alert";
				color = 0xFFA500; // Orange
				thumbnail = "https://cdn.discordapp.com/emojis/1234567893.png"; // Warning emoji
		}

		let description = message + "\n\n";
		
		// Add affected services
		if (services.length > 0) {
			description += "**Affected Services:**\n";
			for (const service of services) {
				const statusEmoji = this.getStatusEmoji(service.status);
				const responseTime = service.responseTime > 0 ? ` (${service.responseTime}ms)` : "";
				description += `${statusEmoji} ${service.name} **${this.capitalizeStatus(service.status)}**${responseTime}\n`;
				
				if (service.error) {
					description += `   └ ${service.error}\n`;
				}
			}
		}

		return new DiscordEmbedBuilder()
			.setTitle(title)
			.setDescription(description.trim())
			.setColor(color)
			.setThumbnail(thumbnail)
			.setTimestamp()
			.setFooter({ text: "Service monitoring system" });
	}

	public buildUptimeEmbed(services: ServiceStatus[]): DiscordEmbedBuilder {
		const serviceGroups = this.organizeServicesIntoGroups(services);
		
		let description = "";
		let totalUptime = 0;
		let serviceCount = 0;
		
		// Add all services to description
		const allServices = [
			...(serviceGroups.systemStatus ? [serviceGroups.systemStatus] : []),
			...(serviceGroups.website ? [serviceGroups.website] : []),
			...serviceGroups.mainServices,
			...serviceGroups.externalServices
		];
		
		for (const service of allServices) {
			const uptime = this.serviceChecker.getUptimePercentage(service.name);
			const avgResponseTime = this.serviceChecker.getAverageResponseTime(service.name);
			const totalChecks = this.serviceChecker["uptimeData"].get(service.name)?.totalChecks || 0;
			
			totalUptime += uptime;
			serviceCount++;
			
			description += `📊 ${service.name}: ${uptime.toFixed(1)}% uptime`;
			if (avgResponseTime > 0) {
				description += ` • Avg: ${Math.round(avgResponseTime)}ms`;
			}
			description += ` • ${totalChecks} checks\n`;
		}

		const overallUptime = serviceCount > 0 ? totalUptime / serviceCount : 100;
		const color = overallUptime >= 99 ? 0x00FF00 : overallUptime >= 95 ? 0xFFA500 : 0xFF0000;

		return new DiscordEmbedBuilder()
			.setTitle("📊 Uptime Statistics")
			.setDescription(description.trim())
			.setColor(color)
			.setThumbnail("https://cdn.discordapp.com/emojis/1234567894.png") // Chart emoji
			.addFields({
				name: "Overall Uptime",
				value: `${overallUptime.toFixed(1)}%`,
				inline: true
			})
			.setTimestamp()
			.setFooter({ text: "Uptime monitoring system" });
	}


	private getStatusEmoji(status: "online" | "slow" | "offline"): string {
		switch (status) {
			case "online": return "<:green:1430281552365092864>";
			case "slow": return "<:yellow:1430281572808003765>";
			case "offline": return "<:red:1430281522233081928>";
		}
	}

	private getFriendlyStatusText(status: "online" | "slow" | "offline"): string {
		switch (status) {
			case "online": return "Operational";
			case "slow": return "Operational";
			case "offline": return "Offline";
		}
	}

	private formatServiceName(name: string): string {
		// Convert service names to match OpenAI style
		const friendlyNames: { [key: string]: string } = {
			"website": "Website",
			"frontend": "Frontend",
			"register": "Registration",
			"contact": "Contact",
			"leaderboard": "Leaderboard",
			"user dashboard": "User Dashboard",
			"discord bot": "Discord BOTs API",
			"system status": "System Status",
			"admin dashboard": "Admin Dashboard",
			"oauth callback": "OAuth Callback",
			"8ballpool shop": "8 Ball Pool Shop",
			"webhook": "Webhook"
		};
		
		return friendlyNames[name.toLowerCase()] || this.capitalizeWords(name);
	}

	private capitalizeWords(str: string): string {
		return str.split(' ').map(word => 
			word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
		).join(' ');
	}

	private capitalizeStatus(status: "online" | "slow" | "offline"): string {
		return status.charAt(0).toUpperCase() + status.slice(1);
	}

	private organizeServicesIntoGroups(services: ServiceStatus[]): {
		systemStatus?: ServiceStatus | undefined;
		website?: ServiceStatus | undefined;
		mainServices: ServiceStatus[];
		externalServices: ServiceStatus[];
	} {
		const groups: {
			systemStatus?: ServiceStatus | undefined;
			website?: ServiceStatus | undefined;
			mainServices: ServiceStatus[];
			externalServices: ServiceStatus[];
		} = {
			mainServices: [],
			externalServices: []
		};

		for (const service of services) {
			const serviceName = service.name.toLowerCase();
			
			if (serviceName === 'system status') {
				groups.systemStatus = service;
			} else if (serviceName === 'website') {
				groups.website = service;
			} else if (['register', 'contact', 'leaderboard', 'user dashboard'].includes(serviceName)) {
				groups.mainServices.push(service);
			} else if (['discord bot'].includes(serviceName)) {
				groups.mainServices.push(service);
			} else if (['8ballpool shop'].includes(serviceName)) {
				groups.externalServices.push(service);
			}
		}

		// Sort main services in the specified order
		groups.mainServices.sort((a, b) => {
			const order = ['register', 'contact', 'leaderboard', 'user dashboard', 'discord bot'];
			const aIndex = order.indexOf(a.name.toLowerCase());
			const bIndex = order.indexOf(b.name.toLowerCase());
			return aIndex - bIndex;
		});

		// Sort external services in the specified order
		groups.externalServices.sort((a, b) => {
			const order = ['8ballpool shop', 'admin dashboard'];
			const aIndex = order.indexOf(a.name.toLowerCase());
			const bIndex = order.indexOf(b.name.toLowerCase());
			return aIndex - bIndex;
		});

		return groups;
	}
}
