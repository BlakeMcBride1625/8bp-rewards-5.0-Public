import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { logger } from './logger';

/**
 * Profile data extracted from 8 Ball Pool screenshot
 */
export interface ProfileData {
  level: number | 'UNKNOWN';
  rank: string | 'UNKNOWN';
  uniqueId: string | 'UNKNOWN';
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
    const apiKey = getApiKey();
    const client = new OpenAI({ apiKey });
    
    // Convert image to base64 data URI
    const imageDataUri = await imageToBase64(imageInput);
    
    // System prompt for strict JSON extraction
    const systemPrompt = `You extract structured data from 8 Ball Pool profile screenshots.
Return ONLY a JSON object with: level, rank, uniqueId.

Extraction rules:
1. Level: Extract the number inside the star icon (usually in the Level progress section). The star can be any color (blue, gold, silver, bronze, platinum, purple, green, red, diamond, etc.) - do not limit to specific colors. This is a 1-3 digit number (level 1 to 999, e.g., 5, 42, 618). Look for numbers near level indicators, progress bars, or star icons of any color.
2. Rank: Extract the text that appears after 'Rank:' in yellow font color. This is typically the player's rank name (e.g., 'Galactic Overlord', 'Master', 'Professional'). Look for rank text anywhere on the profile screen, not just after a label.
3. Unique ID: Extract the number that appears below the country flag on the left side of the screen, formatted with hyphens (e.g., '182-625-474-6'). Look for 'Unique ID:' label followed by the number, or any number sequence with hyphens in the format X-XXX-XXX-X.

IMPORTANT: This is a profile screen if you can see player statistics, level information, rank information, or player identification. Even if you cannot extract specific values, if this appears to be a profile screen (not a main menu, shop, or game screen), try your best to extract at least one field. Only return 'UNKNOWN' if you are absolutely certain the value is not present or readable.

If any value is unreadable or cannot be found, return 'UNKNOWN' for that field.
Output ONLY valid JSON, no explanation, no markdown, no code blocks.
Format: {"level": 618, "rank": "Galactic Overlord", "uniqueId": "182-625-474-6"}`;

    logger.debug('Calling OpenAI Vision API for profile extraction');
    
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
      logger.warn('OpenAI Vision API returned empty response');
      return {
        level: 'UNKNOWN',
        rank: 'UNKNOWN',
        uniqueId: 'UNKNOWN',
      };
    }
    
    const profileData = parseVisionResponse(content);
    
    logger.info('Profile data extracted via Vision API', {
      level: profileData.level,
      rank: profileData.rank,
      uniqueId: profileData.uniqueId,
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
    };
  }
}









