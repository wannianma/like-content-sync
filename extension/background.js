/**
 * Background service worker for Like Content Sync extension
 */

// Constants
const MAX_PENDING_ITEMS = 10;
const MAX_HISTORY_ITEMS = 100;
const MAX_RETRIES = 3;

// Default domain tag rules
const DEFAULT_DOMAIN_RULES = {
  'github.com': ['dev', 'code'],
  'medium.com': ['reading', 'article'],
  'stackoverflow.com': ['dev', 'qa'],
  'youtube.com': ['video'],
  'twitter.com': ['social'],
  'x.com': ['social'],
  'dev.to': ['dev', 'blog'],
  'reddit.com': ['social', 'discussion']
};

/**
 * Create context menu on extension install
 */
chrome.runtime.onInstalled.addListener(() => {
  // Use chrome.action context for contextMenus if available
  try {
    chrome.contextMenus.create({
      id: 'save-content',
      title: 'Save to Cloud',
      contexts: ['selection']
    }, () => {
      // Ignore "already exists" error
      if (chrome.runtime.lastError) {
        console.log('Context menu already exists:', chrome.runtime.lastError.message);
      }
    });
  } catch (e) {
    console.error('Failed to create context menu:', e);
  }

  // Initialize storage
  chrome.storage.local.get(['pendingQueue', 'history', 'domainRules'], (result) => {
    if (!result.pendingQueue) {
      chrome.storage.local.set({ pendingQueue: [] });
    }
    if (!result.history) {
      chrome.storage.local.set({ history: [] });
    }
    if (!result.domainRules) {
      chrome.storage.local.set({ domainRules: DEFAULT_DOMAIN_RULES });
    }
  });
});

/**
 * Handle context menu click
 */
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'save-content') {
    // Check if tab is valid and not a special page
    if (!tab || !tab.id) {
      showNotification('Error', 'Invalid tab');
      return;
    }

    // Cannot inject content script into special pages
    const url = tab.url || '';
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
        url.startsWith('about:') || url.startsWith('edge://')) {
      showNotification('Error', 'Cannot save from browser internal pages');
      return;
    }

    // Request selection data from content script
    chrome.tabs.sendMessage(tab.id, { action: 'getSelection' }, (response) => {
      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message || 'Unknown error';
        console.error('Error getting selection:', errorMsg);

        // Most common error: content script not loaded
        if (errorMsg.includes('Receiving end does not exist') ||
            errorMsg.includes('message port closed')) {
          showNotification('Error', 'Page not ready. Please refresh the page and try again.');
        } else {
          showNotification('Error', 'Could not extract selection. Try refreshing the page.');
        }
        return;
      }

      if (response && !response.error) {
        // Store selection data (modal is shown directly by content script)
        chrome.storage.local.set({ currentSelection: response });
      } else {
        showNotification('Error', response?.error || 'No content selected');
      }
    });
  }
});

/**
 * Save content to server
 */
async function saveToServer(data, retryCount = 0) {
  const settings = await chrome.storage.sync.get(['apiEndpoint', 'apiKey', 'memosConfig', 'webdavConfig']);

  if (!settings.apiEndpoint || !settings.apiKey) {
    return { error: 'API not configured. Please set up in options.' };
  }

  const formData = new FormData();
  formData.append('title', data.title);
  formData.append('url', data.url);
  formData.append('content', data.content);
  formData.append('timestamp', data.timestamp);
  if (data.tags && data.tags.length > 0) {
    formData.append('tags', data.tags.join(','));
  }

  // Add sync configs (as JSON strings)
  if (settings.memosConfig) {
    formData.append('memosConfig', JSON.stringify(settings.memosConfig));
  }
  if (settings.webdavConfig) {
    formData.append('webdavConfig', JSON.stringify(settings.webdavConfig));
  }

  // Add images
  if (data.imageFiles && data.imageFiles.length > 0) {
    for (const imageFile of data.imageFiles) {
      formData.append('images', imageFile);
    }
  }

  try {
    const response = await fetch(`${settings.apiEndpoint}/api/content`, {
      method: 'POST',
      headers: {
        'X-API-Key': settings.apiKey
      },
      body: formData
    });

    const result = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        return { error: 'Invalid API key. Please check your settings.' };
      }
      return { error: result.error || `Server error: ${response.status}` };
    }

    return { success: true, imageUrls: result.imageUrls };
  } catch (err) {
    console.error('API error:', err);

    // Retry logic
    if (retryCount < MAX_RETRIES) {
      const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
      return saveToServer(data, retryCount + 1);
    }

    return { error: 'Network error. Content saved to pending queue.' };
  }
}

