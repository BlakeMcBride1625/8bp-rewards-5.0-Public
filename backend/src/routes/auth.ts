import express from 'express';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import { logger } from '../services/LoggerService';
import { getUserRole } from '../utils/roles';
import { DatabaseService } from '../services/DatabaseService';
import https from 'https';
import http from 'http';
import axios from 'axios';

const router = express.Router();
const dbService = DatabaseService.getInstance();

// Create HTTP agents with timeout for Discord API calls
const httpAgent = new http.Agent({
  keepAlive: true,
  timeout: 15000, // 15 second timeout
  keepAliveMsecs: 1000
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  timeout: 15000, // 15 second timeout
  keepAliveMsecs: 1000
});

// Configure Discord OAuth2 strategy
passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  callbackURL: process.env.OAUTH_REDIRECT_URI!,
  scope: ['identify', 'email'],
  // Use custom HTTP agents with timeout
  httpAgent: httpAgent,
  httpsAgent: httpsAgent
} as any, async (accessToken: string, refreshToken: string, profile: any, done: (error: any, user?: any) => void) => {
  try {
    // Allow all Discord users (guild membership check happens in callback)
    logger.info('Discord OAuth successful', {
      action: 'oauth_success',
      discordId: profile.id,
      username: profile.username
    });

    return done(null, profile);
  } catch (error) {
    logger.error('Discord OAuth error', {
      action: 'oauth_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      discordId: profile.id
    });
    return done(error, false);
  }
}));

// Serialize user for session
passport.serializeUser((user: any, done) => {
  done(null, user);
});

// Deserialize user from session
passport.deserializeUser((user: any, done) => {
  done(null, user);
});

// Initiate Discord OAuth2 login
router.get('/discord', passport.authenticate('discord'));

