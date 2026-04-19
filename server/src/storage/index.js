const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const memosSync = require('./memos');
const qiniuUpload = require('./qiniu');
const webdavSync = require('./webdav');
const MarkdownIt = require('markdown-it');

// Use local data directory for development, /data/notes for Docker deployment
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

// Max image size to download (10MB)
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

// Image proxy services for retry when download fails
const IMAGE_PROXY_SERVICES = [
  {
    name: 'wsrv.nl',
    buildUrl: (url) => `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=webp`
  },
  {
    name: 'images.weserv.nl',
    buildUrl: (url) => `https://images.weserv.nl/?url=${encodeURIComponent(url)}`
  }
];

// Initialize markdown-it parser
const md = new MarkdownIt({ html: true, linkify: true });

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
 * Download image from URL with proxy retry on failure
 * @param {string} url - Image URL to download
 * @param {boolean} useProxy - Whether to try proxy on failure (default: true)
 */
async function downloadImage(url, useProxy = true) {
  // First try direct download
  try {
    const result = await downloadImageDirect(url);
    return result;
  } catch (directError) {
    console.warn(`[Image] Direct download failed: ${directError.message}`);

    if (!useProxy) {
      throw directError;
    }

    // Try proxy services
    for (const proxy of IMAGE_PROXY_SERVICES) {
      try {
        console.log(`[Image] Trying proxy: ${proxy.name}`);
        const proxyUrl = proxy.buildUrl(url);
        const result = await downloadImageDirect(proxyUrl);
        console.log(`[Image] Proxy ${proxy.name} succeeded`);
        return result;
      } catch (proxyError) {
        console.warn(`[Image] Proxy ${proxy.name} failed: ${proxyError.message}`);
      }
    }

    // All attempts failed
    throw new Error(`All download attempts failed (direct + ${IMAGE_PROXY_SERVICES.length} proxies)`);
  }
}

/**
 * Direct download image from URL (no proxy)
 */
