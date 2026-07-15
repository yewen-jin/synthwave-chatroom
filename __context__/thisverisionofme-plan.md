# thisverisionofme_thisverisionofyou — build plan

Client: Symone · Deadline: 20 July 2026 · Budget: 12.5h / £420
**Written 15 July 2026 — 5 days out.**

## Timeline is the main risk

The deadline is 5 days away. Symone asked for a progress check-in "a few weeks before
finalising" — that window has passed, so the check-in needs to happen **now**, and it doubles as
the conversation where the open questions below get answered.

8–11h in 5 days is doable but tight, and the estimate has an unknown in it: the "additional
visual edits attached" for task 2, which I haven't seen. The blocking questions at the bottom
need answers today.

---

## Architecture: the new system sits _beside_ the old one, not on top of it

The existing TBIO piece stays live and untouched — `player-room`, `narrator-room` and the whole
`dialogueController` / `dialogueSystem` / Twine narrative system keep working exactly as they do.
The card game is a **new, isolated room-based chat** alongside it.

**The thing that makes this safe: a socket.io namespace.**

`server.js` has 17 `io.emit(...)` calls and zero `socket.join()` — every message currently goes to
every connected client. My first instinct was to refactor all 17 into `io.to(room).emit(...)`,
but that means rewriting the broadcast layer of a working performance piece 5 days before it
runs. A namespace avoids that entirely.

Verified this rather than assumed it — `io.of("/rooms")` is fully isolated from default-namespace
broadcasts:

|                          | legacy TBIO client | pair A      | pair B |
| ------------------------ | ------------------ | ----------- | ------ |
| `io.emit(...)` from TBIO | ✅ received        | —           | —      |
| pair A sends a message   | —                  | ✅ received | —      |

So: **none of the 17 `io.emit` calls get touched.** The default namespace keeps its global-broadcast
behaviour for TBIO and the generic chatroom. The card game lives in `/rooms` where clients join
real socket.io rooms and can't hear each other or TBIO.

This drops the _risk_ a lot. It doesn't drop the hours much — it's the same amount of building,
just additive and fenced off instead of pervasive and breaking.

## Routing — rename the source files, don't remap routes

Decision: `src/docs.html` → `src/index.html` (docs becomes the front page) and
`src/index.html` → `src/chatroom.html` (the current main page becomes the generic chat).

| URL                          | Serves                             | Socket                    | Notes                   |
| ---------------------------- | ---------------------------------- | ------------------------- | ----------------------- |
| `/`                          | `index.html` (the former docs)     | —                         | zero server changes     |
| `/chatroom`                  | `chatroom.html` (the former index) | default ns, global        | new route, one-liner    |
| `/room`                      | `room.html` (new)                  | `/rooms` ns               | prompts for a room name |
| `/room/#pairA`               | `room.html` (new)                  | `/rooms` ns, room `pairA` | **the QR target**       |
| `/player-room`               | unchanged                          | default ns                | TBIO, untouched         |
| `/narrator-room`             | unchanged                          | default ns                | TBIO, untouched         |
| `/room1` `/room2` `/control` | unchanged                          | default ns                | untouched               |

**Why rename instead of remap:** `express.static` (server.js:35) runs before every route and
serves `dist/index.html` for `/` — verified: `app.get("/")` at server.js:60 is dead code today.
Remapping routes would mean fighting that with `express.static(..., { index: false })`. Renaming
means the shadowing behaviour _is_ the mechanism: if `dist/index.html` is the docs page, `/`
serves docs with no server change at all. Two free wins: the 404 catch-all (server.js:65-67)
now lands mistyped URLs on docs — the right default for a QR event — and the dead `/docs` +
`app.get("/")` routes can simply be deleted.

**Rename checklist (all four move together):**

- Swap the two files in `src/`
- Update `rollupOptions.input` keys in `vite.config.js` (add `room.html`, rename `docs`/`main`)
- Add `app.get("/chatroom")` → `dist/chatroom.html` (static already serves `/chatroom.html`;
  the route just gives the clean URL, same pattern as server.js:40-58)
- Update the docs page's internal links — it links to `/room1.html`, `/player-room.html` etc.
  and needs new entries for `/chatroom` and `/room`

Checked: `roomDetection.js` matches on `room2` / `player-room` / `narrator-room` — none match
"chatroom", so `main.js` behaves identically on the renamed page. `docs.html` has no JS and one
relative stylesheet; it survives the rename untouched.

