/**
 * Tag generation utility for Like Content Sync extension
 */

// Default domain tag rules
const DEFAULT_DOMAIN_RULES = {
  'github.com': ['dev', 'code'],
  'medium.com': ['reading', 'article'],
  'stackoverflow.com': ['dev', 'qa'],
  'youtube.com': ['video'],
  'twitter.com': ['social'],
  'x.com': ['social'],
  'dev.to': ['dev', 'blog'],
  'reddit.com': ['social', 'discussion'],
  'news.ycombinator.com': ['tech', 'news'],
  'npmjs.com': ['dev', 'package'],
  'docs.google.com': ['docs'],
  'notion.so': ['docs', 'notes'],
  'figma.com': ['design']
};

// Common tech keywords for title analysis
const TECH_KEYWORDS = new Set([
  'javascript', 'python', 'react', 'vue', 'angular', 'node', 'nodejs',
  'css', 'html', 'typescript', 'go', 'rust', 'java', 'swift', 'kotlin',
  'docker', 'kubernetes', 'k8s', 'aws', 'gcp', 'azure', 'serverless',
  'frontend', 'backend', 'fullstack', 'devops', 'mobile', 'ios', 'android',
  'api', 'rest', 'graphql', 'database', 'sql', 'mongodb', 'redis',
  'machine', 'learning', 'ai', 'ml', 'deep', 'neural', 'nlp',
  'security', 'crypto', 'blockchain', 'web3',
  'tutorial', 'guide', 'tips', 'best', 'practices', 'howto', 'learn',
  'architecture', 'design', 'pattern', 'refactor', 'clean', 'code',
  'test', 'testing', 'tdd', 'jest', 'cypress', 'selenium',
  'git', 'github', 'gitlab', 'ci', 'cd', 'pipeline',
  'performance', 'optimization', 'speed', 'benchmark',
  'linux', 'unix', 'macos', 'windows', 'shell', 'bash', 'terminal',
  'web', 'webdev', 'browser', 'chrome', 'firefox', 'safari',
  'ux', 'ui', 'design', 'animation', 'svg', 'canvas', 'threejs', 'webgl'
]);

// Common Chinese keywords
const CHINESE_KEYWORDS = new Set([
  '教程', '指南', '入门', '学习', '笔记', '总结',
  '前端', '后端', '全栈', '开发', '编程',
  '算法', '数据结构', '架构', '设计',
  '测试', '调试', '优化', '性能',
  '安全', '加密', '认证',
  '人工智能', '机器学习', '深度学习',
  '工具', '资源', '推荐', '最佳实践'
]);

/**
 * Get tags from domain mapping
 */
function getDomainTags(domain, customRules = {}) {
  const rules = { ...DEFAULT_DOMAIN_RULES, ...customRules };

  // Try exact domain match
  if (rules[domain]) {
    return rules[domain];
  }

  // Try partial match (e.g., for subdomains)
  const baseDomain = domain.split('.').slice(-2).join('.');
  if (rules[baseDomain]) {
    return rules[baseDomain];
  }

  // Check for pattern matches
  for (const [pattern, tags] of Object.entries(rules)) {
    if (pattern.startsWith('*.') && domain.endsWith(pattern.slice(2))) {
      return tags;
    }
    if (domain.includes(pattern)) {
      return tags;
    }
  }

  return [];
}

/**
 * Extract keywords from title
 */
function extractTitleKeywords(title) {
  const keywords = [];
  const words = title.toLowerCase().split(/\s+|，|,|。|\.|:|：|!|！|?|？|\(|\)|\[|\]|-|_|\//);

  for (const word of words) {
    if (word.length < 2) continue;

    // Check English keywords
    if (TECH_KEYWORDS.has(word)) {
      keywords.push(word);
      continue;
    }

    // Check Chinese keywords
    if (CHINESE_KEYWORDS.has(word)) {
      keywords.push(word);
      continue;
    }
  }

  return keywords.slice(0, 5);
}

/**
 * Get frequent tags from history
 */
function getFrequentTagsFromHistory(history, limit = 5) {
  if (!history || history.length === 0) return [];

  const tagCounts = {};

  for (const item of history) {
    if (item.tags) {
      for (const tag of item.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
  }

  // Sort by frequency
  const sortedTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => tag);

  return sortedTags;
}

/**
 * Generate suggested tags combining all sources
 */
function generateSuggestedTags(domain, title, history = [], customRules = {}) {
  const allTags = new Set();

  // Add domain-based tags
  const domainTags = getDomainTags(domain, customRules);
  domainTags.forEach(tag => allTags.add(tag));

  // Add title-based tags
  const titleTags = extractTitleKeywords(title);
  titleTags.forEach(tag => allTags.add(tag));

  // Add frequent history tags
  const historyTags = getFrequentTagsFromHistory(history);
  historyTags.forEach(tag => allTags.add(tag));

  // Convert to array and limit to 10
  return Array.from(allTags).slice(0, 10);
}

/**
 * Validate and normalize tag
 */
function normalizeTag(tag) {
  if (!tag) return null;

  // Trim and lowercase
  const normalized = tag.trim().toLowerCase();

  // Remove special characters except hyphen and underscore
  const cleaned = normalized.replace(/[^\w\-\u4e00-\u9fa5]/g, '');

  // Check length
  if (cleaned.length < 1 || cleaned.length > 50) {
    return null;
  }

  return cleaned;
}

/**
 * Validate tags array
 */
function validateTags(tags) {
  if (!Array.isArray(tags)) return [];

  const validTags = tags
    .map(normalizeTag)
    .filter(t => t !== null)
    .slice(0, 10); // Max 10 tags

  // Remove duplicates
  return [...new Set(validTags)];
}

// Export functions
module.exports = {
  DEFAULT_DOMAIN_RULES,
  getDomainTags,
  extractTitleKeywords,
  getFrequentTagsFromHistory,
  generateSuggestedTags,
  normalizeTag,
  validateTags
};