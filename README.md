# Like Content Sync

<p align="center">
  <strong>Save the best parts. Keep them forever.</strong>
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README_CN.md">简体中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome-Extension-green" alt="Chrome Extension">
  <img src="https://img.shields.io/badge/Docker-Ready-blue" alt="Docker Ready">
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="MIT License">
</p>

---

## Why Like Content Sync?

Have you ever struggled with these problems?

- 📰 Reading a great article, wanting to save the key insights, but stuck with copy-paste to local files
- 🖼️ Finding an amazing image, saving it locally, then never remembering where it came from
- 💡 Browser bookmarks piling up, opening them later with no clue why you saved them
- 📱 Wanting to check saved content on mobile, but no easy sync solution

**Like Content Sync** is built to solve these problems:

- ✅ **One-Click Save** - Right-click on selected content, save instantly
- ✅ **Markdown Format** - Structured storage, easy to read and edit
- ✅ **Source Tracking** - Auto-records original URL, never lose the source
- ✅ **Smart Tags** - Auto-suggests tags based on domain and content
- ✅ **Image Hosting** - Auto-downloads images, supports Qiniu CDN
- ✅ **Multi-Platform Sync** - Supports Memos, WebDAV, view anywhere

---

## Quick Start

### 1. Deploy Server

```bash
# Clone the project
git clone https://github.com/yourusername/like-content-sync.git
cd like-content-sync/server

# Docker one-command deployment
docker-compose up -d
```

### 2. Install Browser Extension

1. Open Chrome, go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked", select the `extension` folder
4. Configure server address and API Key in extension settings

### 3. Start Using

- Select text or images on any webpage
- Right-click → "Save to Cloud"
- Edit title, add tags, confirm save

---

## Features

### Core Features

| Feature | Description |
|---------|-------------|
| Right-click Save | Select text/images, one-click save to cloud |
| Markdown Format | Auto-convert to Markdown, preserving styles |
| Image Auto-download | Downloads remote images locally, supports Qiniu CDN |
| Smart Tags | Auto-suggests tags based on domain and keywords |
| Source Link | Auto-records original URL with scroll position |
| Offline Queue | Auto-queues when offline, syncs when connected |

### Sync Support

| Platform | Features |
|----------|----------|
| **Memos** | Auto-sync to your Memos instance with image display |
| **WebDAV** | Sync to Nutstore, NextCloud, and other WebDAV services |

### Storage Format

Generates one Markdown file per day, organized by date:

```markdown
# 2024-01-15

## 2024/01/15 10:30:00

**Source**: [Article Title](https://example.com/article#scroll=45)

**Tags**: dev, tutorial, react

Selected content...

---

## 2024/01/15 14:20:00

**Source**: [Another Post](https://blog.example.com/post)

**Tags**: reading

More content...
```

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `API_KEYS` | API keys (comma-separated) | `default-key-change-me` |
| `DATA_DIR` | Data storage directory | `./data` |
| `SERVER_URL` | Server public URL (for image links) | - |

### Memos Config (Optional)

| Variable | Description |
|----------|-------------|
| `MEMOS_URL` | Memos server URL |
| `MEMOS_TOKEN` | Memos Access Token |

### Qiniu Config (Optional)

| Variable | Description |
|----------|-------------|
| `QINIU_ACCESS_KEY` | Qiniu Access Key |
| `QINIU_SECRET_KEY` | Qiniu Secret Key |
| `QINIU_BUCKET` | Storage bucket name |
| `QINIU_DOMAIN` | CDN domain |

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Chrome Extension │────▶│ Backend Server  │────▶│ Local Storage   │
│ (Right-click)    │     │ (Express)       │     │ (Markdown)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ├─────────────────┐
                               │                 │
                        ┌──────▼──────┐   ┌──────▼──────┐
                        │ Memos Sync  │   │ WebDAV Sync │
                        │             │   │             │
                        └─────────────┘   └─────────────┘
```

---

## Screenshots

### Right-click Menu

Select content, right-click to save.

### Save Modal

Edit title, add tags, preview content.

### Settings Page

Configure server, Memos, WebDAV connections.

---

## Development

```bash
# Development mode
cd server
npm install
npm run dev

# Run tests
npm test

# Production build
npm run build
```

---

## Roadmap

- [ ] Firefox extension support
- [ ] Mobile app
- [ ] Full-text search
- [ ] AI-powered summaries
- [ ] Team collaboration version

---

## Contributing

Issues and Pull Requests are welcome!

1. Fork this repo
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push branch (`git push origin feature/amazing-feature`)
5. Create Pull Request

---

## License

[MIT License](LICENSE) - Free to use, welcome to build upon.

---

## Acknowledgments

- [Memos](https://usememos.com) - Open-source note service
- [Express](https://expressjs.com) - Node.js web framework
- [Chrome Extensions](https://developer.chrome.com/docs/extensions/) - Browser extension development

---

<p align="center">
  <strong>Start building your personal knowledge base today!</strong>
</p>

<p align="center">
  ⭐ If you find this useful, please give it a Star
</p>