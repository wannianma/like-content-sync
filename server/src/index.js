const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load .env from server directory
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Debug: Log Qiniu config status
console.log('[Debug] QINIU_ACCESS_KEY:', process.env.QINIU_ACCESS_KEY ? 'SET' : 'NOT SET');
console.log('[Debug] QINIU_SECRET_KEY:', process.env.QINIU_SECRET_KEY ? 'SET' : 'NOT SET');
console.log('[Debug] QINIU_BUCKET:', process.env.QINIU_BUCKET || 'NOT SET');
console.log('[Debug] QINIU_DOMAIN:', process.env.QINIU_DOMAIN || 'NOT SET');

const app = express();
const PORT = process.env.PORT || 3000;
const SERVER_URL = process.env.SERVER_URL || '';

// Middleware
app.use(cors());
app.use(express.json());

// Import routes and middleware
const { validateApiKeyIfConfigured } = require('./middleware/auth');
const contentRoutes = require('./routes/content');
const { ensureDir } = require('./storage');

// Initialize data directory
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
ensureDir(DATA_DIR).then(() => {
  console.log(`Data directory initialized: ${DATA_DIR}`);
}).catch(err => {
  console.error('Failed to create data directory:', err);
});

// Serve static images (for Memos to access)
// Mount each user's images directory under /images/user-{hash}/
const fs = require('fs');
const dataPath = DATA_DIR;
if (fs.existsSync(dataPath)) {
  const userDirs = fs.readdirSync(dataPath).filter(d => d.startsWith('user-'));
  for (const userDir of userDirs) {
    const imagesPath = path.join(dataPath, userDir, 'images');
    if (fs.existsSync(imagesPath)) {
      app.use(`/images/${userDir}`, express.static(imagesPath));
      console.log(`Static images served: /images/${userDir}`);
    }
  }
}

// Dynamic static serving for new users
app.use('/images', (req, res, next) => {
  const imagePath = path.join(DATA_DIR, req.path);
  if (fs.existsSync(imagePath)) {
    res.sendFile(imagePath);
  } else {
    next();
  }
});

console.log(`Server URL for images: ${SERVER_URL || 'not configured, images will use relative URLs'}`);

// Health check (no auth required)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    serverUrl: SERVER_URL,
    dataDir: DATA_DIR
  });
});

// Content API (requires auth if configured)
app.use('/api/content', validateApiKeyIfConfigured, contentRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);

  // Handle multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Image too large (max 10MB)' });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ error: 'Too many images (max 10)' });
  }

  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Like Content Sync server running on port ${PORT}`);
});

module.exports = app;