// Discord OAuth2 callback - Manual implementation to work around network issues
router.get('/discord/callback', 
  async (req: express.Request, res: express.Response) => {
    // Log callback received
    logger.info('Discord OAuth callback received', {
      action: 'oauth_callback_received',
      code: req.query.code ? 'present' : 'missing',
      error: req.query.error || null
    });
    
    // If there's an error from Discord, redirect immediately
    if (req.query.error) {
      logger.error('Discord OAuth error from callback', {
        action: 'oauth_discord_error',
        error: req.query.error,
        errorDescription: req.query.error_description
      });
      const publicUrl = process.env.PUBLIC_URL || 'https://8bp.epildevconnect.uk';
      return res.redirect(`${publicUrl}/8bp-rewards/?error=oauth_failed`);
    }
    
    // If no code, redirect to failure
    if (!req.query.code) {
      logger.warn('Discord OAuth callback missing code', {
        action: 'oauth_missing_code'
      });
      return res.redirect(`${process.env.PUBLIC_URL || 'https://8bp.epildevconnect.uk'}/8bp-rewards/?error=oauth_failed`);
    }
    
    // Manual token exchange (workaround for Docker network issues)
    try {
      logger.info('Attempting manual Discord token exchange', {
        action: 'oauth_manual_exchange'
      });
      
      // Exchange authorization code for access token
      const tokenResponse = await axios.post(
        'https://discord.com/api/oauth2/token',
        new URLSearchParams({
          client_id: process.env.DISCORD_CLIENT_ID!,
          client_secret: process.env.DISCORD_CLIENT_SECRET!,
          grant_type: 'authorization_code',
          code: req.query.code as string,
          redirect_uri: process.env.OAUTH_REDIRECT_URI!
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 30000,
          httpsAgent: new https.Agent({
            timeout: 30000,
            keepAlive: true
          })
        }
      );
      
      const accessToken = tokenResponse.data.access_token;
      
      // Fetch user profile
      const userResponse = await axios.get('https://discord.com/api/users/@me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        timeout: 15000,
        httpsAgent: new https.Agent({
          timeout: 15000,
          keepAlive: true
        })
      });
      
      const profile = userResponse.data;
      
      // Check if user is in Discord server (for user dashboard access)
      const guildId = process.env.DISCORD_GUILD_ID;
      const botToken = process.env.DISCORD_TOKEN;
      let isInServer = false;
      
      if (guildId && botToken) {
        try {
          const memberResponse = await axios.get(
            `https://discord.com/api/v10/guilds/${guildId}/members/${profile.id}`,
            {
              headers: {
                'Authorization': `Bot ${botToken}`
              },
              validateStatus: (status) => status < 500
            }
          );
          isInServer = memberResponse.status === 200;
        } catch (error) {
          logger.warn('Failed to check Discord guild membership during OAuth', {
            action: 'oauth_guild_check_failed',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          // Allow login even if guild check fails (fallback)
          isInServer = true;
        }
      } else {
        // If no guild ID set, allow all users
        isInServer = true;
      }
      
      if (!isInServer) {
        logger.warn('User not in Discord server during OAuth', {
          action: 'oauth_user_not_in_guild',
          discordId: profile.id,
          username: profile.username
        });
        const homeUrl = process.env.HOME_URL || '/8bp-rewards/home';
        return res.redirect(`${homeUrl}?error=not_in_server`);
      }
      
      // Check if user is admin
      const allowedAdmins = process.env.ALLOWED_ADMINS?.split(',') || [];
      const isAdmin = allowedAdmins.includes(profile.id);
      
      // Set user in session manually
      (req as any).user = profile;
      (req as any).login(profile, (err: any) => {
        if (err) {
          logger.error('Session login error', {
            action: 'oauth_session_error',
            error: err.message
          });
          const baseUrl = process.env.PUBLIC_URL || process.env.HOME_URL || 'https://8ballpool.website';
          const homeUrl = `${baseUrl}/8bp-rewards/home`;
          return res.redirect(`${homeUrl}?error=oauth_session_failed`);
        }
        
        // Save session before redirecting
        req.session.save((saveErr: any) => {
          if (saveErr) {
            logger.error('Session save error', {
              action: 'oauth_session_save_error',
              error: saveErr.message
            });
          }
          
          logger.info('Discord OAuth successful (manual)', {
            action: 'oauth_callback_success_manual',
            userId: profile.id,
            username: profile.username,
            isAdmin,
            isInServer
          });
          
          // Update Discord avatar hash for all registrations linked to this Discord ID
          // Note: profile.avatar can be null for users with default Discord avatars
          logger.info('Checking Discord avatar hash from OAuth profile', {
            action: 'oauth_avatar_check',
            discordId: profile.id,
            has_avatar_hash: !!profile.avatar,
            avatar_hash_value: profile.avatar || 'null (default avatar)'
          });
          
          // Update avatar hash even if null (to indicate default avatar)
          // This ensures we track the current state of the user's Discord avatar
          dbService.findRegistrations({ discordId: profile.id })
            .then(registrations => {
              if (registrations.length === 0) {
                logger.info('No registrations found for Discord ID during OAuth', {
                  action: 'oauth_no_registrations',
                  discordId: profile.id
                });
                return;
              }
              
              logger.info('Found registrations to update with Discord avatar hash', {
                action: 'oauth_registrations_found',
                discordId: profile.id,
                registration_count: registrations.length,
                avatar_hash: profile.avatar || null
              });
              
              return Promise.all(
                registrations.map(reg => {
                  const updateData: any = {
                    discord_avatar_hash: profile.avatar || null, // Save null if default avatar
                    use_discord_avatar: reg.use_discord_avatar ?? (reg.discordId ? true : false)
                  };
                  
                  logger.debug('Updating registration with Discord avatar hash', {
                    action: 'oauth_update_registration',
                    discordId: profile.id,
                    eightBallPoolId: reg.eightBallPoolId,
                    avatar_hash: profile.avatar || null,
                    previous_hash: reg.discord_avatar_hash || null
                  });
                  
                  return dbService.updateRegistration(reg.eightBallPoolId, updateData);
                })
              );
            })
            .then(() => {
              logger.info('Discord avatar hash updated for linked accounts', {
                action: 'update_discord_avatar_hash',
                discordId: profile.id,
                avatarHash: profile.avatar || null,
                hash_status: profile.avatar ? 'custom_avatar' : 'default_avatar'
              });
            })
            .catch(error => {
              logger.error('Failed to update Discord avatar hash', {
                action: 'update_discord_avatar_hash_error',
                error: error instanceof Error ? error.message : 'Unknown error',
                error_stack: error instanceof Error ? error.stack : undefined,
                discordId: profile.id,
                avatarHash: profile.avatar || null
              });
            });
          
          // Redirect based on user type
          // Use full URL to ensure proper redirect
          const baseUrl = process.env.PUBLIC_URL || process.env.HOME_URL || 'https://8ballpool.website';
          const redirectPath = isAdmin 
            ? (process.env.DASHBOARD_SELECTION_URL || '/8bp-rewards/dashboard-selection')
            : (process.env.USER_DASHBOARD_URL || '/8bp-rewards/user-dashboard');
          
          // Ensure redirectPath is a full URL or starts with /
          const redirectUrl = redirectPath.startsWith('http') 
            ? redirectPath 
            : `${baseUrl}${redirectPath}`;
          
          logger.info('Redirecting user after login', {
            action: 'oauth_redirect',
            userId: profile.id,
            isAdmin,
            redirectUrl,
            sessionId: req.sessionID
          });
          
          return res.redirect(redirectUrl);
        });
      });
      
    } catch (error: any) {
      logger.error('Manual OAuth token exchange failed', {
        action: 'oauth_manual_failed',
        error: error.message,
        code: error.code,
        response: error.response?.status,
        stack: error.stack
      });
      
      // Redirect to error page
      const publicUrl = process.env.PUBLIC_URL || 'https://8bp.epildevconnect.uk';
      return res.redirect(`${publicUrl}/8bp-rewards/?error=oauth_failed`);
    }
  }
);

// Get current user info
router.get('/me', (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    const user = req.user as any;
    res.json({
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
        email: user.email
      }
    });
  } else {
    res.json({
      authenticated: false,
      user: null
    });
  }
});

