# Agent Instructions for Synthwave Chatroom

_The B0dy_is_0bs0let3_ — a live narrative chatroom performance. A performer triggers a branching story; the server delivers it to an audience over Socket.IO with timed delays. It runs in front of an audience, so a broken `main` is a broken show.

## Developer Workflow

- **Dev servers**: this project needs _two_ concurrent processes. `npm run vite:dev` for the frontend (Vite, port 5173) and `npm run dev` for the backend (Node/Express, port 3000).
- **ES Modules**: ESM project (`"type": "module"`). **Always use explicit `.js` extensions** on local imports, both sides (e.g. `import { initSocket } from "./socket.js";`).
- **Production**: `npm run build` (builds `src` → `dist`), then `npm start` (the script sets `NODE_ENV=production` itself — you don't need to prefix it).

## Architecture & Code Boundaries

- **Backend (`server.js`)**: owns dialogue state over Socket.IO. The server sends each node's messages on timed delays; the narrator does **not** type scripted lines.
- **Frontend (`src/`)**: multi-page HTML app built with Vite, no JS framework.
  - `src/js/roomDetection.js` identifies the active room (Player, Narrator, Control).
  - P5.js drives background and glitch visuals (`src/js/visuals.js`).
- **Shared**: `shared/gameParameters.js` holds constants used by both client and server.

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
- Changing a large dependency (p5): check `vite.config.js` (`optimizeDeps`, `manualChunks`).

## What NOT to do

- **Do not resurrect `src/data/dialogues/`** — the server reads `public/data/dialogues/`; writing there does nothing.
- **Do not hand-edit generated dialogue JSON** — the next regeneration discards it.
- **Do not treat `node __test__/*.test.js` as a passing gate** — the files are empty; it proves nothing.
- **Do not add a frontend framework or heavy dependency** — plain HTML/JS + Vite is deliberate, so the client can hand this to any web developer.
