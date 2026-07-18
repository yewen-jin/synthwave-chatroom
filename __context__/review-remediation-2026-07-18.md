# Review remediation notes — 18 Jul 2026

Worklog for the remediation of `__context__/review-2026-07-17` (comprehensive
card-game code review). Tier 1 and Tier 2 of the agreed plan are complete and
verified; Tier 3 remains open. The review document itself carries a
per-finding status block at the top, updated alongside the fixes.

## What was verified before touching anything

Every load-bearing claim in the review was re-checked against the live code
before implementing. All reproduced; only line numbers had drifted (e.g. the
card-game `innerHTML` calls were at `roomMain.js:171,178`, not 132/140).
One additional vulnerability was found during remediation that the review
missed — see "Additional finding" below.

## Tier 1 — show-stoppers (fixed 18 Jul)

### #1 — Malformed Socket.IO payload could crash the whole process

- **Root cause:** `check username` and `user joined` destructured their
  payload in the function signature (`({ roomName, username } = {})`). The
  default covers `undefined` but not `null`, so
  `io('/rooms').emit('check username', null)` threw a synchronous TypeError.
  Socket.IO dispatches handlers with no exception boundary, and the narrative
  show shares the process — one crafted card-game event could end both
  experiences mid-show.
- **Fix (`server.js`):** new `parseJoinPayload()` — validates the raw payload
  is an object, both fields are strings, both non-empty after trim; usernames
  capped at 20 chars (matching `maxlength` in `room.html`). Characters are
  deliberately NOT restricted: rendering is `textContent`-only, so names
  can't carry markup, and a charset rule would only exclude legitimate names
  (emoji, non-Latin scripts).
- **Scope note:** only `/rooms` had the destructuring pattern; the default
  (narrative) namespace was checked and is clean.

### #2 — "Joined the wrong room?" leaked rooms and ghosted players

- **Root cause:** `user joined` did `socket.join(roomName)` unconditionally
  and overwrote `socket.roomName`. A socket that joined a second room stayed
  subscribed to the first (kept receiving its private broadcasts), and the
  first room kept the old username in its `usernames` set forever — a ghost
  occupying one of two slots. Triggerable through the designed recovery
  flow, not just by malicious clients.
- **Fix (`server.js`):** new `leaveCurrentRoom()` helper (leave the
  Socket.IO room, notify the partner, free the slot — which auto-pauses —
  and broadcast fresh status), now shared by `disconnect` and by joins that
  switch rooms. The switch happens only AFTER the new room accepts the join
  (taken/full checks first), so a failed switch doesn't eject the player
  from the room they were in. One room per socket is now an invariant,
  documented in `AGENTS.md`.

### #3 — Display names allowed script injection (`/room`)

- **Root cause:** join/leave notices interpolated the untrusted username
  into `innerHTML`; the server put no bound on names at all.
- **Fix:** `src/js/roomMain.js` builds those notices node-by-node with
  `textContent` (new `buildSystemMessage()`), and the server caps username
  length via `parseJoinPayload()` (above).

### Additional finding — same XSS in the legacy narrative chat (`main.js`)

The review scoped to the card game and missed that `src/js/main.js`
interpolated **audience-typed usernames AND chat message bodies** into
`innerHTML` (worse blast radius: every audience phone, not one partner).
Fixed the same way (textContent nodes + shared helper shape).

**Deliberately left as `innerHTML`:** the system/speaker branch in
`main.js:66` and `dialogueController.js:291,308,352`. The Twine-authored
script contains 47 lines of intentional `<strong>` markup that must render
as formatting; that content is artist-authored, not audience input. The
comment at `main.js:66` now says so explicitly so nobody "fixes" it later.

### Tier-1 verification

- `node --check` on both changed files; `npm test` (dialogue drift) green.
- Live smoke test against a real server with real `socket.io-client`
  clients — 8/8: server survives 7 malformed-payload variants; 21-char
  username rejected; room switch accepted; partner gets leave notice +
  correct 1-player/paused status; old name's slot freed; zero cross-room
  chat leakage. (`data/room-sessions.json` backed up + restored around the
  run; script deleted after.)

## Tier 2 — hardening + docs (fixed 18 Jul)

### #4 — Begin/two-player rules enforced only by the UI

- **Fix (`server.js`):** chat is rejected while `state.begun` is false; the
  INITIAL play is rejected unless `usernames.size === ROOM_CAPACITY`.
- **Judgment call (per the review's own wording):** only the first begin is
  gated. Resumes with one player remain allowed — that's what lets a pair
  continue after one phone drops and rejoins. Rejections are silent,
  consistent with the other handlers (and avoids a log-flood vector).
- **Verified:** live smoke test 8/8 — lone begin rejected, pre-begin chat
  neither relayed nor stored (fresh joiner's replay contains post-begin
  messages only), begin works with a pair, lone resume works after a drop.

### #7 — Manual room-code entry on phones

- **Fix:** `src/room.html` input gets `autocapitalize="none"
  autocorrect="off" spellcheck="false"`; `handleRoomNameSubmit` in
  `roomMain.js` lowercases the entry. The username input is untouched
  (capitalised display names are legitimate). Hash-carried ids are not
  lowercased — they arrive lowercase from the QR, and touching them could
  break legacy mixed-case rooms.

### #10 — Dependency-only deploys didn't restart the process

- **Fix (`scripts/update-vps.sh`):** restart now triggers on
  `package.json`/lockfile changes too (the running process keeps old
  dependency code in memory after `npm install`), and those runs no longer
  misreport as "dist/-only update". Header comment updated to match.
  `bash -n` clean.

### #9 — Stale deployment docs

- README deploy steps now describe the CI `build`-branch artifact flow +
  `update-vps.sh` (was: `git pull` + build on the VPS).
- `__context__/VPS setup manual.md` §8 marked **superseded** with the new
  commands; old flow kept below for reference rather than deleted, since
  the rest of the manual is still accurate operator documentation.

### #11 — Stale Node support declaration

- `package.json` engines and README now say Node **>=24** (current LTS,
  matching CI's `node-version: 24`).

## Files changed

```
AGENTS.md                        one-room-per-socket invariant + payload validation
README.md                        Node >=24, build-branch deploy steps
__context__/VPS setup manual.md  §8 superseded notice + new flow
__context__/review-2026-07-17    remediation status block (top of file)
package.json                     engines >=24
scripts/update-vps.sh            restart on dependency changes
server.js                        parseJoinPayload, leaveCurrentRoom, begin/chat gates
src/js/main.js                   textContent rendering (chat + join/leave)
src/js/roomMain.js               textContent system messages, lowercase room codes
src/room.html                    autocapitalize/autocorrect/spellcheck attrs
```

## Still open (Tier 3 / needs decisions)

- **#5** in-memory room growth: `getRoomState` mints state on a bare
  `check username`; the 24h TTL filters only the disk write, never deletes
  from the Map. Needs a small design call: validate ids against the minted
  alphabet, don't create state on availability checks, add a real sweep.
- **#6** no durable protocol tests. The two smoke scripts written for this
  remediation (deleted after use) are ready-made seeds; `socket.io-client`
  is already a dependency.
- **#8** room ids reach access logs via `/qr.svg?d=…` despite the docs'
  claim — minimum: correct README/AGENTS.md wording + drop the public
  cache header.
- **#12** missing-audio shows as a dead "begin conversation" button; needs
  a player-facing diagnosis.
- Known-incomplete list unchanged (R8 end-of-game, typing indicator, etc.)
  — except R8 may want a decision before the next show: the room clock
  currently runs past the track duration with the server still `playing`.
