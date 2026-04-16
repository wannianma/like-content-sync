const https = require('https');
const http = require('http');

/**
 * Memos 同步模块
 * 将保存的内容异步同步到 Memos 服务
 */

/**
 * 同步内容到 Memos
 * @param {Object} data - 内容数据
 * @param {Object} config - Memos 配置 { url, token }
 */
async function syncToMemos(data, config) {
  if (!config.url || !config.token) {
    console.log('Memos not configured, skipping sync');
    return { success: false, reason: 'not_configured' };
  }

  const { title, url, content, tags, timestamp } = data;

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
  const maxContentLength = 2000;
  let truncatedContent = content;
  if (content.length > maxContentLength) {
    truncatedContent = content.substring(0, maxContentLength) + '...';
  }
  memoContent += truncatedContent;

  // 发送到 Memos API
  try {
    const result = await createMemo(config.url, config.token, memoContent);
    console.log(`Synced to Memos: ${result.id}`);
    return { success: true, memoId: result.id, memoUrl: `${config.url}/m/${result.id}` };
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
    // 解析 URL
    const parsedUrl = new URL(baseUrl);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    // Memos API v1 endpoint
    const apiPath = '/api/v1/memo';

    // 构建请求体
    const body = JSON.stringify({
      content: content,
      visibility: 'PRIVATE' // 私可见，可改为 PUBLIC
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

      res.on('data', (chunk) => {
        data += chunk;
      });

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
  getMemosConfig
};