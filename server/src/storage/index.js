const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const memosSync = require('./memos');

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
 */
function extractImageUrlsFromContent(content) {
  const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const images = [];
  let match;

  while ((match = regex.exec(content)) !== null) {
    const url = match[2];
    // Only download external URLs (not already local images/)
    if (url && !url.startsWith('images/') && !url.startsWith('data:') && (url.startsWith('http://') || url.startsWith('https://'))) {
      images.push({
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
 */
async function processContentImages(apiKeyHash, content) {
  const images = extractImageUrlsFromContent(content);
  const imagesDir = getImagesDir(apiKeyHash);
  await ensureDir(imagesDir);

  const downloadedImages = [];
  let updatedContent = content;

  for (const imageInfo of images) {
    try {
      console.log(`Downloading image: ${imageInfo.url}`);

      const { buffer, ext } = await downloadImage(imageInfo.url);
      const filename = generateImageFilename(`image${ext}`);
      const filePath = path.join(imagesDir, filename);

      await fs.writeFile(filePath, buffer);
      const localUrl = `images/user-${apiKeyHash}/${filename}`;

      // Replace URL in content
      const newImageTag = `![${imageInfo.alt}](${localUrl})`;
      updatedContent = updatedContent.replace(imageInfo.fullMatch, newImageTag);

      downloadedImages.push({
        originalUrl: imageInfo.url,
        localUrl: localUrl,
        filename: filename,
        apiKeyHash: apiKeyHash,
        size: buffer.length
      });

      console.log(`Saved image: ${filename} (${buffer.length} bytes)`);
    } catch (err) {
      console.warn(`Failed to download image ${imageInfo.url}: ${err.message}`);
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
 */
async function saveImage(apiKeyHash, imageBuffer, filename) {
  const imagesDir = getImagesDir(apiKeyHash);
  await ensureDir(imagesDir);

  const filePath = path.join(imagesDir, filename);
  await fs.writeFile(filePath, imageBuffer);

  return `images/user-${apiKeyHash}/${filename}`;
}

/**
 * Append content to daily markdown file
 */
async function appendToDailyFile(apiKeyHash, title, url, content, tags, timestamp) {
  const dailyFile = getDailyFilePath(apiKeyHash, new Date(timestamp));
  const imagesDir = getUserDir(apiKeyHash); // 用户目录，包含 images 子目录

  await initUserDirs(apiKeyHash);

  // Process images in content (download and replace URLs)
  const { content: processedContent, downloadedImages } = await processContentImages(apiKeyHash, content);

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

  // 异步同步到 Memos（不阻塞主流程）
  const memosConfig = memosSync.getMemosConfig();
  if (memosConfig.url && memosConfig.token) {
    // 异步执行，不等待结果，传递图片目录路径用于上传
    memosSync.syncToMemos(
      { title, url, content: processedContent, tags, timestamp },
      memosConfig,
      imagesDir
    )
      .then(result => {
        if (result.success) {
          console.log(`[Memos] Sync completed: ${result.memoUrl}, images: ${result.uploadedImages || 0}`);
        } else {
          console.warn(`[Memos] Sync failed: ${result.reason}`);
        }
      })
      .catch(err => {
        console.error('[Memos] Sync error:', err.message);
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