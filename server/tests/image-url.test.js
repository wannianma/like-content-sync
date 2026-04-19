const {
  extractImageUrlsFromContent,
  processContentImages,
  formatMarkdownEntry
} = require('../src/storage/index');

/**
 * 图片 URL 提取测试
 * 测试各种 markdown 图片格式
 */
describe('extractImageUrlsFromContent', () => {
  test('提取标准图片格式 ![alt](url)', () => {
    const content = '这是一段文字 ![图片](https://example.com/image.jpg) 更多文字';
    const images = extractImageUrlsFromContent(content);

    expect(images.length).toBe(1);
    expect(images[0].type).toBe('external');
    expect(images[0].url).toBe('https://example.com/image.jpg');
    expect(images[0].alt).toBe('图片');
  });

  test('提取嵌套链接图片格式 [![alt](img-url)](link-url)', () => {
    const content = '[![M5StickC Plus](https://example.com/device.jpg)](https://example.com/link)';
    const images = extractImageUrlsFromContent(content);

    expect(images.length).toBe(1);
    expect(images[0].type).toBe('external');
    expect(images[0].url).toBe('https://example.com/device.jpg');
    expect(images[0].alt).toBe('M5StickC Plus');
  });

  test('提取相对路径图片 ![alt](/path/image.jpg) 并转换为完整 URL', () => {
    const content = '![文档图片](/anthropics/claude-desktop-buddy/raw/main/docs/device.jpg)';
    const pageUrl = 'https://github.com/anthropics/claude-desktop-buddy';
    const images = extractImageUrlsFromContent(content, pageUrl);

    expect(images.length).toBe(1);
    expect(images[0].type).toBe('external');
    expect(images[0].url).toBe('https://github.com/anthropics/claude-desktop-buddy/raw/main/docs/device.jpg');
  });

  test('提取多个图片', () => {
    const content = `
      # 标题
      ![图片1](https://example.com/image1.jpg)
      一些文字
      [![嵌套图片](https://example.com/nested.png)](https://example.com/link)
      ![图片2](https://example.com/image2.jpg)
    `;
    const images = extractImageUrlsFromContent(content);

    expect(images.length).toBe(3);
    expect(images[0].url).toBe('https://example.com/image1.jpg');
    expect(images[1].url).toBe('https://example.com/nested.png');
    expect(images[2].url).toBe('https://example.com/image2.jpg');
  });

  test('忽略本地路径图片 images/xxx', () => {
    const content = '![本地图片](images/user-abc123/local.jpg) ![远程图片](https://example.com/remote.jpg)';
    const images = extractImageUrlsFromContent(content);

    expect(images.length).toBe(2);
    expect(images[0].type).toBe('local');
    expect(images[0].url).toBe('images/user-abc123/local.jpg');
    expect(images[1].type).toBe('external');
    expect(images[1].url).toBe('https://example.com/remote.jpg');
  });

  test('忽略 base64 图片', () => {
    const content = '![base64](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGWAj6RAQAAAABJRU5ErkJggg==)';
    const images = extractImageUrlsFromContent(content);

    expect(images.length).toBe(0);
  });

  test('处理复杂嵌套格式：GitHub README 风格', () => {
    const content = `
      # Project Title

      [![Device Photo](/anthropics/claude-desktop-buddy/raw/main/docs/device.jpg)](/anthropics/claude-desktop-buddy/blob/main/docs/device.jpg)

      Some description here.

      ![Another Image](https://raw.githubusercontent.com/anthropics/claude-desktop-buddy/main/docs/screenshot.png)
    `;
    const pageUrl = 'https://github.com/anthropics/claude-desktop-buddy';
    const images = extractImageUrlsFromContent(content, pageUrl);

    expect(images.length).toBe(2);
    // 第一个应该是相对路径转换后的
    expect(images[0].url).toBe('https://github.com/anthropics/claude-desktop-buddy/raw/main/docs/device.jpg');
    // 第二个是完整 URL
    expect(images[1].url).toBe('https://raw.githubusercontent.com/anthropics/claude-desktop-buddy/main/docs/screenshot.png');
  });

  test('没有页面 URL 时，相对路径不转换', () => {
    const content = '![相对路径](/path/to/image.jpg)';
    const images = extractImageUrlsFromContent(content, null);

    // 相对路径没有被识别为 external（因为不以 http/https 开头）
    expect(images.length).toBe(0);
  });

  test('处理图片 URL 中带空格的情况', () => {
    const content = '![图片](https://example.com/path%20with%20spaces/image.jpg)';
    const images = extractImageUrlsFromContent(content);

    expect(images.length).toBe(1);
    expect(images[0].url).toBe('https://example.com/path%20with%20spaces/image.jpg');
  });

  test('提取 GIF 图片格式 ![alt](url.gif)', () => {
    const content = '这是一段文字 ![动态图片](https://example.com/animation.gif) 更多文字';
    const images = extractImageUrlsFromContent(content);

    expect(images.length).toBe(1);
    expect(images[0].type).toBe('external');
    expect(images[0].url).toBe('https://example.com/animation.gif');
    expect(images[0].alt).toBe('动态图片');
  });

  test('提取嵌套链接中的 GIF 图片 [![alt](gif-url)](link-url)', () => {
    const content = '[![演示动画](https://example.com/demo.gif)](https://example.com/page)';
    const images = extractImageUrlsFromContent(content);

    expect(images.length).toBe(1);
    expect(images[0].type).toBe('external');
    expect(images[0].url).toBe('https://example.com/demo.gif');
    expect(images[0].alt).toBe('演示动画');
  });

  test('混合提取 JPG、PNG、GIF 等多种图片格式', () => {
    const content = `
      ![JPG图片](https://example.com/photo.jpg)
      ![PNG图片](https://example.com/screenshot.png)
      ![GIF动画](https://example.com/animation.gif)
      ![WebP图片](https://example.com/modern.webp)
    `;
    const images = extractImageUrlsFromContent(content);

    expect(images.length).toBe(4);
    expect(images[0].url).toBe('https://example.com/photo.jpg');
    expect(images[1].url).toBe('https://example.com/screenshot.png');
    expect(images[2].url).toBe('https://example.com/animation.gif');
    expect(images[3].url).toBe('https://example.com/modern.webp');
  });
});

/**
 * Markdown 格式化测试
 */
describe('formatMarkdownEntry', () => {
  test('正确格式化 markdown 条目', () => {
    const title = 'Test Page';
    const url = 'https://example.com';
    const content = 'This is test content';
    const tags = ['test', 'demo'];
    const timestamp = '2024-01-15T10:30:00.000Z';

    const entry = formatMarkdownEntry(title, url, content, tags, timestamp);

    expect(entry).toContain('## 2024/01/15');
    expect(entry).toContain('**来源**: [Test Page](https://example.com)');
    expect(entry).toContain('**标签**: test, demo');
    expect(entry).toContain('This is test content');
    expect(entry).toContain('---');
  });

  test('无标签时不显示标签行', () => {
    const title = 'Test Page';
    const url = 'https://example.com';
    const content = 'Content';
    const tags = [];
    const timestamp = '2024-01-15T10:30:00.000Z';

    const entry = formatMarkdownEntry(title, url, content, tags, timestamp);

    expect(entry).not.toContain('**标签**');
  });
});

/**
 * 运行测试的说明
 *
 * 执行测试：
 *   cd server
 *   npm test
 *
 * 或只运行此测试文件：
 *   npm test -- tests/image-url.test.js
 *
 * 监听模式（开发时使用）：
 *   npm run test:watch
 */