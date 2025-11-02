# Discord OAuth Setup & Fix Guide

## Issue 1: Missing Application Logo/Icon

The blank logo in the Discord authorization popup means you need to upload an application icon in the Discord Developer Portal.

### How to Fix:

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your application ("8 Ball Pool/Rewards")
3. Go to **"General Information"** section
4. Scroll to **"APP ICON"**
5. Click **"Upload Icon"** or the icon placeholder
6. Upload a square image (minimum 512x512 pixels recommended)
   - Format: PNG, JPG, or GIF
   - Max size: 8MB
   - Recommended: 512x512 or 1024x1024 PNG with transparency
7. Click **"Save Changes"**

The icon should now appear in Discord authorization popups within a few minutes.

## Issue 2: Discord OAuth Redirect Not Working

### Current Configuration:

- **Callback Route**: `/8bp-rewards/api/auth/discord/callback`
- **Redirect URI in .env**: `https://8bp.epildevconnect.uk/8bp-rewards/api/auth/discord/callback`
- **Redirect After Auth**: `https://8bp.epildevconnect.uk/8bp-rewards/admin-dashboard`

### Steps to Fix Redirect:

1. **Verify Discord Developer Portal Settings:**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Select your application
   - Go to **"OAuth2"** → **"General"**
   - Under **"Redirects"**, ensure you have EXACTLY:
     ```
     https://8bp.epildevconnect.uk/8bp-rewards/api/auth/discord/callback
     ```
   - The URI must match EXACTLY (case-sensitive, including https://)
   - Click **"Save Changes"**

2. **Check Environment Variables:**
   - Ensure `.env` has:
     ```env
     OAUTH_REDIRECT_URI=https://8bp.epildevconnect.uk/8bp-rewards/api/auth/discord/callback
     ADMIN_DASHBOARD_URL=https://8bp.epildevconnect.uk/8bp-rewards/admin-dashboard
     ```

3. **Session Cookie Configuration:**
   - The session cookie must be configured for cross-site requests
   - `sameSite: 'none'` is required for OAuth redirects
   - `secure: true` is required when `sameSite: 'none'` (HTTPS only)

4. **Restart Backend After Changes:**
   ```bash
   docker restart 8bp-backend
   ```

### Testing:

1. Visit: `https://8bp.epildevconnect.uk/8bp-rewards/api/auth/discord`
2. You should be redirected to Discord authorization
3. After authorizing, you should be redirected back to your admin dashboard
4. If you see an error, check:
   - Browser console for errors
   - Backend logs: `docker logs 8bp-backend | grep oauth`
   - Network tab to see redirect flow

### Common Issues:

1. **"Redirect URI mismatch"**: The URI in Discord Developer Portal doesn't exactly match your callback URL
2. **"Session lost"**: Cookie settings (`sameSite`, `secure`) not configured correctly
3. **"Redirect loops"**: Check that `ADMIN_DASHBOARD_URL` is correct and accessible

## Additional Notes:

- The application icon can take a few minutes to update after upload
- OAuth redirect URIs must be HTTPS in production
- Session cookies require proper CORS and cookie settings for cross-domain redirects

