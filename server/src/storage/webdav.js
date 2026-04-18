const { createClient } = require('webdav');
const path = require('path');

/**
 * WebDAV 同步模块
 * 将保存的内容异步同步到用户配置的 WebDAV 服务器
 */

/**
 * 检查 WebDAV 是否启用
 * @param {Object} config - WebDAV 配置 { url, username, password, basePath }
 */
function isWebDAVEnabled(config) {
  return config &&
    config.url &&
    config.username &&
    config.password &&
    config.enabled === true;
}

/**
 * 创建 WebDAV 客户端
 * @param {Object} config - WebDAV 配置
 */
function createWebDAVClient(config) {
  return createClient(config.url, {
    username: config.username,
    password: config.password
  });
}

/**
 * 检查目录是否存在（使用 getDirectoryContents 更可靠）
 * @param {Object} client - WebDAV 客户端
 * @param {string} dirPath - 目录路径
 */
async function checkDirectoryExists(client, dirPath) {
  // 去掉末尾斜杠，统一路径格式
  const normalizedPath = dirPath.replace(/\/+$/, '');

  try {
    await client.getDirectoryContents(normalizedPath);
    return true;  // 成功获取内容，目录存在
  } catch (err) {
    if (err.status === 404 || (err.message && err.message.includes('404'))) {
      return false;  // 404 表示目录不存在
    }
    // 其他错误，记录日志并返回 false
    console.warn(`[WebDAV] Check directory error for ${normalizedPath}:`, err.message);
    return false;
  }
}

/**
 * 确保 WebDAV 目录存在
 * @param {Object} client - WebDAV 客户端
 * @param {string} dirPath - 目录路径
 */
async function ensureDirectory(client, dirPath) {
  // 去掉末尾斜杠
  const normalizedPath = dirPath.replace(/\/+$/, '');

  const exists = await checkDirectoryExists(client, normalizedPath);
  if (exists) {
    console.log(`[WebDAV] Directory already exists: ${normalizedPath}`);
    return true;
  }

  // 目录不存在，尝试创建它
  try {
    await client.createDirectory(normalizedPath, { recursive: true });
    console.log(`[WebDAV] Created directory: ${normalizedPath}`);
    return true;
  } catch (createErr) {
    // 如果是因为目录已存在的错误（405 Method Not Allowed），忽略它
    if (createErr.status === 405 || (createErr.message && createErr.message.includes('405'))) {
      console.log(`[WebDAV] Directory already exists (405): ${normalizedPath}`);
      return true;
    }
    console.error(`[WebDAV] Failed to create directory ${normalizedPath}:`, createErr.message);
    throw createErr;
  }
}

/**
 * 上传文件到 WebDAV
 * @param {Object} client - WebDAV 客户端
 * @param {string} remotePath - 远程路径
 * @param {Buffer|string} content - 文件内容
 */
async function uploadFile(client, remotePath, content) {
  try {
    await client.putFileContents(remotePath, content);
    console.log(`[WebDAV] Uploaded: ${remotePath}`);
    return { success: true, path: remotePath };
  } catch (err) {
    console.error(`[WebDAV] Failed to upload ${remotePath}:`, err.message);
    return { success: false, error: err.message, status: err.status };
  }
}

/**
 * 上传图片（如果目录不存在会自动创建）
 * @param {Object} client - WebDAV 客户端
 * @param {string} remoteImagePath - 远程图片路径
 * @param {Buffer} buffer - 图片内容
 * @param {string} imagesPath - images 目录路径
 */
async function uploadImageWithRetry(client, remoteImagePath, buffer, imagesPath) {
  // 先尝试上传
  const result = await uploadFile(client, remoteImagePath, buffer);

  if (!result.success) {
    // 如果是 409 Conflict（目录不存在），先创建目录再重试
    if (result.status === 409 || (result.error && result.error.includes('409'))) {
      console.log(`[WebDAV] Directory missing, creating: ${imagesPath}`);
      await ensureDirectorySimple(client, imagesPath);

      // 重试上传
      const retryResult = await uploadFile(client, remoteImagePath, buffer);
      return retryResult;
    }
  }

  return result;
}

/**
 * 确保目录存在（直接尝试创建，405 表示已存在）
 * @param {Object} client - WebDAV 客户端
 * @param {string} dirPath - 目录路径
 */
async function ensureDirectorySimple(client, dirPath) {
  const normalizedPath = dirPath.replace(/\/+$/, '');
  try {
    await client.createDirectory(normalizedPath);
    console.log(`[WebDAV] Created directory: ${normalizedPath}`);
    return true;
  } catch (err) {
    // 405 Method Not Allowed 表示目录已存在
    if (err.status === 405 || (err.message && err.message.includes('405'))) {
      console.log(`[WebDAV] Directory already exists (405): ${normalizedPath}`);
      return true;
    }
    console.error(`[WebDAV] Failed to create directory ${normalizedPath}:`, err.message);
    return false;
  }
}

/**
 * 同步内容到 WebDAV
 * @param {Object} data - 内容数据 { title, url, content, tags, timestamp }
 * @param {Array} downloadedImages - 图片信息数组 [{ localUrl, qiniuUrl, filename, buffer }]
 * @param {Object} config - WebDAV 配置 { url, username, password, basePath, enabled }
 * @param {string} apiKeyHash - 用户 API key hash
 * @param {string} fullMarkdown - 完整的 markdown 内容（包含格式化的条目）
 */