**Also verified:** Express 5 matches `/room`, `/room/` and `/room/#pairA` all to `app.get("/room")`.
The browser strips the hash and requests `/room/` with a trailing slash, and it does _not_ fall
through to the 404 catch-all. The QR flow is safe. (Express 5 swapped to path-to-regexp v8, so this
was worth confirming rather than assuming.)

The room name lives in the **hash**, so the server never sees it — that's fine, since capacity and
room membership are enforced on socket join, not by the HTTP route.

---

## Task 1 — Mobile (2–3h)

Audit-and-fix, not from scratch. Breakpoints already exist at 768px, 320px and 600px, and
`.msn-window` is a fixed `width: 1000px` (style.css:189) already overridden to 95% on mobile.

- Drive it on real phone viewports, not just devtools
- Suspects: fixed px widths (146 `px` occurrences), the `.input-section` column-reverse stack,
  `100vh` vs mobile browser chrome (use `100dvh`)
- iOS Safari — `#chatInput` already sets font-size to avoid zoom-on-focus; verify it holds
- Applies to `/room` primarily (that's what players use), then `/chatroom`

## Task 2 — Rebrand (0.5h + unknown)

Text swap: `The B0dy_is_0bs0let3` → `thisverisionofme_thisverisionofyou` in `<title>` and
`.window-title` (lines 7 and 26 of the former index.html — `chatroom.html` after the rename),
plus any "Symone" occurrences. The docs page header also says `The B0dy_is_0bs0let3` — confirm
with Symone whether the front page keeps TBIO branding (it still links to the TBIO rooms) or
takes the new title.

**Blocked:** "additional visual edits attached" — I don't have the attachment. Can't scope until
I see it. Could be 10 minutes, could be hours. This is the main threat to the estimate.

## Task 3 — Room-based chat namespace (3–4h)

Additive. Nothing here can break TBIO.

**Server — new `/rooms` namespace:**

1. `const nsp = io.of("/rooms")`
2. On join: `socket.join(roomName)`, stash `socket.roomName`
3. Broadcast with `nsp.to(roomName).emit(...)`
4. **Own** `Map<roomName, Set<username>>` for taken usernames — do _not_ reach into the global
   `takenUsernames` (server.js:71), or the cross-contamination comes straight back
5. Per-room count via `nsp.adapter.rooms.get(roomName)?.size` — no manual counter
6. Capacity cap at 2; third scanner gets turned away, not silently dropped into someone's game
7. Cleanup on disconnect — when a socket leaves, free its username; when the room empties,
   clear all room state (usernames + selected track) for the next pair

**Refresh button (per room, confirmed by Symone):** a reset control in the room UI. Cheap
implementation: button emits `room-reset` → server broadcasts it to the room → both clients
`location.reload()`. The reloads disconnect the sockets, disconnect cleanup (item 7) frees the
names and track, and both players land back at name entry. No server-side state machine needed.

**Client — new `room.html` + `roomMain.js`:**

- Parameterize `initSocket` (socket.js:7) with a namespace arg — it currently hardcodes the
  default namespace via `window.location.origin`
- Read `location.hash` for the room name; no hash → prompt, then set the hash
- Reuse `chatUI.js` as-is for rendering
- **Register `room.html` in `rollupOptions.input`** (vite.config.js) or it won't build

**Verify early:** `server.js:19-24` restricts socket origins to the old
`void-space-chatroom.onrender.com` URLs when `NODE_ENV=production` — which `npm start` sets on the
VPS. It gates the new namespace handshake too. Same-origin likely sidesteps it, but check before
debugging room isolation on the live domain; a rejected handshake would look like broken room code.

## Task 4 — Audio (2–3h)

1–5 tracks. Storage is a non-issue at that count.

**Flow (confirmed by Symone):** music is selected once at the start of a session. Both players
name themselves → track selection UI appears → a player picks → server broadcasts to the room →
both hear the same track for the whole game. A new selection only happens after a refresh.

- **Selection emits to the `/rooms` namespace**, server broadcasts `audio-play` to that room
  only — so each room has its own music, isolated the same way the chat is. Both clients start
  within ~50ms, imperceptible for ambient music on separate headphones. No clock-sync needed.
- **Preload before enabling the button.** Fetch once both players are named, keep the button
  disabled until buffered. Once local, a wifi drop mid-game can't stall the music. This is what
  makes file size a non-question.
- **Keep audio out of git.** Not a size limit — Symone will re-export, and each round adds
  permanently to repo history. `rsync` to the VPS separately from `git pull`.
- Served by `express.static` alongside everything else.

**Sound designer spec:**

> MP3, 128 kbps CBR, 44.1 kHz, stereo. Every track **exactly the same length** — to the second.
> Normalize to ~-16 LUFS so no track is louder than the others. Timing cues audible at low volume.

"Same length" matters most: the track _is_ the game timer, so 14:52 vs 15:08 means the two pairs
play different-length games.

---

## Hours

| Task                            | Hours        |
| ------------------------------- | ------------ |
| 1. Mobile audit + fix           | 2–3          |
| 2. Rebrand (text only)          | 0.5          |
| 3. `/rooms` namespace + routing | 3–4          |
| 4. Audio + preload              | 2–3          |
| **Total**                       | **7.5–10.5** |

Fits inside 12.5h. The visual edits in task 2 are the unknown that could eat the margin.

## Build sequence

Phases run **sequentially** (1 and 2 both touch `server.js` + `vite.config.js`; 3 builds on 2;
mobile polishes what exists). One agent per phase, main session verifies between phases, one
atomic commit per numbered step. All work on branch `thisverisionofme` — `main` stays showable.

### Phase 0 — prep (main session, no agent)

- [x] 0.1 Commit the pending dialogue-reorg work from this morning's audit (staged twee
      canonicalisation + deletions, plus `package.json` scripts, `scripts/README.md`,
      `scripts/check-dialogue.js`, `AGENTS.md`, `CLAUDE.md`, audit doc) — one commit.
      Commit this plan doc separately.
