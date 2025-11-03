import express from 'express';
import { DatabaseService } from '../services/DatabaseService';
import { logger } from '../services/LoggerService';

const router = express.Router();
const dbService = DatabaseService.getInstance();

// Get leaderboard
router.get('/', async (req, res): Promise<void> => {
  try {
    const timeframe = req.query.timeframe as string || '7d';
    const limit = parseInt(req.query.limit as string) || 50;
    
    // Calculate date range based on timeframe
    const days = getDaysFromTimeframe(timeframe);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Use optimized SQL aggregation instead of fetching all records
    let leaderboardData: any[] = [];
    try {
      // Optimized SQL query that aggregates in the database
      const leaderboardQuery = `
        SELECT 
          eight_ball_pool_id,
          COUNT(*) as total_claims,
          COUNT(*) FILTER (WHERE status = 'success') as successful_claims,
          COUNT(*) FILTER (WHERE status = 'failed') as failed_claims,
          COALESCE(SUM(ARRAY_LENGTH(items_claimed, 1)) FILTER (WHERE status = 'success'), 0) as total_items_claimed,
          MAX(claimed_at) as last_claimed
        FROM claim_records
        WHERE claimed_at >= $1
        GROUP BY eight_ball_pool_id
        ORDER BY total_items_claimed DESC
        LIMIT $2
      `;
      
      const result = await Promise.race([
        dbService.executeQuery(leaderboardQuery, [startDate, limit]),
        new Promise<any>((_, reject) => 
          setTimeout(() => reject(new Error('Query timeout')), 15000)
        )
      ]);
      
      leaderboardData = result.rows.map((row: any) => ({
        eightBallPoolId: row.eight_ball_pool_id,
        totalClaims: parseInt(row.total_claims),
        successfulClaims: parseInt(row.successful_claims),
        failedClaims: parseInt(row.failed_claims),
        totalItemsClaimed: parseInt(row.total_items_claimed || 0),
        lastClaimed: row.last_claimed
      }));
      
    } catch (error) {
      logger.error('Leaderboard query timeout or error', {
        action: 'leaderboard_query_error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Return empty leaderboard instead of failing
      res.json({
        timeframe,
        period: `${days} days`,
        totalUsers: 0,
        leaderboard: []
      });
      return;
    }

    // Get user details for each entry with optimized batch query
    const userIds = leaderboardData.map(entry => entry.eightBallPoolId);
    let userMap = new Map<string, string>();
    
    if (userIds.length > 0) {
      try {
        // Batch fetch usernames in a single query
        const usernameQuery = `
          SELECT eight_ball_pool_id, username 
          FROM registrations 
          WHERE eight_ball_pool_id = ANY($1)
        `;
        const usernameResult = await Promise.race([
          dbService.executeQuery(usernameQuery, [userIds]),
          new Promise<any>((_, reject) => 
            setTimeout(() => reject(new Error('Query timeout')), 3000)
          )
        ]);
        
        usernameResult.rows.forEach((row: any) => {
          userMap.set(row.eight_ball_pool_id, row.username);
        });
      } catch (error) {
        logger.warn('Failed to batch fetch usernames, will use individual lookups', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    // Build leaderboard response
    const leaderboard = leaderboardData.map((entry: any, index: number) => ({
      rank: index + 1,
      eightBallPoolId: entry.eightBallPoolId,
      username: userMap.get(entry.eightBallPoolId) || 'Unknown',
      totalClaims: entry.totalClaims,
      successfulClaims: entry.successfulClaims,
      failedClaims: entry.failedClaims,
      totalItemsClaimed: entry.totalItemsClaimed,
      successRate: entry.totalClaims > 0 
        ? Math.round((entry.successfulClaims / entry.totalClaims) * 100) 
        : 0,
      lastClaimed: entry.lastClaimed
    }));

    res.json({
      timeframe,
      period: `${days} days`,
      totalUsers: leaderboard.length,
      leaderboard
    });

  } catch (error) {
    logger.error('Failed to retrieve leaderboard', {
      action: 'leaderboard_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timeframe: req.query.timeframe
    });

    res.status(500).json({
      error: 'Failed to retrieve leaderboard'
    });
  }
});

// Get user's ranking
router.get('/user/:eightBallPoolId', async (req, res): Promise<void> => {
  try {
    const { eightBallPoolId } = req.params;
    const timeframe = req.query.timeframe as string || '7d';
    
    const days = getDaysFromTimeframe(timeframe);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get user's claim records within timeframe
    const userClaims = await dbService.findClaimRecords({
      eightBallPoolId,
      claimedAt: { $gte: startDate }
    });

    if (userClaims.length === 0) {
      res.status(404).json({
        error: 'No claims found for this user in the specified timeframe'
      });
      return;
    }

    // Calculate user stats
    let totalClaims = 0;
    let successfulClaims = 0;
    let failedClaims = 0;
    let totalItemsClaimed = 0;
    let lastClaimed: string | null = null;

    userClaims.forEach((claim: any) => {
      totalClaims++;
      if (claim.status === 'success') {
        successfulClaims++;
        totalItemsClaimed += claim.itemsClaimed?.length || 0;
      } else {
        failedClaims++;
      }
      
      if (!lastClaimed || new Date(claim.claimedAt) > new Date(lastClaimed)) {
        lastClaimed = claim.claimedAt;
      }
    });

    // Get user's rank by getting all users and finding position
    const allClaims = await dbService.findClaimRecords({
      claimedAt: { $gte: startDate }
    });

    const allUserStats: { [key: string]: number } = {};
    allClaims.forEach((claim: any) => {
      const userId = claim.eightBallPoolId;
      if (!allUserStats[userId]) {
        allUserStats[userId] = 0;
      }
      if (claim.status === 'success') {
        allUserStats[userId] += claim.itemsClaimed?.length || 0;
      }
    });

    const sortedUsers = Object.entries(allUserStats)
      .sort(([,a], [,b]) => b - a)
      .map(([userId]) => userId);

    const rank = sortedUsers.indexOf(eightBallPoolId) + 1;

    // Get user registration details
    const registration = await dbService.findRegistration({ eightBallPoolId });

    res.json({
      rank,
      eightBallPoolId,
      username: registration?.username || 'Unknown',
      totalClaims,
      successfulClaims,
      failedClaims,
      totalItemsClaimed,
      successRate: totalClaims > 0 
        ? Math.round((successfulClaims / totalClaims) * 100) 
        : 0,
      lastClaimed,
      timeframe,
      period: `${days} days`
    });

  } catch (error) {
    logger.error('Failed to retrieve user ranking', {
      action: 'user_ranking_error',
      eightBallPoolId: req.params.eightBallPoolId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'Failed to retrieve user ranking'
    });
  }
});

// Get leaderboard statistics
router.get('/stats', async (req, res) => {
  try {
    const timeframe = req.query.timeframe as string || '7d';
    const days = getDaysFromTimeframe(timeframe);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all claim records within timeframe
    const claimRecords = await dbService.findClaimRecords({
      claimedAt: { $gte: startDate }
    });

    // Calculate overall statistics
    let totalClaims = 0;
    let successfulClaims = 0;
    let failedClaims = 0;
    let totalItemsClaimed = 0;
    const uniqueUsers = new Set<string>();

    claimRecords.forEach((claim: any) => {
      totalClaims++;
      uniqueUsers.add(claim.eightBallPoolId);
      
      if (claim.status === 'success') {
        successfulClaims++;
        totalItemsClaimed += claim.itemsClaimed?.length || 0;
      } else {
        failedClaims++;
      }
    });

    const successRate = totalClaims > 0 
      ? Math.round((successfulClaims / totalClaims) * 100) 
      : 0;

    res.json({
      timeframe,
      period: `${days} days`,
      totalClaims,
      successfulClaims,
      failedClaims,
      totalItemsClaimed,
      uniqueUsers: uniqueUsers.size,
      successRate
    });

  } catch (error) {
    logger.error('Failed to retrieve leaderboard statistics', {
      action: 'leaderboard_stats_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'Failed to retrieve leaderboard statistics'
    });
  }
});

// Helper function to get days from timeframe string
function getDaysFromTimeframe(timeframe: string): number {
  const timeframes: { [key: string]: number } = {
    '1d': 1,
    '7d': 7,
    '14d': 14,
    '28d': 28,
    '30d': 30,
    '90d': 90,
    '1y': 365
  };

  return timeframes[timeframe] || 7;
}

export default router;



