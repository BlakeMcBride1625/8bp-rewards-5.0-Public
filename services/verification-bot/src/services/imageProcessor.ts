import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { PassThrough, Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { logger } from './logger';
import { rankMatcher } from './rankMatcher';
import { extractProfileData, ProfileData } from './visionProfileExtractor';
import { MatchedRank } from '../types';

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB
const DOWNLOAD_TIMEOUT_MS = 10_000;
const TEMP_DIR = path.join(process.cwd(), 'tmp');

export type ImageSource = {
  url: string;
  size?: number | null;
  contentType?: string | null;
  filename?: string | null;
};

type ProcessedAttachment = {
  data: Buffer;
  name: string;
  contentType: string;
};

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Download image from URL to local file
 */
async function downloadImage(url: string, filePath: string, maxBytes: number): Promise<void> {
  const controller = new AbortController();
  let timedOut = false;
  let exceededSize = false;
  let downloadedBytes = 0;

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, DOWNLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': '8BP-Verification-Bot/1.0',
      },
    } as RequestInit);

    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > maxBytes) {
      exceededSize = true;
      throw new Error(`Image size ${contentLength} exceeds maximum ${maxBytes}`);
    }

    const fileStream = fs.createWriteStream(filePath);
    const body = response.body;

    if (!body) {
      throw new Error('Response body is null');
    }

    const readable = Readable.fromWeb(body as ReadableStream);
    const passThrough = new PassThrough();

    readable.on('data', (chunk: Buffer) => {
      downloadedBytes += chunk.length;
      if (downloadedBytes > maxBytes) {
        exceededSize = true;
        passThrough.destroy();
        fileStream.destroy();
        throw new Error(`Image size ${downloadedBytes} exceeds maximum ${maxBytes}`);
      }
    });

    await pipeline(readable, passThrough, fileStream);
  } catch (error) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    if (timedOut) {
      throw new Error(`Image download timed out after ${DOWNLOAD_TIMEOUT_MS}ms`);
    }
    if (exceededSize) {
      throw error;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Compute SHA256 hash of a file
 */
async function computeFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', (error) => reject(error));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}


/**
 * Validate if extracted data suggests this is a profile screenshot
 * We check if we got valid data from Vision API
 * 
 * Made more lenient: If Vision API fails to extract data, we still allow it
 * to proceed to rank matching, as the API might fail on valid profiles due to
 * image quality, lighting, or UI variations.
 */
function isValidProfileScreenshot(profileData: ProfileData): boolean {
  // If we got at least rank or level, it's definitely a profile
  if (profileData.rank !== 'UNKNOWN' || profileData.level !== 'UNKNOWN') {
    return true;
  }

  // If we have unique ID, it's likely a profile
  if (profileData.uniqueId !== 'UNKNOWN') {
    return true;
  }

  // If all fields are UNKNOWN, we still allow it to proceed
  // The Vision API might fail to extract data from valid profiles due to:
  // - Image quality issues
  // - UI variations or updates
  // - Lighting/contrast issues
  // - Different device resolutions
  // We'll let rank matching attempt to process it, and if that also fails,
  // the user will get a more helpful error message
  logger.debug('All fields UNKNOWN, but allowing to proceed to rank matching', {
    level: profileData.level,
    rank: profileData.rank,
    uniqueId: profileData.uniqueId,
  });
  return true;
}

/**
 * Normalize filename for storage
 */
function normalizeFilename(rawName: string | null | undefined, fallbackExtension: string): string {
  const baseName = rawName && rawName.trim().length > 0 ? rawName : `profile${fallbackExtension || '.png'}`;
  const normalized = baseName.replace(/[^\w.\-]/g, '_');
  if (path.extname(normalized)) {
    return normalized;
  }
  return `${normalized}${fallbackExtension || '.png'}`;
}

/**
 * Resolve content type from input or extension
 */
function resolveContentType(input: string | null | undefined, extension: string): string {
  if (input && input.trim().length > 0) {
    return input;
  }

  const ext = extension.toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') {
    return 'image/jpeg';
  }
  if (ext === '.png') {
    return 'image/png';
  }

  return 'image/png'; // Default
}

/**
 * Process image using OpenAI Vision API to extract profile data
 * Maintains compatibility with existing code structure
 */
