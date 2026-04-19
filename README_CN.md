# Like Content Sync

<p align="center">
  <strong>一键收藏，永久保存</strong>
</p>

<p align="center">
  <a href="README_CN.md">简体中文</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome-Extension-green" alt="Chrome Extension">
  <img src="https://img.shields.io/badge/Docker-Ready-blue" alt="Docker Ready">
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="MIT License">
</p>

---

## Why Like Content Sync?

你是否遇到过这些困扰？

- 📰 读到一篇好文章，想保存精华段落，却只能复制粘贴到本地文件
- 🖼️ 看到一张精彩图片，右键另存为后，再也找不到它来自哪里
- 💡 浏览器书签堆积如山，打开后却忘记当初为什么要收藏
- 📱 想在手机上查看电脑收藏的内容，却没有便捷的同步方案

**Like Content Sync** 专为解决这些问题而生：

- ✅ **一键保存** - 右键选中内容，即刻收藏
- ✅ **Markdown 格式** - 结构化存储，易于阅读和编辑
- ✅ **来源追溯** - 自动记录原始链接，永不丢失出处
- ✅ **智能标签** - 根据域名和内容自动推荐标签
- ✅ **图片托管** - 自动下载图片，支持七牛云 CDN
- ✅ **多端同步** - 支持 Memos、WebDAV，随时随地查看

---

## Quick Start

### 1. 部署服务器

```bash
# 克隆项目
git clone https://github.com/yourusername/like-content-sync.git
cd like-content-sync/server

# Docker 一键部署
docker-compose up -d
```

### 2. 安装浏览器扩展

1. 打开 Chrome，访问 `chrome://extensions/`
2. 启用「开发者模式」
3. 点击「加载已解压的扩展程序」，选择 `extension` 目录
4. 在扩展设置页面配置服务器地址和 API Key

### 3. 开始使用

- 在任意网页选中文字或图片
- 右键点击 → 「Save to Cloud」
- 编辑标题、添加标签、确认保存

---

## Features

### 核心功能

| 功能 | 描述 |
|------|------|
| 右键收藏 | 选中文本/图片，一键保存到云端 |
| Markdown 格式 | 自动转换为 Markdown，保留格式和样式 |
| 图片自动下载 | 自动下载远程图片到本地，支持七牛云 CDN |
| 智能标签 | 根据域名和内容关键词自动推荐标签 |
| 来源链接 | 自动记录原始 URL，支持滚动位置定位 |
| 离线队列 | 网络断开时自动暂存，恢复后自动同步 |

### 同步支持

| 平台 | 功能 |
|------|------|
| **Memos** | 自动同步到你的 Memos 实例，支持图片展示 |
| **WebDAV** | 同步到坚果云、NextCloud 等 WebDAV 服务 |

### 存储格式

每天生成一个 Markdown 文件，按日期归档：

```markdown
# 2024-01-15

## 2024/01/15 10:30:00

**来源**: [文章标题](https://example.com/article#scroll=45)

**标签**: dev, tutorial, react

选中的内容...

---

## 2024/01/15 14:20:00

**来源**: [另一篇文章](https://blog.example.com/post)

**标签**: reading

更多内容...
```

---

## Configuration

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | `3000` |
| `API_KEYS` | API 密钥（逗号分隔） | `default-key-change-me` |
| `DATA_DIR` | 数据存储目录 | `./data` |
| `SERVER_URL` | 服务器公网地址（用于图片链接） | - |

### Memos 配置（可选）

| 变量 | 说明 |
|------|------|
| `MEMOS_URL` | Memos 服务器地址 |
| `MEMOS_TOKEN` | Memos Access Token |

### 七牛云配置（可选）

| 变量 | 说明 |
|------|------|
| `QINIU_ACCESS_KEY` | 七牛云 Access Key |
| `QINIU_SECRET_KEY` | 七牛云 Secret Key |
| `QINIU_BUCKET` | 存储空间名称 |
| `QINIU_DOMAIN` | CDN 加速域名 |

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Chrome 扩展   │────▶│   后端服务器    │────▶│   本地存储      │
│  (右键收藏)     │     │   (Express)     │     │   (Markdown)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ├─────────────────┐
                               │                 │
                        ┌──────▼──────┐   ┌──────▼──────┐
                        │   Memos     │   │   WebDAV    │
                        │   同步      │   │   同步      │
                        └─────────────┘   └─────────────┘
```

---

## Screenshots

### 右键菜单

选中内容后，右键点击即可保存。

### 保存弹窗

编辑标题、添加标签、预览内容。

### 设置页面

配置服务器、Memos、WebDAV 连接。

---

## Development

```bash
# 开发模式
cd server
npm install
npm run dev

# 运行测试
npm test

# 构建生产版本
npm run build
```

---

## Roadmap

- [ ] Firefox 扩展支持
- [ ] 移动端 App
- [ ] 全文搜索功能
- [ ] AI 智能摘要
- [ ] 团队协作版本

---

## Contributing

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

---

## License

[MIT License](LICENSE) - 自由使用，欢迎二次开发。

---

## Acknowledgments

- [Memos](https://usememos.com) - 开源的笔记服务
- [Express](https://expressjs.com) - Node.js Web 框架
- [Chrome Extensions](https://developer.chrome.com/docs/extensions/) - 浏览器扩展开发

---

<p align="center">
  <strong>开始构建你的个人知识库吧！</strong>
</p>

<p align="center">
  ⭐ 如果觉得有用，请给个 Star 支持一下
</p>