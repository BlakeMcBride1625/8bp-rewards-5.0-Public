## Manual Claim Per User - Setup Instructions

To use the new manual claim per user functionality:

1. Copy the environment template:
   cp env-template.txt .env

2. Edit .env and configure your settings:
   - Set TEST_USERS to customize test users (optional)
   - Configure all other required environment variables

3. The new features are now available in the Admin Dashboard:
   - Single User Claim: Enter any user ID
   - Test User Quick Claims: Pre-configured buttons
   - Claim All Users: Original functionality (unchanged)

4. Test users can be configured via TEST_USERS environment variable:
   Format: JSON array with id, username, description fields
   Example: [{"id":"1826254746","username":"TestUser1","description":"Primary test user"}]

## Files Updated:
- Backend API: Added /admin/claim-users and /admin/test-users endpoints
- Frontend: Enhanced Manual Actions section with new claim options
- Claimer Scripts: Support TARGET_USER_IDS for targeted claims
- Config: Added test users configuration support
- Docker: Added TEST_USERS environment variable
- Documentation: Updated README with new admin commands

All changes are backward compatible!
