# Agent Instructions for Synthwave Chatroom

Two experiences on one server, both live in front of an audience — so a broken `main` is a broken show:

1. **_The B0dy_is_0bs0let3_** — a narrative performance. A performer triggers a branching story; the server delivers it to the audience over Socket.IO with timed delays. Runs on the **default** Socket.IO namespace.
2. **_thisverisionofme_thisverisionofyou_** — a two-player card-game room. A physical card game is played at a table; the room gives each pair a private synchronised chat and a shared music track, with QR-code onboarding. Runs on an **isolated `/rooms` namespace**. See [Card-Game Rooms](#card-game-rooms-rooms-namespace).

The new title applies **only** to `/room` — the narrative game and the other pages keep _The B0dy_is_0bs0let3_.

## Developer Workflow

- **Dev servers**: this project needs _two_ concurrent processes. `npm run vite:dev` for the frontend (Vite, port 5173) and `npm run dev` for the backend (Node/Express, port 3000).
- **ES Modules**: ESM project (`"type": "module"`). **Always use explicit `.js` extensions** on local imports, both sides (e.g. `import { initSocket } from "./socket.js";`).
- **Production**: `npm run build` (builds `src` → `dist`), then `npm start` (the script sets `NODE_ENV=production` itself — you don't need to prefix it).
- **Toolchain versions**: whenever a version must be pinned — CI `node-version`, `engines`, setup docs — use the **newest LTS** of Node (and the newest stable of any other tool), never an older release.
- **Deploy (VPS)**: push to `main` and CI does the rest. `.github/workflows/build.yml` runs `npm test` (dialogue-drift gate), `npm run build`, then force-pushes `dist/` to the `build` branch as one commit on top of the main commit it came from (old snapshots are GC'd; `git add -f dist` is what gets dist past `.gitignore`). The VPS hasn't the RAM to build, so it only tracks the artifact: run `scripts/update-vps.sh` there — it does `git fetch` + `git reset --hard origin/build` (**never `git pull`**, the branch is rewritten every deploy), then reinstalls deps only when `package.json`/`package-lock.json` changed and restarts the node process only when `server.js`/`shared/` changed (set `RESTART_CMD`, e.g. `RESTART_CMD="pm2 restart chatroom"`). `dist`-only changes are live on next page load.
- **Card-game audio**: `/room` needs a track in `audio-assets/` (gitignored). Run `npm run make:audio` for a 20s placeholder, or `TRACK_SECONDS=900 npm run make:audio` for a 15-min stand-in that actually shows the timeline markers. No track = the "begin conversation" button is disabled and the server no-ops play requests, silently. **On the VPS the track must be seeded by hand** — gitignored means CI never carries it: `VPS_HOST=user@host ./scripts/push-audio.sh` (rsync, no `--delete`). It survives every deploy (`git reset --hard` leaves ignored files alone), and no restart is needed after adding it (`currentTrack()` reads the dir fresh).
- **Vite dev proxy**: `vite.config.js` proxies `/socket.io`, `/audio`, and `/qr.svg` to the backend. **Any new backend route needs a proxy entry here** or it works under `npm start` (one origin) and 404s under `npm run vite:dev` (two origins). This has already bitten twice — the "Loading track…" and broken-QR bugs were both a missing proxy entry.

## Architecture & Code Boundaries

- **Backend (`server.js`)**: owns state for **both** systems. The narrative game runs on the **default** namespace (sends each node's messages on timed delays; the narrator does **not** type scripted lines). The card game runs on `io.of("/rooms")`. A namespace is fully isolated from default-namespace `io.emit` broadcasts, so the card game was added **without changing any existing narrative-game handler** — keep it that way.
- **Frontend (`src/`)**: multi-page HTML app built with Vite, no JS framework.
  - `src/js/roomDetection.js` identifies the active room (Player, Narrator, Control).
  - `src/js/roomMain.js` is the card-game room client (`/room`), talking to `/rooms`.
  - P5.js drives background and glitch visuals (`src/js/visuals.js`).
- **Shared**: `shared/gameParameters.js` holds constants used by both client and server — narrator name, `ROOM_CAPACITY`, `TRACK_MARKERS_SEC`, delays.

## Card-Game Rooms (`/rooms` namespace)

`/room` is _thisverisionofme_thisverisionofyou_. The card game is **physical**; the room is only chat + music for a pair. Client is `src/js/roomMain.js`; server handlers live under `roomsNsp.on("connection", …)` in `server.js`.

**Pairing — rooms are minted per pair, ids never reused:**

- The printed poster QR points at `/room` with **no room in the URL**. On arrival with no `#hash`, the client emits `create room`; the server mints a fresh id (`newRoomName()`, alphabet excludes `i/l/o/0/1` because the id is also shown as text) and returns it in the hash.
- Player A's screen then shows a QR (server-rendered at `/qr.svg?d=…`) encoding `<origin>/room#<id>`. **B scans A's phone**, not the poster. A third scanner is refused (`ROOM_CAPACITY = 2`).
- The join URL is built from `window.location.origin`, so the QR reflects whatever public URL A actually loaded — no server-side host config. The id lives in the URL **fragment**: browser history carries it (free return) and it never reaches a server access log.

**"begin conversation" (R7):** the chat is gated shut until a player presses it — one press opens the chat **and** starts the music, for both. Server-latched (`state.begun`), so pausing the music doesn't re-close the chat and a reload rejoins an open chat. Before begin, `/room` shows the pairing QR (alone) or "The conversation has not begun."

**Sessions persist — `data/room-sessions.json` (gitignored, runtime):**

- Written on state change (debounced, write-then-rename, flushed on SIGINT/SIGTERM); restored on boot. Lets a pair reopen their `#id` after a drop or a **server restart** and find the game where they left it. Abandoned rooms age out after 24h.
- **Two rules — do not break them.** (1) **Presence is never persisted.** `usernames` is bound to live sockets; restoring it would reject a returning player as "name taken" by their own ghost. (2) **The file always holds a paused snapshot.** A persisted `playing:true`/`startedAt` becomes a lie on restart — elapsed would be measured against a pre-outage timestamp and the track would leap forward by the downtime. Playing rooms are written paused at their elapsed-so-far, restored paused.
- **Reset actually deletes server state** (`room-reset` → `roomStates.delete`). Since sessions persist, a bare client reload would otherwise drop both players back into the same session. The refresh button is the reset mechanism.

**Conversation replay — in memory only:**

- Each room keeps its messages and replays them on join/rejoin (`chat-history`), so a dropped player sees everything said while away. Client clears-and-rebuilds on receipt (the `connect` handler re-emits `user joined` every reconnect, so replay must be idempotent).
- Held **in memory only** — same lifetime as the relay, **not** written to `data/`. Persisting transcripts to disk is a values decision on an intimate piece, not a default. Message text is escaped on render (`textContent`, not `innerHTML`) since it is now stored and replayed.

**Reconnect:** the rejoin handler is on `"connect"`, **not** `"reconnect"` — socket.io v4 has no `reconnect` event on the Socket (it's on the Manager). A `connect` handler covers first connect (a no-op, no username yet) and every reconnection.

**Audio & timeline:** one track, auto-selected from `audio-assets/` (read live, never cached at boot). Playback follows the **room clock** (`startedAt`/`pausedElapsed`), not any device's `audio.currentTime`, so both players share one timeline and an autoplay-blocked device still tracks the game. `TRACK_MARKERS_SEC` drives the timeline dots (absolute seconds; markers past the track end aren't drawn). iOS autoplay is handled by playing synchronously in the click gesture, with a "tap to enable sound" fallback for the non-pressing device. **Display name** is remembered per room in `localStorage` (`tvom:<id>:username`), prefilled not auto-submitted.

**Username `localStorage` (`main.js:122`)** in the legacy chat stores a global unscoped `username` key — unrelated to the per-room keys above.

## Dialogue Data (Twine → JSON)

Dialogue is authored in Twine (Harlowe), exported as `.twee`, and compiled to JSON. Nodes compile into `messageSequence` arrays dictating narrator text, system actions, pauses, and images in a strictly ordered sequence.

**The live pipeline — verified 15 Jul 2026:**

```
src/data/twine/thebodyisobsolete.twee  →  public/data/dialogues/thebodyisobsolete.json
                (you edit this)                    (the show runs on this)
```

```bash
npm run build:dialogue    # regenerate the shipped dialogue from the twee
npm run check:dialogue    # (= npm test) verify they're in sync; never writes
```

- `server.js` → `loadDialogueData()` (~line 87) reads **only** from `public/data/dialogues/`. That file is what the show runs on. Nothing reads `src/data/`.
- **Never hand-edit the generated JSON.** Edit the `.twee` and run `npm run build:dialogue`. Hand-edits are discarded by the next regeneration — and this has already happened once in this repo's history.
- The frontend never fetches dialogue JSON — the server pushes each message over Socket.IO. So a dialogue change needs no frontend rebuild.
- **A regenerated JSON takes effect on the next transmission trigger — no server restart needed.** `loadDialogueData()` has a single call site, inside `startDialogue()` (~line 129), which runs each time the narrator initiates; there is no boot-time preload or cache. An already-running transmission keeps the copy it started with, so regenerating mid-show won't disturb the transmission in flight — it lands on the next one.
- Sync is **not** automatic, by choice: regenerating the shipped dialogue is a deliberate act so a pre-show edit can't silently rewrite the live script. `npm test` tells you when the two have drifted.

**History (15 Jul 2026 reorg):** the live source used to be `scripts/thebodyisobsoleteFV.twee`, while these docs pointed at a stale Dec-2025 draft in `src/data/twine/` and an output directory (`src/data/dialogues/`) that the server never read. The FV twee is now the canonical file at `src/data/twine/thebodyisobsolete.twee`; the dead draft and dead output are deleted. If you find an old instruction naming `scripts/…FV.twee` or `src/data/dialogues/`, it predates this. Pre-reorg state is recoverable at the git tag `pre-dialogue-reorg-2026-07-15`.

⚠️ `src/data/twine/thebodyisobsolete.html` is the **Dec 2025 Twine archive** and is now older than the `.twee` beside it. Opening it in Twine gets you the draft, not the current script. Re-export it from Twine or delete it before trusting it.

## Testing & Setup

- **`npm test` runs the dialogue drift check only** (`scripts/check-dialogue.js`) — it proves the shipped dialogue matches its Twine source. That is all it proves. It is not a test suite.
- **The files in `__test__/` are all 0 bytes.** `node __test__/server.test.js` exits 0 _because the file is empty_ — that is not a passing test and must never be cited as verification. `jest` ^30 is in devDependencies but has no config and nothing invokes it.
- To verify anything else, **run the app**: start both servers, trigger a transmission from `/narrator-room`, and watch `/player-room`.
- **Card game**: run the app and drive `/room` in two browser contexts. Note a same-origin iframe is a useful test harness — media queries evaluate against the iframe viewport, so you can check mobile layouts without a device (`resize_window` does **not** work in every context). But **a real phone is the gate for**: iOS audio autoplay, `dvh` against Safari's collapsing toolbar, timeline ticking + duration from real metadata (Chrome throttles media/timers in background tabs), and a camera reading the QR off another phone's screen. Do not claim these are done from a desktop.
- **Don't patch `Date.now` to fast-forward the room clock** in a test — socket.io reads it for ping timeouts, so a jump of minutes disconnects the client. Drive the `room-status` handler with chosen `pausedElapsed` values instead.
- Changing a large dependency (p5): check `vite.config.js` (`optimizeDeps`, `manualChunks`).

## What NOT to do

- **Do not resurrect `src/data/dialogues/`** — the server reads `public/data/dialogues/`; writing there does nothing.
- **Do not hand-edit generated dialogue JSON** — the next regeneration discards it.
- **Do not treat `node __test__/*.test.js` as a passing gate** — the files are empty; it proves nothing.
- **Do not add a frontend framework or heavy dependency** — plain HTML/JS + Vite is deliberate, so the client can hand this to any web developer. (The `qrcode` dependency is **server-side only** — it renders `/qr.svg`, never ships to the browser — which is how the frontend stays framework-free.)
- **Do not persist room presence (`usernames`) or write a `playing:true` session snapshot** — see the two rules under [Card-Game Rooms](#card-game-rooms-rooms-namespace).
- **Do not write conversation transcripts to `data/`** without it being a deliberate decision — the replay log is in-memory by design.
- **Do not add a card-game backend route without a matching `vite.config.js` proxy entry** — it will 404 only in dev, which is exactly the trap that has bitten twice.
- **Do not commit `audio-assets/` or `data/`** — both are gitignored runtime state.
