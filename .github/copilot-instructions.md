# Copilot Instructions - Void Space Chatroom

## Build, Test, and Lint Commands

### Development
```bash
# Start both frontend and backend (requires 2 terminals)
npm run vite:dev    # Frontend dev server on port 5173
npm run dev         # Backend Express/Socket.IO server on port 3000
```

### Production Build
```bash
npm run build       # Vite builds src/ → dist/
npm start           # Runs production server on port 3000
```

### Testing
```bash
# Tests are located in __test__/
# Run specific test files:
node __test__/server.test.js
node __test__/dialoguecontroller.test.js
node __test__/main.test.js
```

### Clean Build
```bash
# Windows CMD
rd /s /q dist

# PowerShell
Remove-Item -Path dist -Recurse -Force

# Git Bash/Linux
rm -rf dist
```

## Architecture Overview

### Two-Room Dialogue System
This project implements a **server-driven dialogue system** with two synchronized rooms:

- **Player Room** (`/player-room`): Players receive messages and make choices
- **Narrator Room** (`/narrator-room`): Narrator initiates dialogues and monitors progress
- **Server** (`server.js`): Orchestrates all flow, auto-sends messages, manages state

**Key principle**: Dialogue state lives on the server. The server automatically sends narrator messages when nodes are processed—the narrator doesn't manually type them.

### Client-Server Split
- **Frontend** (Vite dev server): `src/` directory with multi-page HTML setup
  - Entry points: `index.html`, `control.html`, `room1.html`, `room2.html`, `player-room.html`, `narrator-room.html`
  - Build output: `dist/` directory (gitignored)
- **Backend** (Express + Socket.IO): `server.js`
  - Serves static files from `dist/` in production
  - Handles real-time communication
  - Manages dialogue state per room via `dialogueStates` Map

### Shared Code
- **`shared/gameParameters.js`**: Constants used by both client and server (ES module exports)
  - `NARRATOR_USERNAME`, `HOST_USERNAME`, `MESSAGE_DELAY_MS`, etc.
  - Import this file when you need these constants

### Module System
- Project uses ES modules (`"type": "module"` in package.json)
- Use `import`/`export`, not `require()`
- Server uses `fileURLToPath` and `path.dirname` to get `__dirname` in ES modules

## Dialogue System

### Message Sequence Format (New/Recommended)
Dialogue nodes use `messageSequence` arrays for complete control over message order and types:

```json
{
  "messageSequence": [
    { "type": "system", "content": "The lights flicker..." },
    { "type": "narrator", "content": "I've been waiting." },
    { "type": "image", "url": "https://...", "alt": "Description" },
    { "type": "pause", "duration": 2000 }
  ],
  "choices": [...]
}
```

**Message types:**
- `system`: Stage directions, other characters, context
- `narrator`: Messages from Liz (NARRATOR_USERNAME)
- `image`: Inline images in chat
- `pause`: Extra delay between messages

**Server behavior** (see `server.js` around line 289-350):
1. Server receives player choice
2. Processes effects and conditions
3. Auto-sends each message in sequence with delays
4. After last message, shows choices or auto-advances to `nextNode`

### Legacy Format (Backward Compatible)
Older nodes use separate fields:
- `text`: System text
- `narratorMessages`: Array of narrator messages (auto-sent by server)
- `choices`: Player choices

### Twee to JSON Converter
- Located in `scripts/twee-to-json.js`
- Converts Twine stories to messageSequence format
- See `scripts/README.md` for detailed usage
- **Syntax conventions:**
  - `Liz:` or `Liz says:` → narrator message (prefix stripped)
  - `You:` or `You say:` → used in choices, not messageSequence
  - Everything else → system message
  - `![alt](url)` or `[img:url]` → image
  - `[pause:2000]` → delay
  - `[[Choice{var:value}->Node]]` → choice with effect
  - `[[Choice[if var:value]->Node]]` → conditional choice

