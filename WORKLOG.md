# WORKLOG

Append-only decision log for this repo — the reasoning behind changes, not the changes themselves (git history already records the what). Newest entry at the bottom. **Never delete, rewrite, or reorder an entry.** A failed approach is logged with status `reverted` so it isn't retried; a wrong entry is corrected by a later entry, not an edit.

Maintained by the `notes-keeper` agent (`.claude/agents/notes-keeper.md`) — dispatch it after substantive work with a brief that carries the whys. See the Decision Log section in `AGENTS.md`.

## Entry template

```markdown
## [YYYY-MM-DD HH:MM] Task/Decision Title

**Status:** completed | in-progress | blocked | reverted

**Summary:** One or two sentences describing what was done.

**Decisions & Reasoning:**

- Decision: [what was chosen]
  Why: [the reasoning behind it]

**Alternatives Considered:** (if any)

- [alternative]: [why it was rejected]

**Files Changed:** list of files modified/created/deleted

**Backtrack Notes:** If this needs to be undone, here's what to revert.
```

If the reasoning behind a decision is uncertain, record the uncertainty explicitly ("probably because X, not confirmed") rather than guessing.

---

The two entries dated before this log existed were backfilled at adoption (17 Jul 2026) from `CLAUDE.md`'s status section and `__context__/`. From then on, entries are appended as the work happens.

## [2026-07-15] Agent-workflow audit and dialogue reorg (backfilled)

**Status:** completed

**Summary:** Audited the agent workflow, made `src/data/twine/thebodyisobsolete.twee` the canonical dialogue source (previously `scripts/thebodyisobsoleteFV.twee`, with docs pointing at a stale draft), deleted the dead draft and dead output directory, and set up the worktree workflow with its traps documented in `CLAUDE.md`.

**Decisions & Reasoning:**

- Decision: dialogue sync (`npm run build:dialogue`) stays manual, with `npm test` as the drift gate.
  Why: regenerating the shipped dialogue must be a deliberate act, so a pre-show edit can't silently rewrite the live script.
- Decision: `worktree.baseRef = head` in `.claude/settings.json`, not the `fresh` default.
  Why: `fresh` branches from `origin/main`, which goes stale the moment a commit lands locally without a push — a worktree would silently lack the newest instructions and dialogue.
- Decision: the `merge=ours` `.gitattributes` entries were left in place, with no merge driver configured.
  Why: they look like a deliberate deploy guard; undriven they are inert and safe (conflicts stay loud), whereas configuring `merge.ours.driver true` makes merges silently discard changes to those files.

**Files Changed:** see `__context__/agent-workflow-audit-2026-07-15.md` for the full audit.

**Backtrack Notes:** pre-reorg state recoverable at git tag `pre-dialogue-reorg-2026-07-15`.

## [2026-07-17] Card-game room system for Symone (backfilled)

**Status:** completed — merged into `card-game` (PRs #5, #6), since carried on to `main`

**Summary:** Built _thisverisionofme_thisverisionofyou_ (paid commission, brief transcribed as R0–R9 in `__context__/thisverisionofme-plan.md`): per-pair QR-minted rooms with gated chat and a shared music track, on an isolated `/rooms` Socket.IO namespace.

**Decisions & Reasoning:**

- Decision: the card game runs on an isolated `/rooms` namespace.
  Why: namespace isolation from default-namespace `io.emit` broadcasts meant it could be added without touching any narrative-game handler — a broken `main` is a broken show.
- Decision: the room id lives in the URL **fragment**, not the path or query.
  Why: browser history carries it (free return after a drop) and it never reaches a server access log.
- Decision: sessions persist to `data/room-sessions.json`, but always as a **paused** snapshot, and presence (`usernames`) is never persisted.
  Why: a persisted `playing:true` becomes a lie after a restart (elapsed measured against a pre-outage timestamp makes the track leap forward by the downtime); a persisted username would reject a returning player as "name taken" by their own ghost.
- Decision: conversation replay is held in memory only, not written to disk.
  Why: persisting transcripts of an intimate piece is a values decision for Yewen, not a default. Still open.
- Decision: `qrcode` is a server-side dependency rendering `/qr.svg`; nothing ships to the browser.
  Why: keeps the frontend framework-free, which is deliberate so the client can hand the piece to any web developer.

**Alternatives Considered:**

- R8 game-end options (a)/(b): neither chosen yet — the proposal on the table is that the track is the game clock. Open with Symone.

**Files Changed:** `server.js` (the `roomsNsp` block), `src/js/roomMain.js`, `src/room.html`, `src/style.css`, `shared/gameParameters.js`, `vite.config.js` (proxy entries), `scripts/make-placeholder-audio.js`, `package.json`/`package-lock.json`, `.gitignore`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `__context__/thisverisionofme-plan.md`.

**Backtrack Notes:** the system is additive — removing the `roomsNsp` block from `server.js` and the `/room` page restores the narrative-only server. The real-device gate (iOS autoplay, `dvh` vs Safari's toolbar, timeline from real metadata, camera reading the QR off a screen) was **still unverified** at merge time — see `CLAUDE.md` Current status.

## [2026-07-17] Adopt the worklog and notes-keeper agent

**Status:** completed

**Summary:** Adopted the subagent-orchestration skill's minimal path: this `WORKLOG.md`, a Haiku `notes-keeper` agent to append to it, and a Decision Log section in `AGENTS.md`.

**Decisions & Reasoning:**

- Decision: minimal adoption — no role table of model-tiered dev agents.
  Why: this repo is small (plain HTML/JS + one server file) and worked on by one person; specialised dev roles are overhead without payoff here. The worklog convention and the cannot-verify declaration carry most of the skill's value.
- Decision: the notes-keeper appends to `WORKLOG.md` only — it does not edit `README.md` or `AGENTS.md` (a deliberate deviation from the skill, which has the same agent keep the README in sync).
  Why: this repo backs a live performance; a cheap agent with a wide write surface is the wrong trade. It flags README/AGENTS drift in its report instead.
- Decision: backfill the two documented sessions rather than start the log empty.
  Why: the log demonstrates its own format and is immediately searchable; the entries are marked backfilled so nobody mistakes them for contemporaneous records.

**Files Changed:** `WORKLOG.md` (new), `.claude/agents/notes-keeper.md` (new), `AGENTS.md` (Decision Log section + one "What NOT to do" bullet), `CLAUDE.md` (Current status).

**Backtrack Notes:** delete the two new files and revert the `AGENTS.md`/`CLAUDE.md` hunks; nothing else references them.
