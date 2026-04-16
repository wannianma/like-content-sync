const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Import routes and middleware
const { validateApiKeyIfConfigured } = require('./middleware/auth');
const contentRoutes = require('./routes/content');
const { ensureDir } = require('./storage');
const path = require('path');

// Initialize data directory
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
ensureDir(DATA_DIR).then(() => {
  console.log(`Data directory initialized: ${DATA_DIR}`);
}).catch(err => {
  console.error('Failed to create data directory:', err);
});

// Health check (no auth required)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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