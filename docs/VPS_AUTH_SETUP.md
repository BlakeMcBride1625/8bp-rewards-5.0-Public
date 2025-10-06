# VPS Monitor Two-Factor Authentication Setup

## Overview
The VPS Monitor tab now requires two-factor authentication via Discord bot. This ensures only authorized admins can access sensitive VPS monitoring data.

## Setup Instructions

### 1. Environment Configuration
Add the following environment variable to your `.env` file:

```bash
# Comma-separated list of Discord user IDs who can access VPS Monitor
ALLOWED_VPS_ADMINS=123456789012345678,987654321098765432
```

### 2. Getting Discord User IDs
To get a Discord user ID:
1. Enable Developer Mode in Discord (User Settings → Advanced → Developer Mode)
2. Right-click on the user → Copy User ID
3. Add the ID to the `ALLOWED_VPS_ADMINS` environment variable

### 3. Discord Bot Requirements
Your Discord bot must have the following permissions:
- `Send Messages` - To send access codes via DM
- `Manage Messages` - To delete messages after use
- `Create DM` - To create direct message channels

## How It Works

### Authentication Flow
1. **User clicks VPS Monitor tab** → System checks if user is in `ALLOWED_VPS_ADMINS`
2. **If authorized** → User clicks "Send Access Code" button
3. **Bot sends DM** → 16-character random code sent to user's Discord DMs
4. **User enters code** → Code is verified and expires after 5 minutes
5. **Access granted** → Original code message is deleted, approval message sent
6. **Auto-cleanup** → Approval message auto-deletes after 24 hours

### Security Features
- **One-time codes**: Each code can only be used once
- **Time expiration**: Codes expire after 5 minutes
- **Auto-cleanup**: All Discord messages are automatically deleted
- **User verification**: Codes can only be used by the user who requested them
- **Admin whitelist**: Only users in `ALLOWED_VPS_ADMINS` can request codes

### Code Format
- **Length**: 16 characters
- **Format**: Hexadecimal (0-9, A-F)
- **Example**: `A1B2C3D4E5F6789A`

## API Endpoints

### Request Access Code
```http
POST /api/admin/vps/request-access
Authorization: Required (admin session)
```

**Response:**
```json
{
  "message": "Access code sent to your Discord DMs",
  "expiresIn": 300000
}
```

### Verify Access Code
```http
POST /api/admin/vps/verify-access
Authorization: Required (admin session)
Content-Type: application/json

{
  "code": "A1B2C3D4E5F6789A"
}
```

**Response:**
```json
{
  "message": "Access granted",
  "accessToken": "session_token_here"
}
```

### Check Access Status
```http
GET /api/admin/vps/access-status
Authorization: Required (admin session)
```

**Response:**
```json
{
  "isAllowed": true,
  "hasActiveCode": false
}
```

## Error Handling

### Common Error Responses
- `403 Forbidden`: User not in `ALLOWED_VPS_ADMINS`
- `400 Bad Request`: Invalid, expired, or already-used code
- `500 Internal Server Error`: Discord API issues or server errors

### Discord API Errors
- **Failed to send DM**: Bot doesn't have permission or user blocked bot
- **Failed to delete message**: Bot doesn't have manage messages permission
- **User not found**: Invalid Discord user ID

## Troubleshooting

### Bot Can't Send DMs
1. Ensure bot has `Send Messages` permission
2. Check if user has DMs enabled from server members
3. Verify bot can create DM channels

### Code Not Working
1. Check code hasn't expired (5-minute limit)
2. Ensure code hasn't been used already
3. Verify code belongs to the requesting user

### Access Denied
1. Confirm user ID is in `ALLOWED_VPS_ADMINS`
2. Check Discord user ID is correct (enable Developer Mode)
3. Restart backend after changing environment variables

## Security Considerations

### Production Recommendations
1. **Use Redis/Database**: Replace in-memory storage with persistent storage
2. **Rate Limiting**: Add rate limiting to prevent code spam
3. **Audit Logging**: Log all VPS access attempts
4. **Session Management**: Implement proper session tokens with expiration

### Environment Security
- Keep `ALLOWED_VPS_ADMINS` secure and limit to essential personnel
- Regularly review and update the admin list
- Use environment-specific configurations (dev/staging/prod)

## Example Configuration

### Development (.env)
```bash
ALLOWED_VPS_ADMINS=123456789012345678
```

### Production (.env)
```bash
ALLOWED_VPS_ADMINS=123456789012345678,987654321098765432,555666777888999000
```

## Testing

### Manual Testing
1. Add your Discord user ID to `ALLOWED_VPS_ADMINS`
2. Restart the backend server
3. Navigate to Admin Dashboard → VPS Monitor tab
4. Follow the authentication flow
5. Verify Discord messages are sent and auto-deleted

### Automated Testing
Consider adding integration tests for:
- Code generation and expiration
- Discord message sending and deletion
- Access control verification
- Error handling scenarios
