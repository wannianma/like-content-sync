const express = require('express');
const multer = require('multer');
const storage = require('../storage');

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
    const { title, url, content, tags, timestamp, memosConfig, webdavConfig } = req.body;

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

    // Parse sync configs (JSON strings from FormData)
    let parsedMemosConfig = null;
    let parsedWebdavConfig = null;

    if (memosConfig && typeof memosConfig === 'string') {
      try {
        parsedMemosConfig = JSON.parse(memosConfig);
      } catch (e) {
        console.warn('[API] Failed to parse memosConfig:', e.message);
      }
    }

    if (webdavConfig && typeof webdavConfig === 'string') {
      try {
        parsedWebdavConfig = JSON.parse(webdavConfig);
      } catch (e) {
        console.warn('[API] Failed to parse webdavConfig:', e.message);
      }
    }

    const apiKeyHash = req.apiKeyHash;
    const uploadedImages = [];

    // Save uploaded image files
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const filename = storage.generateImageFilename(file.originalname);
        const { localUrl, qiniuUrl } = await storage.saveImage(apiKeyHash, file.buffer, filename);
        uploadedImages.push({ localUrl, qiniuUrl, filename });
      }
    }

    // Append uploaded images to content (use local URL for local file, Qiniu URL tracked separately)
    let finalContent = content;
    if (uploadedImages.length > 0) {
      for (const img of uploadedImages) {
        finalContent += `\n\n![uploaded image](${img.localUrl})`;
      }
    }

    // Save content to daily file (will auto-download images in content)
    const result = await storage.appendToDailyFile(
      apiKeyHash,
      title,
      url,
      finalContent,
      parsedTags,
      timestamp,
      uploadedImages, // Pass uploaded images info for sync
      parsedMemosConfig, // User-level Memos config
      parsedWebdavConfig // User-level WebDAV config
    );

    const qiniuImageCount = [...uploadedImages, ...result.downloadedImages].filter(img => img.qiniuUrl).length;

    // Check which syncs are enabled
    const memosEnabled = parsedMemosConfig && parsedMemosConfig.enabled && parsedMemosConfig.url && parsedMemosConfig.token;
    const webdavEnabled = parsedWebdavConfig && parsedWebdavConfig.enabled && parsedWebdavConfig.url;

    res.json({
      success: true,
      uploadedImages: uploadedImages.length,
      qiniuImages: qiniuImageCount,
      downloadedImages: result.downloadedImages.length,
      downloadedDetails: result.downloadedImages,
      memosEnabled,
      webdavEnabled
    });
  } catch (err) {
    console.error('Error saving content:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;