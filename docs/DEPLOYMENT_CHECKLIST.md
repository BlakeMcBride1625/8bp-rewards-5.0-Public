# Deployment Checklist

## Pre-Deployment Verification

### ✅ Code Changes Complete
- [x] `user_id = username` implemented (8BP account username from registration or verification)
- [x] Role detection (Owner/Admin/Member) working
- [x] All fallback usernames removed
- [x] Leaderboard uses INNER JOIN, filters non-null usernames
- [x] User dashboard returns `user_id` correctly
- [x] Verification always updates username when detected
- [x] TypeScript compiles successfully

### ✅ Files Modified
**Backend:**
- `backend/src/utils/roles.ts` (NEW)
- `backend/src/routes/auth.ts`
- `backend/src/routes/leaderboard.ts`
- `backend/src/routes/user-dashboard.ts`
- `backend/src/routes/verification.ts`
- `backend/src/services/VerificationSyncService.ts`

**Frontend:**
- `frontend/src/hooks/useAuth.tsx`
- `frontend/src/components/Layout.tsx`
- `frontend/src/pages/LeaderboardPage.tsx`
- `frontend/src/pages/UserDashboardPage.tsx`

**Migration:**
- `migrations/unified_database_migration.sql` (NEW)
- `migrations/copy_verification_data.sql` (NEW)
- `migrations/README_DATABASE_CONSOLIDATION.md` (NEW)

## Testing Checklist

### Manual Testing
- [ ] Test leaderboard displays correct usernames (not Discord names, not IDs)
- [ ] Test user dashboard shows correct username and `user_id` for logged-in user
- [ ] Test role display in navbar (Owner/Admin/Member)
- [ ] Test search functionality with username and `user_id`
- [ ] Test verification bot updates username when image is processed
- [ ] Verify no fallback usernames ("User 123", "Unknown") appear anywhere

### API Testing
- [ ] GET `/api/leaderboard` returns `user_id`, `username`, `eight_ball_pool_id`
- [ ] GET `/api/user-dashboard/linked-accounts` returns `user_id` correctly
- [ ] GET `/api/auth/status` returns `role` field
- [ ] POST `/api/internal/verification/sync` updates username correctly

## Database Migration (Optional)

### Before Migration
- [ ] Backup `8bp_rewards` database
- [ ] Backup `accountchecker` database (verification DB)
- [ ] Test migration in staging environment first

### Migration Steps
1. Run `migrations/unified_database_migration.sql` in rewards DB
2. Run `migrations/copy_verification_data.sql` to copy data
3. Verify data integrity with validation queries
4. (Optional) Switch verification bot to use unified database

See `migrations/README_DATABASE_CONSOLIDATION.md` for detailed instructions.

## Deployment Steps

### 1. Build Services
```bash
cd /home/blake/8bp-rewards

# Build backend
cd backend && npm run build

# Build frontend
cd ../frontend && npm run build
```

### 2. Restart Services
```bash
docker-compose restart backend
# Or rebuild if needed:
docker-compose up -d --build backend
```

### 3. Verify Services
```bash
# Check services are running
docker ps | grep 8bp

# Check backend logs
docker logs 8bp-backend --tail 50

# Check verification bot logs
docker logs 8bp-verification-bot --tail 50
```

### 4. Test Endpoints
```bash
# Test auth status
curl http://localhost:2600/api/auth/status

# Test leaderboard
curl http://localhost:2600/api/leaderboard?timeframe=7d&limit=10
```

## Post-Deployment Verification

- [ ] Verify leaderboard shows correct usernames
- [ ] Verify user dashboard displays `user_id` correctly
- [ ] Verify role displays correctly in navbar
- [ ] Check logs for any errors
- [ ] Verify verification bot sync still works

## Rollback Plan

If issues occur:

1. **Code Rollback:**
   ```bash
   git checkout <previous-commit>
   docker-compose restart backend
   ```

2. **Database Rollback:**
   - Restore from backup if migration was run
   - Verification bot can still use separate database

3. **No Breaking Changes:**
   - All changes are backward compatible
   - Existing functionality preserved

## Environment Variables

Ensure these are set correctly:

```env
# Role Detection
VPS_OWNERS=discord_id1,discord_id2
ALLOWED_ADMINS=discord_id1,discord_id2

# Verification
VERIFICATION_BOT_TOKEN=...
VERIFICATION_DATABASE_URL=...
OPENAI_API_KEY=...

# Database
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=8bp_rewards
POSTGRES_USER=admin
POSTGRES_PASSWORD=...
```

## Monitoring

After deployment, monitor:
- [ ] Error logs for any username-related issues
- [ ] Leaderboard query performance
- [ ] User dashboard loading times
- [ ] Verification sync success rate

## Support

If issues arise:
1. Check logs: `docker logs 8bp-backend`
2. Review `./CHANGES_COMPLETE.md` for details
3. Verify environment variables are set correctly
4. Check database connectivity

