import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface Config {
  userIds: string[];
  testUsers: Array<{id: string; username: string; description: string}>;
  shopUrl: string;
  headless: boolean;
  timeout: number;
  delayBetweenUsers: number;
}

export const config: Config = {
  userIds: getUserIdList(),
  testUsers: getTestUsers(),
  shopUrl: process.env.SHOP_URL || 'https://8ballpool.com/en/shop',
  headless: process.env.HEADLESS === 'true',
  timeout: parseInt(process.env.TIMEOUT || '20000', 10),
  delayBetweenUsers: parseInt(process.env.DELAY_BETWEEN_USERS || '10000', 10)
};

function getUserIdList(): string[] {
  // Check if specific users are targeted via environment variable
  const targetUserIds = process.env.TARGET_USER_IDS;
  if (targetUserIds) {
    const userIds = targetUserIds.split(',').map(id => id.trim()).filter(id => id);
    console.log(`🎯 Running targeted claim for ${userIds.length} specific users`);
    console.log(`👥 Target Users: ${userIds.join(', ')}`);
    return userIds;
  }

  // Support both single USER_ID and multiple USER_IDS
  const userIds = process.env.USER_IDS;
  const singleUserId = process.env.USER_ID;
  
  if (userIds) {
    // Split by comma and clean up whitespace
    return userIds.split(',').map(id => id.trim()).filter(id => id.length > 0);
  } else if (singleUserId) {
    return [singleUserId.trim()];
  } else {
    // Default fallback
    return ['1826254746'];
  }
}

function getTestUsers(): Array<{id: string; username: string; description: string}> {
  const testUsersEnv = process.env.TEST_USERS;
  
  if (testUsersEnv) {
    try {
      const parsed = JSON.parse(testUsersEnv);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (error) {
      console.warn('Failed to parse TEST_USERS environment variable:', error);
    }
  }
  
  // Default test users
  return [
    { id: '1826254746', username: 'TestUser1', description: 'Primary test user' },
    { id: '3057211056', username: 'TestUser2', description: 'Secondary test user' },
    { id: '110141', username: 'TestUser3', description: 'Tertiary test user' }
  ];
}
