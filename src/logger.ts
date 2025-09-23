import fs from 'fs';
import path from 'path';

export class Logger {
  private logFile: string;

  constructor(logFile: string = '8bp-claimer.log') {
    this.logFile = logFile;
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
  }

  private writeToFile(message: string): void {
    try {
      fs.appendFileSync(this.logFile, message + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  info(message: string): void {
    const formattedMessage = this.formatMessage('info', message);
    console.log(formattedMessage);
    this.writeToFile(formattedMessage);
  }

  warn(message: string): void {
    const formattedMessage = this.formatMessage('warn', message);
    console.warn(formattedMessage);
    this.writeToFile(formattedMessage);
  }

  error(message: string): void {
    const formattedMessage = this.formatMessage('error', message);
    console.error(formattedMessage);
    this.writeToFile(formattedMessage);
  }

  success(message: string): void {
    const formattedMessage = this.formatMessage('success', message);
    console.log(`✅ ${formattedMessage}`);
    this.writeToFile(formattedMessage);
  }
}