/**
 * Add to pending queue
 */
async function addToPendingQueue(data) {
  const result = await chrome.storage.local.get(['pendingQueue']);
  const queue = result.pendingQueue || [];

  // Add item with UUID
  const item = {
    ...data,
    id: generateUUID(),
    retryCount: 0,
    addedAt: new Date().toISOString()
  };

  // Enforce max queue size (FIFO eviction)
  if (queue.length >= MAX_PENDING_ITEMS) {
    queue.shift();
  }

  queue.push(item);
  await chrome.storage.local.set({ pendingQueue: queue });

  showNotification('Saved Locally', 'Content queued for sync when online.');
}

/**
 * Add to history
 */
async function addToHistory(data) {
  const result = await chrome.storage.local.get(['history']);
  const history = result.history || [];

  const item = {
    title: data.title,
    url: data.url,
    tags: data.tags,
    timestamp: data.timestamp,
    savedAt: new Date().toISOString()
  };

  // Enforce max history size
  if (history.length >= MAX_HISTORY_ITEMS) {
    history.shift();
  }

  history.push(item);
  await chrome.storage.local.set({ history: history });
}

/**
 * Process pending queue
 */
async function processPendingQueue() {
  const result = await chrome.storage.local.get(['pendingQueue']);
  const queue = result.pendingQueue || [];

  if (queue.length === 0) return;

  const processedItems = [];
  const remainingItems = [];

  for (const item of queue) {
    const result = await saveToServer(item, item.retryCount);

    if (result.success) {
      processedItems.push(item);
      addToHistory(item);
    } else {
      item.retryCount++;
      if (item.retryCount >= MAX_RETRIES) {
        // Keep in queue but don't retry automatically
        remainingItems.push(item);
      } else {
        remainingItems.push(item);
      }
    }
  }

  await chrome.storage.local.set({ pendingQueue: remainingItems });

  if (processedItems.length > 0) {
    showNotification('Sync Complete', `${processedItems.length} items synced successfully.`);
  }
}

/**
 * Handle messages from popup/content script
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Keep message channel open for async responses
  let keepChannelOpen = false;

  if (request.action === 'save') {
    keepChannelOpen = true;
    saveToServer(request.data)
      .then(async (result) => {
        if (result.success) {
          await addToHistory(request.data);
          sendResponse({ success: true });
        } else {
          await addToPendingQueue(request.data);
          sendResponse({ success: false, error: result.error });
        }
      })
      .catch(err => {
        console.error('Save error:', err);
        sendResponse({ success: false, error: err.message || 'Unknown error' });
      });
  }

  if (request.action === 'getSelection') {
    keepChannelOpen = true;
    chrome.storage.local.get(['currentSelection'], (result) => {
      sendResponse(result.currentSelection || null);
    });
  }

  if (request.action === 'getSettings') {
    keepChannelOpen = true;
    chrome.storage.sync.get(['apiEndpoint', 'apiKey', 'domainRules', 'memosConfig', 'webdavConfig'], (result) => {
      sendResponse(result);
    });
  }

  if (request.action === 'saveSettings') {
    keepChannelOpen = true;
    chrome.storage.sync.set(request.settings, () => {
      sendResponse({ success: true });
    });
  }

  if (request.action === 'getPendingQueue') {
    keepChannelOpen = true;
    chrome.storage.local.get(['pendingQueue'], (result) => {
      sendResponse(result.pendingQueue || []);
    });
  }

  if (request.action === 'getHistory') {
    keepChannelOpen = true;
    chrome.storage.local.get(['history'], (result) => {
      sendResponse(result.history || []);
    });
  }

  if (request.action === 'retryPending') {
    keepChannelOpen = true;
    processPendingQueue().then(() => {
      sendResponse({ success: true });
    });
  }

  if (request.action === 'clearPending') {
    keepChannelOpen = true;
    chrome.storage.local.set({ pendingQueue: [] }, () => {
      sendResponse({ success: true });
    });
  }

  if (request.action === 'clearHistory') {
    keepChannelOpen = true;
    chrome.storage.local.set({ history: [] }, () => {
      sendResponse({ success: true });
    });
  }

  if (request.action === 'testMemos') {
    keepChannelOpen = true;
    testMemosConnection(request.apiEndpoint, request.url, request.token)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, reason: err.message }));
  }

  if (request.action === 'testWebdav') {
    keepChannelOpen = true;
    testWebdavConnection(request.apiEndpoint, request.url, request.username, request.password, request.basePath)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, reason: err.message }));
  }

  return keepChannelOpen;
});

/**
 * Generate UUID
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Show notification
 */
