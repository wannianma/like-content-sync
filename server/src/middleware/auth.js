const crypto = require('crypto');

/**
 * Validates API key from X-API-Key header
 */
function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({ error: 'Missing API key' });
  }

  const validKeys = (process.env.API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);

  if (!validKeys.includes(apiKey)) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  // Store hashed API key for folder naming
  req.apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex').substring(0, 16);

  next();
}

/**
 * Optional: Validate API key only if API_KEYS is configured
 */
function validateApiKeyIfConfigured(req, res, next) {
  const validKeys = (process.env.API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);

  if (validKeys.length === 0) {
    // No API keys configured, skip validation
    req.apiKeyHash = 'default';
    return next();
  }

  return validateApiKey(req, res, next);
}

module.exports = {
  validateApiKey,
  validateApiKeyIfConfigured
};