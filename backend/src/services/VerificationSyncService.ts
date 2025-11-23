import axios from 'axios';
import { logger } from './LoggerService';
import { DatabaseService } from './DatabaseService';

export interface SyncAccountData {
	discord_id: string;
	username: string;
	unique_id: string;
	level: number;
	rank_name: string;
	avatar_url?: string | null;
	metadata?: Record<string, unknown>;
}

class VerificationSyncService {
	private rewardsApiUrl: string;
	private dbService: DatabaseService;

	constructor() {
		// Get rewards API URL from environment, fallback to internal service URL
		this.rewardsApiUrl = 
			process.env.REWARDS_API_URL || 
			process.env.BACKEND_URL || 
			'http://backend:2600';
		
		// Remove trailing /api if present, we'll add it back
		this.rewardsApiUrl = this.rewardsApiUrl.replace(/\/api\/?$/, '');
		
		this.dbService = DatabaseService.getInstance();
		
		logger.info('VerificationSyncService initialized', {
			rewards_api_url: this.rewardsApiUrl
		});
	}

	/**
	 * Sync account data to rewards system after verification
	 */
	async syncToRewards(data: SyncAccountData): Promise<void> {
		try {
			logger.info('Syncing verification to rewards system', {
				discord_id: data.discord_id,
				unique_id: data.unique_id,
				level: data.level,
				rank_name: data.rank_name
			});

			// First, check if registration exists in rewards DB
			const existingRegistration = await this.dbService.findRegistration({
				eightBallPoolId: data.unique_id
			});

			// Also check by discord_id if it exists
			let registrationByDiscord = null;
			if (data.discord_id) {
				// Note: We'll need to add a method to find by discord_id if it doesn't exist
				// For now, we'll check via the unique_id and then update with discord_id
			}

			const registrationData: any = {
				eightBallPoolId: data.unique_id,
				username: data.username,
				account_level: data.level,
				account_rank: data.rank_name,
				verified_at: new Date(),
				discord_id: data.discord_id
			};

			if (existingRegistration) {
				// Update existing registration with verification data
				// Always update username when verification bot detects it (username from image takes precedence)
				logger.info('Updating existing rewards registration with verification data', {
					eightBallPoolId: data.unique_id,
					discord_id: data.discord_id,
					username: data.username,
					current_username: existingRegistration.username
				});

				await this.dbService.updateRegistration(data.unique_id, {
					username: data.username, // Update username from verification image detection
					account_level: data.level,
					account_rank: data.rank_name,
					verified_at: new Date(),
					discordId: data.discord_id
				});

				logger.info('Rewards registration updated successfully', {
					eightBallPoolId: data.unique_id,
					discord_id: data.discord_id,
					level: data.level
				});
			} else {
				// Create new registration in rewards system
				logger.info('Creating new rewards registration from verification', {
					eightBallPoolId: data.unique_id,
					discord_id: data.discord_id
				});

				// Use internal API endpoint for verification sync (bypasses device validation)
				try {
					const response = await axios.post(
						`${this.rewardsApiUrl}/api/internal/verification/sync`,
						{
							discord_id: data.discord_id,
							username: data.username,
							unique_id: data.unique_id,
							level: data.level,
							rank_name: data.rank_name,
							avatar_url: data.avatar_url
						},
						{
							timeout: 10000,
							headers: {
								'Content-Type': 'application/json'
							}
						}
					);

					logger.info('Rewards registration created via API', {
						eightBallPoolId: data.unique_id,
						discord_id: data.discord_id,
						response_status: response.status
					});
				} catch (apiError: any) {
					// If API endpoint doesn't exist yet, fall back to direct DB insert
					if (apiError.response?.status === 404 || apiError.code === 'ECONNREFUSED') {
						logger.warn('Internal API endpoint not available, using direct DB insert', {
							error: apiError.message
						});

						// Direct DB insert as fallback
					await this.dbService.createRegistration({
						eightBallPoolId: data.unique_id,
						username: data.username,
						account_level: data.level,
						account_rank: data.rank_name,
						verified_at: new Date(),
						discordId: data.discord_id,
						registrationIp: 'verification-bot', // Mark as from verification
						deviceId: 'verification-bot',
						deviceType: 'bot',
						userAgent: 'verification-bot',
						lastLoginAt: new Date(),
						isActive: true
					});

						logger.info('Rewards registration created via direct DB insert', {
							eightBallPoolId: data.unique_id,
							discord_id: data.discord_id
						});
					} else {
						throw apiError;
					}
				}
			}

			logger.info('Verification synced to rewards system successfully', {
				discord_id: data.discord_id,
				unique_id: data.unique_id,
				level: data.level
			});
		} catch (error) {
			// Don't throw - we don't want to break verification if rewards sync fails
			logger.error('Failed to sync verification to rewards system', {
				error: error instanceof Error ? error.message : 'Unknown error',
				discord_id: data.discord_id,
				unique_id: data.unique_id
			});
		}
	}
}

export const verificationSyncService = new VerificationSyncService();

