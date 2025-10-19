import express from 'express';
import axios from 'axios';
import { logger } from '../services/LoggerService';

const router = express.Router();

// Cache for profile pictures to avoid repeated API calls
const profileCache = new Map<string, { url: string; timestamp: number }>();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// TikTok profile picture endpoints - using more reliable APIs
const TIKTOK_APIS = [
  'https://api.tiklydown.eu.org/api/profile-picture',
  'https://tikcdn.io/avatar',
  'https://api.tiklydown.eu.org/api/user-info',
  'https://api.tiklydown.eu.org/api/user',
  'https://tiklydown.eu.org/api/profile-picture',
  'https://api.tiklydown.eu.org/api/profile-picture',
  'https://api.tiklydown.eu.org/api/profile-picture'
];

async function fetchTikTokProfilePicture(username: string): Promise<string | null> {
  // Check cache first
  const cached = profileCache.get(username);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.url;
  }

  try {
    logger.info(`Fetching TikTok profile page for: ${username}`);
    
    // Try to fetch the TikTok profile page directly
    const response = await axios.get(`https://www.tiktok.com/@${username}`, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    });

    if (response.status === 200 && response.data) {
      // Extract avatar URLs from the HTML/JSON data
      const html = response.data;
      
      // Look for avatar URLs in the JSON data
      const avatarMatches = html.match(/"avatarLarger":"([^"]+)"/);
      if (avatarMatches && avatarMatches[1]) {
        let avatarUrl = avatarMatches[1];
        
        // Decode the URL if it's encoded
        avatarUrl = avatarUrl.replace(/\\u002F/g, '/');
        
        // Cache the result
        profileCache.set(username, {
          url: avatarUrl,
          timestamp: Date.now()
        });
        
        logger.info(`Successfully extracted TikTok profile picture for ${username}: ${avatarUrl}`);
        return avatarUrl;
      }
      
      // Try alternative patterns
      const altMatches = html.match(/"avatarMedium":"([^"]+)"/);
      if (altMatches && altMatches[1]) {
        let avatarUrl = altMatches[1];
        avatarUrl = avatarUrl.replace(/\\u002F/g, '/');
        
        profileCache.set(username, {
          url: avatarUrl,
          timestamp: Date.now()
        });
        
        logger.info(`Successfully extracted TikTok profile picture (medium) for ${username}: ${avatarUrl}`);
        return avatarUrl;
      }
    }
  } catch (error) {
    logger.warn(`Failed to fetch TikTok profile page for ${username}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Fallback: Try external APIs
  for (const api of TIKTOK_APIS) {
    try {
      let url: string;
      
      if (api.includes('tiklydown') && api.includes('profile-picture')) {
        url = `${api}?username=${username}`;
      } else if (api.includes('tikcdn')) {
        url = `${api}/${username}`;
      } else if (api.includes('tiklydown') && (api.includes('user-info') || api.includes('user'))) {
        url = `${api}?username=${username}`;
      } else {
        continue;
      }

      logger.info(`Trying TikTok API: ${url}`);
      
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });

      if (response.status === 200 && response.data) {
        let profileUrl: string | null = null;
        
        // Handle different response formats
        if (typeof response.data === 'string') {
          // If it's a direct URL string
          if (response.data.startsWith('http')) {
            profileUrl = response.data;
          }
        } else if (typeof response.data === 'object') {
          // If it's a JSON object, look for common profile picture fields
          profileUrl = response.data.avatar || 
                      response.data.profile_picture || 
                      response.data.avatarLarger || 
                      response.data.avatarMedium ||
                      response.data.avatarThumb ||
                      response.data.profileUrl ||
                      response.data.url;
        }

        if (profileUrl) {
          // Cache the result
          profileCache.set(username, {
            url: profileUrl,
            timestamp: Date.now()
          });
          
          logger.info(`Successfully fetched profile picture for ${username}: ${profileUrl}`);
          return profileUrl;
        }
      }
    } catch (error) {
      logger.warn(`Failed to fetch from ${api}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      continue;
    }
  }

  // Fallback: Try to construct a direct TikTok CDN URL
  // This is a common pattern for TikTok profile pictures
  const fallbackUrls = [
    `https://p16-sign-va.tiktokcdn-us.com/obj/tos-useast2a-ve-277c-avt/avatar/${username}.jpeg`,
    `https://p16-sign-va.tiktokcdn-us.com/obj/tos-useast2a-ve-277c-avt/avatar/${username}.jpg`,
    `https://p16-sign-va.tiktokcdn-us.com/obj/tos-useast2a-ve-277c-avt/avatar/${username}.png`,
    `https://p16-sign-va.tiktokcdn-us.com/obj/tos-useast2a-ve-277c-avt/avatar/${username}.webp`
  ];

  for (const fallbackUrl of fallbackUrls) {
    try {
      logger.info(`Trying fallback URL: ${fallbackUrl}`);
      const response = await axios.head(fallbackUrl, { timeout: 5000 });
      
      if (response.status === 200) {
        // Cache the result
        profileCache.set(username, {
          url: fallbackUrl,
          timestamp: Date.now()
        });
        
        logger.info(`Successfully found fallback profile picture for ${username}: ${fallbackUrl}`);
        return fallbackUrl;
      }
    } catch (error) {
      logger.warn(`Fallback URL failed: ${fallbackUrl}`);
      continue;
    }
  }

  // Final fallback: Return a data URI placeholder image
  logger.warn(`All TikTok APIs failed for ${username}, returning data URI placeholder`);
  const initial = username.charAt(0).toUpperCase();
  const colors = ['FF6B6B', '4ECDC4', '45B7D1', '96CEB4', 'FFEAA7', 'DDA0DD', '98D8C8', 'F7DC6F'];
  const color = colors[username.length % colors.length];
  
  // Create a simple SVG placeholder as data URI
  const svg = `<svg width="150" height="150" xmlns="http://www.w3.org/2000/svg">
    <rect width="150" height="150" fill="#${color}"/>
    <text x="75" y="85" font-family="Arial, sans-serif" font-size="60" font-weight="bold" text-anchor="middle" fill="white">${initial}</text>
  </svg>`;
  
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

