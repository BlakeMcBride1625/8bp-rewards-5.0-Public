import express from 'express';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import { logger } from '../services/LoggerService';
import https from 'https';
import http from 'http';
import axios from 'axios';

const router = express.Router();

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
    // Check if user is in allowed admins list
    const allowedAdmins = process.env.ALLOWED_ADMINS?.split(',') || [];
    
    if (!allowedAdmins.includes(profile.id)) {
      logger.warn('Unauthorized Discord OAuth attempt', {
        action: 'oauth_unauthorized',
        discordId: profile.id,
        username: profile.username
      });
      return done(null, false);
    }

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
      return res.redirect('/8bp-rewards/?error=oauth_failed');
    }
    
    // If no code, redirect to failure
    if (!req.query.code) {
      logger.warn('Discord OAuth callback missing code', {
        action: 'oauth_missing_code'
      });
      return res.redirect('/8bp-rewards/?error=oauth_failed');
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
      
      // Check if user is allowed admin
      const allowedAdmins = process.env.ALLOWED_ADMINS?.split(',') || [];
      if (!allowedAdmins.includes(profile.id)) {
        logger.warn('Unauthorized Discord OAuth attempt', {
          action: 'oauth_unauthorized',
          discordId: profile.id,
          username: profile.username
        });
        return res.redirect('/8bp-rewards/?error=oauth_unauthorized');
      }
      
      // Set user in session manually
      (req as any).user = profile;
      (req as any).login(profile, (err: any) => {
        if (err) {
          logger.error('Session login error', {
            action: 'oauth_session_error',
            error: err.message
          });
          return res.redirect('/8bp-rewards/?error=oauth_session_failed');
        }
        
        logger.info('Discord OAuth successful (manual)', {
          action: 'oauth_callback_success_manual',
          userId: profile.id,
          username: profile.username
        });
        
        const redirectUrl = process.env.ADMIN_DASHBOARD_URL || '/8bp-rewards/admin-dashboard';
        const finalUrl = redirectUrl.startsWith('http') 
          ? redirectUrl 
          : (redirectUrl.startsWith('/') ? redirectUrl : `/8bp-rewards${redirectUrl}`);
        
        return res.redirect(finalUrl);
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
      return res.redirect('/8bp-rewards/?error=oauth_failed');
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
      
      res.json({
        authenticated: true,
        isAdmin: true,
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
    const allowedAdmins = process.env.ALLOWED_ADMINS?.split(',') || [];
    const isAdmin = allowedAdmins.includes(user.id);
    
    res.json({
      authenticated: true,
      isAdmin,
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
      user: null
    });
  }
});

export default router;




