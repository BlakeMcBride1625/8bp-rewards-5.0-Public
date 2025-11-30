import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { logger } from './logger';

/**
 * Profile data extracted from 8 Ball Pool screenshot
 */
export interface ProfileData {
  level: number | 'UNKNOWN';
  rank: string | 'UNKNOWN';
  uniqueId: string | 'UNKNOWN';
  username?: string | 'UNKNOWN';
}

// Cache for image hashes to avoid re-processing same images
const imageCache = new Map<string, ProfileData>();
const CACHE_DIR = path.join(process.cwd(), 'tmp', 'vision-cache');
const MOCK_MODE = process.env.VERIFICATION_MOCK_MODE === 'true' || process.env.VERIFICATION_MOCK_MODE === '1';
const MOCK_DATA: ProfileData = {
  level: 618,
  rank: 'Galactic Overlord',
  uniqueId: '182-625-474-6',
  username: 'TestUser',
};

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  logger.info('Created vision cache directory', { path: CACHE_DIR });
}

if (MOCK_MODE) {
  logger.warn('🔧 VERIFICATION MOCK MODE ENABLED - OpenAI calls will be bypassed');
}

/**
 * Load OpenAI API key from environment variable
 */
function getApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
  return apiKey;
}

/**
 * Compute hash of image buffer for caching
 */
function computeImageHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Convert image input (file path or Buffer) to base64 data URI
 */
