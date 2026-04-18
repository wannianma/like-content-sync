const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const memosSync = require('./memos');
const qiniuUpload = require('./qiniu');
const webdavSync = require('./webdav');

// Use local data directory for development, /data/notes for Docker deployment
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

// Max image size to download (10MB)
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

/**
 * Get the user's base directory path
 */
function getUserDir(apiKeyHash) {
  return path.join(DATA_DIR, `user-${apiKeyHash}`);
}

/**
 * Get the images directory path for a user
 */
function getImagesDir(apiKeyHash) {
  return path.join(getUserDir(apiKeyHash), 'images');
}

/**
 * Get daily markdown file path
 */
function getDailyFilePath(apiKeyHash, date = new Date()) {
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(getUserDir(apiKeyHash), `${dateStr}.md`);
}

/**
 * Ensure directory exists
 */
async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

/**
 * Generate unique filename for image
 */
function generateImageFilename(originalName) {
  const ext = path.extname(originalName) || '.png';
  const id = crypto.randomBytes(8).toString('hex');
  return `${id}${ext}`;
}

/**
 * Download image from URL
 */
async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LikeContentSync/1.0)'
      }
    }, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        downloadImage(response.headers.location).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
        return;
      }

      // Check content type
      const contentType = response.headers['content-type'] || '';
      if (!contentType.startsWith('image/')) {
        reject(new Error(`Not an image: ${contentType}`));
        return;
      }

      // Check content length
      const contentLength = parseInt(response.headers['content-length'] || '0', 10);
      if (contentLength > MAX_IMAGE_SIZE) {
        reject(new Error(`Image too large: ${contentLength} bytes`));
        return;
      }

      const chunks = [];
      let totalSize = 0;

      response.on('data', (chunk) => {
        totalSize += chunk.length;
        if (totalSize > MAX_IMAGE_SIZE) {
          request.destroy();
          reject(new Error(`Image too large: exceeded ${MAX_IMAGE_SIZE} bytes during download`));
          return;
        }
        chunks.push(chunk);
      });

      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        // Determine extension from content type
        let ext = '.png';
        if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = '.jpg';
        else if (contentType.includes('png')) ext = '.png';
        else if (contentType.includes('gif')) ext = '.gif';
        else if (contentType.includes('webp')) ext = '.webp';
        else if (contentType.includes('svg')) ext = '.svg';
        resolve({ buffer, ext, contentType });
      });

      response.on('error', reject);
    });

    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Download timeout'));
    });
  });
}

/**
 * Extract image URLs from markdown content
 * Includes both external URLs and local images that need Qiniu upload
 */
function extractImageUrlsFromContent(content) {
  const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const images = [];
  let match;

  while ((match = regex.exec(content)) !== null) {
    const url = match[2];
    // External URLs (http/https) - need download
    if (url && !url.startsWith('data:') && (url.startsWith('http://') || url.startsWith('https://'))) {
      if (!url.startsWith('images/')) { // Not already a local path
        images.push({
          type: 'external',
          fullMatch: match[0],
          alt: match[1],
          url: url
        });
      }
    }
    // Local images (images/) - need Qiniu upload if configured
    if (url && url.startsWith('images/')) {
      images.push({
        type: 'local',
        fullMatch: match[0],
        alt: match[1],
        url: url
      });
    }
  }

  return images;
}

/**
 * Download images from content and replace URLs with local paths
 * Also upload to Qiniu for Memos display
 * Handles both external URLs and local images that need Qiniu upload
 */
