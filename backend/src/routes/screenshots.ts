import express from 'express';
import { logger } from '../services/LoggerService';
import { Registration } from '../models/Registration';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// Get screenshot folders and their contents
router.get('/folders', async (req, res) => {
  try {
    const screenshotsDir = path.join(__dirname, '../../../screenshots');
    const folders = [
      { name: 'confirmation', displayName: 'Confirmation Images' },
      { name: 'shop-page', displayName: 'Shop Page Screenshots' },
      { name: 'id-entry', displayName: 'After ID Entry Screenshots' },
      { name: 'go-click', displayName: 'After Go Click Screenshots' },
      { name: 'login', displayName: 'After Login Screenshots' },
      { name: 'initial', displayName: 'Initial Screenshots' },
      { name: 'final-page', displayName: 'Final Page Screenshots' }
    ];

    const folderData: Array<{
      name: string;
      displayName: string;
      files: Array<{
        name: string;
        size: string;
        modified: Date;
        base64Data: string;
      }>;
    }> = [];

    for (const folder of folders) {
      const folderPath = path.join(screenshotsDir, folder.name);
      let files: Array<{
        name: string;
        size: string;
        modified: Date;
        base64Data: string;
      }> = [];

      if (fs.existsSync(folderPath)) {
        const fileList = fs.readdirSync(folderPath);
        files = fileList
          .filter(file => file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg'))
          .map(file => {
            const filePath = path.join(folderPath, file);
            const stats = fs.statSync(filePath);
            
            // Convert image to base64 for direct display
            let base64Data = '';
            try {
              const imageBuffer = fs.readFileSync(filePath);
              const ext = path.extname(file).toLowerCase();
              const mimeType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
              base64Data = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
            } catch (error) {
              // If we can't read the file, leave base64Data empty
              console.warn(`Could not read image file: ${filePath}`);
            }
            
            return {
              name: file,
              size: formatFileSize(stats.size),
              modified: stats.mtime,
              base64Data: base64Data
            };
          })
          .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
      }

      folderData.push({
        name: folder.name,
        displayName: folder.displayName,
        files
      });
    }

    logger.info('Fetched screenshot folders', {
      action: 'fetch_screenshot_folders',
      totalFolders: folderData.length,
      totalFiles: folderData.reduce((sum, folder) => sum + folder.files.length, 0)
    });

    return res.json({
      success: true,
      folders: folderData
    });

  } catch (error) {
    logger.error('Error fetching screenshot folders', {
      action: 'fetch_screenshot_folders_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch screenshot folders'
    });
  }
});

// Serve individual screenshot images
router.get('/view/:folder/:filename', async (req, res) => {
  try {
    const { folder, filename } = req.params;
    
    // Validate folder name to prevent directory traversal
    const allowedFolders = ['final-page', 'shop-page', 'id-entry', 'go-click', 'login', 'confirmation', 'initial'];
    if (!allowedFolders.includes(folder)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid folder name'
      });
    }

    // Validate filename to prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid filename'
      });
    }

    const screenshotsDir = path.join(__dirname, '../../../screenshots');
    const imagePath = path.join(screenshotsDir, folder, filename);

    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({
        success: false,
        message: 'Screenshot not found'
      });
    }

    // Set appropriate headers for image serving
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    
    // Stream the image file
    const fileStream = fs.createReadStream(imagePath);
    fileStream.pipe(res);
    return; // Explicit return after streaming

  } catch (error) {
    logger.error('Error serving screenshot', {
      action: 'serve_screenshot_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to serve screenshot'
    });
  }
});

// Helper function to format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Clear screenshots for a specific user
router.post('/clear-user', async (req, res) => {
  try {
    const { userQuery } = req.body;
    
    if (!userQuery || typeof userQuery !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'User ID or username is required'
      });
    }

    // Find user by ID or username
    const user = await Registration.findOne({
      $or: [
        { eightBallPoolId: userQuery },
        { username: { $regex: userQuery, $options: 'i' } }
      ]
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const screenshotsDir = path.join(__dirname, '../../../screenshots');
    let deletedCount = 0;

    // Clear screenshots for this specific user
    const userScreenshotDirs = [
      'final-page',
      'shop-page',
      'id-entry',
      'go-click',
      'login',
      'confirmation',
      'initial'
    ];

    for (const dir of userScreenshotDirs) {
      const dirPath = path.join(screenshotsDir, dir);
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
          if (file.includes(user.eightBallPoolId)) {
            const filePath = path.join(dirPath, file);
            try {
              fs.unlinkSync(filePath);
              deletedCount++;
              logger.info(`Deleted screenshot: ${filePath}`);
            } catch (error) {
              logger.warn(`Failed to delete screenshot: ${filePath}`, { error });
            }
          }
        }
      }
    }

    logger.info(`Cleared screenshots for user ${user.username} (${user.eightBallPoolId})`, {
      action: 'clear_user_screenshots',
      userId: user.eightBallPoolId,
      username: user.username,
      deletedCount
    });

    return res.json({
      success: true,
      message: `Successfully cleared ${deletedCount} screenshots for user ${user.username}`,
      deletedCount
    });

  } catch (error) {
    logger.error('Error clearing user screenshots', {
      action: 'clear_user_screenshots_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to clear user screenshots'
    });
  }
});

// Clear all screenshots
router.post('/clear-all', async (req, res) => {
  try {
    const screenshotsDir = path.join(__dirname, '../../../screenshots');
    let deletedCount = 0;

    if (!fs.existsSync(screenshotsDir)) {
      return res.json({
        success: true,
        message: 'No screenshots directory found',
        deletedCount: 0
      });
    }

    // Get all screenshot directories
    const screenshotDirs = [
      'final-page',
      'shop-page', 
      'id-entry',
      'go-click',
      'login',
      'confirmation',
      'initial'
    ];

    for (const dir of screenshotDirs) {
      const dirPath = path.join(screenshotsDir, dir);
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          try {
            fs.unlinkSync(filePath);
            deletedCount++;
          } catch (error) {
            logger.warn(`Failed to delete screenshot: ${filePath}`, { error });
          }
        }
      }
    }

    logger.info(`Cleared all screenshots`, {
      action: 'clear_all_screenshots',
      deletedCount
    });

    return res.json({
      success: true,
      message: `Successfully cleared ${deletedCount} screenshots`,
      deletedCount
    });

  } catch (error) {
    logger.error('Error clearing all screenshots', {
      action: 'clear_all_screenshots_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to clear all screenshots'
    });
  }
});

export default router;
