import { appendFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

export enum LogLevel {
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3
}

export class Logger {
	private static instance: Logger;
	private logLevel: LogLevel;
	private logToFile: boolean;
	private logDir: string;

	private constructor() {
		this.logLevel = LogLevel.INFO;
		this.logToFile = process.env["BOT2_LOG_TO_FILE"] === "true";
		this.logDir = join(__dirname, "../../logs");
		
		if (this.logToFile && !existsSync(this.logDir)) {
			mkdirSync(this.logDir, { recursive: true });
		}
	}

	public static getInstance(): Logger {
		if (!Logger.instance) {
			Logger.instance = new Logger();
		}
		return Logger.instance;
	}

	public setLogLevel(level: LogLevel): void {
		this.logLevel = level;
	}

	private formatMessage(level: string, message: string, ...args: any[]): string {
		const timestamp = new Date().toISOString();
		const formattedArgs = args.length > 0 ? " " + args.map(arg => 
			typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg)
		).join(" ") : "";
		
		return `[${timestamp}] [${level}] ${message}${formattedArgs}`;
	}

	private log(level: LogLevel, levelName: string, message: string, ...args: any[]): void {
		if (level < this.logLevel) return;

		const formattedMessage = this.formatMessage(levelName, message, ...args);
		
		// Console output with colors
		const colors = {
			DEBUG: "\x1b[36m", // Cyan
			INFO: "\x1b[32m",  // Green
			WARN: "\x1b[33m",  // Yellow
			ERROR: "\x1b[31m", // Red
			RESET: "\x1b[0m"
		};

		console.log(`${colors[levelName as keyof typeof colors]}${formattedMessage}${colors.RESET}`);

		// File output
		if (this.logToFile) {
			const logFile = join(this.logDir, `bot-${new Date().toISOString().split("T")[0]}.log`);
			try {
				appendFileSync(logFile, formattedMessage + "\n");
			} catch (error) {
				console.error("Failed to write to log file:", error);
			}
		}
	}

	public debug(message: string, ...args: any[]): void {
		this.log(LogLevel.DEBUG, "DEBUG", message, ...args);
	}

	public info(message: string, ...args: any[]): void {
		this.log(LogLevel.INFO, "INFO", message, ...args);
	}

	public warn(message: string, ...args: any[]): void {
		this.log(LogLevel.WARN, "WARN", message, ...args);
	}

	public error(message: string, ...args: any[]): void {
		this.log(LogLevel.ERROR, "ERROR", message, ...args);
	}

	public serviceCheck(serviceName: string, status: string, responseTime: number, error?: string): void {
		const message = `Service check: ${serviceName} - ${status} (${responseTime}ms)`;
		if (error) {
			this.warn(message, { error });
		} else {
			this.info(message);
		}
	}

	public alert(type: string, services: string[]): void {
		this.warn(`Alert: ${type}`, { services });
	}

	public dailyReport(summary: { online: number; slow: number; offline: number }): void {
		this.info("Daily report generated", summary);
	}
}
