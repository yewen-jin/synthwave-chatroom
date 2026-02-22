# Synthwave Chatroom - My Body Is Obsolete

An interactive narrative chatroom with synthwave aesthetics. Players join a retro MSN-style chat interface where a narrator (Liz) delivers a branching story in real time through Socket.IO. Stories are authored in Twine/Twee (Harlowe format) and converted to a custom JSON dialogue format for playback.

## Key features
- Two-room architecture: narrator triggers the story, player interacts with choices
- Branching dialogue with conditional logic, variables, and multiple speakers
- Twine/Twee (Harlowe) to JSON converter for story authoring
- Real-time message delivery with Socket.IO
- p5.js synthwave visuals with controllable glitch effects
- Classic MSN Messenger-style UI with draggable windows

## Tech stack
- **Frontend:** Vite, vanilla JS (ES modules), p5.js
- **Backend:** Node.js (>=18), Express 5, Socket.IO
- **Build:** Vite with Terser minification and vendor chunk splitting
- **Testing:** Jest
- **Deployment:** Render (recommended)

## Project layout
```
src/                          # Source (Vite root)
  index.html                  # Main chatroom entry
  player-room.html            # Interactive story player
  narrator-room.html          # Story narrator control
  control.html                # Visual effects control panel
  docs.html                   # Navigation hub
  room1.html, room2.html      # General / host chatrooms
  style.css
  assets/                     # Fonts, images, cursors
  js/
    main.js                   # App bootstrap, message routing
    socket.js                 # Socket.IO client wrapper
    dialogueSystem.js         # Dialogue state engine (conditions, variables)
    dialogueController.js     # Dialogue flow & socket event handling
    chatUI.js                 # Chat input, message display, scrolling
    dialogueUI.js             # Dialogue popup rendering
    visuals.js                # p5.js synthwave background & glitch effects
    chatDrag.js               # Window drag & maximize
    roomDetection.js          # Room-aware logic flags
public/
  data/dialogues/             # Generated dialogue JSON files
shared/
  gameParameters.js           # Shared constants (usernames, delays)
scripts/
  twee-to-json.js             # Twine/Harlowe to JSON converter
server.js                     # Express + Socket.IO server
vite.config.js                # Multi-page Vite build config
```

## Quickstart

1. Install dependencies:
   ```
   npm install
   ```

2. Development (two terminals):
   ```
   npm run vite:dev     # Frontend on http://localhost:5173
   npm run dev          # Backend on http://localhost:3000
   ```
   Vite proxies `/socket.io` to the backend automatically.

3. Production build:
   ```
   npm run build
   npm start            # Serves from dist/ on http://localhost:3000
   ```

## How the dialogue system works

1. **Author** a story in Twine (Harlowe format) and export as `.twee`
2. **Convert** with `node scripts/twee-to-json.js` (see `scripts/README.md` for details)
3. **Place** the output JSON in `public/data/dialogues/`
4. **Play**: narrator opens `narrator-room.html` and clicks "Initiate Transmission"; player opens `player-room.html` to receive the story and make choices

Messages types in the dialogue: `narrator` (Liz's lines), `system` (stage directions), `image` (inline images), `speaker` (third-party characters), and `pause` (timed delays).

## Converting Twee stories

```
node scripts/twee-to-json.js <input.twee> [output.json]
```

Supported Harlowe macros: `(set:)`, `(if:)`, `(else-if:)`, `(else:)`, `(link:)`, `(print:)`, `(nth:)`. See `scripts/README.md` for the full authoring guide.

## Deployment (Render)

Configure the web service with:
- **Build command:** `npm install && npm run build`
- **Start command:** `node server.js`
- **Environment:** `NODE_ENV=production`
- Set `CUSTOM_DOMAIN` env var if using a custom domain (for CORS).

## Helpful commands
| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run vite:dev` | Start Vite dev server (port 5173) |
| `npm run dev` | Start backend with nodemon (port 3000) |
| `npm run build` | Production build to dist/ |
| `npm start` | Start production server |
| `npm run preview` | Preview built site via Vite |
