# Like Content Sync

A Chrome extension that allows users to save selected web content (text and images) to a self-hosted cloud storage via right-click context menu. The system includes a Docker-deployable backend server that organizes content into daily markdown files.

## Features

- Right-click to save selected web content
- Extract text and images from selection
- Add custom tags to saved content
- Automatic tag suggestions based on domain and content
- Offline support with pending queue
- Self-hosted backend with Docker deployment
- Daily markdown files with organized structure

## Project Structure

```
like-content-sync/
├── extension/              # Chrome extension (MV3)
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── options.html/js
│   └── popup.html/js
├── server/                 # Backend API
│   ├── src/
│   ├── Dockerfile
│   └── docker-compose.yml
└── README.md
```

## Quick Start

### Server Setup

```bash
cd server
npm install
npm run dev
```

### Docker Deployment

```bash
cd server
docker-compose up -d
```

### Extension Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `extension/` folder
4. Configure API endpoint and key in extension options

## Configuration

### Environment Variables (Server)

- `PORT` - Server port (default: 3000)
- `API_KEYS` - Comma-separated API keys for authentication

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/content` | Save content with optional images |

## License

MIT