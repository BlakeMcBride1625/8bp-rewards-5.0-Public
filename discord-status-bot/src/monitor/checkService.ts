import axios, { AxiosError, AxiosResponse } from "axios";
import { ServiceConfig, ServiceCheckResult } from "../types/service";
import { Logger } from "../utils/logger";

export class ServiceChecker {
	private logger: Logger;
	private serviceStatuses: Map<string, ServiceCheckResult> = new Map();
	private uptimeData: Map<string, { totalChecks: number; successfulChecks: number; totalResponseTime: number }> = new Map();

	constructor() {
		this.logger = Logger.getInstance();
	}

	public async checkService(service: ServiceConfig): Promise<ServiceCheckResult> {
		const startTime = Date.now();
		let lastError: string | undefined;
		let httpStatus: number | undefined;

		// Retry logic with exponential backoff
		for (let attempt = 1; attempt <= service.retries; attempt++) {
			try {
				const response: AxiosResponse = await axios.get(service.url, {
					timeout: service.timeout,
					validateStatus: (status) => status < 500, // Accept 4xx as "online" but log it
					headers: {
						"User-Agent": "Discord-Status-Bot/1.0"
					}
				});

				const responseTime = Date.now() - startTime;
				httpStatus = response.status;

				// Determine service status based on response time and HTTP status
				let status: "online" | "slow" | "offline";
				
				if (response.status >= 400 && response.status < 500) {
					status = "slow"; // Client errors are considered slow/degraded
				} else if (responseTime > 5000) {
					status = "slow"; // Slow response
				} else {
					status = "online";
				}

				const result: ServiceCheckResult = {
					name: service.name,
					url: service.url,
					category: service.category,
					status,
					responseTime,
					httpStatus,
					timestamp: new Date()
				};

				this.updateUptimeData(service.name, true, responseTime);
				this.serviceStatuses.set(service.name, result);
				
				this.logger.serviceCheck(service.name, status, responseTime);
				return result;

			} catch (error) {
				lastError = this.getErrorMessage(error);
				
				if (attempt < service.retries) {
					// Exponential backoff: wait 1s, 2s, 4s...
					const delay = Math.pow(2, attempt - 1) * 1000;
					this.logger.debug(`Retry ${attempt}/${service.retries} for ${service.name} in ${delay}ms`);
					await this.sleep(delay);
				}
			}
		}

		// All retries failed
		const responseTime = Date.now() - startTime;
		const result: ServiceCheckResult = {
			name: service.name,
			url: service.url,
			category: service.category,
			status: "offline",
			responseTime,
			httpStatus: httpStatus,
			error: lastError,
			timestamp: new Date()
		};

		this.updateUptimeData(service.name, false, responseTime);
		this.serviceStatuses.set(service.name, result);
		
		this.logger.serviceCheck(service.name, "offline", responseTime, lastError);
		return result;
	}

	public async checkAllServices(services: ServiceConfig[]): Promise<ServiceCheckResult[]> {
		this.logger.info(`Checking ${services.length} services...`);
		
		const promises = services.map(service => this.checkService(service));
		const results = await Promise.allSettled(promises);
		
		const successfulResults: ServiceCheckResult[] = [];
		const failedResults: ServiceCheckResult[] = [];

		results.forEach((result, index) => {
			if (result.status === "fulfilled") {
				successfulResults.push(result.value);
			} else {
				this.logger.error(`Failed to check service ${services[index]!.name}:`, result.reason);
				// Create a failed result
				failedResults.push({
					name: services[index]!.name,
					url: services[index]!.url,
					category: services[index]!.category,
					status: "offline",
					responseTime: 0,
					error: result.reason?.message || "Unknown error",
					timestamp: new Date()
				});
			}
		});

		const allResults = [...successfulResults, ...failedResults];
		this.logger.info(`Service check complete: ${successfulResults.length} successful, ${failedResults.length} failed`);
		
		return allResults;
	}

	public getServiceStatus(serviceName: string): ServiceCheckResult | undefined {
		return this.serviceStatuses.get(serviceName);
	}

	public getAllServiceStatuses(): ServiceCheckResult[] {
		return Array.from(this.serviceStatuses.values());
	}

	public getUptimePercentage(serviceName: string): number {
		const data = this.uptimeData.get(serviceName);
		if (!data || data.totalChecks === 0) return 100;
		return (data.successfulChecks / data.totalChecks) * 100;
	}

	public getAverageResponseTime(serviceName: string): number {
		const data = this.uptimeData.get(serviceName);
		if (!data || data.successfulChecks === 0) return 0;
		return data.totalResponseTime / data.successfulChecks;
	}

	private updateUptimeData(serviceName: string, success: boolean, responseTime: number): void {
		const existing = this.uptimeData.get(serviceName) || {
			totalChecks: 0,
			successfulChecks: 0,
			totalResponseTime: 0
		};

		existing.totalChecks++;
		if (success) {
			existing.successfulChecks++;
			existing.totalResponseTime += responseTime;
		}

		this.uptimeData.set(serviceName, existing);
	}

	private getErrorMessage(error: unknown): string {
		if (axios.isAxiosError(error)) {
			const axiosError = error as AxiosError;
			if (axiosError.code === "ECONNABORTED") {
				return "Request timeout";
			} else if (axiosError.code === "ENOTFOUND") {
				return "DNS resolution failed";
			} else if (axiosError.code === "ECONNREFUSED") {
				return "Connection refused";
			} else if (axiosError.response) {
				return `HTTP ${axiosError.response.status}: ${axiosError.response.statusText}`;
			} else {
				return axiosError.message || "Network error";
			}
		}
		
		return error instanceof Error ? error.message : "Unknown error";
	}

	private sleep(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}
