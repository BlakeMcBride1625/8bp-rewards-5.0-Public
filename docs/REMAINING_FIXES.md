# Remaining Fixes - TODO

## 🎨 Discord Avatar Toggle Issue (User Dashboard)

**Problem:** Discord avatar toggle isn't working - no Discord profile picture shows up when toggled on.

**What we've done so far:**
- ✅ Added toggle button to user dashboard
- ✅ Added backend endpoint for toggling Discord avatar
- ✅ Implemented optimistic UI updates
- ✅ Added state management to prevent race conditions
- ✅ Fixed avatar priority logic in backend
- ✅ Added logic to fetch Discord avatar hash from user session if missing

**What still needs to be checked:**
- ❌ **TEST**: Verify Discord avatar actually displays when toggle is ON
- ❌ **DEBUG**: Check if `discord_avatar_hash` is being populated correctly in database
- ❌ **DEBUG**: Check if `activeAvatarUrl` is computed correctly on frontend
- ❌ **DEBUG**: Check browser console for any JavaScript errors
- ❌ **DEBUG**: Check backend logs when toggle is clicked - does it show the correct avatar URL?
- ❌ **FIX**: Ensure Discord avatar image URL is correctly formatted: `https://cdn.discordapp.com/avatars/${discordId}/${discord_avatar_hash}.png`

**Testing Steps:**
1. Open user dashboard
2. Click Discord avatar toggle ON
3. Check if Discord profile picture appears
4. Check browser console for errors
5. Check network tab for API calls to `/profile-image/discord-toggle`
6. Check backend logs for avatar URL computation

**Files to check:**
- `frontend/src/pages/UserDashboardPage.tsx` - Toggle handler and avatar display
- `backend/src/routes/user-dashboard.ts` - Toggle endpoint and avatar priority logic
- `backend/src/routes/auth.ts` - Discord OAuth callback (where avatar hash should be set)

---

## ✅ Verification Bot - FIXED
- ✅ Created `pool_accounts` table in database
- ✅ Added error handling for missing table (graceful fallback)
- ✅ Bot should now work correctly

---

## 📝 Notes
- The Discord avatar toggle might not be showing because:
  1. `discord_avatar_hash` is null/empty in database
  2. Avatar URL format is incorrect
  3. Frontend isn't updating the displayed avatar
  4. CORS/loading issue with Discord CDN

- Need to verify:
  - Is the Discord avatar hash being saved during OAuth login?
  - Is the toggle actually updating the database?
  - Is the frontend reading the correct `activeAvatarUrl`?