async function processContentImages(apiKeyHash, content) {
  const images = extractImageUrlsFromContent(content);
  const imagesDir = getImagesDir(apiKeyHash);
  await ensureDir(imagesDir);

  const downloadedImages = [];
  let updatedContent = content;

  for (const imageInfo of images) {
    try {
      if (imageInfo.type === 'external') {
        // Download external image
        console.log(`Downloading image: ${imageInfo.url}`);

        const { buffer, ext } = await downloadImage(imageInfo.url);
        const filename = generateImageFilename(`image${ext}`);
        const filePath = path.join(imagesDir, filename);

        // Save local copy
        await fs.writeFile(filePath, buffer);
        const localUrl = `images/user-${apiKeyHash}/${filename}`;

        // Upload to Qiniu (if configured)
        let qiniuUrl = null;
        if (qiniuUpload.isQiniuEnabled()) {
          const qiniuResult = await qiniuUpload.uploadImage(buffer, filename, apiKeyHash);
          if (qiniuResult.success) {
            qiniuUrl = qiniuResult.url;
            console.log(`[Qiniu] Image uploaded: ${qiniuUrl}`);
          }
        }

        // Replace URL in content (use local URL for local file)
        const newImageTag = `![${imageInfo.alt}](${localUrl})`;
        updatedContent = updatedContent.replace(imageInfo.fullMatch, newImageTag);

        downloadedImages.push({
          originalUrl: imageInfo.url,
          localUrl: localUrl,
          qiniuUrl: qiniuUrl,
          filename: filename,
          apiKeyHash: apiKeyHash,
          size: buffer.length
        });

        console.log(`Saved image: ${filename} (${buffer.length} bytes)`);
      } else if (imageInfo.type === 'local') {
        // Handle existing local image - upload to Qiniu if configured
        const localPath = imageInfo.url;
        console.log(`Processing local image: ${localPath}`);

        // Extract filename and user hash from path (images/user-{hash}/{filename})
        const pathParts = localPath.split('/');
        const userHash = pathParts[1]; // user-{hash}
        const filename = pathParts[2]; // filename

        // Only upload if Qiniu is configured
        if (qiniuUpload.isQiniuEnabled()) {
          // Read local file - actual path is {DATA_DIR}/{userHash}/images/{filename}
          const filePath = path.join(DATA_DIR, userHash, 'images', filename);
          try {
            await fs.access(filePath);
            const buffer = await fs.readFile(filePath);

            // Upload to Qiniu (use the user hash from the path)
            const qiniuResult = await qiniuUpload.uploadImage(buffer, filename, userHash.replace('user-', ''));
            if (qiniuResult.success) {
              console.log(`[Qiniu] Local image uploaded: ${qiniuResult.url}`);
              downloadedImages.push({
                originalUrl: localPath,
                localUrl: localPath,
                qiniuUrl: qiniuResult.url,
                filename: filename,
                apiKeyHash: userHash.replace('user-', ''),
                size: buffer.length
              });
            }
          } catch (accessErr) {
            console.warn(`Local image file not found: ${filePath}`);
          }
        }
      }
    } catch (err) {
      console.warn(`Failed to process image ${imageInfo.url}: ${err.message}`);
      // Keep original URL if download fails
    }
  }

  return { content: updatedContent, downloadedImages };
}

/**
 * Format content for markdown file
 */
function formatMarkdownEntry(title, url, content, tags, timestamp) {
  const date = new Date(timestamp);
  const timeStr = date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  let entry = `## ${timeStr}\n\n`;
  entry += `**来源**: [${title}](${url})\n\n`;

  if (tags && tags.length > 0) {
    entry += `**标签**: ${tags.join(', ')}\n\n`;
  }

  entry += `${content}\n\n`;
  entry += '---\n\n';

  return entry;
}

/**
 * Initialize user directories
 */
async function initUserDirs(apiKeyHash) {
  await ensureDir(getUserDir(apiKeyHash));
  await ensureDir(getImagesDir(apiKeyHash));
}

/**
 * Save image to user's images directory
 * Also upload to Qiniu if configured
 */
async function saveImage(apiKeyHash, imageBuffer, filename) {
  const imagesDir = getImagesDir(apiKeyHash);
  await ensureDir(imagesDir);

  const filePath = path.join(imagesDir, filename);
  await fs.writeFile(filePath, imageBuffer);

  const localUrl = `images/user-${apiKeyHash}/${filename}`;

  // Upload to Qiniu if configured
  let qiniuUrl = null;
  if (qiniuUpload.isQiniuEnabled()) {
    const qiniuResult = await qiniuUpload.uploadImage(imageBuffer, filename, apiKeyHash);
    if (qiniuResult.success) {
      qiniuUrl = qiniuResult.url;
    }
  }

  return { localUrl, qiniuUrl };
}

/**
 * Append content to daily markdown file
 * @param {string} apiKeyHash - User API key hash
 * @param {string} title - Page title
 * @param {string} url - Source URL
 * @param {string} content - Markdown content
 * @param {Array} tags - Tags array
 * @param {string} timestamp - ISO timestamp
 * @param {Array} uploadedImages - Uploaded images info [{ localUrl, qiniuUrl, filename }]
 * @param {Object} memosConfig - Memos 配置（用户级）{ url, token, enabled }
 * @param {Object} webdavConfig - WebDAV 配置（用户级）{ url, username, password, basePath, enabled }
 */
