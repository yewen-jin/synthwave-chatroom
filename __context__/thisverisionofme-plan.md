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

**Yewen-verified 15 Jul (browser, two-window):** 3 audio files play, refresh button resets both
clients back to name entry. Full 15-min runtime not exercised (placeholders are 3 s); real-device
autoplay (iOS Safari) and venue wifi still to confirm before the show.

### Interlude — audit of phases 0–3, and visual parity with /chatroom (16 Jul)

Requested out of sequence: an audit of everything committed so far, then bringing in the
background-visual redesign that had landed on `main` while this branch was in progress.

**Audit findings:**

- Confirmed via a whitespace-ignored diff over the full range since `main`: the pre-existing
  narrator/TBIO logic in `server.js` has **zero semantic changes**, only reformatting.
- Room isolation — scripted socket.io-client matrix, 4/4: capacity cap rejects a 3rd joiner,
  roomA↛roomB, `/rooms` never leaks to/from the default namespace.
- **Real bug, found and fixed (`dfe3c6e`):** `audio-select` broadcasts both `audio-play` and
  `room-status` (carrying the same track) to the room — `room-status` doubles as the resync
  path for a mid-session joiner, so it has to carry the track. The client's `playTrack()` had
  no guard against being called twice for the same track, so every selection restarted
  playback from 0:00 within milliseconds of starting. Reproduced empirically (scripted client
  received both signals at +0ms); fixed with a one-line idempotency guard in `roomMain.js`.
  Confirmed the guard is in place by inspection; confirming it actually stops the audible
  restart needs a browser — see "what agents cannot verify" below.
- Minor, not fixed: `check username` doesn't account for room capacity, so a 3rd scanner could
  see "name available" and then get rejected on actual join. Cosmetic only — the real gate on
  `user joined` is correct.