### Dialogue Files
- Source: `src/data/dialogues/*.json`
- Copied to `dist/data/dialogues/` during build (via vite-plugin-static-copy)
- Server loads from `dist/data/dialogues/` in production

## Socket.IO Events

### Client Connection
Client initializes socket with environment detection:
```javascript
// In src/js/socket.js
const socket = io(
  window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : window.location.origin,
  { withCredentials: true, transports: ['websocket', 'polling'] }
);
```

### Key Events
- `chat`: Chat message broadcast
- `user joined` / `user left`: User presence
- `dialogue-start`: Narrator initiates dialogue
- `dialogue-message`: Server sends messageSequence item
- `dialogue-choices`: Server presents choices to player
- `dialogue-choice`: Player makes choice
- `dialogue-end`: Dialogue concludes
- `narrator-status`: Narrator online/offline status
- `theme-change`: UI theme updates
- `glitch-control`: Visual effects control

## Visual System

### p5.js Integration
- Visuals defined in `src/js/visuals.js`
- p5 sketch creates synthwave/glitch effects
- Gradient rectangles use `translate(x, y, z)` for position
- Adjust in `visuals.js` to change size/position

### Theme System
- CSS palette classes: `palette-purple`, `palette-blue`, `palette-green`
- Control panel (`/control`) broadcasts theme changes via Socket.IO
- Clients listen for `theme-change` event and update `document.body.classList`

### Draggable Chat
- Implemented in `src/js/chatDrag.js`
- Makes chat window draggable for MSN-style feel

## Key Conventions

### File Naming and Paths
- HTML entry points are in `src/` root (not nested in subdirectories)
- Assets use absolute paths: `/assets/fonts/Windows-Regular.ttf`
- Static files go in `public/` → copied to `dist/` during build
- Data files in `src/data/` → copied to `dist/data/` via vite-plugin-static-copy

### Room Detection
- `src/js/roomDetection.js` detects which page/room the client is on
- Used to determine whether to initialize player UI vs narrator UI vs control UI

### Active Users Tracking
- Server maintains `activeUsers` Map (socketId → username)
- `takenUsernames` Set prevents duplicates
- Narrator username (from `NARRATOR_USERNAME`) gets special handling

### CORS Configuration
- Development: `localhost:5173` and `localhost:3000`
- Production: Render deployment URL in `server.js` CORS config
- If deploying to custom domain, update CORS origin or use `process.env.CUSTOM_DOMAIN`

### ES Module Imports
- Always use explicit file extensions: `import './chatUI.js'` (not `'./chatUI'`)
- Vite handles this during build, but explicit extensions prevent issues

### Vite Multi-Page Setup
```javascript
// vite.config.js rollupOptions.input
input: {
  main: path.resolve(__dirname, 'src/index.html'),
  control: path.resolve(__dirname, 'src/control.html'),
  room1: path.resolve(__dirname, 'src/room1.html'),
  room2: path.resolve(__dirname, 'src/room2.html'),
  'player-room': path.resolve(__dirname, 'src/player-room.html'),
  'narrator-room': path.resolve(__dirname, 'src/narrator-room.html')
}
```

### Code Splitting
- Vite config splits vendor code into chunks for caching
- `vendor-p5`: p5.js library
- `vendor-socket`: Socket.IO client
- `vendor`: Other node_modules

### Production Deployment
- Target: Render.com
- Build command: `npm install && npm run build`
- Start command: `node server.js`
- Must set `NODE_ENV=production`
- Optional: Use `render.yaml` for configuration

### State Cleanup
- Server cleans up inactive dialogue states after 5 minutes (`STATE_CLEANUP_MS`)
- Prevents memory leaks from abandoned sessions

## Context Documentation
The `__context__/` directory contains project-specific documentation:
- `MESSAGE_SEQUENCE_SYSTEM.md`: Details on new dialogue format
- `interaction.md`: Comprehensive dialogue system architecture
- `to-do.md`: Feature backlog
- `future-implementations.md`: Planned enhancements

Refer to these files when working on dialogue features or understanding architectural decisions.
