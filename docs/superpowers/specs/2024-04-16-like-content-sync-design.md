# Like Content Sync - Design Specification

**Date:** 2024-04-16
**Author:** Claude

## Overview

A Chrome extension that allows users to save selected web content (text and images) to a self-hosted cloud storage via right-click context menu. The system includes a Docker-deployable backend server that organizes content into daily markdown files.

## Architecture

### Project Structure

```
like-content-sync/
├── extension/              # Chrome extension (MV3)
│   ├── manifest.json       # Extension manifest
│   ├── background.js       # Service worker for context menu & API calls
│   ├── content.js          # Content script for selection extraction
│   ├── options.html        # Settings page
│   ├── options.js          # Settings page logic
│   ├── popup.html          # Quick status view
│   ├── popup.js            # Popup logic
│   ├── styles/             # CSS files
│   └── icons/              # Extension icons
│
├── server/                 # Backend API (Docker-ready)
│   ├── Dockerfile          # Docker build file
│   ├── docker-compose.yml  # Easy deployment
│   ├── package.json        # Node.js dependencies
│   ├── src/
│   │   ├── index.js        # Express server entry
│   │   ├── routes/         # API routes
│   │   ├── storage/        # File storage logic
│   │   └── middleware/     # Auth middleware
│   └── data/               # Persistent markdown files
│
└── README.md               # Documentation
```

### Components

| Component | Responsibility |
|-----------|----------------|
| **extension/background.js** | Context menu, API communication, local history, pending queue |
| **extension/content.js** | Extract selection (text + images), page metadata |
| **extension/options.js** | Settings UI, API configuration, history view |
| **extension/popup.js** | Tag input, content preview, save action |
| **server** | REST API, file storage, image handling |

### Data Flow

```
User selects content → Right-click "Save to Cloud" →
popup.js shows preview + tag input →
User confirms tags →
background.js sends to server API (multipart/form-data) →
Server appends to daily markdown file, stores images →
background.js saves to local history
```

---

## Server API Design

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST /api/content` | Save content (text + images) |
| `GET /api/health` | Health check |

### Request Format (POST /api/content)

```
Content-Type: multipart/form-data

Fields:
- title: string (required) - page title
- url: string (required) - source URL
- content: string (required) - selected text, markdown formatted
- images: file[] (optional) - 0 or more image files
- tags: string (optional) - comma-separated tags
- timestamp: string (required) - ISO 8601 format
```

### Response Format

**Success (200):**
```json
{
  "success": true,
  "imageUrls": ["images/abc123.png"]
}
```

**Error (4xx/5xx):**
```json
{
  "error": "Error message"
}
```

### Authentication

- Header: `X-API-Key: <your-key>`
- Server validates against configured keys in environment variable

### Server Storage Structure

```
/data/notes/              # Docker volume mapping point
├── api-key-1/            # Folder per API key (hashed or obfuscated)
│   ├── 2024-04-16.md     # Daily markdown file
│   └── images/
│       └── abc123.png
├── api-key-2/
│   ├── 2024-04-16.md
│   └── images/
│       └── def456.jpg
```

### Markdown File Format

Each saved content is appended to the daily file:

```markdown
## 2024-04-16 14:30:00

