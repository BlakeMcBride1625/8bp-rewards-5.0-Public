import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface Config {
  userIds: string[];
  shopUrl: string;
  headless: boolean;
  timeout: number;
  delayBetweenUsers: number;
}

export const config: Config = {
  userIds: getUserIdList(),
  shopUrl: process.env.SHOP_URL || 'https://8ballpool.com/en/shop',
  headless: process.env.HEADLESS === 'true',
  timeout: parseInt(process.env.TIMEOUT || '30000', 10),
  delayBetweenUsers: parseInt(process.env.DELAY_BETWEEN_USERS || '5000', 10)
};

function getUserIdList(): string[] {
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
