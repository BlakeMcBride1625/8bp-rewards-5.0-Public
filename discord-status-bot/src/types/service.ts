export interface ServiceConfig {
	name: string;
	url: string;
	category: string;
	timeout: number;
	retries: number;
	expectedStatus?: number;
}

export interface ServiceStatus {
	name: string;
	url: string;
	category: string;
	status: "online" | "slow" | "offline";
	responseTime: number;
	httpStatus?: number | undefined;
	error?: string | undefined;
	lastChecked: Date;
	uptimePercentage: number;
	averageResponseTime: number;
	totalChecks: number;
	successfulChecks: number;
	lastFailure?: Date | undefined;
	lastSuccess?: Date | undefined;
}

export interface ServiceCheckResult {
	name: string;
	url: string;
	category: string;
	status: "online" | "slow" | "offline";
	responseTime: number;
	httpStatus?: number | undefined;
	error?: string | undefined;
	timestamp: Date;
}

export interface StatusSummary {
	totalServices: number;
	online: number;
	slow: number;
	offline: number;
	overallStatus: "operational" | "partial" | "major_outage";
	lastChecked: Date;
}

export interface UptimeData {
	serviceName: string;
	totalChecks: number;
	successfulChecks: number;
	averageResponseTime: number;
	uptimePercentage: number;
	lastFailure?: Date;
	lastSuccess?: Date;
}

export interface AlertData {
	type: "service_down" | "service_restored" | "multiple_down";
	services: ServiceStatus[];
	timestamp: Date;
	message: string;
}

export interface DailyReportData {
	summary: StatusSummary;
	services: ServiceStatus[];
	timestamp: Date;
	previousMessageId?: string | undefined;
}