- [x] 0.2 `git switch -c thisverisionofme`
- [x] 0.3 Baseline: `npm install` (no `node_modules` locally), `npm test` (dialogue drift),
      `npm run build`, boot both servers, confirm TBIO transmission works **before** changes.

**Phase 0 outcome (15 Jul):** 0.1 turned out mostly done already — the dialogue-reorg was
merged as PR #1 (`70b26b5`) and the dirty duplicates in the main checkout had been resolved;
only the plan doc needed committing (`9468b1a` on `main`). 0.2 became `EnterWorktree` per the
new CLAUDE.md workflow — branch `worktree-thisverisionofme` from `9468b1a`. 0.3 all green:
`npm test` in sync, build clean, all 7 routes 200, scripted narrator→player transmission
verified (dialogue-started → opening image message → sync at `main_portal`, 1 choice → manual
end). One trap found and fixed en route: `res.sendFile` 404s under `.claude/` worktrees
(dotfiles default) — fixed in `a047ab5`, documented as worktree trap 6 in CLAUDE.md.

### Phase 1 — routing & renames (agent: mechanical / Sonnet-tier)

- [x] 1.1 `git mv src/index.html src/chatroom.html`, then `git mv src/docs.html src/index.html`
      (that order — the target name is occupied)
- [x] 1.2 `vite.config.js`: point `main` input at the new index (docs), add `chatroom` input
- [x] 1.3 `server.js`: add `app.get("/chatroom")`; delete dead `app.get("/")` (server.js:60) and
      `app.get("/docs")`; keep the 404 catch-all (now correctly lands on docs)
- [x] 1.4 Front page (former docs): add links for `/chatroom` and `/room`
- **Acceptance:** build passes; `/` = docs, `/chatroom` = old chat UI, all 5 legacy routes
  byte-identical behaviour; `npm test` still green.