// GET /api/tiktok-profiles/:username - returns JSON
router.get('/:username', async (req, res) => {
  try {
    const { username } = req.params;
    
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    logger.info(`Fetching TikTok profile picture for: ${username}`);
    
    const profileUrl = await fetchTikTokProfilePicture(username);
    
    if (profileUrl) {
      return res.json({ 
        success: true, 
        profileUrl,
        username 
      });
    } else {
      return res.status(404).json({ 
        success: false, 
        error: 'Profile picture not found',
        username 
      });
    }
  } catch (error) {
    logger.error(`Error fetching TikTok profile: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// GET /api/tiktok-profiles/:username/image - returns image directly
router.get('/:username/image', async (req, res) => {
  const { username } = req.params;
  
  try {
    if (!username) {
      return res.status(400).send('Username is required');
    }

    logger.info(`Fetching TikTok profile image for: ${username}`);
    
    const profileUrl = await fetchTikTokProfilePicture(username);
    
    if (profileUrl) {
      // Redirect to the actual image URL
      return res.redirect(profileUrl);
    } else {
      // Return a default placeholder image
      const initial = username.charAt(0).toUpperCase();
      const colors = ['FF6B6B', '4ECDC4', '45B7D1', '96CEB4', 'FFEAA7', 'DDA0DD', '98D8C8', 'F7DC6F'];
      const color = colors[username.length % colors.length];
      
      const svg = `<svg width="150" height="150" xmlns="http://www.w3.org/2000/svg">
        <rect width="150" height="150" fill="#${color}"/>
        <text x="75" y="85" font-family="Arial, sans-serif" font-size="60" font-weight="bold" text-anchor="middle" fill="white">${initial}</text>
      </svg>`;
      
      const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
      return res.redirect(dataUri);
    }
  } catch (error) {
    logger.error(`Error fetching TikTok profile image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    const initial = username.charAt(0).toUpperCase();
    const colors = ['FF6B6B', '4ECDC4', '45B7D1', '96CEB4', 'FFEAA7', 'DDA0DD', '98D8C8', 'F7DC6F'];
    const color = colors[username.length % colors.length];
    
    const svg = `<svg width="150" height="150" xmlns="http://www.w3.org/2000/svg">
      <rect width="150" height="150" fill="#${color}"/>
      <text x="75" y="85" font-family="Arial, sans-serif" font-size="60" font-weight="bold" text-anchor="middle" fill="white">${initial}</text>
    </svg>`;
    
    const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    return res.redirect(dataUri);
  }
});

export default router;


