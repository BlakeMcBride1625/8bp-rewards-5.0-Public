# Pre-Deployment Checklist

## ✅ Required Steps Before Deploying New Features

### 1. Database Migration - **REQUIRED**
Run the support tickets migration to create the necessary tables:

```bash
cd /home/blake/8bp-rewards

# Copy migration file to container
docker cp migrations/add_support_tickets.sql 8bp-postgres:/tmp/

# Run migration
docker-compose exec postgres psql -U ${POSTGRES_USER:-8bp_user} -d ${POSTGRES_DB:-8bp_rewards} -f /tmp/add_support_tickets.sql

# Verify tables were created
docker-compose exec postgres psql -U ${POSTGRES_USER:-8bp_user} -d ${POSTGRES_DB:-8bp_rewards} -c "\dt" | grep -E "support_tickets|ticket_"
```

**Expected output:** Should show:
- `support_tickets`
- `ticket_attachments`
- `ticket_messages`
- `ticket_sequences`

### 2. Create Verifications Folder (Optional - will auto-create)
The verifications folder will be created automatically when the first image is saved, but you can create it manually:

```bash
mkdir -p /home/blake/8bp-rewards/services/verification-bot/verifications
chmod 755 /home/blake/8bp-rewards/services/verification-bot/verifications
```

### 3. Verify Docker Compose Configuration
Check that volume mounts are correct:

```bash
docker-compose config | grep -A 5 "verification-bot:" | grep volumes
```

Should show:
- `./services/verification-bot/verifications:/app/services/verification-bot/verifications`

### 4. Rebuild and Restart Services
After migration, rebuild and restart affected services:

```bash
# Rebuild services with new code
docker-compose build backend verification-bot

# Restart services gracefully
docker-compose restart backend verification-bot

# Or full restart (if needed)
docker-compose down
docker-compose up -d
```

### 5. Verify Services Are Running
Check all services are healthy:

```bash
docker-compose ps
```

All services should show `Up` status.

### 6. Test New Features
After deployment, test:

- [ ] Contact form with file upload
- [ ] User dashboard support chat (create ticket)
- [ ] Admin dashboard support tickets view
- [ ] Verification images display (user and admin)
- [ ] Screenshots organized by account ID
- [ ] Discord bot `/clear` command with "all" option
- [ ] All bots show DND status

### 7. Check Logs
Monitor logs for any errors:

```bash
# Backend logs
docker-compose logs -f backend

# Verification bot logs
docker-compose logs -f verification-bot

# Discord API logs
docker-compose logs -f discord-api
```

## 🚨 Important Notes

1. **Database Migration is CRITICAL** - The support ticket system will not work without running the migration first.

2. **No .env Changes Needed** - All paths are configured with sensible defaults.

3. **Verifications Folder** - Will be created automatically on first save, but creating it manually ensures proper permissions.

4. **Backup First** (Recommended):
   ```bash
   # Backup database before migration
   docker-compose exec postgres pg_dump -U ${POSTGRES_USER:-8bp_user} ${POSTGRES_DB:-8bp_rewards} > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

## ✅ Quick Deploy Script

```bash
#!/bin/bash
cd /home/blake/8bp-rewards

# 1. Run migration
echo "Running database migration..."
docker cp migrations/add_support_tickets.sql 8bp-postgres:/tmp/
docker-compose exec -T postgres psql -U ${POSTGRES_USER:-8bp_user} -d ${POSTGRES_DB:-8bp_rewards} -f /tmp/add_support_tickets.sql

# 2. Create verifications folder
echo "Creating verifications folder..."
mkdir -p services/verification-bot/verifications
chmod 755 services/verification-bot/verifications

# 3. Rebuild and restart
echo "Rebuilding services..."
docker-compose build backend verification-bot

echo "Restarting services..."
docker-compose restart backend verification-bot

# 4. Verify
echo "Checking service status..."
docker-compose ps

echo "✅ Deployment complete!"
```



