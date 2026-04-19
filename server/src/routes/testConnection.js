const express = require('express');
const memosSync = require('../storage/memos');
const webdavSync = require('../storage/webdav');

const router = express.Router();

/**
 * POST /api/test/memos
 * Test Memos connection with user-provided config
 *
 * Body:
 * - url: string - Memos server URL
 * - token: string - Access token
 */
router.post('/memos', async (req, res) => {
  try {
    const { url, token } = req.body;

    if (!url || !token) {
      return res.status(400).json({ success: false, reason: 'missing_url_or_token' });
    }

    const result = await memosSync.testMemosConnection(url, token);
    res.json(result);
  } catch (err) {
    console.error('[Test] Memos test error:', err.message);
    res.status(500).json({ success: false, reason: err.message });
  }
});

/**
 * POST /api/test/webdav
 * Test WebDAV connection with user-provided config
 *
 * Body:
 * - url: string - WebDAV server URL
 * - username: string - Username
 * - password: string - Password
 * - basePath: string (optional) - Base path
 */
router.post('/webdav', async (req, res) => {
  try {
    const { url, username, password, basePath } = req.body;

    if (!url || !username || !password) {
      return res.status(400).json({ success: false, reason: 'missing_required_fields' });
    }

    const result = await webdavSync.testWebDAVConnection({
      url,
      username,
      password,
      basePath: basePath || '/notes'
    });
    res.json(result);
  } catch (err) {
    console.error('[Test] WebDAV test error:', err.message);
    res.status(500).json({ success: false, reason: err.message });
  }
});

module.exports = router;