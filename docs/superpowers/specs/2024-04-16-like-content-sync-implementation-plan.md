# Like Content Sync - Implementation Plan

**Date:** 2024-04-16
**Status:** Planning

---

## Phase 1: Project Setup & Server Foundation

### 1.1 Project Structure Setup
- [ ] Create root project structure as defined in design spec
- [ ] Initialize git repository with `.gitignore` (node_modules, data, .env)
- [ ] Create base `README.md` with project overview

### 1.2 Server Setup
- [ ] Initialize Node.js project in `server/` with `package.json`
- [ ] Install core dependencies: express, multer, dotenv, cors
- [ ] Install dev dependencies: jest, supertest, nodemon
- [ ] Create `server/src/index.js` with Express server skeleton
- [ ] Configure environment variables loading
- [ ] Create basic health check endpoint `GET /api/health`

### 1.3 Docker Configuration
- [ ] Create `server/Dockerfile` (Node.js 18+ base image)
- [ ] Create `server/docker-compose.yml` with volume mapping
- [ ] Add `.dockerignore` file
- [ ] Test basic container build and run

---

## Phase 2: Server API Implementation

### 2.1 Authentication Middleware
- [ ] Create `server/src/middleware/auth.js`
- [ ] Implement API key validation from `X-API-Key` header
- [ ] Return 401 for invalid/missing API keys
- [ ] Add tests for auth middleware

### 2.2 Storage Module
- [ ] Create `server/src/storage/index.js`
- [ ] Implement user folder creation (hashed/obfuscated API key)
- [ ] Implement daily markdown file management
- [ ] Implement content appending with proper formatting
- [ ] Implement image storage in `images/` subfolder
- [ ] Generate unique filenames for images (uuid-based)
- [ ] Add tests for storage module

### 2.3 Content API Endpoint
- [ ] Create `server/src/routes/content.js`
- [ ] Implement `POST /api/content` endpoint
- [ ] Configure multer for multipart/form-data parsing
- [ ] Validate required fields (title, url, content, timestamp)
- [ ] Implement size limits (single image: 10MB, total: 50MB)
- [ ] Integrate storage module for file writing
- [ ] Return proper response with image URLs
- [ ] Add error handling for all error cases (400, 401, 413, 500)
- [ ] Add integration tests with supertest

### 2.4 Server Finalization
- [ ] Add request logging middleware
- [ ] Add error handling middleware
- [ ] Configure CORS for extension access
- [ ] Add API documentation (README section)

---

## Phase 3: Chrome Extension Foundation

### 3.1 Extension Manifest & Structure
- [ ] Create `extension/manifest.json` (MV3)
- [ ] Define permissions: contextMenus, storage, activeTab
- [ ] Configure host permissions for API server
- [ ] Create basic icon set (16, 48, 128px)
- [ ] Register background service worker
- [ ] Register content script

### 3.2 Content Script
- [ ] Create `extension/content.js`
- [ ] Implement selection extraction (text + formatting)
- [ ] Implement image extraction from selection
- [ ] Extract page metadata (title, URL)
- [ ] Convert selection to markdown format
- [ ] Handle message communication with background script
- [ ] Add edge case handling (empty selection, iframes)

### 3.3 Background Service Worker
- [ ] Create `extension/background.js`
- [ ] Implement context menu creation on install
- [ ] Handle context menu click events
- [ ] Implement message handling from content script
- [ ] Set up communication with popup
- [ ] Implement API key management in chrome.storage

---

## Phase 4: Extension UI Components

### 4.1 Popup Interface
- [ ] Create `extension/popup.html` with layout structure
- [ ] Create `extension/styles/popup.css`
- [ ] Implement content preview display (truncate to 200 chars)
- [ ] Create image thumbnail preview
- [ ] Add loading/error states UI

### 4.2 Popup Logic
- [ ] Create `extension/popup.js`
- [ ] Receive selection data from background
- [ ] Implement tag input functionality
- [ ] Implement tag removal on click
- [ ] Implement custom tag input (+ button)
- [ ] Handle Enter key for tag submission
- [ ] Implement save button handler
- [ ] Handle cancel action
- [ ] Implement form submission to background

### 4.3 Options Page
- [ ] Create `extension/options.html`
- [ ] Create `extension/styles/options.css`
- [ ] Create `extension/options.js`
- [ ] Implement API endpoint URL configuration
- [ ] Implement API key configuration (with show/hide toggle)
- [ ] Implement tag history display
- [ ] Add clear history functionality
- [ ] Add clear pending queue functionality
- [ ] Display recent saves list
- [ ] Implement settings persistence