**来源**: [文章标题](https://example.com/article)

**标签**: tech, frontend

选中的内容...

![image](images/abc123.png)

---

```

### Docker Configuration

```yaml
# docker-compose.yml
services:
  like-content-sync:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./notes:/data/notes  # Map to host for persistence
    environment:
      - API_KEYS=key1,key2,key3
      - PORT=3000
```

---

## Extension UI Design

### Context Menu

- Menu item: "Save to Cloud" with extension icon
- Appears when user has selected content
- On click: Opens popup/modal

### Popup/Modal Layout

```
┌─────────────────────────────────────┐
│ Save to Cloud                    [X]│
├─────────────────────────────────────┤
│ Preview:                            │
│ ┌─────────────────────────────────┐ │
│ │ Selected text preview...        │ │
│ │ (first 200 chars + images)      │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ Tags:                               │
│ ┌─────┐ ┌─────┐ ┌─────┐            │
│ │ tech│ │ vue │ │ +   │            │
│ └─────┘ └─────┘ └─────┘            │
│ Suggested: [frontend] [tutorial]    │
├─────────────────────────────────────┤
│ [Cancel]              [Save]        │
└─────────────────────────────────────┘
```

### Tag UI Interactions

| Action | Behavior |
|--------|----------|
| Click suggested tag | Adds to selected tags |
| Click tag on selected | Removes tag |
| Click "+" button | Opens text input for custom tag |
| Type + Enter | Adds custom tag, clears input |
| Press Enter on "Save" | Submits content |

### Options Page

- API endpoint URL configuration
- API key configuration
- Tag history management
- Clear history / pending queue
- Recent saves list

---

## Tag Generation Logic (Hybrid Approach)

### Tag Sources

| Source | Method | Example |
|--------|--------|---------|
| Domain mapping | Predefined rules | github.com → "dev", "code" |
| Title keywords | Extract meaningful words | "Vue 3 教程" → "vue", "frontend" |
| User history | Frequently used tags | User often uses "tech" |
| Custom rules | User-defined URL patterns | `*.medium.com` → "reading" |

### Flow

1. User selects content → popup opens
2. Extension extracts domain, title, and analyzes keywords
3. Suggested tags shown in popup (clickable to add)
4. User can add custom tags via input
5. Final tag set sent to server

### Default Domain Rules

```javascript
const domainRules = {
  'github.com': ['dev', 'code'],
  'medium.com': ['reading', 'article'],
  'stackoverflow.com': ['dev', 'qa'],
  'youtube.com': ['video'],
  'twitter.com': ['social'],
  'x.com': ['social'],
  // User can add custom rules
};
```

---

## Error Handling

### Extension Error Cases

| Scenario | Handling |
|----------|----------|
| API unreachable | Show error toast, save to local pending queue |
| Invalid API key | Show error message, prompt settings check |
| Network timeout | Retry 3 times with exponential backoff, then show error |
| Image too large (>5MB) | Compress if possible, warn and skip if not |
| Selection empty | Disable context menu item |
| API rate limited | Show "Rate limited, try again later" |

### Local Pending Queue

```javascript
// Stored in chrome.storage.local
{
  pendingQueue: [
    {
      id: "uuid",
      title: "...",
      url: "...",
      content: "...",
      images: ["base64..."], // Images encoded for storage
      tags: [...],
      timestamp: "2024-04-16T14:30:00Z",
      retryCount: 0
    }
  ]
}
```

- Auto-retry on extension reload or network restore
- Max 10 pending items (FIFO eviction)
- Manual retry from options page

### Server Error Responses

| Status | Message |
|--------|---------|
| 400 | `{ "error": "Missing required field: content" }` |
| 401 | `{ "error": "Invalid API key" }` |
| 413 | `{ "error": "Image too large (max 10MB)" }` |
| 500 | `{ "error": "Internal server error" }` |

---

## Testing Strategy

### Extension Testing

| Test Type | Coverage |
|-----------|----------|
| Unit tests | Tag generation logic, content extraction, history management |
| Integration tests | API communication, multipart upload, error handling |
| E2E tests | Full flow: select → right-click → add tags → save |

**Tools:** Jest + Puppeteer/Playwright

### Server Testing

| Test Type | Coverage |
|-----------|----------|
| Unit tests | File operations, tag parsing, API key validation |
| Integration tests | API endpoints, multipart handling, image storage |
| Docker tests | Volume mapping, environment config |

**Tools:** Jest + Supertest

### Manual Test Checklist

- [ ] Fresh install → configure API → save content
- [ ] Select text with images → verify image upload
- [ ] Offline mode → verify pending queue → online retry
- [ ] Invalid API key → verify error message
- [ ] Docker deployment → verify volume mapping
- [ ] Multiple API keys → verify separate folders
- [ ] Large files → verify size limits

---

## Technical Constraints

### Extension

- Manifest V3 compliance
- No external code execution
- Minimal permissions (contextMenus, storage, activeTab, host permissions for API)

### Server

- Node.js 18+
- Express.js framework
- Multer for multipart handling
- Environment-based configuration
- No database required (filesystem-based storage)

### Limits

| Resource | Limit |
|----------|-------|
| Single image max size | 10MB |
| Total request size | 50MB |
| Pending queue size | 10 items |
| History items stored | 100 items |
| Tag length | 50 characters |
| Tags per save | 10 tags |