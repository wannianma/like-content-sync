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

  let currentDomainRules = {};

  /**
   * Initialize options page
   */
  async function init() {
    loadSettings();
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
      domainRules: currentDomainRules
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