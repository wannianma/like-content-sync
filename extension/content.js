/**
 * Content script for extracting selected content from web pages
 * Converts HTML to Markdown while preserving styles
 * Also provides an in-page modal for saving content
 */

(function() {
  'use strict';

  // Modal instance
  let modalInstance = null;
  let currentSelection = null;

  /**
   * Convert HTML element to Markdown
   */
  function htmlToMarkdown(element) {
    if (!element) return '';

    if (element.nodeType === Node.TEXT_NODE) {
      return element.textContent;
    }

    if (element.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const tagName = element.tagName.toLowerCase();

    let childrenContent = '';
    for (const child of element.childNodes) {
      childrenContent += htmlToMarkdown(child);
    }

    switch (tagName) {
      case 'h1': return `\n# ${childrenContent.trim()}\n\n`;
      case 'h2': return `\n## ${childrenContent.trim()}\n\n`;
      case 'h3': return `\n### ${childrenContent.trim()}\n\n`;
      case 'h4': return `\n#### ${childrenContent.trim()}\n\n`;
      case 'h5': return `\n##### ${childrenContent.trim()}\n\n`;
      case 'h6': return `\n###### ${childrenContent.trim()}\n\n`;
      case 'p': return `\n${childrenContent.trim()}\n\n`;
      case 'div': return `\n${childrenContent.trim()}\n`;
      case 'br': return '\n';
      case 'hr': return '\n---\n\n';
      case 'strong': case 'b': return `**${childrenContent.trim()}**`;
      case 'em': case 'i': return `*${childrenContent.trim()}*`;
      case 's': case 'strike': case 'del': return `~~${childrenContent.trim()}~~`;
      case 'code':
        if (element.parentElement && element.parentElement.tagName.toLowerCase() === 'pre') {
          return childrenContent;
        }
        return `\`${childrenContent.trim()}\``;
      case 'pre':
        const langClass = element.className.match(/language-(\w+)/);
        const lang = langClass ? langClass[1] : '';
        return `\n\`\`\`${lang}\n${childrenContent.trim()}\n\`\`\`\n\n`;
      case 'a':
        const href = element.getAttribute('href') || '';
        const title = element.getAttribute('title');
        if (title) return `[${childrenContent.trim()}](${href} "${title}")`;
        return `[${childrenContent.trim()}](${href})`;
      case 'img':
        const src = element.getAttribute('src') || '';
        const alt = element.getAttribute('alt') || '';
        return `![${alt}](${src})`;
      case 'ul': return processList(element, false);
      case 'ol': return processList(element, true);
      case 'li': return childrenContent;
      case 'blockquote':
        const lines = childrenContent.trim().split('\n');
        return lines.map(line => `> ${line}`).join('\n') + '\n\n';
      case 'table': return processTable(element);
      case 'script': case 'style': case 'noscript': case 'iframe': return '';
      default: return childrenContent;
    }
  }

  function processList(listElement, isOrdered) {
    const items = listElement.querySelectorAll(':scope > li');
    let result = '\n';
    items.forEach((item, index) => {
      const prefix = isOrdered ? `${index + 1}. ` : '- ';
      let content = '';
      for (const child of item.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE &&
            (child.tagName.toLowerCase() === 'ul' || child.tagName.toLowerCase() === 'ol')) {
          const nestedContent = processList(child, child.tagName.toLowerCase() === 'ol');
          content += nestedContent.split('\n').map(line =>
            line.trim() ? '  ' + line : line
          ).join('\n');
        } else {
          content += htmlToMarkdown(child);
        }
      }
      result += `${prefix}${content.trim()}\n`;
    });
    return result + '\n';
  }

  function processTable(tableElement) {
    const rows = tableElement.querySelectorAll('tr');
    if (rows.length === 0) return '';

    let result = '\n';
    let headerRow = null;
    let bodyRows = [];

    const thead = tableElement.querySelector('thead');
    const tbody = tableElement.querySelector('tbody');

    if (thead) headerRow = thead.querySelector('tr');
    if (tbody) bodyRows = tbody.querySelectorAll('tr');
    else {
      if (!headerRow && rows.length > 0) {
        headerRow = rows[0];
        bodyRows = Array.from(rows).slice(1);
      } else {
        bodyRows = rows;
      }
    }

    if (headerRow) {
      const headerCells = headerRow.querySelectorAll('th, td');
      result += '| ' + Array.from(headerCells).map(cell => htmlToMarkdown(cell).trim()).join(' | ') + ' |\n';
      result += '| ' + Array.from(headerCells).map(() => '---').join(' | ') + ' |\n';
    }

    for (const row of bodyRows) {
      const cells = row.querySelectorAll('th, td');
      if (cells.length > 0) {
        result += '| ' + Array.from(cells).map(cell => htmlToMarkdown(cell).trim()).join(' | ') + ' |\n';
      }
    }
    return result + '\n';
  }

  /**
   * Extract text content from selection
   */
  function extractTextContent(selection) {
    const range = selection.getRangeAt(0);
    const container = range.cloneContents();
    const wrapper = document.createElement('div');
    wrapper.appendChild(container);
    let markdown = htmlToMarkdown(wrapper);
    markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();
    return markdown;
  }

  /**
   * Extract images from selection
   */
  function extractImages(selection) {
    const range = selection.getRangeAt(0);
    const container = range.cloneContents();
    const images = [];
    const imgElements = container.querySelectorAll('img');
    for (const img of imgElements) {
      const src = img.src;
      if (src && !src.startsWith('data:')) {
        images.push({ src: src, alt: img.alt || '' });
      }
    }
    return images;
  }

  /**
   * Create and show modal
   */
  function showModal(selectionData) {
    currentSelection = selectionData;

    // Remove existing modal if any
    if (modalInstance) {
      modalInstance.remove();
    }

    // Create modal
    const modal = document.createElement('div');
    modal.id = 'like-content-sync-modal';
    modal.innerHTML = `
      <style>
        #like-content-sync-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 999999;
        }
        #like-content-sync-modal-box {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 400px;
          max-width: 90vw;
          background: #fff;
          border-radius: 12px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
          z-index: 1000000;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .lcs-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid #eee;
        }
        .lcs-header h3 {
          margin: 0;
          font-size: 16px;
          color: #333;
        }
        .lcs-close {
          background: none;
          border: none;
          font-size: 24px;
          color: #999;
          cursor: pointer;
          line-height: 1;
        }
        .lcs-close:hover { color: #666; }
        .lcs-preview {
          padding: 16px 20px;
        }
        .lcs-preview-label {
          font-size: 12px;
          color: #666;
          margin-bottom: 8px;
        }
        .lcs-preview-box {
          background: #f5f5f5;
          border-radius: 8px;
          padding: 12px;
          max-height: 120px;
          overflow-y: auto;
          font-size: 13px;
          line-height: 1.5;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .lcs-source {
          margin-top: 8px;
          font-size: 11px;
          color: #888;
        }
        .lcs-source a {
          color: #0066cc;
          text-decoration: none;
        }
        .lcs-tags-section {
          padding: 16px 20px;
          border-top: 1px solid #eee;
        }
        .lcs-tags-label {
          font-size: 12px;
          color: #666;
          margin-bottom: 8px;
        }
        .lcs-tags-container {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }
        .lcs-tag {
          display: inline-flex;
          align-items: center;
          background: #e0e0e0;
          border-radius: 16px;
          padding: 6px 12px;
          font-size: 13px;
          cursor: pointer;
        }
        .lcs-tag.selected {
          background: #0066cc;
          color: #fff;
        }
        .lcs-tag.suggested {
          background: #f0f0f0;
          border: 1px solid #ddd;
        }
        .lcs-tag-remove {
          margin-left: 4px;
          font-size: 12px;
        }
        .lcs-tag-input-row {
          display: flex;
          gap: 8px;
        }
        .lcs-tag-input {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 13px;
        }
        .lcs-tag-input:focus {
          outline: none;
          border-color: #0066cc;
        }
        .lcs-tag-add-btn {
          padding: 8px 16px;
          background: #0066cc;
          color: #fff;
          border: none;
          border-radius: 6px;
          cursor: pointer;
        }
        .lcs-suggested-row {
          margin-top: 8px;
        }
        .lcs-suggested-label {
          font-size: 11px;
          color: #888;
        }
        .lcs-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          padding: 16px 20px;
          border-top: 1px solid #eee;
        }
        .lcs-btn {
          padding: 10px 20px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
        }
        .lcs-btn-primary {
          background: #0066cc;
          color: #fff;
        }
        .lcs-btn-primary:hover { background: #0052a3; }
        .lcs-btn-primary:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        .lcs-btn-secondary {
          background: #f0f0f0;
          color: #333;
        }
        .lcs-btn-secondary:hover { background: #e0e0e0; }
        .lcs-status {
          padding: 12px 20px;
          text-align: center;
          font-size: 13px;
          border-radius: 6px;
          margin: 0 20px 16px;
          display: none;
        }
        .lcs-status.success {
          display: block;
          background: #e6f7e6;
          color: #2d7d2d;
        }
        .lcs-status.error {
          display: block;
          background: #ffe6e6;
          color: #d32f2f;
        }
        .lcs-status.loading {
          display: block;
          background: #e6f0ff;
          color: #0066cc;
        }
      </style>
      <div id="like-content-sync-overlay"></div>
      <div id="like-content-sync-modal-box">
        <div class="lcs-header">
          <h3>Save to Cloud</h3>
          <button class="lcs-close">×</button>
        </div>
        <div class="lcs-preview">
          <div class="lcs-preview-label">Preview</div>
          <div class="lcs-preview-box">${escapeHtml(selectionData.content.substring(0, 200))}${selectionData.content.length > 200 ? '...' : ''}</div>
          <div class="lcs-source">Source: <a href="${escapeHtml(selectionData.url)}" target="_blank">${escapeHtml(selectionData.title)}</a></div>
        </div>
        <div class="lcs-tags-section">
          <div class="lcs-tags-label">Tags</div>
          <div class="lcs-tags-container" id="lcs-selected-tags"></div>
          <div class="lcs-tag-input-row">
            <input type="text" class="lcs-tag-input" id="lcs-tag-input" placeholder="Add custom tag...">
            <button class="lcs-tag-add-btn" id="lcs-tag-add">+</button>
          </div>
          <div class="lcs-suggested-row">
            <span class="lcs-suggested-label">Suggested: </span>
            <div class="lcs-tags-container" id="lcs-suggested-tags"></div>
          </div>
        </div>
        <div class="lcs-status" id="lcs-status"></div>
        <div class="lcs-actions">
          <button class="lcs-btn lcs-btn-secondary" id="lcs-cancel">Cancel</button>
          <button class="lcs-btn lcs-btn-primary" id="lcs-save">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modalInstance = modal;

    // Initialize
    const selectedTags = [];
    const suggestedTags = generateSuggestedTags(selectionData.domain, selectionData.title);

    renderSelectedTags(selectedTags);
    renderSuggestedTags(suggestedTags, selectedTags);

    // Event handlers
    const overlay = modal.querySelector('#like-content-sync-overlay');
    const closeBtn = modal.querySelector('.lcs-close');
    const cancelBtn = modal.querySelector('#lcs-cancel');
    const saveBtn = modal.querySelector('#lcs-save');
    const tagInput = modal.querySelector('#lcs-tag-input');
    const tagAddBtn = modal.querySelector('#lcs-tag-add');

    function closeModal() {
      modal.remove();
      modalInstance = null;
    }

    overlay.addEventListener('click', closeModal);
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    tagAddBtn.addEventListener('click', () => {
      const tag = tagInput.value.trim().toLowerCase();
      if (tag && tag.length <= 50 && !selectedTags.includes(tag) && selectedTags.length < 10) {
        selectedTags.push(tag);
        renderSelectedTags(selectedTags);
        renderSuggestedTags(suggestedTags, selectedTags);
      }
      tagInput.value = '';
    });

    tagInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') tagAddBtn.click();
    });

    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      showStatus('Saving...', 'loading');

      const data = {
        title: currentSelection.title,
        url: currentSelection.url,
        content: currentSelection.content,
        tags: selectedTags,
        timestamp: new Date().toISOString(),
        imageFiles: []
      };

      // Send to background
      chrome.runtime.sendMessage({ action: 'save', data }, (response) => {
        if (response.success) {
          showStatus('Saved successfully!', 'success');
          setTimeout(closeModal, 1500);
        } else {
          showStatus(response.error || 'Save failed', 'error');
          saveBtn.disabled = false;
        }
      });
    });

    function renderSelectedTags(tags) {
      const container = modal.querySelector('#lcs-selected-tags');
      container.innerHTML = '';
      tags.forEach(tag => {
        const el = document.createElement('span');
        el.className = 'lcs-tag selected';
        el.innerHTML = `${escapeHtml(tag)}<span class="lcs-tag-remove">×</span>`;
        el.addEventListener('click', () => {
          const idx = selectedTags.indexOf(tag);
          if (idx !== -1) {
            selectedTags.splice(idx, 1);
            renderSelectedTags(selectedTags);
            renderSuggestedTags(suggestedTags, selectedTags);
          }
        });
        container.appendChild(el);
      });
    }

    function renderSuggestedTags(suggested, selected) {
      const container = modal.querySelector('#lcs-suggested-tags');
      container.innerHTML = '';
      suggested.forEach(tag => {
        const el = document.createElement('span');
        el.className = 'lcs-tag suggested' + (selected.includes(tag) ? ' selected' : '');
        el.textContent = tag;
        el.addEventListener('click', () => {
          if (!selected.includes(tag) && selected.length < 10) {
            selected.push(tag);
            renderSelectedTags(selected);
            renderSuggestedTags(suggested, selected);
          } else if (selected.includes(tag)) {
            const idx = selected.indexOf(tag);
            selected.splice(idx, 1);
            renderSelectedTags(selected);
            renderSuggestedTags(suggested, selected);
          }
        });
        container.appendChild(el);
      });
    }

    function showStatus(msg, type) {
      const status = modal.querySelector('#lcs-status');
      status.textContent = msg;
      status.className = 'lcs-status ' + type;
    }
  }

  /**
   * Generate suggested tags
   */
  function generateSuggestedTags(domain, title) {
    const tags = [];
    const techKeywords = ['javascript', 'python', 'react', 'vue', 'angular', 'node', 'css',
      'typescript', 'docker', 'kubernetes', 'aws', 'frontend', 'backend', 'devops',
      'tutorial', 'guide', 'tips', 'api', 'security', 'database'];

    // Domain-based
    const domainRules = {
      'github.com': ['dev', 'code'],
      'medium.com': ['reading', 'article'],
      'stackoverflow.com': ['dev', 'qa'],
      'youtube.com': ['video'],
      'dev.to': ['dev', 'blog']
    };
    if (domainRules[domain]) tags.push(...domainRules[domain]);

    // Title keywords
    const words = title.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (techKeywords.includes(word) && word.length >= 3) tags.push(word);
    }

    return [...new Set(tags)].slice(0, 6);
  }

  /**
   * Escape HTML
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Handle message from background script
   */
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getSelection') {
      const selection = window.getSelection();

      if (!selection || selection.isCollapsed) {
        sendResponse({ error: 'No selection' });
        return true;
      }

      const text = extractTextContent(selection);
      const images = extractImages(selection);

      if (!text && images.length === 0) {
        sendResponse({ error: 'Empty selection' });
        return true;
      }

      const data = {
        title: document.title,
        url: window.location.href,
        content: text,
        images: images,
        domain: window.location.hostname
      };

      // Show modal directly
      showModal(data);

      sendResponse(data);
      return true;
    }

    if (request.action === 'showModal') {
      showModal(request.data);
      sendResponse({ success: true });
      return true;
    }
  });

})();