export async function processImage(source: ImageSource): Promise<{
  success: boolean;
  rank?: MatchedRank;
  level?: number;
  isProfile?: boolean;
  ocrText?: string;
  screenshotHash?: string;
  uniqueId?: string | null;
  attachmentUrl: string;
  attachmentFile?: ProcessedAttachment;
  ocrArtifacts?: never; // No longer used, but kept for type compatibility
}> {
  const urlWithoutQuery = source.url.split('?')[0];
  const fileExtension = path.extname(urlWithoutQuery).toLowerCase();

  const contentType = source.contentType || '';
  const isImage = ['.jpg', '.jpeg', '.png'].includes(fileExtension) || contentType.startsWith('image/');

  if (!isImage) {
    logger.debug('Attachment is not an image', {
      extension: fileExtension,
      content_type: contentType,
      url: source.url,
    });
    return { success: false, attachmentUrl: source.url };
  }

  if (source.size && source.size > MAX_ATTACHMENT_BYTES) {
    logger.warn('Attachment exceeds size limit', {
      attachment_size: source.size,
      limit: MAX_ATTACHMENT_BYTES,
      url: source.url,
    });
    return { success: false, attachmentUrl: source.url };
  }

  const tempFilePath = path.join(
    TEMP_DIR,
    `image_${Date.now()}_${Math.random().toString(36).substring(7)}${fileExtension}`,
  );

  try {
    logger.info('Starting image processing with Vision API', { url: source.url, temp_path: tempFilePath });

    logger.debug('Downloading image...');
    await downloadImage(source.url, tempFilePath, MAX_ATTACHMENT_BYTES);
    logger.debug('Image downloaded successfully');

    const attachmentBuffer = await fs.promises.readFile(tempFilePath);
    const attachmentFilename = normalizeFilename(source.filename ?? path.basename(urlWithoutQuery), fileExtension);
    const attachmentContentType = resolveContentType(source.contentType ?? null, fileExtension);

    // Compute screenshot hash
    const screenshotHash = await computeFileHash(tempFilePath);
    logger.debug('Computed screenshot hash', {
      screenshot_hash: screenshotHash,
    });

    // Extract profile data using Vision API
    logger.debug('Extracting profile data with Vision API...');
    const profileData = await extractProfileData(attachmentBuffer);

    logger.info('Profile data extracted via Vision API', {
      level: profileData.level,
      rank: profileData.rank,
      uniqueId: profileData.uniqueId,
    });

    // Validate if this is a profile screenshot
    const isProfile = isValidProfileScreenshot(profileData);
    if (!isProfile) {
      logger.warn('Image does not appear to be a profile screenshot', {
        level: profileData.level,
        rank: profileData.rank,
        uniqueId: profileData.uniqueId,
      });
      return {
        success: false,
        isProfile: false,
        screenshotHash,
        attachmentUrl: source.url,
        uniqueId: profileData.uniqueId !== 'UNKNOWN' ? profileData.uniqueId : null,
        attachmentFile: {
          data: attachmentBuffer,
          name: attachmentFilename,
          contentType: attachmentContentType,
        },
      };
    }

    // Match rank using rankMatcher
    logger.debug('Matching rank from extracted data...');
    let matchedRank: MatchedRank | null = null;

    // Extract level as number if available
    let extractedLevel: number | null = null;
    if (profileData.level !== 'UNKNOWN') {
      extractedLevel = typeof profileData.level === 'number' ? profileData.level : parseInt(String(profileData.level), 10);
      if (isNaN(extractedLevel)) {
        extractedLevel = null;
      }
    }

    // Try to match by rank name if available
    if (profileData.rank !== 'UNKNOWN') {
      matchedRank = rankMatcher.matchRankByNameHint(profileData.rank);
      if (matchedRank) {
        logger.info('Rank matched from Vision API rank name', {
          rank_name: matchedRank.rank_name,
          confidence: matchedRank.confidence,
          extracted_rank: profileData.rank,
        });
      } else {
        logger.warn('Rank name extracted but could not match', {
          extracted_rank: profileData.rank,
        });
      }
    }

    // If still no match, return failure
    if (!matchedRank) {
      logger.warn('No rank matched from Vision API data', {
        extracted_rank: profileData.rank,
        extracted_level: profileData.level,
        extracted_uniqueId: profileData.uniqueId,
      });
      return {
        success: false,
        isProfile: true,
        screenshotHash,
        uniqueId: profileData.uniqueId !== 'UNKNOWN' ? profileData.uniqueId : null,
        attachmentUrl: source.url,
        ocrText: '', // Empty for Vision API, kept for compatibility
        attachmentFile: {
          data: attachmentBuffer,
          name: attachmentFilename,
          contentType: attachmentContentType,
        },
      };
    }

    // Determine final level (use Vision API level if available, otherwise use rank default)
    let finalLevel: number | undefined;
    if (profileData.level !== 'UNKNOWN') {
      finalLevel = typeof profileData.level === 'number' ? profileData.level : parseInt(String(profileData.level), 10);
      if (isNaN(finalLevel)) {
        finalLevel = matchedRank.level_detected ?? matchedRank.level_min;
      }
    } else {
      finalLevel = matchedRank.level_detected ?? matchedRank.level_min;
    }

    logger.info('Rank matched successfully', {
      rank_name: matchedRank.rank_name,
      level: finalLevel,
      confidence: matchedRank.confidence,
    });

    return {
      success: true,
      rank: {
        ...matchedRank,
        level_extracted_from_image: profileData.level !== 'UNKNOWN' && typeof profileData.level === 'number' ? profileData.level : null,
      },
      level: finalLevel,
      ocrText: '', // Empty for Vision API, kept for compatibility
      screenshotHash,
      uniqueId: profileData.uniqueId !== 'UNKNOWN' ? profileData.uniqueId : null,
      attachmentUrl: source.url,
      attachmentFile: {
        data: attachmentBuffer,
        name: attachmentFilename,
        contentType: attachmentContentType,
      },
    };
  } catch (error) {
    logger.error('Error processing image', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      attachment_url: source.url,
    });
    return { success: false, attachmentUrl: source.url };
  } finally {
    // Clean up temp file
    if (fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupError) {
        logger.warn('Failed to clean up temp file', {
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
          file_path: tempFilePath,
        });
      }
    }
  }
}
