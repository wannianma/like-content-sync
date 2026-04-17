const qiniu = require('qiniu');
const path = require('path');

/**
 * 七牛云图片上传模块
 * 将图片上传到七牛云存储，返回公网可访问的 URL
 */

/**
 * 从环境变量获取七牛配置
 */
function getQiniuConfig() {
  return {
    accessKey: process.env.QINIU_ACCESS_KEY || '',
    secretKey: process.env.QINIU_SECRET_KEY || '',
    bucket: process.env.QINIU_BUCKET || '',
    domain: process.env.QINIU_DOMAIN || '', // CDN域名，如 https://cdn.example.com
    enabled: Boolean(process.env.QINIU_ACCESS_KEY && process.env.QINIU_SECRET_KEY && process.env.QINIU_BUCKET && process.env.QINIU_DOMAIN)
  };
}

/**
 * 生成七牛上传凭证
 */
function generateUploadToken(bucket, mac) {
  const putPolicy = new qiniu.rs.PutPolicy({
    scope: bucket,
    deadline: Math.floor(Date.now() / 1000) + 3600, // 1小时有效
    fsizeLimit: 10 * 1024 * 1024 // 10MB限制
  });
  return putPolicy.uploadToken(mac);
}

/**
 * 上传图片到七牛云
 * @param {Buffer} imageBuffer - 图片数据
 * @param {string} filename - 文件名（用于生成key）
 * @param {string} apiKeyHash - 用户API Key哈希（用于区分用户目录）
 * @returns {Object} { success, url, key, error }
 */
async function uploadImage(imageBuffer, filename, apiKeyHash) {
  const config = getQiniuConfig();

  if (!config.enabled) {
    return { success: false, error: 'Qiniu not configured', url: null };
  }

  try {
    // 初始化七牛认证
    const mac = new qiniu.auth.digest.Mac(config.accessKey, config.secretKey);
    const uploadToken = generateUploadToken(config.bucket, mac);

    // 配置上传区域
    const uploadConfig = new qiniu.conf.Config();
    // 根据空间所在区域选择
    // Zone_z0: 华东
    // Zone_z1: 华北
    // Zone_z2: 华南
    // Zone_na0: 北美
    // 自动识别区域（推荐）
    uploadConfig.useCdnDomain = true;

    // 构建文件key（路径）
    const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const key = `like-content-sync/${apiKeyHash}/${dateStr}/${filename}`;

    // 执行上传
    const formUploader = new qiniu.form_up.FormUploader(uploadConfig);
    const putExtra = new qiniu.form_up.PutExtra();

    const result = await new Promise((resolve, reject) => {
      formUploader.put(uploadToken, key, imageBuffer, putExtra, (err, body, info) => {
        if (err) {
          reject(err);
        } else if (info.statusCode === 200) {
          resolve({ key, body });
        } else {
          reject(new Error(`Qiniu upload failed: HTTP ${info.statusCode} - ${JSON.stringify(body)}`));
        }
      });
    });

    // 构建公网URL - 严格使用 .env 配置的域名，不做任何修改
    const domain = config.domain;
    // 确保 key 不以斜杠开头，避免双斜杠
    const cleanKey = key.startsWith('/') ? key.substring(1) : key;
    const url = `${domain}/${cleanKey}`;

    console.log(`[Qiniu] Uploaded: ${key} (${imageBuffer.length} bytes) -> ${url}`);

    return {
      success: true,
      url: url,
      key: key,
      size: imageBuffer.length
    };
  } catch (err) {
    console.error('[Qiniu] Upload failed:', err.message);
    return { success: false, error: err.message, url: null };
  }
}

/**
 * 批量上传图片到七牛云
 * @param {Array} images - 图片数组 [{ buffer, filename }]
 * @param {string} apiKeyHash - 用户API Key哈希
 * @returns {Array} 上传结果数组
 */
async function uploadImages(images, apiKeyHash) {
  const results = [];

  for (const image of images) {
    const result = await uploadImage(image.buffer, image.filename, apiKeyHash);
    results.push({
      ...result,
      originalFilename: image.filename
    });
  }

  return results;
}

/**
 * 获取七牛配置状态
 */
function isQiniuEnabled() {
  return getQiniuConfig().enabled;
}

module.exports = {
  getQiniuConfig,
  uploadImage,
  uploadImages,
  isQiniuEnabled
};