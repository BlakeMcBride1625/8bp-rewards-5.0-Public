import axios from "axios";
import { EmbedBuilder as DiscordEmbedBuilder } from "discord.js";
import { Logger } from "../utils/logger";

export class WebhookService {
	private webhookUrl: string;
	private logger: Logger;

	constructor(webhookUrl: string) {
		this.webhookUrl = webhookUrl;
		this.logger = Logger.getInstance();
	}

	public async sendEmbed(embed: DiscordEmbedBuilder): Promise<boolean> {
		try {
			const payload = {
				embeds: [embed.toJSON()]
			};

			const response = await axios.post(this.webhookUrl, payload, {
				headers: {
					"Content-Type": "application/json"
				},
				timeout: 10000
			});

			if (response.status >= 200 && response.status < 300) {
				this.logger.info("Webhook message sent successfully");
				return true;
			} else {
				this.logger.warn(`Webhook returned status ${response.status}`);
				return false;
			}

		} catch (error) {
			this.logger.error("Failed to send webhook message:", error);
			return false;
		}
	}

	public async sendMessage(content: string): Promise<boolean> {
		try {
			const payload = {
				content: content
			};

			const response = await axios.post(this.webhookUrl, payload, {
				headers: {
					"Content-Type": "application/json"
				},
				timeout: 10000
			});

			if (response.status >= 200 && response.status < 300) {
				this.logger.info("Webhook message sent successfully");
				return true;
			} else {
				this.logger.warn(`Webhook returned status ${response.status}`);
				return false;
			}

		} catch (error) {
			this.logger.error("Failed to send webhook message:", error);
			return false;
		}
	}

	public async sendStatusUpdate(embed: DiscordEmbedBuilder): Promise<boolean> {
		try {
			const payload = {
				embeds: [embed.toJSON()]
			};

			// For webhooks, we can't edit messages, so we'll always send new ones
			// But we'll add a "wait" parameter to make it synchronous
			const response = await axios.post(this.webhookUrl, payload, {
				headers: {
					"Content-Type": "application/json"
				},
				timeout: 10000,
				params: {
					wait: true // This makes the webhook wait for the message to be sent
				}
			});

			if (response.status >= 200 && response.status < 300) {
				this.logger.info("Webhook status update sent successfully");
				return true;
			} else {
				this.logger.warn(`Webhook returned status ${response.status}`);
				return false;
			}

		} catch (error) {
			this.logger.error("Failed to send webhook status update:", error);
			return false;
		}
	}
}
