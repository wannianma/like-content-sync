/**
 * Popup script for Like Content Sync extension
 */

(function() {
  'use strict';

  let currentSelection = null;
  let selectedTags = [];

  // Elements
  const editTitle = document.getElementById('edit-title');
  const editContent = document.getElementById('edit-content');
  const sourceInfo = document.getElementById('source-info');
  const selectedTagsContainer = document.getElementById('selected-tags');
  const suggestedTagsContainer = document.getElementById('suggested-tags');
  const tagInput = document.getElementById('tag-input');
  const addTagBtn = document.getElementById('add-tag-btn');
  const saveBtn = document.getElementById('save-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const closeBtn = document.getElementById('close-btn');
  const statusMessage = document.getElementById('status-message');

  /**
   * Initialize popup
   */
  async function init() {
    // Get current selection data
    chrome.runtime.sendMessage({ action: 'getSelection' }, (response) => {
      if (response) {
        currentSelection = response;
        renderEditFields();
        generateSuggestedTags();
      } else {
        showError('No content available');
      }
    });

    // Set up event listeners
    addTagBtn.addEventListener('click', addCustomTag);
    tagInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        addCustomTag();
      }
    });
    saveBtn.addEventListener('click', saveContent);
    cancelBtn.addEventListener('click', closePopup);
    closeBtn.addEventListener('click', closePopup);
  }

  /**
   * Render edit fields
   */
  function renderEditFields() {
    if (!currentSelection) return;

    // Set title
    editTitle.value = currentSelection.title || '';

    // Set content
    editContent.value = currentSelection.content || '';

    // Show source info
    sourceInfo.innerHTML = `Source: <a href="${currentSelection.url}" target="_blank">${currentSelection.url}</a>`;
  }

  /**
   * Generate suggested tags
   */
  function generateSuggestedTags() {
    if (!currentSelection) return;

    chrome.runtime.sendMessage({ action: 'getSettings' }, (settings) => {
      const domainRules = settings.domainRules || {};
      const domain = currentSelection.domain;

      // Get domain-based tags
      const domainTags = domainRules[domain] || [];

      // Get title-based tags
      const titleTags = extractTitleKeywords(currentSelection.title);

      // Combine and deduplicate
      const allSuggested = [...new Set([...domainTags, ...titleTags])];

      renderSuggestedTags(allSuggested);
    });
  }

  /**
   * Extract keywords from title
   */
  function extractTitleKeywords(title) {
    const keywords = [];

    // Simple keyword extraction
    const words = title.toLowerCase().split(/\s+/);

    // Common tech keywords
    const techKeywords = ['javascript', 'python', 'react', 'vue', 'angular', 'node', 'css', 'html',
                          'typescript', 'go', 'rust', 'java', 'docker', 'kubernetes', 'aws', 'gcp',
                          'frontend', 'backend', 'fullstack', 'devops', 'mobile', 'ios', 'android',
                          'tutorial', 'guide', 'tips', 'best', 'practices', 'how', 'to', 'learn'];

    for (const word of words) {
      if (techKeywords.includes(word) && word.length >= 3) {
        keywords.push(word);
      }
    }

    return keywords.slice(0, 5); // Max 5 title-based suggestions
  }

  /**
   * Render suggested tags
   */
  function renderSuggestedTags(tags) {
    suggestedTagsContainer.innerHTML = '';

    for (const tag of tags) {
      const tagEl = createTagElement(tag, 'suggested');
      tagEl.addEventListener('click', () => toggleTag(tag));
      suggestedTagsContainer.appendChild(tagEl);
    }
  }

  /**
   * Render selected tags
   */
  function renderSelectedTags() {
    selectedTagsContainer.innerHTML = '';

    for (const tag of selectedTags) {
      const tagEl = createTagElement(tag, 'selected');
      tagEl.addEventListener('click', () => removeTag(tag));
      selectedTagsContainer.appendChild(tagEl);
    }
  }

  /**
   * Create tag element
   */
  function createTagElement(tag, type) {
    const el = document.createElement('span');
    el.className = `tag ${type}`;
    el.textContent = tag;

    if (type === 'selected') {
      el.innerHTML = `${tag}<span class="remove">×</span>`;
    }

    return el;
  }

  /**
   * Toggle tag selection
   */
  function toggleTag(tag) {
    const index = selectedTags.indexOf(tag);

    if (index === -1) {
      if (selectedTags.length < 10) {
        selectedTags.push(tag);
      } else {
        showStatus('Maximum 10 tags allowed', 'error');
        return;
      }
    } else {
      selectedTags.splice(index, 1);
    }

    renderSelectedTags();
    updateSuggestedTagStyles();
  }

  /**
   * Remove tag
   */
  function removeTag(tag) {
    const index = selectedTags.indexOf(tag);
    if (index !== -1) {
      selectedTags.splice(index, 1);
      renderSelectedTags();
      updateSuggestedTagStyles();
    }
  }

  /**
   * Update suggested tag styles based on selection
   */
  function updateSuggestedTagStyles() {
    const suggestedTags = suggestedTagsContainer.querySelectorAll('.tag');
    suggestedTags.forEach(el => {
      if (selectedTags.includes(el.textContent)) {
        el.classList.add('selected');
      } else {
        el.classList.remove('selected');
      }
    });
  }

  /**
   * Add custom tag
   */
  function addCustomTag() {
    const tag = tagInput.value.trim().toLowerCase();

    if (!tag) return;

    if (tag.length > 50) {
      showStatus('Tag too long (max 50 characters)', 'error');
      return;
    }

    if (selectedTags.length >= 10) {
      showStatus('Maximum 10 tags allowed', 'error');
      return;
    }

    if (!selectedTags.includes(tag)) {
      selectedTags.push(tag);
      renderSelectedTags();
    }

    tagInput.value = '';
  }

  /**
   * Save content
   */
  async function saveContent() {
    if (!currentSelection) {
      showError('No content to save');
      return;
    }

    saveBtn.disabled = true;
    showStatus('Saving...', 'loading');

    // Get edited values
    const editedTitle = editTitle.value.trim() || currentSelection.title;
    const editedContent = editContent.value.trim() || currentSelection.content;

    // Prepare data
    const data = {
      title: editedTitle,
      url: currentSelection.url,
      content: editedContent,
      tags: selectedTags,
      timestamp: new Date().toISOString(),
      imageFiles: []
    };

    // Fetch images as File objects
    if (currentSelection.images && currentSelection.images.length > 0) {
      try {
        for (const img of currentSelection.images) {
          const file = await fetchImageAsFile(img.src);
          if (file) {
            data.imageFiles.push(file);
          }
        }
      } catch (err) {
        console.error('Error fetching images:', err);
      }
    }

    // Send to background for saving
    chrome.runtime.sendMessage({ action: 'save', data }, (response) => {
      if (response.success) {
        showStatus('Saved successfully!', 'success');
        setTimeout(closePopup, 1500);
      } else {
        showStatus(response.error || 'Save failed', 'error');
        saveBtn.disabled = false;
      }
    });
  }

  /**
   * Fetch image as File object
   */
  async function fetchImageAsFile(url) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();

      // Check size
      if (blob.size > 10 * 1024 * 1024) {
        console.warn('Image too large, skipping:', url);
        return null;
      }

      // Convert to File
      const filename = url.split('/').pop() || 'image.png';
      return new File([blob], filename, { type: blob.type || 'image/png' });
    } catch (err) {
      console.error('Failed to fetch image:', url, err);
      return null;
    }
  }

  /**
   * Show status message
   */
  function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
  }

  /**
   * Show error
   */
  function showError(message) {
    editContent.value = message;
    editContent.style.background = '#ffe6e6';
    editContent.disabled = true;
    editTitle.disabled = true;
    saveBtn.disabled = true;
  }

  /**
   * Close popup
   */
  function closePopup() {
    window.close();
  }

  // Initialize on load
  init();
})();