/**
 * Options page script for Like Content Sync extension
 */

(function() {
  'use strict';

  // Elements
  const apiEndpointInput = document.getElementById('api-endpoint');
  const apiKeyInput = document.getElementById('api-key');
  const toggleKeyBtn = document.getElementById('toggle-key');
  const testConnectionBtn = document.getElementById('test-connection');
  const saveSettingsBtn = document.getElementById('save-settings');
  const connectionStatus = document.getElementById('connection-status');
  const pendingList = document.getElementById('pending-list');
  const retryPendingBtn = document.getElementById('retry-pending');
  const clearPendingBtn = document.getElementById('clear-pending');
  const historyList = document.getElementById('history-list');
  const clearHistoryBtn = document.getElementById('clear-history');
  const domainRulesList = document.getElementById('domain-rules-list');
  const newDomainInput = document.getElementById('new-domain');
  const newTagsInput = document.getElementById('new-tags');
  const addRuleBtn = document.getElementById('add-rule');

  // Memos elements
  const memosEnabledCheckbox = document.getElementById('memos-enabled');
  const memosUrlInput = document.getElementById('memos-url');
  const memosTokenInput = document.getElementById('memos-token');
  const toggleMemosTokenBtn = document.getElementById('toggle-memos-token');
  const testMemosBtn = document.getElementById('test-memos');
  const memosConfigFields = document.getElementById('memos-config-fields');
  const memosTestStatus = document.getElementById('memos-test-status');

  // WebDAV elements
  const webdavEnabledCheckbox = document.getElementById('webdav-enabled');
  const webdavUrlInput = document.getElementById('webdav-url');
  const webdavUsernameInput = document.getElementById('webdav-username');
  const webdavPasswordInput = document.getElementById('webdav-password');
  const toggleWebdavPasswordBtn = document.getElementById('toggle-webdav-password');
  const webdavBasePathInput = document.getElementById('webdav-base-path');
  const testWebdavBtn = document.getElementById('test-webdav');
  const webdavConfigFields = document.getElementById('webdav-config-fields');
  const webdavTestStatus = document.getElementById('webdav-test-status');

  let currentDomainRules = {};

  /**
   * Initialize options page
   */
  async function init() {
    loadSettings();
    loadSyncConfigs();
    loadPendingQueue();
    loadHistory();
    loadDomainRules();

    // Event listeners
    toggleKeyBtn.addEventListener('click', toggleApiKeyVisibility);
    testConnectionBtn.addEventListener('click', testConnection);
    saveSettingsBtn.addEventListener('click', saveSettings);
    retryPendingBtn.addEventListener('click', retryPending);
    clearPendingBtn.addEventListener('click', clearPending);
    clearHistoryBtn.addEventListener('click', clearHistory);
    addRuleBtn.addEventListener('click', addDomainRule);

    // Memos event listeners
    memosEnabledCheckbox.addEventListener('change', toggleMemosFields);
    toggleMemosTokenBtn.addEventListener('click', toggleMemosTokenVisibility);
    testMemosBtn.addEventListener('click', testMemosConnection);

    // WebDAV event listeners
    webdavEnabledCheckbox.addEventListener('change', toggleWebdavFields);
    toggleWebdavPasswordBtn.addEventListener('click', toggleWebdavPasswordVisibility);
    testWebdavBtn.addEventListener('click', testWebdavConnection);
  }

  /**
   * Load settings from storage
   */
  function loadSettings() {
    chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
      if (response) {
        apiEndpointInput.value = response.apiEndpoint || '';
        apiKeyInput.value = response.apiKey || '';
      }
    });
  }

  /**
   * Load sync configurations from storage
   */
  function loadSyncConfigs() {
    chrome.runtime.sendMessage({ action: 'getSettings' }, (settings) => {
      // Memos config
      if (settings.memosConfig) {
        memosEnabledCheckbox.checked = settings.memosConfig.enabled || false;
        memosUrlInput.value = settings.memosConfig.url || '';
        memosTokenInput.value = settings.memosConfig.token || '';
        toggleMemosFields();
      }

      // WebDAV config
      if (settings.webdavConfig) {
        webdavEnabledCheckbox.checked = settings.webdavConfig.enabled || false;
        webdavUrlInput.value = settings.webdavConfig.url || '';
        webdavUsernameInput.value = settings.webdavConfig.username || '';
        webdavPasswordInput.value = settings.webdavConfig.password || '';
        webdavBasePathInput.value = settings.webdavConfig.basePath || '/notes';
        toggleWebdavFields();
      }
    });
  }

  /**
   * Toggle Memos config fields visibility
   */
  function toggleMemosFields() {
    memosConfigFields.style.display = memosEnabledCheckbox.checked ? 'block' : 'none';
  }

  /**
   * Toggle WebDAV config fields visibility
   */
  function toggleWebdavFields() {
    webdavConfigFields.style.display = webdavEnabledCheckbox.checked ? 'block' : 'none';
  }

  /**
   * Toggle Memos token visibility
   */
  function toggleMemosTokenVisibility() {
    const type = memosTokenInput.type;
    memosTokenInput.type = type === 'password' ? 'text' : 'password';
    toggleMemosTokenBtn.textContent = type === 'password' ? '🙈' : '👁';
  }

  /**
   * Toggle WebDAV password visibility
   */
  function toggleWebdavPasswordVisibility() {
    const type = webdavPasswordInput.type;
    webdavPasswordInput.type = type === 'password' ? 'text' : 'password';
    toggleWebdavPasswordBtn.textContent = type === 'password' ? '🙈' : '👁';
  }

  /**
   * Test Memos connection
   */
  async function testMemosConnection() {
    const url = memosUrlInput.value.trim();
    const token = memosTokenInput.value.trim();
    const apiEndpoint = apiEndpointInput.value.trim();

    if (!apiEndpoint) {
      showSyncStatus('memos', 'Please configure API endpoint first', 'error');
      return;
    }

    if (!url || !token) {
      showSyncStatus('memos', 'Please enter Memos URL and Token', 'error');
      return;
    }

    showSyncStatus('memos', `Testing connection to ${url}...`, 'loading');

    chrome.runtime.sendMessage({
      action: 'testMemos',
      apiEndpoint: apiEndpoint,
      url: url,
      token: token
    }, (result) => {
      if (chrome.runtime.lastError) {
        showSyncStatus('memos', `Connection to ${url} failed: ${chrome.runtime.lastError.message}`, 'error');
        return;
      }
      if (result.success) {
        showSyncStatus('memos', `Connection to ${url} successful!`, 'success');
      } else {
        showSyncStatus('memos', `Connection to ${url} failed: ${result.reason}`, 'error');
      }
    });
  }

  /**
   * Test WebDAV connection
   */
  async function testWebdavConnection() {
    const url = webdavUrlInput.value.trim();
    const username = webdavUsernameInput.value.trim();
    const password = webdavPasswordInput.value.trim();
    const basePath = webdavBasePathInput.value.trim() || '/notes';
    const apiEndpoint = apiEndpointInput.value.trim();

    if (!apiEndpoint) {
      showSyncStatus('webdav', 'Please configure API endpoint first', 'error');
      return;
    }

    if (!url || !username || !password) {
      showSyncStatus('webdav', 'Please enter WebDAV URL, Username and Password', 'error');
      return;
    }

    showSyncStatus('webdav', `Testing connection to ${url}...`, 'loading');

    chrome.runtime.sendMessage({
      action: 'testWebdav',
      apiEndpoint: apiEndpoint,
      url: url,
      username: username,
      password: password,
      basePath: basePath
    }, (result) => {
      if (chrome.runtime.lastError) {
        showSyncStatus('webdav', `Connection to ${url} failed: ${chrome.runtime.lastError.message}`, 'error');
        return;
      }
      if (result.success) {
        showSyncStatus('webdav', `Connection to ${url} successful!`, 'success');
      } else {
        showSyncStatus('webdav', `Connection to ${url} failed: ${result.reason}`, 'error');
      }
    });
  }

  /**
   * Show sync test status
   */
  function showSyncStatus(type, message, statusType) {
    const statusEl = type === 'memos' ? memosTestStatus : webdavTestStatus;
    statusEl.textContent = message;
    statusEl.className = `status-message ${statusType}`;
  }

  /**
   * Load pending queue
   */
  function loadPendingQueue() {
    chrome.runtime.sendMessage({ action: 'getPendingQueue' }, (queue) => {
      renderPendingList(queue || []);
    });
  }

  /**
   * Load history
   */
  function loadHistory() {
    chrome.runtime.sendMessage({ action: 'getHistory' }, (history) => {
      renderHistoryList(history || []);
    });
  }

  /**
   * Load domain rules
   */
  function loadDomainRules() {
    chrome.runtime.sendMessage({ action: 'getSettings' }, (settings) => {
      currentDomainRules = settings.domainRules || getDefaultDomainRules();
      renderDomainRules();
    });
  }

  /**
   * Get default domain rules
   */
  function getDefaultDomainRules() {
    return {
      'github.com': ['dev', 'code'],
      'medium.com': ['reading', 'article'],
      'stackoverflow.com': ['dev', 'qa'],
      'youtube.com': ['video'],
      'twitter.com': ['social'],
      'x.com': ['social'],
      'dev.to': ['dev', 'blog'],
      'reddit.com': ['social', 'discussion']
    };
  }

  /**
   * Toggle API key visibility
   */
  function toggleApiKeyVisibility() {
    const type = apiKeyInput.type;
    apiKeyInput.type = type === 'password' ? 'text' : 'password';
    toggleKeyBtn.textContent = type === 'password' ? '🙈' : '👁';
  }

  /**
   * Test connection to server
   */
  async function testConnection() {
    const endpoint = apiEndpointInput.value.trim();
    const apiKey = apiKeyInput.value.trim();

    if (!endpoint) {
      showConnectionStatus('Please enter an API endpoint', 'error');
      return;
    }

    showConnectionStatus('Testing connection...', 'loading');

    try {
      const response = await fetch(`${endpoint}/api/health`, {
        headers: apiKey ? { 'X-API-Key': apiKey } : {}
      });

      if (response.ok) {
        showConnectionStatus('Connection successful!', 'success');
      } else {
        showConnectionStatus(`Connection failed: ${response.status}`, 'error');
      }
    } catch (err) {
      showConnectionStatus('Connection failed: Network error', 'error');
    }
  }

  /**
   * Save settings
   */
  function saveSettings() {
    const settings = {
      apiEndpoint: apiEndpointInput.value.trim(),
      apiKey: apiKeyInput.value.trim(),
      domainRules: currentDomainRules,
      memosConfig: {
        enabled: memosEnabledCheckbox.checked,
        url: memosUrlInput.value.trim(),
        token: memosTokenInput.value.trim()
      },
      webdavConfig: {
        enabled: webdavEnabledCheckbox.checked,
        url: webdavUrlInput.value.trim(),
        username: webdavUsernameInput.value.trim(),
        password: webdavPasswordInput.value.trim(),
        basePath: webdavBasePathInput.value.trim() || '/notes'
      }
    };

    chrome.runtime.sendMessage({ action: 'saveSettings', settings }, (response) => {
      if (response.success) {
        showConnectionStatus('Settings saved!', 'success');
      } else {
        showConnectionStatus('Failed to save settings', 'error');
      }
    });
  }

  /**
   * Show connection status
   */
  function showConnectionStatus(message, type) {
    connectionStatus.textContent = message;
    connectionStatus.className = `status-message ${type}`;
  }

  /**
   * Render pending list
   */
  function renderPendingList(items) {
    pendingList.innerHTML = '';

    if (items.length === 0) {
      pendingList.innerHTML = '<div class="item"><div class="item-meta">No pending items</div></div>';
      return;
    }

    for (const item of items) {
      const el = document.createElement('div');
      el.className = 'item';
      el.innerHTML = `
        <div class="item-title">${item.title || 'Untitled'}</div>
        <div class="item-meta">${formatTimestamp(item.timestamp)}</div>
        <div class="item-tags">${item.tags?.map(t => `<span class="tag">${t}</span>`).join('') || ''}</div>
      `;
      pendingList.appendChild(el);
    }
  }

  /**
   * Render history list
   */
  function renderHistoryList(items) {
    historyList.innerHTML = '';

    if (items.length === 0) {
      historyList.innerHTML = '<div class="item"><div class="item-meta">No history items</div></div>';
      return;
    }

    for (const item of items) {
      const el = document.createElement('div');
      el.className = 'item';
      el.innerHTML = `
        <div class="item-title">${item.title || 'Untitled'}</div>
        <div class="item-meta">${formatTimestamp(item.savedAt)}</div>
        <div class="item-tags">${item.tags?.map(t => `<span class="tag">${t}</span>`).join('') || ''}</div>
      `;
      historyList.appendChild(el);
    }
  }

  /**
   * Render domain rules
   */
  function renderDomainRules() {
    domainRulesList.innerHTML = '';

    for (const [domain, tags] of Object.entries(currentDomainRules)) {
      const el = document.createElement('div');
      el.className = 'rule-item';
      el.innerHTML = `
        <span class="rule-domain">${domain}</span>
        <span class="rule-tags">${tags.join(', ')}</span>
        <button class="rule-remove" data-domain="${domain}">×</button>
      `;
      el.querySelector('.rule-remove').addEventListener('click', () => removeDomainRule(domain));
      domainRulesList.appendChild(el);
    }
  }

  /**
   * Add domain rule
   */
  function addDomainRule() {
    const domain = newDomainInput.value.trim().toLowerCase();
    const tags = newTagsInput.value.split(',').map(t => t.trim().toLowerCase()).filter(t => t);

    if (!domain) {
      return;
    }

    if (domain.includes('/') || domain.includes(':')) {
      alert('Please enter just the domain (e.g., example.com)');
      return;
    }

    currentDomainRules[domain] = tags;
    renderDomainRules();
    saveSettings();

    newDomainInput.value = '';
    newTagsInput.value = '';
  }

  /**
   * Remove domain rule
   */
  function removeDomainRule(domain) {
    delete currentDomainRules[domain];
    renderDomainRules();
    saveSettings();
  }

  /**
   * Retry pending items
   */
  function retryPending() {
    chrome.runtime.sendMessage({ action: 'retryPending' }, (response) => {
      if (response.success) {
        loadPendingQueue();
      }
    });
  }

  /**
   * Clear pending queue
   */
  function clearPending() {
    if (confirm('Are you sure you want to clear the pending queue?')) {
      chrome.runtime.sendMessage({ action: 'clearPending' }, (response) => {
        if (response.success) {
          loadPendingQueue();
        }
      });
    }
  }

  /**
   * Clear history
   */
  function clearHistory() {
    if (confirm('Are you sure you want to clear all history?')) {
      chrome.runtime.sendMessage({ action: 'clearHistory' }, (response) => {
        if (response.success) {
          loadHistory();
        }
      });
    }
  }

  /**
   * Format timestamp
   */
  function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return timestamp;
    }
  }

  // Initialize on load
  init();
})();