async function downloadImageDirect(url) {
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
        downloadImageDirect(response.headers.location).then(resolve).catch(reject);
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
 * Extract image URLs from markdown content using markdown-it AST parser
 * Accurately handles nested link-image format: [![alt](image-url)](link-url)
 * Handles relative paths using pageUrl as base
 */
function extractImageUrlsFromContent(content, pageUrl = null) {
  const images = [];

  // 提取页面基础 URL（域名）
  let pageBaseUrl = null;
  if (pageUrl) {
    try {
      const parsedUrl = new URL(pageUrl);
      pageBaseUrl = parsedUrl.origin;
    } catch (e) {
      console.warn('[Storage] Could not parse page URL:', pageUrl);
    }
  }

  // Parse content to AST tokens
  const tokens = md.parse(content, {});

  // Iterate through tokens
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // Images are inside inline tokens
    if (token.type === 'inline' && token.children) {
      const children = token.children;

      for (let j = 0; j < children.length; j++) {
        const child = children[j];

        // Check for nested link with image: link_open -> image -> link_close
        if (child.type === 'link_open') {
          const linkUrl = child.attrGet('href') || '';

          // Look for image inside this link
          for (let k = j + 1; k < children.length; k++) {
            const innerChild = children[k];

            if (innerChild.type === 'link_close') {
              break; // End of link
            }

            if (innerChild.type === 'image') {
              // Found nested image inside link
              const originalImageUrl = innerChild.attrGet('src') || '';
              const originalLinkUrl = linkUrl;
              let imageUrl = originalImageUrl;
              const alt = innerChild.content || innerChild.attrGet('alt') || '';

              // Convert relative paths for image URL
              if (imageUrl && imageUrl.startsWith('/') && pageBaseUrl) {
                imageUrl = pageBaseUrl + imageUrl;
                console.log(`[Storage] AST: Converted nested image relative path -> ${imageUrl}`);
              }

              // Convert relative paths for link URL
              let fullLinkUrl = originalLinkUrl;
              if (fullLinkUrl && fullLinkUrl.startsWith('/') && pageBaseUrl) {
                fullLinkUrl = pageBaseUrl + fullLinkUrl;
                console.log(`[Storage] AST: Converted nested link relative path -> ${fullLinkUrl}`);
              }

              // Build the full markdown match string using ORIGINAL URLs (for accurate replacement)
              const fullMatch = `[![${alt}](${originalImageUrl})](${originalLinkUrl})`;

              if (imageUrl && !imageUrl.startsWith('data:') &&
                  (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
                images.push({
                  type: 'nested_external',
                  fullMatch: fullMatch,
                  alt: alt,
                  url: imageUrl,
                  linkUrl: fullLinkUrl
                });
                console.log(`[Storage] AST: Found nested image: ${imageUrl}`);
              }
            }
          }
        }

        // Check for standalone image (not inside link)
        if (child.type === 'image') {
          // Check if previous sibling is link_open (means it's nested, already processed)
          let isNested = false;
          if (j > 0) {
            // Look back for link_open
            for (let m = j - 1; m >= 0; m--) {
              if (children[m].type === 'link_close') break;
              if (children[m].type === 'link_open') {
                isNested = true;
                break;
              }
            }
          }

          if (isNested) continue;

          // Also check if already processed by nested detection above
          const alreadyProcessed = images.some(img =>
            img.type === 'nested_external' && img.url === child.attrGet('src')
          );
          if (alreadyProcessed) continue;

          let url = child.attrGet('src') || '';
          const alt = child.content || child.attrGet('alt') || '';

          // Convert relative paths
          if (url && url.startsWith('/') && pageBaseUrl) {
            url = pageBaseUrl + url;
            console.log(`[Storage] AST: Converted relative path -> ${url}`);
          }

          // Build full markdown match
          const fullMatch = `![${alt}](${url})`;

          if (url && !url.startsWith('data:') &&
              (url.startsWith('http://') || url.startsWith('https://'))) {
            if (!url.startsWith('images/')) {
              images.push({
                type: 'external',
                fullMatch: fullMatch,
                alt: alt,
                url: url
              });
              console.log(`[Storage] AST: Found external image: ${url}`);
            }
          }

          // Local images
          if (url && url.startsWith('images/')) {
            images.push({
              type: 'local',
              fullMatch: fullMatch,
              alt: alt,
              url: url
            });
          }
        }
      }
    }
  }

  console.log(`[Storage] AST parser found ${images.length} images`);
  return images;
}

/**
 * Download images from content and replace URLs with local paths
 * Also upload to Qiniu for Memos display
 * Handles both external URLs and local images that need Qiniu upload
 */
async function processContentImages(apiKeyHash, content, pageUrl = null) {
  const images = extractImageUrlsFromContent(content, pageUrl);
  const imagesDir = getImagesDir(apiKeyHash);
  await ensureDir(imagesDir);

  const downloadedImages = [];
  let updatedContent = content;

  for (const imageInfo of images) {
    try {
      if (imageInfo.type === 'nested_external') {
        // 处理嵌套链接图片 [![alt](image-url)](link-url)
        // 对于 Memos 兼容性，转换为普通图片格式（去掉外层链接）
        console.log(`Downloading nested image: ${imageInfo.url}`);

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
            console.log(`[Qiniu] Nested image uploaded: ${qiniuUrl}`);
          }
        }

        // 转换为普通图片格式，去掉外层链接（Memos 兼容性更好）
        // Use Qiniu URL for Memos display if available, otherwise use local URL
        const displayUrl = qiniuUrl || localUrl;
        const newImageTag = `![${imageInfo.alt}](${displayUrl})`;
        updatedContent = updatedContent.replace(imageInfo.fullMatch, newImageTag);

        downloadedImages.push({
          originalUrl: imageInfo.url,
          localUrl: localUrl,
          qiniuUrl: qiniuUrl,
          filename: filename,
          apiKeyHash: apiKeyHash,
          size: buffer.length
        });

        console.log(`Saved nested image as plain: ${filename} (${buffer.length} bytes)`);
      } else if (imageInfo.type === 'external') {
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

        // Replace URL in content (use Qiniu URL for Memos, local URL for local file)
        const displayUrl = qiniuUrl || localUrl;
        const newImageTag = `![${imageInfo.alt}](${displayUrl})`;
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

  // 先保存原始内容到文件（不等待图片下载）
  const entry = formatMarkdownEntry(title, url, content, tags, timestamp);

  // Check if file exists and add header if new
  let header = '';
  try {
    await fs.access(dailyFile);
  } catch {
    const dateStr = new Date(timestamp).toISOString().split('T')[0];
    header = `# ${dateStr}\n\n`;
  }

  await fs.appendFile(dailyFile, header + entry);

  // 异步下载图片并更新文件（不阻塞主流程）
  const asyncImageTask = async () => {
    try {
      console.log('[Storage] Starting async image download...');
      const { content: processedContent, downloadedImages } = await processContentImages(apiKeyHash, content, url);

      // 如果有下载的图片，更新文件中的图片链接
      if (downloadedImages.length > 0) {
        const updatedEntry = formatMarkdownEntry(title, url, processedContent, tags, timestamp);

        // 读取文件内容并替换
        let fileContent = await fs.readFile(dailyFile, 'utf8');
        // 替换原始 entry 为更新后的 entry
        fileContent = fileContent.replace(entry, updatedEntry);
        await fs.writeFile(dailyFile, fileContent);
        console.log(`[Storage] Updated ${downloadedImages.length} image links in file`);
      }

      // Merge uploaded images with downloaded images for sync
      const allImages = [...uploadedImages, ...downloadedImages];

      // 读取完整的当天文件内容（用于 WebDAV 同步）
      let fullFileContent = '';
      try {
        fullFileContent = await fs.readFile(dailyFile, 'utf8');
      } catch (readErr) {
        console.warn('[Storage] Could not read daily file for WebDAV sync:', readErr.message);
        fullFileContent = header + updatedEntry;
      }

      // 获取服务器 URL（用于 Memos 图片访问）
      const serverUrl = process.env.SERVER_URL || '';

      // Memos 同步（用户级配置）
      if (memosConfig && memosConfig.enabled && memosConfig.url && memosConfig.token) {
        try {
          const result = await memosSync.syncToMemos(
            { title, url, content: processedContent, tags, timestamp },
            memosConfig,
            allImages,
            serverUrl
          );
          if (result.success) {
            const qiniuCount = allImages.filter(img => img.qiniuUrl).length;
            console.log(`[Memos] Sync completed: ${result.memoUrl}, total images: ${allImages.length}, Qiniu: ${qiniuCount}`);
          } else {
            console.warn(`[Memos] Sync failed: ${result.reason}`);
          }
        } catch (err) {
          console.error('[Memos] Sync error:', err.message);
        }
      }

      // WebDAV 同步（用户级配置）
      if (webdavConfig && webdavSync.isWebDAVEnabled(webdavConfig)) {
        // 为 WebDAV 准备图片 buffer
        const imagesWithBuffer = [];
        for (const img of allImages) {
          if (img.filename && img.localUrl) {
            try {
              const localImagePath = path.join(DATA_DIR, `user-${apiKeyHash}`, 'images', img.filename);
              const buffer = await fs.readFile(localImagePath);
              imagesWithBuffer.push({ ...img, buffer });
            } catch (readErr) {
              console.warn(`[WebDAV] Could not read local image: ${img.filename}`);
            }
          }
        }

        try {
          const result = await webdavSync.syncToWebDAV(
            { title, url, content: processedContent, tags, timestamp },
            imagesWithBuffer,
            webdavConfig,
            apiKeyHash,
            fullFileContent
          );
          if (result.success) {
            console.log(`[WebDAV] Sync completed: ${result.filePath}, images: ${result.imageCount}`);
          } else {
            console.warn(`[WebDAV] Sync failed: ${result.reason}`);
          }
        } catch (err) {
          console.error('[WebDAV] Sync error:', err.message);
        }
      }

      return { downloadedImages };
    } catch (err) {
      console.error('[Storage] Async image processing error:', err.message);
      return { downloadedImages: [] };
    }
  };

  // 启动异步任务（不等待）
  asyncImageTask().catch(err => {
    console.error('[Storage] Async image task failed:', err.message);
  });

  // 立即返回（不等待图片下载）
  return { downloadedImages: [] };
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