async function appendToDailyFile(apiKeyHash, title, url, content, tags, timestamp, uploadedImages = [], memosConfig = null, webdavConfig = null) {
  const dailyFile = getDailyFilePath(apiKeyHash, new Date(timestamp));

  await initUserDirs(apiKeyHash);

  // Process images in content (download and replace URLs)
  const { content: processedContent, downloadedImages } = await processContentImages(apiKeyHash, content);

  // Merge uploaded images with downloaded images for Memos sync
  const allImages = [...uploadedImages, ...downloadedImages];

  const entry = formatMarkdownEntry(title, url, processedContent, tags, timestamp);

  // Check if file exists and add header if new
  let header = '';
  try {
    await fs.access(dailyFile);
  } catch {
    const dateStr = new Date(timestamp).toISOString().split('T')[0];
    header = `# ${dateStr}\n\n`;
  }

  await fs.appendFile(dailyFile, header + entry);

  // 读取完整的当天文件内容（用于 WebDAV 同步）
  let fullFileContent = '';
  try {
    fullFileContent = await fs.readFile(dailyFile, 'utf8');
  } catch (readErr) {
    console.warn('[Storage] Could not read daily file for WebDAV sync:', readErr.message);
    fullFileContent = header + entry; // fallback to current entry
  }

  // 获取服务器 URL（用于 Memos 图片访问）
  const serverUrl = process.env.SERVER_URL || '';

  // 异步同步到外部服务（不阻塞主流程）
  const syncTasks = [];

  // Memos 同步（用户级配置）
  if (memosConfig && memosConfig.enabled && memosConfig.url && memosConfig.token) {
    syncTasks.push(
      memosSync.syncToMemos(
        { title, url, content: processedContent, tags, timestamp },
        memosConfig,
        allImages,
        serverUrl
      )
        .then(result => {
          if (result.success) {
            const qiniuCount = allImages.filter(img => img.qiniuUrl).length;
            console.log(`[Memos] Sync completed: ${result.memoUrl}, total images: ${allImages.length}, Qiniu: ${qiniuCount}`);
          } else {
            console.warn(`[Memos] Sync failed: ${result.reason}`);
          }
        })
        .catch(err => {
          console.error('[Memos] Sync error:', err.message);
        })
    );
  }

  // WebDAV 同步（用户级配置）
  if (webdavConfig && webdavSync.isWebDAVEnabled(webdavConfig)) {
    // 为 WebDAV 准备图片 buffer
    const imagesWithBuffer = [];
    for (const img of allImages) {
      if (img.filename && img.localUrl) {
        try {
          // 尝试读取本地图片文件
          const localImagePath = path.join(DATA_DIR, `user-${apiKeyHash}`, 'images', img.filename);
          const buffer = await fs.readFile(localImagePath);
          imagesWithBuffer.push({
            ...img,
            buffer
          });
        } catch (readErr) {
          console.warn(`[WebDAV] Could not read local image: ${img.filename}`);
        }
      }
    }

    syncTasks.push(
      webdavSync.syncToWebDAV(
        { title, url, content: processedContent, tags, timestamp },
        imagesWithBuffer,
        webdavConfig,
        apiKeyHash,
        fullFileContent  // 发送完整的当天 md 文件内容
      )
        .then(result => {
          if (result.success) {
            console.log(`[WebDAV] Sync completed: ${result.filePath}, images: ${result.imageCount}`);
          } else {
            console.warn(`[WebDAV] Sync failed: ${result.reason}`);
          }
        })
        .catch(err => {
          console.error('[WebDAV] Sync error:', err.message);
        })
    );
  }

  // 执行所有同步任务（并行，不阻塞）
  if (syncTasks.length > 0) {
    Promise.all(syncTasks).catch(err => {
      console.error('[Sync] Sync tasks error:', err.message);
    });
  }

  return { downloadedImages };
}

module.exports = {
  getUserDir,
  getImagesDir,
  getDailyFilePath,
  ensureDir,
  generateImageFilename,
  formatMarkdownEntry,
  initUserDirs,
  saveImage,
  appendToDailyFile,
  downloadImage,
  extractImageUrlsFromContent,
  processContentImages
};