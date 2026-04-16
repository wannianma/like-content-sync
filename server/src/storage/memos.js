const https = require('https');
const http = require('http');
const fs = require('fs').promises;
const path = require('path');

/**
 * Memos 同步模块
 * 将保存的内容异步同步到 Memos 服务，支持图片上传
 */

/**
 * 上传图片到 Memos
 * @param {string} baseUrl - Memos 服务器地址
 * @param {string} token - Access Token
 * @param {Buffer} imageBuffer - 图片数据
 * @param {string} filename - 文件名
 */
async function uploadImageToMemos(baseUrl, token, imageBuffer, filename) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(baseUrl);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    // Memos API v1 resource endpoint
    const apiPath = '/api/v1/resource';

    // 构建 multipart/form-data
    const boundary = '----FormBoundary' + Date.now();
    const bodyParts = [];

    // 文件字段
    bodyParts.push(`--${boundary}`);
    bodyParts.push(`Content-Disposition: form-data; name="file"; filename="${filename}"`);
    bodyParts.push(`Content-Type: image/${getImageType(filename)}`);
    bodyParts.push('');
    bodyParts.push(imageBuffer);
    bodyParts.push(`--${boundary}--`);

    const body = Buffer.concat(bodyParts.map(part =>
      typeof part === 'string' ? Buffer.from(part + '\r\n') : part
    ));

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: apiPath,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        'Authorization': `Bearer ${token}`
      }
    };

    const req = protocol.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => { data += chunk; });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const result = JSON.parse(data);
            resolve(result);
          } catch (e) {
            reject(new Error('Invalid JSON response: ' + data));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Upload timeout'));
    });

    req.write(body);
    req.end();
  });
}

/**
 * 根据文件名获取图片类型
 */
function getImageType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const types = {
    '.jpg': 'jpeg',
    '.jpeg': 'jpeg',
    '.png': 'png',
    '.gif': 'gif',
    '.webp': 'webp',
    '.svg': 'svg+xml'
  };
  return types[ext] || 'png';
}

/**
 * 同步内容到 Memos（支持图片上传）
 * @param {Object} data - 内容数据
 * @param {Object} config - Memos 配置 { url, token }
 * @param {string} imagesDir - 本地图片目录路径
 */
async function syncToMemos(data, config, imagesDir = null) {
  if (!config.url || !config.token) {
    console.log('Memos not configured, skipping sync');
    return { success: false, reason: 'not_configured' };
  }

  const { title, url, content, tags, timestamp } = data;

  try {
    // 处理图片：上传到 Memos 并替换链接
    let processedContent = content;
    const imageRegex = /!\[([^\]]*)\]\((images\/[^)]+)\)/g;
    let match;
    const uploadedResources = [];

    while ((match = imageRegex.exec(content)) !== null) {
      const [fullMatch, altText, localPath] = match;
      const imagePath = imagesDir ? path.join(imagesDir, localPath) : null;

      if (imagePath) {
        try {
          // 读取本地图片文件
          const imageBuffer = await fs.readFile(imagePath);
          const filename = path.basename(localPath);

          console.log(`Uploading image to Memos: ${filename}`);
          const resource = await uploadImageToMemos(config.url, config.token, imageBuffer, filename);

          // Memos 使用 resource ID 引用图片
          const memosImageUrl = `${config.url}/o/r/${resource.id}`;
          const newImageTag = `![${altText}](${memosImageUrl})`;
          processedContent = processedContent.replace(fullMatch, newImageTag);

          uploadedResources.push({
            localPath,
            memosUrl: memosImageUrl,
            resourceId: resource.id
          });

          console.log(`Uploaded image: ${filename} -> resource ${resource.id}`);
        } catch (err) {
          console.warn(`Failed to upload image ${localPath}: ${err.message}`);
          // 保留原始链接
        }
      }
    }

    // 构建 Memos 内容格式
    let memoContent = '';

    // 添加来源链接
    memoContent += `📍 来源: [${title}](${url})\n\n`;

    // 添加标签（Memos 使用 #tag 格式）
    if (tags && tags.length > 0) {
      const memosTags = tags.map(tag => `#${tag.replace(/\s+/g, '-')}`).join(' ');
      memoContent += `${memosTags}\n\n`;
    }

    // 添加正文内容（截取部分，避免过长）
    const maxContentLength = 4000; // 增加长度以容纳图片链接
    if (processedContent.length > maxContentLength) {
      processedContent = processedContent.substring(0, maxContentLength) + '...';
    }
    memoContent += processedContent;

    // 创建 Memo
    const result = await createMemo(config.url, config.token, memoContent);
    console.log(`Synced to Memos: ${result.id}`);

    return {
      success: true,
      memoId: result.id,
      memoUrl: `${config.url}/m/${result.id}`,
      uploadedImages: uploadedResources.length,
      uploadedResources
    };
  } catch (err) {
    console.error('Failed to sync to Memos:', err.message);
    return { success: false, reason: err.message };
  }
}

/**
 * 调用 Memos API 创建 Memo
 */
async function createMemo(baseUrl, token, content) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(baseUrl);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    const apiPath = '/api/v1/memo';

    const body = JSON.stringify({
      content: content,
      visibility: 'PRIVATE'
    });

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: apiPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': `Bearer ${token}`
      }
    };

    const req = protocol.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => { data += chunk; });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const result = JSON.parse(data);
            resolve(result);
          } catch (e) {
            reject(new Error('Invalid JSON response'));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(body);
    req.end();
  });
}

/**
 * 从环境变量获取 Memos 配置
 */
function getMemosConfig() {
  return {
    url: process.env.MEMOS_URL || '',
    token: process.env.MEMOS_TOKEN || ''
  };
}

module.exports = {
  syncToMemos,
  createMemo,
  uploadImageToMemos,
  getMemosConfig
};