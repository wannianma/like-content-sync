const https = require('https');
const http = require('http');
const fs = require('fs').promises;
const path = require('path');

/**
 * Memos 同步模块
 * 将保存的内容异步同步到 Memos 服务，支持图片上传
 */

/**
 * 规范化 Memos URL，提取正确的 base URL
 * 支持：
 * - https://memos.example.com
 * - https://memos.example.com/
 * - https://memos.example.com/memos (带子路径)
 */
function normalizeBaseUrl(url) {
  // 移除末尾斜杠
  let normalized = url.replace(/\/+$/, '');

  // 如果 URL 包含常见路径，提取 base URL
  // 但保留用户可能配置的子路径部署
  const commonPaths = ['/memos', '/app', '/api'];
  for (const p of commonPaths) {
    if (normalized.endsWith(p)) {
      // 用户配置了子路径，保留它
      // 例如 https://example.com/memos -> 保持不变
      return normalized;
    }
  }

  return normalized;
}

/**
 * 构建 API 路径
 */
function buildApiPath(baseUrl, endpoint) {
  const normalized = normalizeBaseUrl(baseUrl);

  // 检查是否已经有子路径
  const parsedUrl = new URL(normalized);
  const existingPath = parsedUrl.pathname;

  // 如果已有子路径（如 /memos），在其后面加 API 路径
  if (existingPath && existingPath !== '/') {
    return `${existingPath}${endpoint}`;
  }

  return endpoint;
}

/**
 * 上传图片到 Memos
 * @param {string} baseUrl - Memos 服务器地址
 * @param {string} token - Access Token
 * @param {Buffer} imageBuffer - 图片数据
 * @param {string} filename - 文件名
 */
