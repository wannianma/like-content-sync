const express = require('express');
const multer = require('multer');
const storage = require('../storage');
const memosSync = require('../storage/memos');

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 10 // Max 10 images
  }
});

/**
 * POST /api/content
 * Save content with optional images
 *
 * Form fields:
 * - title: string (required) - page title
 * - url: string (required) - source URL
 * - content: string (required) - selected text, markdown formatted
 * - images: file[] (optional) - 0 or more image files
 * - tags: string (optional) - comma-separated tags
 * - timestamp: string (required) - ISO 8601 format
 */
router.post('/', upload.array('images', 10), async (req, res) => {
  try {
    const { title, url, content, tags, timestamp } = req.body;

    // Validate required fields
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'Missing required field: title' });
    }
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing required field: url' });
    }
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Missing required field: content' });
    }
    if (!timestamp || typeof timestamp !== 'string') {
      return res.status(400).json({ error: 'Missing required field: timestamp' });
    }

    // Validate timestamp
    const timestampDate = new Date(timestamp);
    if (isNaN(timestampDate.getTime())) {
      return res.status(400).json({ error: 'Invalid timestamp format. Use ISO 8601.' });
    }

    // Parse tags
    let parsedTags = [];
    if (tags && typeof tags === 'string') {
      parsedTags = tags.split(',').map(t => t.trim()).filter(t => t);
    }

    // Validate tag count
    if (parsedTags.length > 10) {
      return res.status(400).json({ error: 'Too many tags. Maximum 10 tags allowed.' });
    }

    // Validate tag length
    for (const tag of parsedTags) {
      if (tag.length > 50) {
        return res.status(400).json({ error: `Tag too long: ${tag.substring(0, 20)}...` });
      }
    }

    const apiKeyHash = req.apiKeyHash;
    const uploadedImageUrls = [];

    // Save uploaded image files
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const filename = storage.generateImageFilename(file.originalname);
        const imageUrl = await storage.saveImage(apiKeyHash, file.buffer, filename);
        uploadedImageUrls.push(imageUrl);
      }
    }

    // Append uploaded images to content
    let finalContent = content;
    if (uploadedImageUrls.length > 0) {
      for (const imageUrl of uploadedImageUrls) {
        finalContent += `\n\n![uploaded image](${imageUrl})`;
      }
    }

    // Save content to daily file (will auto-download images in content)
    const result = await storage.appendToDailyFile(
      apiKeyHash,
      title,
      url,
      finalContent,
      parsedTags,
      timestamp
    );

    res.json({
      success: true,
      uploadedImages: uploadedImageUrls.length,
      downloadedImages: result.downloadedImages.length,
      downloadedDetails: result.downloadedImages,
      memosEnabled: Boolean(memosSync.getMemosConfig().url && memosSync.getMemosConfig().token)
    });
  } catch (err) {
    console.error('Error saving content:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;