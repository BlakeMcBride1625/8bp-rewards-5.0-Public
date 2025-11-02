#!/usr/bin/env node

import { DiscordBot } from "./index";
import { Logger } from "./utils/logger";

async function main(): Promise<void> {
	const logger = Logger.getInstance();
	let bot: DiscordBot | null = null;
	
	// Handle uncaught exceptions
	process.on("uncaughtException", (error) => {
		logger.error("Uncaught Exception:", error);
		process.exit(1);
	});

	process.on("unhandledRejection", (reason, promise) => {
		logger.error("Unhandled Rejection at:", promise, "reason:", reason);
		process.exit(1);
	});

	// Handle graceful shutdown
	process.on("SIGINT", async () => {
		logger.info("Received SIGINT, shutting down gracefully...");
		if (bot) {
			await bot.stop();
		}
		process.exit(0);
	});

	process.on("SIGTERM", async () => {
		logger.info("Received SIGTERM, shutting down gracefully...");
		if (bot) {
			await bot.stop();
		}
		process.exit(0);
	});

	try {
		logger.info("Starting Discord Status Bot...");
		
		bot = new DiscordBot();
		await bot.start();
		
		// Register slash commands after bot is ready
		setTimeout(async () => {
			try {
				if (bot) {
					await bot.registerSlashCommands();
				}
			} catch (error) {
				logger.error("Failed to register slash commands:", error);
			}
		}, 5000); // Wait 5 seconds for bot to be ready
		
		logger.info("Discord Status Bot started successfully");
		
	} catch (error) {
		logger.error("Failed to start bot:", error);
		process.exit(1);
	}
}

// Start the bot
main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
