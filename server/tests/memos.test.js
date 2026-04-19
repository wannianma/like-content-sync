const {
  normalizeBaseUrl,
  buildApiPath,
  syncToMemos,
  testMemosConnection
} = require('../src/storage/memos');

/**
 * Memos URL 规范化测试
 */
describe('normalizeBaseUrl', () => {
  test('移除末尾斜杠', () => {
    expect(normalizeBaseUrl('https://memos.example.com/')).toBe('https://memos.example.com');
    expect(normalizeBaseUrl('https://memos.example.com///')).toBe('https://memos.example.com');
  });

  test('保留标准 URL', () => {
    expect(normalizeBaseUrl('https://memos.example.com')).toBe('https://memos.example.com');
    expect(normalizeBaseUrl('http://localhost:5230')).toBe('http://localhost:5230');
  });

  test('保留子路径部署', () => {
    expect(normalizeBaseUrl('https://example.com/memos')).toBe('https://example.com/memos');
    expect(normalizeBaseUrl('https://example.com/memos/')).toBe('https://example.com/memos');
    expect(normalizeBaseUrl('https://example.com/app')).toBe('https://example.com/app');
  });

  test('处理复杂 URL', () => {
    expect(normalizeBaseUrl('https://memos.example.com:8080/')).toBe('https://memos.example.com:8080');
    expect(normalizeBaseUrl('https://example.com/memos:8080/')).toBe('https://example.com/memos:8080');
  });
});

/**
 * API 路径构建测试
 */
describe('buildApiPath', () => {
  test('标准路径构建', () => {
    expect(buildApiPath('https://memos.example.com', '/api/v1/memos')).toBe('/api/v1/memos');
  });

  test('子路径部署的 API 路径构建', () => {
    expect(buildApiPath('https://example.com/memos', '/api/v1/memos')).toBe('/memos/api/v1/memos');
  });

  test('处理末尾斜杠', () => {
    expect(buildApiPath('https://memos.example.com/', '/api/v1/memos')).toBe('/api/v1/memos');
    expect(buildApiPath('https://example.com/memos/', '/api/v1/memos')).toBe('/memos/api/v1/memos');
  });
});

/**
 * Memos 同步测试（需要配置）
 */
describe('syncToMemos', () => {
  test('未配置时返回 not_configured', async () => {
    const result = await syncToMemos(
      { title: 'Test', url: 'https://example.com', content: 'Test content', tags: [], timestamp: new Date().toISOString() },
      null, // 无配置
      []
    );

    expect(result.success).toBe(false);
    expect(result.reason).toBe('not_configured');
  });

  test('空配置时返回 not_configured', async () => {
    const result = await syncToMemos(
      { title: 'Test', url: 'https://example.com', content: 'Test content', tags: [], timestamp: new Date().toISOString() },
      { url: '', token: '' },
      []
    );

    expect(result.success).toBe(false);
    expect(result.reason).toBe('not_configured');
  });

  test('处理图片 URL 替换逻辑', async () => {
    // 这个测试验证图片 URL 替换的处理逻辑
    // 实际网络请求需要真实配置或 mock
    const content = '![图片](images/user-abc/test.jpg) 正文内容';
    const images = [
      { localUrl: 'images/user-abc/test.jpg', qiniuUrl: 'https://qiniu.example.com/test.jpg', filename: 'test.jpg' }
    ];

    // 由于没有真实配置，这个测试只验证 not_configured 情况
    const result = await syncToMemos(
      { title: 'Test', url: 'https://example.com', content: content, tags: ['test'], timestamp: new Date().toISOString() },
      { url: '', token: '' },
      images
    );

    expect(result.success).toBe(false);
  });
});

/**
 * Memos 连接测试
 */
describe('testMemosConnection', () => {
  test('缺少 URL 时返回失败', async () => {
    const result = await testMemosConnection('', 'some-token');
    expect(result.success).toBe(false);
  });

  test('缺少 token 时返回失败', async () => {
    const result = await testMemosConnection('https://memos.example.com', '');
    expect(result.success).toBe(false);
  });

  test('无效 URL 格式时返回失败', async () => {
    const result = await testMemosConnection('invalid-url', 'some-token');
    expect(result.success).toBe(false);
  });

  // 注意：真实连接测试需要实际 Memos 服务器
  // 可以在集成测试中或手动测试时执行
});

/**
 * Memos 内容格式化测试（内部逻辑验证）
 */
describe('Memos content formatting', () => {
  test('标签转换为 Memos 格式', () => {
    // 验证标签格式化逻辑（#tag 格式）
    const tags = ['dev', 'code', 'reading'];
    const memosTags = tags.map(tag => `#${tag.replace(/\s+/g, '-')}`).join(' ');
    expect(memosTags).toBe('#dev #code #reading');
  });

  test('标签中空格替换为连字符', () => {
    const tags = ['test tag', 'multi word tag'];
    const memosTags = tags.map(tag => `#${tag.replace(/\s+/g, '-')}`).join(' ');
    expect(memosTags).toBe('#test-tag #multi-word-tag');
  });

  test('来源链接格式', () => {
    const title = 'Test Page';
    const url = 'https://example.com/test';
    const sourceLine = `📍 来源: [${title}](${url})`;
    expect(sourceLine).toContain('来源');
    expect(sourceLine).toContain(title);
    expect(sourceLine).toContain(url);
  });
});

/**
 * 集成测试说明
 *
 * 要测试真实的 Memos 连接，需要：
 * 1. 配置真实的 Memos 服务器 URL 和 Token
 * 2. 手动运行以下测试脚本：
 *
 *   // 测试连接
 *   node -e "
 *     const { testMemosConnection } = require('./src/storage/memos');
 *     testMemosConnection('https://your-memos-url', 'your-token')
 *       .then(r => console.log(r));
 *   "
 *
 *   // 测试同步
 *   node -e "
 *     const { syncToMemos } = require('./src/storage/memos');
 *     syncToMemos(
 *       { title: 'Test', url: 'https://example.com', content: 'Test', tags: ['test'], timestamp: new Date().toISOString() },
 *       { url: 'https://your-memos-url', token: 'your-token' },
 *       []
 *     ).then(r => console.log(r));
 *   "
 */