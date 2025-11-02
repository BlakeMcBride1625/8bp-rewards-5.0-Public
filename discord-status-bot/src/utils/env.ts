import { config } from "dotenv";
import { join } from "path";
import { ServiceConfig } from "../types/service";

// Load environment variables from parent directory
config({ path: join(__dirname, "../../../.env") });

export interface BotConfig {
	token: string;
	clientId: string;
	guildId: string;
	statusChannelId: string;
	webhookUrl?: string | undefined;
	checkInterval: number;
	dailyReportInterval: number;
	notifyRestore: boolean;
	services: ServiceConfig[];
}

export function loadConfig(): BotConfig {
	const requiredVars = [
		"BOT2_TOKEN",
		"BOT2_CLIENT_ID", 
		"BOT2_GUILD_ID",
		"BOT2_STATUS_CHANNEL_ID"
	];

	for (const varName of requiredVars) {
		if (!process.env[varName]) {
			throw new Error(`Missing required environment variable: ${varName}`);
		}
	}

	// Extract all service URLs from environment variables
	const services: ServiceConfig[] = [];
	const envVars = Object.keys(process.env);
	
	for (const key of envVars) {
		if (key.startsWith("BOT2_") && key.endsWith("_URL")) {
			const url = process.env[key];
			if (url) {
				const serviceName = key
					.replace("BOT2_", "")
					.replace("_URL", "")
					.toLowerCase()
					.replace(/_/g, " ");
				
				// Skip admin dashboard as it's not public
				if (serviceName === "admin dashboard") {
					continue;
				}
				
				const category = categorizeService(serviceName);
				
				services.push({
					name: serviceName,
					url,
					category,
					timeout: 10000, // 10 seconds default
					retries: 3,
					expectedStatus: 200
				});
			}
		}
	}

	return {
		token: process.env["BOT2_TOKEN"]!,
		clientId: process.env["BOT2_CLIENT_ID"]!,
		guildId: process.env["BOT2_GUILD_ID"]!,
		statusChannelId: process.env["BOT2_STATUS_CHANNEL_ID"]!,
		webhookUrl: process.env["BOT2_WEBHOOK_URL"] || undefined,
		checkInterval: parseInt(process.env["BOT2_CHECK_INTERVAL"] || "1") * 60 * 1000, // Convert minutes to ms (default 1 minute)
		dailyReportInterval: parseInt(process.env["BOT2_DAILY_REPORT_INTERVAL"] || "24") * 60 * 60 * 1000, // Convert hours to ms
		notifyRestore: process.env["BOT2_NOTIFY_RESTORE"] === "true",
		services
	};
}

function categorizeService(serviceName: string): string {
	const name = serviceName.toLowerCase();
	
	if (name.includes("website") || name.includes("main")) {
		return "Website";
	} else if (name.includes("api")) {
		return "APIs";
	} else if (name.includes("backend")) {
		return "Backends";
	} else if (name.includes("claimer")) {
		return "Claimers";
	} else if (name.includes("database") || name.includes("db")) {
		return "Database";
	} else {
		return "Misc";
	}
}