### 4.4 Tag Generation System
- [ ] Create `extension/utils/tags.js`
- [ ] Implement domain mapping rules
- [ ] Implement title keyword extraction
- [ ] Implement user history analysis (frequent tags)
- [ ] Implement custom URL pattern rules storage
- [ ] Combine sources for suggested tags
- [ ] Add unit tests for tag generation

---

## Phase 5: Error Handling & Offline Support

### 5.1 Pending Queue System
- [ ] Design queue data structure
- [ ] Implement queue storage in chrome.storage.local
- [ ] Implement FIFO eviction (max 10 items)
- [ ] Add items to queue on API failure
- [ ] Store images as base64 in queue

### 5.2 Retry Mechanism
- [ ] Implement exponential backoff retry (3 attempts)
- [ ] Implement auto-retry on extension reload
- [ ] Implement retry on network restore detection
- [ ] Add manual retry from options page
- [ ] Update retry count in queue items

### 5.3 Error Handling
- [ ] Handle network timeout gracefully
- [ ] Show user-friendly error toasts
- [ ] Handle image size limits (compress or skip)
- [ ] Handle API rate limiting (show message)
- [ ] Handle invalid API key (prompt settings)
- [ ] Disable context menu when selection is empty

---

## Phase 6: Integration & Polish

### 6.1 API Integration
- [ ] Implement multipart/form-data upload in background.js
- [ ] Handle image file conversion (base64 to File)
- [ ] Implement proper error response handling
- [ ] Add request timeout handling
- [ ] Test with running server

### 6.2 Local History
- [ ] Design history data structure
- [ ] Implement save to history after successful API call
- [ ] Implement history display in options page
- [ ] Implement history search/filter
- [ ] Limit history to 100 items

### 6.3 Final Polish
- [ ] Add loading indicators throughout UI
- [ ] Add success/error notifications
- [ ] Implement keyboard shortcuts
- [ ] Add extension internationalization setup
- [ ] Polish UI animations and transitions
- [ ] Add proper focus management

---

## Phase 7: Testing

### 7.1 Extension Unit Tests
- [ ] Set up Jest for extension testing
- [ ] Write tests for tag generation logic
- [ ] Write tests for content extraction
- [ ] Write tests for history management
- [ ] Write tests for queue management

### 7.2 Extension E2E Tests
- [ ] Set up Puppeteer for E2E testing
- [ ] Write test: fresh install → configure → save
- [ ] Write test: select text with images → verify upload
- [ ] Write test: offline mode → pending queue → retry
- [ ] Write test: invalid API key → error handling

### 7.3 Server Unit Tests
- [ ] Write tests for storage module
- [ ] Write tests for auth middleware
- [ ] Write tests for content validation

### 7.4 Server Integration Tests
- [ ] Write tests for POST /api/content
- [ ] Write tests for error responses
- [ ] Write tests for multi-image upload
- [ ] Write tests for concurrent requests

### 7.5 Manual Testing Checklist
- [ ] Fresh install → configure API → save content
- [ ] Select text with images → verify image upload
- [ ] Offline mode → verify pending queue → online retry
- [ ] Invalid API key → verify error message
- [ ] Docker deployment → verify volume mapping
- [ ] Multiple API keys → verify separate folders
- [ ] Large files → verify size limits

---

## Phase 8: Documentation & Deployment

### 8.1 Documentation
- [ ] Complete README with setup instructions
- [ ] Document API endpoints with examples
- [ ] Document extension installation steps
- [ ] Document Docker deployment steps
- [ ] Add troubleshooting section
- [ ] Document configuration options

### 8.2 Deployment Preparation
- [ ] Create production Docker compose file
- [ ] Add environment variable documentation
- [ ] Create sample `.env.example` file
- [ ] Prepare Chrome Web Store listing assets
- [ ] Write privacy policy (if needed)

---

## Estimated Effort

| Phase | Estimated Complexity |
|-------|---------------------|
| Phase 1: Setup | Low |
| Phase 2: Server API | Medium |
| Phase 3: Extension Foundation | Medium |
| Phase 4: Extension UI | Medium |
| Phase 5: Error Handling | High |
| Phase 6: Integration | Medium |
| Phase 7: Testing | Medium |
| Phase 8: Documentation | Low |

**Recommended Order:** Sequential from Phase 1 to 8, with Phase 2 and 3 being parallelizable.

---

## Dependencies

### Extension
- Chrome Manifest V3 APIs
- chrome.contextMenus
- chrome.storage
- chrome.runtime

### Server
- Node.js 18+
- Express.js
- Multer (multipart handling)
- dotenv (environment config)
- Jest + Supertest (testing)

### Dev Tools
- Docker
- Chrome DevTools
- Postman (API testing)