// Logout
router.post('/logout', (req, res): void => {
  req.logout((err): void => {
    if (err) {
      logger.error('Logout error', {
        action: 'logout_error',
        error: err.message
      });
      res.status(500).json({ error: 'Logout failed' });
      return;
    }

    req.session.destroy((err): void => {
      if (err) {
        logger.error('Session destruction error', {
          action: 'session_destroy_error',
          error: err.message
        });
        res.status(500).json({ error: 'Session cleanup failed' });
        return;
      }

      res.clearCookie('connect.sid');
      res.json({ message: 'Logged out successfully' });
    });
  });
});

  // Check authentication status
  router.get('/status', (req, res): void => {
    // Disable caching for auth status
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    
    // Development bypass - auto-authenticate in development mode
    if (process.env.NODE_ENV === 'development') {
      const allowedAdmins = process.env.ALLOWED_ADMINS?.split(',') || [];
      const devAdminId = allowedAdmins[0] || '850726663289700373'; // Use first admin or your ID
      const role = getUserRole(devAdminId);
      
      res.json({
        authenticated: true,
        isAdmin: true,
        role,
        user: {
          id: devAdminId,
          username: 'epildev',
          discriminator: '0000',
          avatar: 'dev-avatar'
        }
      });
      return;
    }
  
  const isAuthenticated = req.isAuthenticated && req.isAuthenticated();
  
  if (isAuthenticated) {
    const user = req.user as any;
    const role = getUserRole(user.id);
    const allowedAdmins = process.env.ALLOWED_ADMINS?.split(',') || [];
    const isAdmin = allowedAdmins.includes(user.id) || role === 'Owner' || role === 'Admin';
    
    res.json({
      authenticated: true,
      isAdmin,
      role,
      user: {
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar
      }
    });
  } else {
    res.json({
      authenticated: false,
      isAdmin: false,
      role: 'Member',
      user: null
    });
  }
});

export default router;




