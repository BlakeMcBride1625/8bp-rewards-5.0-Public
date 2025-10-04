# Real-Time Claim Progress Tracker

## Overview
The Progress Tracker is a new feature in the admin dashboard that provides real-time visibility into the manual claim process. It shows each user's progress through the claiming steps with live updates.

## Features

### 🎯 Real-Time Progress Tracking
- **Live Updates**: Automatically refreshes every 2 seconds during active claims
- **User Progress**: Shows each user's journey through the claim process
- **Step-by-Step Tracking**: Visualizes progress through each phase

### 📊 Progress Indicators
- **Overall Progress**: Shows total users, completed, failed, and current user
- **Progress Bar**: Visual representation of completion percentage
- **Status Icons**: Color-coded status indicators for each step

### 🔍 Detailed Monitoring
- **Step Tracking**: Shows each user's progress through:
  - Navigating to shop
  - Login modal appearance
  - Successful login
  - Entering user ID
  - Clicking Go button
  - Claim success/failure
- **Live Logs**: Real-time console output from the claim process
- **Timestamps**: Precise timing for each step and log entry

## How to Use

### 1. Trigger Manual Claim
1. Go to the Admin Dashboard
2. Click "Trigger Manual Claim" button
3. The progress tracker will automatically open

### 2. Monitor Progress
- **Progress Overview**: See total users, completed, failed, and current user
- **User Progress List**: View detailed progress for each user
- **Live Logs**: Toggle to see real-time console output

### 3. Progress Tracker Controls
- **Auto Refresh**: Automatically updates every 2 seconds (can be toggled)
- **Show/Hide Logs**: Toggle console output visibility
- **Close**: Exit the progress tracker

## UI Components

### Progress Cards
- **Total Users**: Number of users in the claim queue
- **Completed**: Successfully claimed users
- **Failed**: Users who encountered errors
- **Current User**: Currently processing user ID

### User Progress Items
Each user shows:
- **User ID**: 8 Ball Pool account identifier
- **Status**: Current status (starting, in_progress, completed, failed)
- **Steps**: Visual timeline of completed actions
- **Timestamps**: When each step occurred

### Live Logs
- **Real-time Output**: Console logs from the claim process
- **Color Coding**: Info (green), warnings (yellow), errors (red)
- **Timestamps**: Precise timing for each log entry

## Technical Details

### API Endpoints
- `POST /api/admin/claim-all` - Triggers manual claim and returns processId
- `GET /api/admin/claim-progress/:processId` - Get specific process progress
- `GET /api/admin/claim-progress` - Get all active processes

### Progress States
- **starting**: Process initialization
- **running**: Active claim processing
- **completed**: Process finished successfully
- **failed**: Process encountered errors

### Step Types
- **navigating**: Browser navigating to shop
- **login_modal**: Login modal appeared
- **logged_in**: Successfully authenticated
- **entering_id**: Entering user ID
- **go_clicked**: Clicked Go button
- **claimed**: Successfully claimed rewards
- **failed**: Claim failed

## Benefits

### For Administrators
- **Real-time Visibility**: See exactly what's happening during claims
- **Issue Detection**: Quickly identify problems or bottlenecks
- **Progress Monitoring**: Track completion status across all users
- **Debugging**: Access to live logs for troubleshooting

### For System Monitoring
- **Performance Tracking**: Monitor claim processing times
- **Success Rates**: Track success/failure ratios
- **User Experience**: Ensure smooth claim processing
- **System Health**: Monitor overall system performance

## Future Enhancements
- **WebSocket Integration**: Real-time updates without polling
- **Historical Data**: View past claim sessions
- **Analytics**: Detailed performance metrics
- **Alerts**: Notifications for failures or issues
- **Export**: Download progress reports

## Troubleshooting

### Common Issues
1. **Progress Not Updating**: Check auto-refresh is enabled
2. **Missing User Progress**: Verify processId is correct
3. **Logs Not Showing**: Ensure "Show Logs" is toggled on

### Error Handling
- **Process Not Found**: Process may have completed or failed
- **Network Errors**: Check connection and retry
- **Permission Issues**: Ensure admin authentication

## Integration
The Progress Tracker integrates seamlessly with the existing admin dashboard and claim system, providing enhanced visibility without disrupting existing workflows.
