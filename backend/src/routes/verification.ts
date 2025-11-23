import express from 'express';
import { DatabaseService } from '../services/DatabaseService';
import { logger } from '../services/LoggerService';

const router = express.Router();
const dbService = DatabaseService.getInstance();

/**
 * Internal API endpoint for verification bot to sync verification data
 * POST /api/internal/verification/sync
 */
router.post('/sync', async (req, res): Promise<void> => {
	try {
		const { discord_id, username, unique_id, level, rank_name, avatar_url } = req.body;

		// Validate required fields
		if (!discord_id || !username || !unique_id || level === undefined || !rank_name) {
			res.status(400).json({
				success: false,
				error: 'Missing required fields: discord_id, username, unique_id, level, rank_name'
			});
			return;
		}

		logger.info('Verification sync request received', {
			action: 'verification_sync',
			discord_id,
			unique_id,
			level,
			rank_name
		});

		// Normalize unique_id - remove dashes for matching (database stores without dashes)
		const normalizedUniqueId = unique_id.replace(/-/g, '');

		// Check if registration exists by unique_id (try both with and without dashes) or discord_id
		let existingRegistration = await dbService.findRegistration({ eightBallPoolId: normalizedUniqueId });
		
		// If not found, try with dashes format
		if (!existingRegistration) {
			existingRegistration = await dbService.findRegistration({ eightBallPoolId: unique_id });
		}

		// Also check by discord_id
		if (!existingRegistration && discord_id) {
			existingRegistration = await dbService.findRegistration({ discordId: discord_id });
		}

		if (existingRegistration) {
			// Update existing registration with verification data
			// Always update username when verification bot detects it (username from image takes precedence)
			logger.info('Updating existing rewards registration with verification data', {
				eightBallPoolId: existingRegistration.eightBallPoolId,
				normalizedUniqueId,
				originalUniqueId: unique_id,
				discord_id,
				username,
				current_username: existingRegistration.username,
				level,
				rank_name
			});

			await dbService.updateRegistration(existingRegistration.eightBallPoolId, {
				username: username, // Update username from verification image if different
				discordId: discord_id,
				account_level: level,
				account_rank: rank_name,
				verified_at: new Date()
			});
			
			logger.info('Registration updated successfully with verification data', {
				eightBallPoolId: existingRegistration.eightBallPoolId,
				account_level: level,
				account_rank: rank_name
			});

			res.json({
				success: true,
				registration_id: existingRegistration.id || existingRegistration.eightBallPoolId,
				message: 'Registration updated with verification data'
			});
			return;
		}

		// Create new registration
		logger.info('Creating new rewards registration from verification', {
			eightBallPoolId: unique_id,
			discord_id
		});

		const newRegistration = await dbService.createRegistration({
			eightBallPoolId: normalizedUniqueId, // Use normalized ID (no dashes)
			username: username,
			discordId: discord_id,
			account_level: level,
			account_rank: rank_name,
			verified_at: new Date(),
			registrationIp: 'verification-bot',
			deviceId: 'verification-bot',
			deviceType: 'bot',
			userAgent: 'verification-bot',
			lastLoginAt: new Date(),
			isActive: true
		});

		res.json({
			success: true,
			registration_id: newRegistration.id || newRegistration.eightBallPoolId,
			message: 'Registration created from verification'
		});

	} catch (error) {
		logger.error('Failed to sync verification to rewards', {
			action: 'verification_sync_error',
			error: error instanceof Error ? error.message : 'Unknown error',
			body: req.body
		});

		res.status(500).json({
			success: false,
			error: 'Failed to sync verification data'
		});
	}
});

export default router;