function showNotification(title, message) {
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: title,
      message: message
    });
  } catch (e) {
    console.error('Failed to show notification:', e);
  }
}

/**
 * Test Memos connection
 */
async function testMemosConnection(apiEndpoint, url, token) {
  console.log(`[Memos Test] API Endpoint: ${apiEndpoint}, Memos URL: ${url}`);

  // Ensure apiEndpoint uses correct protocol
  let endpoint = apiEndpoint.trim();
  if (endpoint.startsWith('https://localhost') || endpoint.startsWith('https://127.0.0.1')) {
    endpoint = endpoint.replace('https://', 'http://');
    console.log(`[Memos Test] Corrected endpoint protocol: ${endpoint}`);
  }

  try {
    const response = await fetch(`${endpoint}/api/test/memos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, token })
    });

    if (!response.ok) {
      console.error(`[Memos Test] HTTP error: ${response.status}`);
      return { success: false, reason: `HTTP ${response.status}`, testedUrl: url };
    }

    const result = await response.json();
    console.log(`[Memos Test] Result:`, result);
    return result;
  } catch (err) {
    console.error('[Memos Test] Fetch error:', err);
    return { success: false, reason: `Failed to fetch from ${endpoint}: ${err.message}`, testedUrl: url };
  }
}

/**
 * Test WebDAV connection
 */
async function testWebdavConnection(apiEndpoint, url, username, password, basePath) {
  console.log(`[WebDAV Test] API Endpoint: ${apiEndpoint}, WebDAV URL: ${url}`);

  // Ensure apiEndpoint uses correct protocol
  let endpoint = apiEndpoint.trim();
  if (endpoint.startsWith('https://localhost') || endpoint.startsWith('https://127.0.0.1')) {
    endpoint = endpoint.replace('https://', 'http://');
    console.log(`[WebDAV Test] Corrected endpoint protocol: ${endpoint}`);
  }

  try {
    const response = await fetch(`${endpoint}/api/test/webdav`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, username, password, basePath })
    });

    if (!response.ok) {
      console.error(`[WebDAV Test] HTTP error: ${response.status}`);
      return { success: false, reason: `HTTP ${response.status}`, testedUrl: url };
    }

    const result = await response.json();
    console.log(`[WebDAV Test] Result:`, result);
    return result;
  } catch (err) {
    console.error('[WebDAV Test] Fetch error:', err);
    return { success: false, reason: `Failed to fetch from ${endpoint}: ${err.message}`, testedUrl: url };
  }
}

/**
 * Process pending queue on startup
 */
chrome.runtime.onStartup.addListener(() => {
  processPendingQueue();
});

// Listen for online status (when extension service worker wakes up)
self.addEventListener('online', () => {
  processPendingQueue();
});