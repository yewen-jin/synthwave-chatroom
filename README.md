# Synthwave Chatroom

A retro MSN-style chat interface with synthwave visuals, backing a live festival performance. It hosts **two independent experiences** on one server:

1. **The B0dy_is_0bs0let3** — a narrator (Liz) delivers a branching, Twine-authored story in real time over Socket.IO. The performer triggers it; the audience receives it on timed delays.
2. **thisverisionofme_thisverisionofyou** — a two-player card-game room. A physical card game is played at a table; the room provides each pair a private synchronised chat and a shared music track. Pairs are onboarded by QR code.

The two share the chat UI and visuals but are otherwise isolated (see [Architecture](#architecture)). This repo backs a live show, so a broken `main` is a broken performance — see `AGENTS.md` for the working agreements.

## Key features

**Narrative game (The B0dy_is_0bs0let3)**

- Narrator triggers the story; player receives choices and branches
- Branching dialogue with conditional logic, variables, and multiple speakers
- Twine/Twee (Harlowe) → JSON converter for authoring

**Card-game rooms (thisverisionofme_thisverisionofyou)**

- Isolated `/rooms` Socket.IO namespace — cannot interfere with the live performance
- **Per-pair rooms minted on demand**: the printed poster QR names no room; scanning it mints a brand-new room, and the first player's own phone shows the QR their partner scans (see [Pairing](#pairing-how-two-players-reach-the-same-room))
- **Sessions survive drops and restarts**: a dropped player rejoins to find the game where they left it, and the full conversation replayed
- **"begin conversation"** — one press opens the chat and starts the music together
- **Track timeline** with markers, no numeric countdown
- Mobile-first: usable on real phones, portrait and landscape

**Shared**

- p5.js synthwave visuals with a `/control` panel for glitch effects
- Classic MSN Messenger-style UI with draggable windows

## Tech stack

- **Frontend:** Vite, vanilla JS (ES modules), p5.js — deliberately no framework
- **Backend:** Node.js (>=24, current LTS), Express 5, Socket.IO 4
- **QR:** `qrcode` (server-side SVG rendering — keeps the frontend framework-free)
- **Build:** Vite, multi-page, Terser minification, vendor chunk splitting
- **Testing:** a dialogue drift check (`npm test`) — **not** a unit-test suite; see [Testing](#testing)
- **Deployment:** self-hosted VPS behind an nginx reverse proxy (see [Deployment](#deployment))

## Routing

| Path             | Serves                            | System    |
| ---------------- | --------------------------------- | --------- |
| `/`              | Front page / navigation hub       | —         |
| `/chatroom`      | Generic MSN-style chat            | shared    |
| `/room`          | Card-game room (mints a new room) | card game |
| `/room#<id>`     | Join a specific card-game room    | card game |
| `/player-room`   | Story player                      | narrative |
| `/narrator-room` | Story narrator control            | narrative |
| `/control`       | Visual-effects control panel      | shared    |

## Architecture

- **`server.js`** owns both systems. The narrative game runs on the **default** Socket.IO namespace; the card game runs on an isolated **`/rooms`** namespace (`io.of("/rooms")`). A namespace is fully isolated from default-namespace broadcasts, so the card game was added without touching any of the existing narrative-game event handling.
- **Frontend (`src/`)** is a multi-page Vite app, one entry HTML per route, no JS framework.
- **`shared/gameParameters.js`** holds constants used by both client and server (narrator name, room capacity, timeline markers, delays).

### Card-game room state

Each room lives in an in-memory `Map` keyed by its minted id, holding: the present usernames (live presence), whether the pair has begun, the audio clock (`playing` / `startedAt` / `pausedElapsed`), and the conversation so far.

- **Session persistence** — `begun` and the audio clock are written to `data/room-sessions.json` (gitignored, runtime-only). A pair reopening their `#id` after a drop or a server restart finds the game where they left it. Two rules: **presence is never persisted** (restoring usernames would reject a returning player as "name taken"), and **the file always holds a paused snapshot** (a persisted `startedAt` would leap the track forward by the downtime on restart).
- **Conversation replay** — messages are held **in memory only** (same lifetime as the relay) and replayed to anyone who joins or rejoins, so a returning player sees everything said while they were away. Transcripts are deliberately **not** written to disk.

### Pairing: how two players reach the same room

A printed QR code is static, but a session isn't — so the poster QR names no room:

1. Player A scans the poster → lands on `/room` (no room in the URL) → the server **mints a brand-new room id** and puts it in A's URL fragment.
2. A's screen shows a QR encoding `<origin>/room#<id>` — rendered server-side at `/qr.svg?d=…` — plus the id as text and a "joined the wrong room?" fallback.
3. Player B scans **A's phone** → lands in the same room. A third scanner is refused (`ROOM_CAPACITY = 2`).

Because each session is a room that never existed before, no pair can inherit a previous pair's abandoned room, and a straggler's forgotten tab holds an id nobody will be sent to again. The room id lives in the URL **fragment**, so the browser's own history carries it (returning is free) and it never reaches a server access log.

## Project layout

```
src/                          # Source (Vite root)
  index.html                  # Front page / nav hub
  chatroom.html               # Generic MSN-style chat
  room.html                   # Card-game room (thisverisionofme_thisverisionofyou)
  player-room.html            # Story player (The B0dy_is_0bs0let3)
  narrator-room.html          # Story narrator control
  control.html                # Visual-effects control panel
  room1.html, room2.html      # Legacy chatrooms
  style.css
  assets/                     # Fonts, images, cursors
  data/twine/                 # Canonical Twine source (.twee)
  js/
    main.js                   # Narrative-game bootstrap
    roomMain.js               # Card-game room client (/rooms namespace)
    socket.js                 # Socket.IO client wrapper (namespace-aware)
    dialogueSystem.js         # Dialogue state engine
    dialogueController.js     # Dialogue flow & socket events
    chatUI.js                 # Chat input, message display, scrolling
    dialogueUI.js             # Dialogue popup rendering
    visuals.js                # p5.js synthwave background & glitch
    chatDrag.js               # Window drag & maximize
    roomDetection.js          # Room-aware logic flags
public/
  data/dialogues/             # Generated dialogue JSON (the show runs on this)
shared/
  gameParameters.js           # Shared constants (usernames, ROOM_CAPACITY, TRACK_MARKERS_SEC, delays)
scripts/
  twee-to-json.js             # Twine/Harlowe → JSON converter
  check-dialogue.js           # Dialogue drift check (npm test)
  make-placeholder-audio.js   # Generates a dev audio placeholder
server.js                     # Express + Socket.IO server (both systems)
vite.config.js                # Multi-page Vite build + dev proxy
audio-assets/                 # Card-game audio (gitignored, runtime)
data/                         # Room session persistence (gitignored, runtime)
```

## Quickstart

1. Install dependencies:

   ```
   npm install
   ```

2. Generate a dev audio placeholder (the card-game room needs a track):

   ```
   npm run make:audio                 # 20s tone at audio-assets/track-1.wav
   TRACK_SECONDS=900 npm run make:audio   # 15-min stand-in, to see timeline markers
   ```

3. Development (two terminals):

   ```
   npm run vite:dev     # Frontend on http://localhost:5173
   npm run dev          # Backend on http://localhost:3000
   ```

   Vite proxies `/socket.io`, `/audio`, and `/qr.svg` to the backend. **Anything the backend serves needs a proxy entry here**, or it works in production and 404s in dev.

4. Production build:
   ```
   npm run build
   npm start            # Serves from dist/ on http://localhost:3000 (NODE_ENV=production)
   ```

## How the dialogue system works

1. **Author** a story in Twine (Harlowe) and export `.twee` to `src/data/twine/`
2. **Regenerate** the shipped dialogue: `npm run build:dialogue`
3. **Verify** source and shipped JSON are in sync: `npm test` (= `npm run check:dialogue`)
4. **Play**: narrator opens `/narrator-room` and initiates; player opens `/player-room`

`server.js` reads dialogue only from `public/data/dialogues/`. **Never hand-edit the generated JSON** — edit the `.twee` and regenerate. See `AGENTS.md` for the full pipeline and its traps.

Message types: `narrator` (Liz's lines), `system` (stage directions), `image` (inline images), `speaker` (third-party characters), `pause` (timed delays).

## Testing

`npm test` runs **only** the dialogue drift check (`scripts/check-dialogue.js`) — it proves the shipped dialogue matches its Twine source. That is all it proves; it is not a test suite. The files in `__test__/` are empty placeholders. To verify anything else, **run the app**: start both servers, and drive the flow in the browser. See `AGENTS.md` → Testing.

## Deployment

Self-hosted on a VPS, behind an **nginx reverse proxy** that forwards all paths to the Node server (a single catch-all `location /` — see `__context__/chatroom-web.conf`). Because nginx forwards everything, routes added to `server.js` (`/qr.svg`, `/audio`, …) need no nginx change — unlike the Vite dev proxy.

Deploy steps — the VPS tracks the CI-built `build` branch, it does **not** build (too little RAM). Push to `main` and CI runs `npm test`, `npm run build`, then force-pushes `dist/` to `build`. On the VPS:

```
./scripts/update-vps.sh    # git fetch + git reset --hard origin/build (never git pull —
                           # the branch is rewritten every deploy), installs deps and
                           # restarts the node process only when they actually changed
                           # (set RESTART_CMD, e.g. RESTART_CMD="pm2 restart chatroom")
```

`dist`-only changes are live on the next page load. See `AGENTS.md` → Deploy for the full workflow.

Runtime data lives outside git and is not deployed with the artifact:

- **`audio-assets/`** — the real track is rsynced separately; dev placeholders come from `npm run make:audio`.
- **`data/room-sessions.json`** — created by the server; belongs to whichever machine wrote it.

CORS for cross-origin socket connections is set in `server.js` (production allows the deploy domain; dev reflects the request origin). Same-origin — the normal case — is never CORS-checked.

## Helpful commands

| Command                               | Description                                                      |
| ------------------------------------- | ---------------------------------------------------------------- |
| `npm install` / `npm ci`              | Install dependencies                                             |
| `npm run make:audio`                  | Generate a dev audio placeholder (`TRACK_SECONDS` to set length) |
| `npm run vite:dev`                    | Start Vite dev server (port 5173)                                |
| `npm run dev`                         | Start backend with nodemon (port 3000)                           |
| `npm run build`                       | Production build to `dist/`                                      |
| `npm start`                           | Start production server                                          |
| `npm run build:dialogue`              | Regenerate shipped dialogue JSON from the Twine source           |
| `npm test` / `npm run check:dialogue` | Dialogue drift check (see [Testing](#testing))                   |
| `npm run preview`                     | Preview built site via Vite                                      |