async function uploadImageToMemos(baseUrl, token, imageBuffer, filename) {
  return new Promise((resolve, reject) => {
    const normalizedUrl = normalizeBaseUrl(baseUrl);
    const parsedUrl = new URL(normalizedUrl);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    // 构建 resource API 路径（Memos v0.22+ 使用复数形式）
    const apiPath = buildApiPath(baseUrl, '/api/v1/resources');

    console.log(`[Memos] Uploading image to: ${parsedUrl.host}${apiPath}`);

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
        console.log(`[Memos] Upload response: HTTP ${res.statusCode}`);
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
 * 同步内容到 Memos（图片使用七牛 URL）
 * @param {Object} data - 内容数据
 * @param {Object} config - Memos 配置 { url, token }
 * @param {Array} downloadedImages - 图片信息数组 [{ localUrl, qiniuUrl, filename }]
 */
async function syncToMemos(data, config, downloadedImages = []) {
  if (!config.url || !config.token) {
    console.log('[Memos] Not configured, skipping sync');
    return { success: false, reason: 'not_configured' };
  }

  const { title, url, content, tags, timestamp } = data;

  try {
    console.log(`[Memos] Starting sync, base URL: ${config.url}`);

    // 处理图片：将本地路径替换为七牛 URL（如果有）
    let processedContent = content;
    const imageRegex = /!\[([^\]]*)\]\((images\/[^)]+)\)/g;
    let match;
    const imageUrls = [];

    while ((match = imageRegex.exec(content)) !== null) {
      const [fullMatch, altText, localPath] = match;

      // 查找对应的图片信息
      const imageInfo = downloadedImages.find(img => img.localUrl === localPath);

      // 优先使用七牛 URL，严格按原样使用，不做任何修改
      let imageUrl = null;
      if (imageInfo && imageInfo.qiniuUrl) {
        imageUrl = imageInfo.qiniuUrl;
        console.log(`[Memos] Using Qiniu URL (strict from .env): ${imageUrl}`);
      } else if (config.serverUrl) {
        imageUrl = `${config.serverUrl}/${localPath}`;
        console.log(`[Memos] Image URL (Server): ${localPath} -> ${imageUrl}`);
      } else {
        console.warn(`[Memos] No URL available for image ${localPath}`);
      }

      if (imageUrl) {
        const newImageTag = `![${altText}](${imageUrl})`;
        processedContent = processedContent.replace(fullMatch, newImageTag);
        imageUrls.push({ localPath, imageUrl });
      }
    }

    // 构建 Memos 内容格式（来源放在最后）
    let memoContent = '';

    // 添加标签（Memos 使用 #tag 格式）
    if (tags && tags.length > 0) {
      const memosTags = tags.map(tag => `#${tag.replace(/\s+/g, '-')}`).join(' ');
      memoContent += `${memosTags}\n\n`;
    }

    // 添加正文内容（截取部分，避免过长）
    const maxContentLength = 4000;
    // 预留来源链接的空间
    const sourceLength = 50 + title.length + url.length;
    const availableLength = maxContentLength - sourceLength;
    if (processedContent.length > availableLength) {
      processedContent = processedContent.substring(0, availableLength) + '...';
    }
    memoContent += processedContent;

    // 来源链接放在最后
    memoContent += `\n\n---\n\n📍 来源: [${title}](${url})`;

    // 创建 Memo
    const result = await createMemo(config.url, config.token, memoContent);

    // 从 result.name 提取 memo ID（格式如 "memos/62"）
    const memoId = result.name ? result.name.split('/')[1] : result.id;
    console.log(`[Memos] Synced successfully: memo ID ${memoId}`);

    return {
      success: true,
      memoId: memoId,
      memoUrl: `${normalizeBaseUrl(config.url)}/m/${memoId}`,
      imageCount: imageUrls.length,
      imageUrls
    };
  } catch (err) {
    console.error('[Memos] Sync failed:', err.message);
    return { success: false, reason: err.message };
  }
}

/**
 * 调用 Memos API 创建 Memo
 * 支持多种 API 路径尝试
 */
async function createMemo(baseUrl, token, content) {
  const normalizedUrl = normalizeBaseUrl(baseUrl);
  const parsedUrl = new URL(normalizedUrl);
  const protocol = parsedUrl.protocol === 'https:' ? https : http;

  // 尝试多种 API 路径（兼容不同版本）
  // Memos v0.22+ 使用 /api/v1/memos (复数)
  // Memos 旧版本使用 /api/memo (单数)
  const apiPaths = [
    '/api/v1/memos',     // Memos v0.22+ (正确路径，复数形式)
    '/api/v1/memo',      // 可能的旧路径
    '/api/memo',         // Memos 旧版本
  ];

  // 如果有子路径，需要调整
  const existingPath = parsedUrl.pathname;
  if (existingPath && existingPath !== '/') {
    apiPaths[0] = `${existingPath}/api/v1/memo`;
    apiPaths[1] = `${existingPath}/api/memo`;
  }

  const body = JSON.stringify({
    content: content,
    visibility: 'PRIVATE'
  });

  // 尝试不同的 API 路径
  for (const apiPath of apiPaths) {
    console.log(`[Memos] Trying API path: ${parsedUrl.host}${apiPath}`);

    try {
      const result = await makeRequest(protocol, parsedUrl, apiPath, token, body);
      console.log(`[Memos] Success with path: ${apiPath}`);
      console.log(`[Memos] API response:`, JSON.stringify(result).substring(0, 200));
      return result;
    } catch (err) {
      console.warn(`[Memos] Failed with path ${apiPath}: ${err.message}`);
      // 如果是 404，尝试下一个路径
      if (err.message.includes('404')) {
        continue;
      }
      // 其他错误直接抛出
      throw err;
    }
  }

  // 所有路径都失败
  throw new Error('All API paths failed. Please check MEMOS_URL configuration.');
}

/**
 * 发送 HTTP 请求
 */
async function makeRequest(protocol, parsedUrl, apiPath, token, body) {
  return new Promise((resolve, reject) => {
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
    token: process.env.MEMOS_TOKEN || '',
    serverUrl: process.env.SERVER_URL || ''
  };
}

/**
 * 测试 Memos 连接
 */
async function testMemosConnection(url, token) {
  try {
    const normalizedUrl = normalizeBaseUrl(url);
    const parsedUrl = new URL(normalizedUrl);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    // 尝试获取用户信息来验证连接
    const apiPaths = [
      '/api/v1/user/me',
      '/api/user/me',
      '/api/v1/status'
    ];

    const existingPath = parsedUrl.pathname;
    if (existingPath && existingPath !== '/') {
      apiPaths[0] = `${existingPath}/api/v1/user/me`;
    }

    for (const apiPath of apiPaths) {
      try {
        const result = await new Promise((resolve, reject) => {
          const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: apiPath,
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          };

          const req = protocol.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                try {
                  resolve(JSON.parse(data));
                } catch (e) {
                  reject(new Error('Invalid JSON'));
                }
              } else {
                reject(new Error(`HTTP ${res.statusCode}`));
              }
            });
          });
          req.on('error', reject);
          req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Timeout'));
          });
          req.end();
        });

        return { success: true, user: result };
      } catch (err) {
        if (err.message.includes('404')) continue;
        throw err;
      }
    }

    return { success: false, reason: 'Could not find valid API endpoint' };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

module.exports = {
  syncToMemos,
  createMemo,
  uploadImageToMemos,
  getMemosConfig,
  normalizeBaseUrl,
  testMemosConnection
};