async function syncToWebDAV(data, downloadedImages, config, apiKeyHash, fullMarkdown) {
  if (!isWebDAVEnabled(config)) {
    console.log('[WebDAV] Not configured or disabled, skipping sync');
    return { success: false, reason: 'not_configured' };
  }

  try {
    console.log(`[WebDAV] Starting sync to: ${config.url}`);

    const client = createWebDAVClient(config);
    const basePath = config.basePath || '/notes';
    const normalizedBasePath = basePath.replace(/\/+$/, '');

    // 尝试创建 basePath（405 表示已存在）
    await ensureDirectorySimple(client, normalizedBasePath);

    // 尝试创建 images 目录
    const imagesPath = normalizedBasePath + '/images';
    await ensureDirectorySimple(client, imagesPath);

    // 获取日期文件名
    const dateStr = new Date(data.timestamp).toISOString().split('T')[0];
    const remoteFilePath = normalizedBasePath + '/' + `${dateStr}.md`;

    // 转换 markdown 中的图片路径：images/user-{hash}/{filename} -> images/{filename}
    let processedMarkdown = fullMarkdown;
    for (const img of downloadedImages) {
      if (img.localUrl && img.filename) {
        const localPattern = img.localUrl;
        const webdavPath = `images/${img.filename}`;
        processedMarkdown = processedMarkdown.replace(localPattern, webdavPath);
        console.log(`[WebDAV] Image path converted: ${localPattern} -> ${webdavPath}`);
      }
    }

    // 上传 markdown 文件
    const fileResult = await uploadFile(client, remoteFilePath, processedMarkdown);

    // 上传图片（自动处理目录不存在的情况）
    const imageResults = [];
    for (const img of downloadedImages) {
      if (img.buffer) {
        const remoteImagePath = imagesPath + '/' + img.filename;
        const result = await uploadImageWithRetry(client, remoteImagePath, img.buffer, imagesPath);
        imageResults.push({
          localUrl: img.localUrl,
          remotePath: remoteImagePath,
          success: result.success
        });
      }
    }

    console.log(`[WebDAV] Sync completed: ${remoteFilePath}, images: ${imageResults.length}`);

    return {
      success: true,
      filePath: remoteFilePath,
      imageCount: imageResults.length,
      imageResults
    };
  } catch (err) {
    console.error('[WebDAV] Sync failed:', err.message);
    return { success: false, reason: err.message };
  }
}

/**
 * 测试 WebDAV 连接
 * @param {Object} config - WebDAV 配置
 */
async function testWebDAVConnection(config) {
  console.log('[WebDAV] Test connection started');
  console.log('[WebDAV] Config:', JSON.stringify({
    url: config.url,
    username: config.username,
    basePath: config.basePath || '/notes'
  }, null, 2));

  if (!config.url || !config.username || !config.password) {
    console.log('[WebDAV] Missing required config');
    return { success: false, reason: 'missing_config' };
  }

  try {
    console.log('[WebDAV] Creating client...');
    const client = createWebDAVClient(config);
    const basePath = config.basePath || '/notes';

    // 先尝试获取根目录内容，验证连接是否正常
    console.log('[WebDAV] Testing root directory access...');
    try {
      const rootContents = await client.getDirectoryContents('/');
      console.log('[WebDAV] Root directory accessible, contents count:', rootContents.length);
    } catch (rootErr) {
      console.error('[WebDAV] Root directory access failed:', rootErr.message);
      console.error('[WebDAV] Root error details:', JSON.stringify({
        status: rootErr.status,
        response: rootErr.response
      }, null, 2));
    }

    // 检查是否能访问基础路径
    console.log('[WebDAV] Checking base path:', basePath);
    let basePathExists = await checkDirectoryExists(client, basePath);
    console.log('[WebDAV] Base path exists:', basePathExists);

    if (!basePathExists) {
      // 尝试创建目录
      console.log('[WebDAV] Attempting to create directory:', basePath);
      try {
        await client.createDirectory(basePath, { recursive: true });
        console.log('[WebDAV] Directory created successfully');
        basePathExists = true;
      } catch (createErr) {
        // 405 表示目录已存在
        if (createErr.status === 405 || (createErr.message && createErr.message.includes('405'))) {
          console.log('[WebDAV] Directory already exists (405)');
          basePathExists = true;
        } else {
          console.error('[WebDAV] Create directory failed:', createErr.message);
          throw createErr;
        }
      }
    }

    // 尝试列出目录内容
    if (basePathExists) {
      console.log('[WebDAV] Listing directory contents...');
      try {
        const contents = await client.getDirectoryContents(basePath);
        console.log('[WebDAV] Directory contents count:', contents.length);
      } catch (listErr) {
        console.error('[WebDAV] List directory failed:', listErr.message);
        console.error('[WebDAV] List error details:', JSON.stringify({
          status: listErr.status,
          response: listErr.response
        }, null, 2));
        throw listErr;
      }
    }

    console.log('[WebDAV] Test connection successful');
    return { success: true };
  } catch (err) {
    console.error('[WebDAV] Test connection failed:', err.message);
    console.error('[WebDAV] Full error:', err);
    return { success: false, reason: err.message };
  }
}

module.exports = {
  isWebDAVEnabled,
  createWebDAVClient,
  checkDirectoryExists,
  ensureDirectory,
  uploadFile,
  syncToWebDAV,
  testWebDAVConnection
};