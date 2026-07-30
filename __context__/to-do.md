# Open items

The single list of open tasks and decisions for this repo. History and reasoning live in `WORKLOG.md`; this file holds only what is still open. Maintained by whichever session does the work — see the Decision Log section in `AGENTS.md`. Close an item by deleting the line (git history preserves it).

## Before the show — real-device gate

Cannot be verified from a desktop (see Testing & Setup in `AGENTS.md`). Verify on real hardware, then delete the line. Outstanding since 17 Jul 2026.

- [ ] iOS audio autoplay in `/room`, including the tap-to-enable fallback on the non-pressing device
- [ ] `dvh` layout against Safari's collapsing toolbar
- [ ] Timeline ticking + duration read from real audio metadata (Chrome throttles media/timers in background tabs, so desktop is not evidence)
- [ ] A phone camera reading the pairing QR off another phone's screen
- [ ] Reconnect behaviour on real network loss

## Open decisions

- [ ] **R8 game-end — option (a) or (b)?** Symone's call. Proposal on the table: the track is the game clock. Brief in `__context__/thisverisionofme-plan.md`.
- [ ] **R9 is truncated in Symone's PDF** ("suitable for all mobile devices, ensure the ___") — ask her for the full sentence.
- [ ] **Persist conversation transcripts to disk?** Currently in-memory only. Yewen's call — a values decision on an intimate piece, not a technical default (logged 17 Jul 2026).

## From the 17 Jul 2026 review — tier 3 still open

Tiers 1–2 fixed in `684351a` (see `__context__/review-remediation-2026-07-18.md`); review at `__context__/review-2026-07-17`.

- [ ] #5 in-memory room growth — needs a design call on room-id validation
- [ ] #6 durable protocol tests — the smoke scripts written for the 18 Jul remediation are ready-made seeds
- [ ] #8 room ids reach access logs via `/qr.svg` — the "fragment never reaches a log" claim is inaccurate for that route
- [ ] #12 player-facing diagnosis when the audio track is missing

## Repo hygiene

- [ ] `src/data/twine/thebodyisobsolete.html` is a stale Dec 2025 Twine archive, older than the `.twee` beside it — re-export from Twine or delete (⚠️ in `AGENTS.md`)
- [ ] `__test__/*.test.js` are empty placeholders — write real tests (seeds: the 18 Jul smoke scripts) or delete the directory along with the unused `jest` devDependency
- [ ] Global `/Users/yewenjin/CLAUDE.md` restructure — needs Yewen's sign-off (see `__context__/agent-workflow-audit-2026-07-15.md`)

## Narrative game — gameplay & style ideas (older notes, kept verbatim)

- [ ] fix the game initiation mechanism. Once game finishes, do not restart, and the narrator room initiation button should not be grayed out.
- [ ] narrator messages no longer need to pop up in narrator room, just go to the messages.
- [ ] add a pause game option, where the narrator can pause the interaction, and add whatever texts
- [ ] images: click to enlarge, click 'X' on top right corner to close
- [ ] edit styling, enlarge texts, maybe remove the top status bar or move it to the side to allow more space for conversation
- [ ] further edit conversation texts, splitting between player option that goes into chat, adding "" in the option, and options that trigger the next node without sending anything to chat (consider if/when this should happen)
- [ ] before the game finishes, the typing should be disabled/grayed out, until the end of the game
- [ ] ==CLICK TO PLAY== shouldn't be in the chat. Maybe in the popup window
- [ ] could some control options, like read on, or go back, be another type of object, not in the chat option? Or should this be relfected in the writing style?

## Feb 2026 code-review highlights — NOT re-verified since

Kept for reference; re-verify against current code before acting on any of these. Already fixed: XSS via `innerHTML` in `src/js/main.js` (18 Jul 2026, commit `684351a`) and the unused `dialogueUI.js` (deleted — `REVIEW_LOG.md`).

- [ ] No server-side input sanitization — no message length limits, rate limiting, or HTML stripping in `server.js` (the `/rooms` namespace now validates join payloads; the default namespace was not re-audited)
- [ ] Arbitrary CSS class injection — `control-theme` event accepts any string as a class name (`src/js/socket.js`, `server.js`)
- [ ] No auth on privileged socket events (`dialogue-start`, `glitch-control`, `control-theme`) in `server.js`
- [ ] Message delays set to 0 in `shared/gameParameters.js` — breaks narrative pacing in production
- [ ] Stale closure state in setTimeout chains during dialogue sequences in `server.js`
- [ ] `connectedUsers` counter can drift negative in `server.js`
- [ ] Dialogue events broadcast to all clients via `io.emit()` instead of scoped Socket.IO rooms in `server.js`
- [ ] Redundant `window._socket` global assignment in `socket.js` and `main.js`
- [ ] Loose equality (`==`) in condition evaluation in `server.js` and `dialogueSystem.js`
- [ ] Duplicated condition evaluation logic across server/client/converter — extract to `shared/`
- [ ] Path traversal risk in `loadDialogueData` — validate `dialogueId` format in `server.js`
- [ ] No username validation (length, format, reserved names) in the default-namespace chat in `server.js`
- [ ] 404 handler returns full `index.html` — may confuse crawlers/monitoring