async function imageToBase64(imageInput: string | Buffer): Promise<string> {
  let buffer: Buffer;
  
  if (typeof imageInput === 'string') {
    // File path provided
    const filePath = path.resolve(imageInput);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Image file not found: ${filePath}`);
    }
    buffer = await fs.promises.readFile(filePath);
  } else {
    // Buffer provided
    buffer = imageInput;
  }
  
  // Determine MIME type from buffer or default to png
  let mimeType = 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    mimeType = 'image/jpeg';
  } else if (buffer[0] === 0x89 && buffer[1] === 0x50) {
    mimeType = 'image/png';
  }
  
  const base64 = buffer.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Parse and validate JSON response from Vision API
 */
function parseVisionResponse(content: string): ProfileData {
  try {
    // Remove markdown code blocks if present
    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    const parsed = JSON.parse(cleaned) as Partial<ProfileData>;
    
    // Validate structure
    const result: ProfileData = {
      level: typeof parsed.level === 'number' ? parsed.level : 'UNKNOWN',
      rank: typeof parsed.rank === 'string' && parsed.rank !== 'UNKNOWN' ? parsed.rank : 'UNKNOWN',
      uniqueId: typeof parsed.uniqueId === 'string' && parsed.uniqueId !== 'UNKNOWN' ? parsed.uniqueId : 'UNKNOWN',
      username: typeof parsed.username === 'string' && parsed.username !== 'UNKNOWN' && parsed.username.trim() !== '' ? parsed.username.trim() : 'UNKNOWN',
    };
    
    // Additional validation: level should be a positive number if not UNKNOWN
    if (result.level !== 'UNKNOWN' && (typeof result.level !== 'number' || result.level <= 0)) {
      result.level = 'UNKNOWN';
    }
    
    return result;
  } catch (error) {
    logger.warn('Failed to parse Vision API response', {
      error: error instanceof Error ? error.message : String(error),
      content: content.substring(0, 200),
    });
    return {
      level: 'UNKNOWN',
      rank: 'UNKNOWN',
      uniqueId: 'UNKNOWN',
      username: 'UNKNOWN',
    };
  }
}

/**
 * Extract profile data from 8 Ball Pool screenshot using OpenAI Vision API
 * 
 * @param imageInput - Either a file path (string) or a Buffer containing image data
 * @returns ProfileData object with level, rank, and uniqueId (or 'UNKNOWN' if extraction fails)
 * 
 * @example
 * // Using a file path:
 * const profile = await extractProfileData('/path/to/screenshot.png');
 * 
 * @example
 * // Using a Discord attachment buffer:
 * const attachment = message.attachments.first();
 * const buffer = await fetch(attachment.url).then(r => r.arrayBuffer()).then(ab => Buffer.from(ab));
 * const profile = await extractProfileData(buffer);
 */
export async function extractProfileData(imageInput: string | Buffer): Promise<ProfileData> {
  try {
    // Get image buffer for hashing
    let buffer: Buffer;
    if (typeof imageInput === 'string') {
      buffer = await fs.promises.readFile(imageInput);
    } else {
      buffer = imageInput;
    }

    // Compute hash for caching
    const imageHash = computeImageHash(buffer);
    
    // Check cache first
    if (imageCache.has(imageHash)) {
      const cached = imageCache.get(imageHash)!;
      logger.info('Using cached profile data (skipping OpenAI call)', {
        image_hash: imageHash.substring(0, 16),
        level: cached.level,
        rank: cached.rank,
        uniqueId: cached.uniqueId,
        username: cached.username,
      });
      return cached;
    }

    // Check disk cache
    const cacheFile = path.join(CACHE_DIR, `${imageHash}.json`);
    if (fs.existsSync(cacheFile)) {
      try {
        const cached = JSON.parse(await fs.promises.readFile(cacheFile, 'utf-8')) as ProfileData;
        imageCache.set(imageHash, cached);
        logger.info('Using disk-cached profile data (skipping OpenAI call)', {
          image_hash: imageHash.substring(0, 16),
          level: cached.level,
          rank: cached.rank,
          uniqueId: cached.uniqueId,
          username: cached.username,
        });
        return cached;
      } catch (cacheError) {
        logger.warn('Failed to read cache file, will call OpenAI', {
          error: cacheError instanceof Error ? cacheError.message : String(cacheError),
        });
      }
    }

    // MOCK MODE: Return mock data without calling OpenAI
    if (MOCK_MODE) {
      logger.info('🔧 MOCK MODE: Returning mock profile data (OpenAI bypassed)', {
        image_hash: imageHash.substring(0, 16),
        mock_data: MOCK_DATA,
      });
      
      // Cache the mock result
      imageCache.set(imageHash, MOCK_DATA);
      await fs.promises.writeFile(cacheFile, JSON.stringify(MOCK_DATA, null, 2));
      
      return MOCK_DATA;
    }

    // Normal OpenAI processing
    const apiKey = getApiKey();
    const client = new OpenAI({ apiKey });
    
    // Convert image to base64 data URI
    const imageDataUri = await imageToBase64(buffer);
    
    // System prompt for strict JSON extraction
    const systemPrompt = `You extract structured data from 8 Ball Pool profile screenshots.
Return ONLY a JSON object with: level, rank, uniqueId, username.

Extraction rules:
1. Level: Extract the number inside the star icon (usually in the Level progress section). The star can be any color (blue, gold, silver, bronze, platinum, purple, green, red, diamond, etc.) - do not limit to specific colors. This is a 1-3 digit number (level 1 to 999, e.g., 5, 42, 618). Look for numbers near level indicators, progress bars, or star icons of any color.
2. Rank: Extract the text that appears after 'Rank:' in yellow font color. This is typically the player's rank name (e.g., 'Galactic Overlord', 'Master', 'Professional'). Look for rank text anywhere on the profile screen, not just after a label.
3. Unique ID: Extract the number that appears below the country flag on the left side of the screen, formatted with hyphens (e.g., '182-625-474-6'). Look for 'Unique ID:' label followed by the number, or any number sequence with hyphens in the format X-XXX-XXX-X.
4. Username: Extract the player's username/display name that appears on the profile screen, typically near the avatar or at the top of the profile. This is the in-game username, not the Discord username.

IMPORTANT: This is a profile screen if you can see player statistics, level information, rank information, or player identification. Even if you cannot extract specific values, if this appears to be a profile screen (not a main menu, shop, or game screen), try your best to extract at least one field. Only return 'UNKNOWN' if you are absolutely certain the value is not present or readable.

If any value is unreadable or cannot be found, return 'UNKNOWN' for that field.
Output ONLY valid JSON, no explanation, no markdown, no code blocks.
Format: {"level": 618, "rank": "Galactic Overlord", "uniqueId": "182-625-474-6", "username": "GamingWithBlake"}`;

    logger.info('Calling OpenAI Vision API for profile extraction', {
      image_hash: imageHash.substring(0, 16),
      image_size: buffer.length,
    });
    
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Here is the screenshot.',
            },
            {
              type: 'image_url',
              image_url: {
                url: imageDataUri,
              },
            },
          ],
        },
      ],
      max_tokens: 200,
      temperature: 0,
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      logger.warn('OpenAI Vision API returned empty response', {
        image_hash: imageHash.substring(0, 16),
      });
      const errorResult = {
        level: 'UNKNOWN' as const,
        rank: 'UNKNOWN' as const,
        uniqueId: 'UNKNOWN' as const,
        username: 'UNKNOWN' as const,
      };
      return errorResult;
    }
    
    logger.debug('OpenAI Vision API response received', {
      image_hash: imageHash.substring(0, 16),
      response_length: content.length,
      response_preview: content.substring(0, 200),
    });
    
    const profileData = parseVisionResponse(content);
    
    // Cache the result
    imageCache.set(imageHash, profileData);
    try {
      await fs.promises.writeFile(cacheFile, JSON.stringify(profileData, null, 2));
    } catch (cacheError) {
      logger.warn('Failed to write cache file (non-critical)', {
        error: cacheError instanceof Error ? cacheError.message : String(cacheError),
      });
    }
    
    logger.info('Profile data extracted via Vision API', {
      image_hash: imageHash.substring(0, 16),
      level: profileData.level,
      rank: profileData.rank,
      uniqueId: profileData.uniqueId,
      username: profileData.username,
      cached: true,
    });
    
    return profileData;
  } catch (error) {
    logger.error('Failed to extract profile data via Vision API', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    // Return UNKNOWN for all fields on error
    return {
      level: 'UNKNOWN',
      rank: 'UNKNOWN',
      uniqueId: 'UNKNOWN',
      username: 'UNKNOWN',
    };
  }
}