- Two suspected issues turned out fine on inspection: `chatUI.js`'s global `.login-content`
  selector correctly targets the username popup (kept first in the DOM, as documented in
  Phase 2's notes), and `#refresh-btn` inherits styling from the generic
  `.window-controls button` rule rather than being unstyled.

**`main` had moved (`b719ea6`):** 4 commits landed while this branch was in progress — PR #2
merged the `bg` branch (background-visual redesign, `src/js/visuals.js` rewritten for a "3D
Synthwave Sunset Highway" look with CRT effects) and PR #3 merged a `card-game` branch that
turned out to contain _only_ that same visual commit, no overlap with anything here. Merged
clean, zero conflicts — confirmed via diffstat before merging that there was no file overlap.

**Visual parity (`e0d328e`):** `/room` had no background canvas at all — only `chatroom.html`
(via `main.js`) called `initVisuals()`. Brought `/room` to full structural parity: same toolbar,
same title-bar, `initVisuals()` + `initChatDrag()` wired into `roomMain.js` matching `main.js`'s
pattern exactly, so the card game and the generic chatroom read as one app skin. The
room-specific additions (track selection, now-playing banner, room-entry popup, refresh button)
stay, but restyled using the site's own CSS variables and its existing button hover accent
(`#003300`/`#00ff00` — the same one `#username-submit` already uses) instead of the ad hoc
neon-green/black the panel had before.

Deliberately **not** wired: `glitch-control`/`theme-change` events from `/control` only ever
broadcast on the default namespace, never `/rooms` — making `/room` live-reactive to those would
need a real architecture decision (dual namespace connection, or bridging broadcasts), which
wasn't asked for and isn't built. The background animation runs on its own regardless.

### Interlude 2 — Yewen's first real test pass, and a scope change (16 Jul)

Yewen pulled the branch into her own checkout for the first time (`origin/worktree-thisverisionofme`,
pushed after realising the earlier work was sitting in an unreachable background-job worktree) and
reported three things from actually clicking through it:

1. **Bug: the track-selection bar showed no options.** Root cause: `audioTracks` was a constant
   read once at server boot. If `npm run make:audio` ran after the server was already up — or, at
   the real event, Symone's rsync landing after the process was started — every room stayed stuck
   with an empty list until a manual restart. Fixed by replacing it with `readAudioTracks()`,
   called fresh on room creation and on each join. Reproduced the exact failure (boot with no
   `audio-assets/`, generate the file after boot, no restart) and confirmed a join now sees it.
2. **New requirement: pause, not just start.** No pause/resume existed before.
3. **New requirement: single track for now.** The real event will ship with exactly one track, not
   the 1–5 the plan had been carrying as open question 2. Symone plans a separate "change track"
   button + popup for multi-track in the future — explicitly not wanted yet.

**Redesign (`16525e1`):** the track-selection UI is gone. The room auto-selects `tracks[0]` the
moment it's created — no picker step. Server protocol is now `audio-play-request` /
`audio-pause-request`, both idempotent intents (not a blind toggle), so a click race between both
players can't leave the room in the wrong state. Room state gained `pausedElapsed` (seconds already
played, accumulated across pause/resume cycles) alongside `playing`/`startedAt`, so a late joiner or
reconnecting client seeks to the correct position whether mid-play or paused, instead of restarting
from 0. Client-side, `room.html`'s two panels collapsed into one audio bar with a single toggle
button (▶ Start / ⏸ Pause), gated on `playerCount >= 2` same as before.

The list-shaped protocol (`audio-tracks`, `readAudioTracks()`) was kept deliberately rather than
hardcoding "one track" into the wire format — so the future multi-track picker button can read from
the same source without another server rewrite; it just isn't built.

Verified: 13/13 on a new scripted protocol test (the no-restart fix, auto-select on room creation,
play/pause-request idempotency in both directions, and the elapsed-time arithmetic across a real
pause-then-resume cycle). Placeholder track bumped from 3s to 20s so pause/resume is actually
manually testable, and reduced from 3 placeholder files to 1 to match the real scenario. Re-ran the
existing isolation matrix (capacity, cross-room, cross-namespace) — still 4/4.

**Open question 2 (track count) is resolved — one track, for now.** The "before the event" question
list below still needs Symone's answers on room-naming and front-page branding.

### Interlude 3 — "Loading track…" resolved, and the preload gate removed (16 Jul)

**The reported bug was already fixed on disk but never delivered.** `8bcc587` (proxy `/audio` to
the backend in Vite dev) was committed at 02:14 but sat unpushed, and Yewen's Vite had been
started at 09:15 — before the config existed. Restarting Vite picked it up; Yewen confirmed:
_"I'm able to start the track now."_ All commits are now pushed to `origin/worktree-thisverisionofme`.

**A worse bug was sitting behind it.** The toggle was `disabled` until `canplaythrough` fired.
That is a bad gate on any stall — venue wifi, a 15-minute track — and mobile browsers (iOS Safari
especially) routinely ignore `preload="auto"` entirely and fetch nothing until a gesture. On those
devices `canplaythrough` never fires before the first press, so **the button would have been dead
on arrival at the event** while working perfectly on the desktop it was tested on.

Fixed in `8988ba1`. Preload is now an optimisation, never a precondition:

- the toggle is enabled as soon as a track exists and both players are present;
- seeking waits for `loadedmetadata` (which it needs) rather than `canplaythrough` (which it doesn't);
- a load `error` becomes a retryable "⟳ Retry track" instead of a permanently dead button;
- the presser calls `play()` **synchronously inside the click**, since iOS only grants an element
  playback permission from a real gesture — the old code only ever called `play()` from the
  `room-status` callback, which iOS is liable to reject **for both players**;
- the non-presser, whose device made no gesture on its own audio element, falls back to a
  "🔇 Tap to enable sound" prompt that re-seeks to the room's live elapsed position (new
  `audio-status-request`, emitted to that one socket) — so it rejoins the music **in sync**
  rather than restarting it.

**Verified** on desktop Chrome, two clients, including a tab where preload never completes
(background tabs are media-throttled, which reproduces "canplaythrough never fires"): button stays
enabled, either player can start, play/pause syncs both ways, and the elapsed clock resumes from
the paused position (0.0 → 6.1 → 6.1 → 6.7s) rather than restarting.

⚠️ **Not verified, and cannot be here:** the actual iOS autoplay behaviour. The gesture handling
above addresses Safari's documented rules _in principle_ — it is reasoned from the spec, not
tested on hardware. **A real-iPhone test is a gate before the event**, not a nice-to-have: if
the non-presser's audio is blocked, the fallback prompt is what saves the feature, and nobody
has seen it fire on real hardware.

**Note on the background-throttle test:** it reproduces the _consequence_ (no `canplaythrough`),
not the _mechanism_ (iOS autoplay policy). Don't let it stand in for a device test.

### Symone's visual edits — RECEIVED 16 Jul (`~/KEEP or DELETE.pdf`)

The long-missing "additional visual edits attached". Three annotated slides. Transcribed here
because the source lives outside the repo; the PDF is the authority if they ever disagree.
(Extracted with PDFKit via `swift` — `pdftotext`/poppler is not installed on this machine.)

Her screenshots are of **`room1.html` / `player-room.html`** (the legacy pages), not the new
`room.html` — so a few notes describe elements the card-game room never had.

| #      | Requirement (her words, condensed)                                                                                             | Slide | Status           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------ | ----- | ---------------- |
| **R1** | "Sam entered the room — keep this"                                                                                             | 2     | ✅ done          |
| **R2** | "Sam is typing…" or live typing visual — _"still nice to have"_                                                                | 2     | ❌ **new**       |
| **R3** | "Take out Symone is online" (avatar + status bar)                                                                              | 2     | ✅ done          |
| **R4** | Take out "The B0dy_is(..)", replace with `thisverisionofme_thisverisionofyou`                                                  | 2     | ⚠️ partial       |
| **R5** | "Keep Display name for each person if possible"                                                                                | 2     | ⚠️ **broken**    |
| **R6** | Synthwave background could be removed — _"if you want/if it's simple"_; not visible on mobile, "might be taking extra storage" | 2     | ⚠️ **conflict**  |
| **R7** | One player presses **"begin conversation"** → opens the chatroom **+ plays music**                                             | 3     | ⚠️ partial       |
| **R8** | Game end: **(a)** "thank you for playing" + chat closed, **or** **(b)** chat continues, music stops                            | 3     | ❌ **new**       |
| **R9** | "suitable for all mobile devices, ensure the ___"                                                                              | 3     | ❓ **truncated** |
| **R0** | "Keep this intro page" — the Sign In / display-name popup                                                                      | 1     | ✅ done          |

### Audit of phases 1–3 against the PDF (16 Jul)

**Satisfied.** R0 (`#username-popup` on `room.html`), R1 (`onUserJoined` renders
"_**Sam** entered the chat_"), R3 (the `.contact-info` avatar/"Online" bar is commented out in
both `room.html` and `chatroom.html`).

**R5 is silently broken — the audit's real find.** `updateUserDisplayName()`
(`src/js/chatUI.js:147`) writes to `#user-display-name`. That element exists **only** in
`player-room.html` and `room1.html` — the pages Symone screenshotted. `room.html` has no such
element, so `roomMain.js` calls the function on every join and it does nothing, silently. Her
arrow points at the `.user-avatar-panel` (mask avatar + name, bottom-right of the input row);
that whole block is absent from `room.html`. Note the softer reading too: per-message sender
names already appear on every line, so "display name for each person" is arguably met — but the
panel she circled is genuinely missing. Fix is a copy of the block from `room1.html:106–114`.

**R4 partial.** `room.html` is already correct. Still carrying "The B0dy_is_0bs0let3":
`index.html:11`, `chatroom.html:7,26`, `room1.html:7,26`, `room2.html:7,26`,
`player-room.html:7,27`, `narrator-room.html:7,26`. ⚠️ **`player-room` / `narrator-room` are the
legacy narrator show — a different work.** Retitling those renames The Body is Obsolete itself.
Assume rebrand = `index` + `chatroom` + `room` only, pending Symone (open question 4).

**R7 partial — smaller than it looks.** Currently: both players sign in → chat is open
immediately → a separate "▶ Start" plays music. Symone wants **one** button that opens the chat
_and_ starts the music. The machinery already matches: the button only appears once both players
are present, either may press it, and one press starts music for both. The delta is only
(1) relabel "▶ Start" → "begin conversation", (2) gate the chat area behind that press.
**The audio work stands — the non-presser still receives music by broadcast, so the iOS
tap-to-enable fallback is exactly as load-bearing under this framing.**

**R8 not implemented at all.** There is no end-of-game concept; `refresh` is the only reset.

**R6 is a stakeholder conflict, not a task.** Yewen (16 Jul): _"I want /room to share the same
background with the rest of the site"_ — which is why `roomMain.js` calls `initVisuals()`.
Symone: the background could go, it's invisible on mobile and "might be taking extra storage".
Not a neutral toss-up: dropping it also removes p5 (the heaviest dependency), which helps mobile
performance and answers her storage worry. **Needs Yewen's call.**

**R9 is truncated in the source PDF** — the sentence ends "ensure the". Not recoverable here;
only Symone has the rest. **Ask.**

### Phase 4 — REVISED after the PDF (16 Jul). Scope now exceeds the 5h remaining.

R2, R7 and R8 are **net-new** beyond "rebrand + mobile". The original Phase 4 was ~3h of a 5h
remainder; these do not fit alongside it. Triage below uses Symone's own signals — she marked R2
"nice to have" and R6 "if you want/if it's simple", so those defer first.

**Core (fits ~5h, in priority order):**

- [ ] 4.1 Rebrand (R4) — ~0.5h. `index` + `chatroom` + `room` only; leave the narrator pages
      pending Symone.
- [ ] 4.2 Mobile (R9) — ~2–2.5h. `/room` first (the QR target), then `/chatroom`, at
      320/375/390/412px; `100vh` → `100dvh` (6 sites); 26 hardcoded px widths; only 4 `@media`
      blocks across 1348 lines of CSS. Screenshots as evidence.
- [ ] 4.3 Display-name panel (R5) — ~0.25h. Port `.user-avatar-panel` from `room1.html`.
- [ ] 4.4 "begin conversation" (R7) — ~0.75h. Relabel + gate the chat area on the press.

**Deferred unless Symone's answers or spare budget say otherwise:**

- [ ] 4.5 Game end (R8) — needs her (a)/(b) choice first. **Cost is asymmetric:** (b) "chat
      continues, music stops" is near-free _if the single track is the game clock_ — the audio
      `ended` event is the game-over signal. (a) needs an explicit end trigger plus chat locking.
      Don't build either arm speculatively.
- [ ] 4.6 Typing indicator (R2) — her own "nice to have". Needs a `typing` event on the `/rooms`
      namespace + debounce. ~0.75h.
- ~~4.7 Background removal (R6)~~ — **RESOLVED 16 Jul: the background stays. Do not remove it.**
  Yewen's call. Symone's underlying worry was that rendering the background would steal
  processing power from live audio playback — it doesn't: audio decoding runs off the main
  thread with its own buffer, so canvas work doesn't cause dropouts. The two are unrelated.
  She wrote "could", not "must". **p5 and `initVisuals()` stay in `roomMain.js`.**

      One honest caveat, recorded so it isn't rediscovered later: her _other_ reason ("on the
      mobile its not visible") is a design observation, not the misconception, and it broadly
      checks out — at ≤768px `.msn-window` is `width: 95%; height: 100vh`, leaving the background
      as a ~2.5% sliver each side. It is fully visible on desktop, which is where it carries the
      piece. Not a reason to remove it; just don't be surprised on a phone.

**Proposal worth putting to Symone (resolves R7 + R8(b) together, cheaply):** the single track
_is_ the game clock — "begin conversation" starts it, the track ending ends the game and stops
the music. It matches her "15-minute track with all the timing signals" idea and needs no
separate timer. **Offer as a proposal, not a decision.**

- **Acceptance:** no horizontal scroll at any width; input area usable on a real phone;
  screenshots attached; iPhone audio test passed (see Interlude 3 — that is still a gate).

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

1. **The attached visual edits — RECEIVED 16 Jul** (`~/KEEP or DELETE.pdf`). Transcribed and
   audited above (R0–R9). They **grew the job past the remaining 5h**: R2, R7, R8 are net-new.
   See the revised Phase 4 for the triage. Three follow-ups came _out_ of the PDF:

   1a. **R9 is cut off mid-sentence** — "Additionally: suitable for all mobile devices, ensure
   the ___". The slide just ends. **What was the rest?** Can't guess this one.

   1b. **R8 — she offered (a) or (b) and didn't pick.** Needs a decision. Suggest (b) (chat
   continues, music stops) with the track as the game clock — near-free, and it matches her
   "15-minute track with all the timing signals" plan. (a) costs more (explicit end trigger +
   chat locking).

   1c. **R4 vs the narrator show** — "The B0dy_is_0bs0let3" also titles `player-room` /
   `narrator-room`, which are the _legacy TBIO piece_, not the card game. Confirm the rename
   covers only the card-game pages (front page, `/chatroom`, `/room`). See also Q4.

2. **Track count — RESOLVED (16 Jul): one track for now.** Symone confirmed the real event
   ships with exactly one track. The UI stays as the current single-track ▶/⏸ bar — no picker.
   The list-shaped protocol (`audio-tracks`, `readAudioTracks()`) is kept deliberately rather
   than hardcoding "one track" into the wire format, so a future "change track" button + popup
   for multi-track can read from the same source without another server rewrite. That multi-track
   UI is explicitly **not** wanted yet. Dev runs with 1 placeholder (`npm run make:audio`
   generates `track-1.wav`, 20 s); add entries in `scripts/make-placeholder-audio.js` when more
   tracks are needed.

**Before the event, not before I start:**

3. **Room names for the QR codes** — `/room/#pairA` and `/room/#pairB`, or something meaningful?
4. **Does the front page (former docs) keep TBIO branding** or take the new game title?
5. **"verision"** — deliberate glitch spelling? Assuming yes.
6. **Venue wifi** — doesn't change the build, but decides whether preload is nice-to-have or
   load-bearing.

**Resolved by Yewen, 15 July:** the game is physical — rooms are only chat + music. Music is
selected once at session start by a player and is per-room. Each room gets a refresh button as
the reset mechanism (this answers both "who picks" and "what ends a game").