**Phase 1 outcome (15 Jul):** done in the `thisverisionofme` worktree, one commit. Renames in
the specified order; `vite.config.js` `docs` input dropped, `chatroom` added. Server: `/chatroom`
route added, dead `/` and `/docs` removed, 404 catch-all now serves the docs page. Front page
got a `/room` card-game entry (top) and the "General Chatroom" link repointed from `/room1.html`
to `/chatroom` (the designated generic-chat route — `chatroom.html`, `room1.html`, `room2.html`
are all variants of the same generic chat UI, so `/room1` is still reachable via its unchanged
URL, just no longer the front-page's featured chat link). Front-page `<h1>` left as
`The B0dy_is_0bs0let3` — branding pending Symone's answer to open question 4. Verified: build
clean, `npm test` in sync, `/` → docs, `/chatroom` → old chat UI, all 5 legacy routes 200,
`/docs` and mistyped URLs 404 → docs page.

### Phase 2 — `/rooms` namespace + room page (agent: fork — inherits verified context)

- [x] 2.1 `server.js`: `io.of("/rooms")` block, **additive only — zero edits to existing
      handlers or the 17 `io.emit` calls.** Join `{roomName, username}` → `socket.join`;
      per-room `Map<roomName, Set<username>>` (never the global `takenUsernames`); capacity 2
      with explicit `room-full` rejection; chat via `nsp.to(room)`; disconnect cleanup frees
      name, empty room clears all state; `room-reset` → broadcast to room. Constants
      (`ROOM_CAPACITY = 2`) in `shared/gameParameters.js`.
- [x] 2.2 Client: `src/room.html` + `src/js/roomMain.js` — room name from `location.hash`
      (no hash → entry prompt, then set hash); username popup + chat rendering reusing
      `chatUI.js`; refresh button emits `room-reset`, on receipt `location.reload()`.
      Parameterise `initSocket` (socket.js:7) with an optional namespace arg — default
      behaviour unchanged. Page title: `thisverisionofme_thisverisionofyou` from birth.
- [x] 2.3 Register `room` in `rollupOptions.input`
- **Acceptance:** scripted socket.io-client isolation matrix against the real `server.js`
  (legacy client still hears `io.emit`; pairA ↛ pairB; 3rd joiner rejected); browser smoke of
  `/room/#test` on the Vite dev server.

**Phase 2 outcome (15 Jul):** done in the worktree, one commit. `io.of("/rooms")` block added
before `server.listen` — own `roomStates` Map (`roomName -> { usernames, selectedTrack }`),
own username sets, never touches global `takenUsernames`/`activeUsers`; none of the 17
`io.emit` calls or existing handlers changed. Protocol: `check username` → `user joined`
(→ `room-joined` to joiner + `user joined` broadcast to room, or `room-full` / `username taken`)
→ `chat` / `room-reset` broadcast to room; disconnect frees the name and clears all room state
when the room empties. `ROOM_CAPACITY = 2` in `shared/gameParameters.js`. `app.get("/room")`
added next to `/chatroom`. `initSocket` takes an optional `namespace` arg (default `""` →
default namespace, unchanged) — `roomMain.js` passes `"/rooms"`. `room.html` mirrors
`chatroom.html`'s element IDs so `chatUI.js` is reused as-is (username popup kept first in the
DOM so `chatUI`'s `querySelector('.login-content')` attaches the username error correctly);
adds a room-name entry overlay (no hash → prompt, then sets the hash) and a refresh button.
Acceptance: scripted socket.io-client matrix — 8/8 green (alice/bob same-room chat delivered;
carol the 3rd scanner rejected with `room-full`; dave in roomB isolated from roomA; legacy
default-ns `io.emit` reaches default ns only, not `/rooms`; `room-reset` reaches both room
clients). `npm run build` clean, `npm test` in sync, `/room` serves the new title via both the
prod server and Vite. Browser smoke of `/room/#...` left for Yewen (real two-client session).

### Phase 3 — audio (agent: fork)

- [x] 3.1 Server: `app.use("/audio", express.static("audio-assets"))` — a directory **outside**
      `dist` and **gitignored** (so Vite's `emptyOutDir` never wipes it and Symone's re-exports
      never enter git history; deploy = `rsync` separate from `git pull`). Server reads the dir
      and emits the track list to room clients on join — **track count becomes data, not code**,
      which un-blocks the "1–5 tracks?" question entirely.
- [x] 3.2 Commit 2–3 tiny placeholder MP3s (seconds long, a few KB) for dev.
- [x] 3.3 Client: when the room reaches 2 named players, show track selection; either player
      picks; preload (`canplaythrough`) gates the play button; `audio-select` → server
      broadcasts `audio-play` to the room; selected track lives in room state, cleared on
      reset/empty.
- **Acceptance:** two browser clients in one room hear the same track; second room independent;
  reset returns both to name entry with track cleared.

**Phase 3 outcome (15 Jul):** done in the worktree, one commit. **Track count is open — `?`** —
the mechanism is data-driven so 1, 3, or 5 all work with no code change; currently 3 placeholder
tracks generated for dev. Final count awaiting Symone's answer (open question 2). Server serves
`/audio` from `audio-assets/` (outside `dist`, gitignored), reads the dir at boot into
`audioTracks` (any audio extension, sorted), and emits `audio-tracks` to each joiner plus
`room-status` (playerCount + selectedTrack) to the room on every join. `audio-select` sets
`state.selectedTrack` (first pick wins, locked until reset), broadcasts `audio-play` + updated
`room-status` to the room only; a late/reconnecting client re-syncs via `room-status`. Selected
track is cleared on reset/empty because `freeRoomSlot` deletes the whole room state when the
room empties (the reloads from `room-reset` disconnect both sockets). Client: `room.html` adds a
`#track-selection` panel (buttons injected by JS from the track list — count is dynamic);
`roomMain.js` preloads every track (`new Audio`, `canplaythrough` enables its button), shows
selection at 2 players, plays on `audio-play`, shows a "now playing" banner, locks after pick.
Placeholder audio: no ffmpeg on the machine, so `scripts/make-placeholder-audio.js` (committed)
generates 3 short distinct-tone **WAV** files in `audio-assets/` via `npm run make:audio` —
format-agnostic, so Symone's MP3 masters drop in with no code change. Deviation from 3.2: the
placeholders are **not committed** (binary blobs), only the generator script is — matches Task 4's
"keep audio out of git"; regenerate in any checkout/worktree with `npm run make:audio`.
Acceptance: scripted check that `/audio/*` serves, `audio-select` broadcasts `audio-play` to the
room only (second room independent), and reset clears selectedTrack; `npm run build` clean, `npm
test` in sync. **Actual audio through headphones, autoplay on real browsers/phones, and venue wifi
left for Yewen** (per "what agents cannot verify") — autoplay should hold because both players have
a prior user gesture (Sign In) before `audio-play` arrives, but verify on iOS Safari.

### Phase 4 — rebrand + mobile (rebrand: main session inline; mobile: agent)

- [ ] 4.1 Rebrand: grep `B0dy_is_0bs0let3` / `Symone` across `src/`; retitle `chatroom.html`
      to `thisverisionofme_thisverisionofyou` (title + `.window-title`). Front page branding
      stays pending Symone's answer (open question 4). Symone's attached visual edits slot in
      here **when they arrive**.
- [ ] 4.2 Mobile: audit `/room` first, then `/chatroom`, at 320/375/390/412px via Chrome device
      emulation; `100vh` → `100dvh`; fix what breaks. Screenshots as evidence.
- **Acceptance:** no horizontal scroll at any width; input area usable; screenshots attached.

### Phase 5 — final verification + docs (main session)

- [ ] 5.1 Full pass: `npm test`, production build + `npm start`, TBIO narrator transmission
      run-through, two-room card-game session end-to-end.
- [ ] 5.2 Update `AGENTS.md` (routing table, audio deploy note, current status) + this doc.
- [ ] 5.3 **Merge to `main` only after Yewen verifies on real phones and says go** — live-show rule.

### What agents cannot verify (do not pretend otherwise)

Real phone behaviour (iOS Safari keyboard, zoom-on-focus), actual audio through headphones,
venue wifi, the VPS deploy. Chrome emulation is evidence for layout only. **Yewen runs these
and reports.**

## Open questions for Symone

**Blocking — need these today:**

1. **The attached visual edits** — can't scope task 2 without them.
2. **Track count** — 1 to 5? **Still open (`?`).** The selection UI is now data-driven
   (server lists whatever is in `audio-assets/`), so the count no longer blocks the build —
   but the final number from Symone is still needed to prep the masters. Dev currently runs
   with 3 placeholders (`npm run make:audio`); add/remove entries in
   `scripts/make-placeholder-audio.js` to change the placeholder count.

**Before the event, not before I start:**

3. **Room names for the QR codes** — `/room/#pairA` and `/room/#pairB`, or something meaningful?
4. **Does the front page (former docs) keep TBIO branding** or take the new game title?
5. **"verision"** — deliberate glitch spelling? Assuming yes.
6. **Venue wifi** — doesn't change the build, but decides whether preload is nice-to-have or
   load-bearing.

**Resolved by Yewen, 15 July:** the game is physical — rooms are only chat + music. Music is
selected once at session start by a player and is per-room. Each room gets a refresh button as
the reset mechanism (this answers both "who picks" and "what ends a game").
