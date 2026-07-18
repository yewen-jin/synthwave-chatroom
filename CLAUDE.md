# CLAUDE.md

This project's instructions live in **`AGENTS.md`** — one file, shared by every agent that reads this repo. Don't duplicate its content here; edit `AGENTS.md` instead.

@AGENTS.md

## Scope correction (read this first)

An ancestor file at `/Users/yewenjin/CLAUDE.md` is loaded automatically into sessions in this repo because Claude Code collects `CLAUDE.md` from the working directory up to the filesystem root. **It describes other projects and does not apply here.** Specifically, ignore all of the following when working in this repo:

- **SvelteKit / Svelte / SCSS / Tailwind guidance** — this is plain HTML/JS + Vite, no framework.
- **`npm run check`, `npm run lint`, `npm run format`, `npm run test:unit`** — none of these scripts exist in this `package.json`. Do not attempt them as gates.
- **"Node.js >=20.9.0 required"** — this project's `package.json` declares `>=24.0.0` (current LTS, matching CI).
- **Vitest / Playwright** — not used here. See the testing note in `AGENTS.md`: there is no working test gate.
- References to `skopetur-frontend`, `hydra-server`, `Prefect`, or `Void-Space-Chatroom` — unrelated repos.

`.github/copilot-instructions.md` in this repo is **stale** — it is titled "Void Space Chatroom" (this repo was forked from it) and still documents the dead dialogue pipeline. Do not treat it as authoritative.

## Working agreements

- One task at a time; atomic commits with specific messages (`Fix narrator restart not resetting story variables`, not `updates`).
- **Plain imperative commit subjects, not conventional-commit prefixes** — this repo's history has no `feat(x):` style and shouldn't gain one.
- Ask before anything irreversible — this repo backs a live performance.
- Verify by running the app, not by citing empty tests.
- British English in prose and docs.

## Worktree workflow

**Work in a worktree, not directly in the main checkout.** `main` is the branch the show runs from; the main checkout is the one you open when a performance is imminent. Keep experiments out of it.

Use the `EnterWorktree` tool (this is the standing project instruction that authorises it). Worktrees land in `.claude/worktrees/<name>/` on their own branch.

```bash
npm test          # works immediately in a new worktree — no npm install needed
npm install       # required before npm run dev / vite:dev (node_modules is not shared)
```

### Traps specific to this repo

1. **`worktree.baseRef` is set to `head`** in `.claude/settings.json`, deliberately. The default (`fresh`) branches from `origin/main`, which goes stale the moment you commit locally without pushing — a worktree would silently lack the newest instructions and dialogue. `head` branches from local HEAD. Don't "helpfully" restore the default.
2. **Two stacks can't run at once.** The backend honours `PORT` (`process.env.PORT || 3000`), but `vite.config.js` hardcodes the dev-server port (5173) **and** proxies `/socket.io` to `ws://localhost:3000`. So a worktree's frontend started alongside main's backend will talk to **main's server**, not its own. Normal use — stop main's stack, run the worktree's on the default ports — avoids this entirely. Don't rewire the proxy to work around it unless you actually need both up.
3. **`merge=ours` on `server.js`, `vite.config.js`, `render.yaml`, `.env*`** (`.gitattributes`). This looks like a deploy guard protecting the `production` / `build` branches from a main-merge clobbering their config — treat it as intentional and leave it alone. It is currently **inert**, because no `merge.ours.driver` is configured. Verified 15 Jul 2026: with the driver unset a conflicting merge conflicts loudly (safe); with `git config merge.ours.driver true` set, the merge **reports success and silently discards** the branch's changes to those files. So: don't configure that driver casually, and if a merge of a worktree branch ever seems to lose `server.js` edits, this is why.
4. **`node_modules` is absent from this checkout entirely** and is per-worktree. `npm test` and `npm run build:dialogue` use only node builtins and work without it; anything that boots a server does not.
5. **Dialogue is per-worktree.** `server.js` reads `public/data/dialogues/` relative to its own `__dirname`, so regenerating dialogue in a worktree cannot disturb a running show in the main checkout.
6. **`res.sendFile` 404s inside worktrees unless dotfiles are allowed.** send() defaults to `dotfiles: "ignore"`, and a worktree's absolute path contains `.claude/` — so every clean-URL route (`/control`, `/player-room`, …) returned 404 in a worktree while `express.static` worked (its check is relative to `dist/`). Fixed 15 Jul 2026 by passing `{ dotfiles: "allow" }` (`SENDFILE_OPTS`) at every sendFile call site. If a new route 404s only in a worktree, this is why — reuse `SENDFILE_OPTS`.

## Current status

_Update at the end of each session: what's done, what's next, any blocker._

- 18 Jul 2026 — **Security remediation of the 17 Jul card-game review, tiers 1–2 done** (commit `684351a` on `card-game`). Crash vector (null-payload destructuring), room leak/ghost players, and XSS in both chat clients fixed; begin/two-player rules now enforced server-side; deploy script restarts on dependency changes; docs aligned (Node >=24, build-branch deploy). Verified by two live socket smoke suites (8/8 each) — desktop only, real-device gate still outstanding. Full notes: `__context__/review-remediation-2026-07-18.md`; per-finding status: top of `__context__/review-2026-07-17`. **Open (tier 3):** #5 in-memory room growth (needs a room-id validation design call), #6 durable protocol tests, #8 room ids in access logs (the "never reaches a log" claim in README/AGENTS is inaccurate via `/qr.svg`), #12 missing-audio player diagnosis, R8 game-end decision.
- 17 Jul 2026 (later) — **Decision log adopted** (subagent-orchestration skill, minimal path): append-only `WORKLOG.md` at the repo root (template at the top; the two prior sessions backfilled), a Haiku `notes-keeper` agent (`.claude/agents/notes-keeper.md`, appends to the worklog only), and a Decision Log section in `AGENTS.md`. Branch `worktree-subagent-orchestration` → draft PR against `card-game`. Note: PRs #5/#6 from the entry below have since **merged** into `card-game`, and `card-game` has been merged onwards to `main` (PRs #7–#9).
- 17 Jul 2026 — **Card-game room system built** (_thisverisionofme_thisverisionofyou_, the paid commission for Symone; brief transcribed as R0–R9 in `__context__/thisverisionofme-plan.md`). Branch `worktree-thisverisionofme` → **open PR #5 against `card-game`** (not `main` — Symone's integration branch is `card-game`). Delivered on the isolated `/rooms` namespace: per-pair QR-minted rooms (phone-as-QR pairing), "begin conversation" chat+music gating, single-track audio with iOS-autoplay handling, a track timeline (dots at 3/6/9/12 min), session persistence (`data/room-sessions.json`, drop/restart-survivable), in-memory conversation replay on rejoin, per-room username `localStorage`, and mobile fixes (portrait + landscape, 320px up). README + AGENTS.md updated to cover both systems this session.
  - **Verified on desktop Chrome** (two clients / scripted socket): pairing, capacity, begin/pause/resume, elapsed resume, auto-pause on drop, session restore across a real server restart, lossless chat replay, XSS-escaped rendering, name prefill.
  - **NOT verified — real-device gate before the show:** iOS audio autoplay + the tap-to-enable fallback; `dvh` vs Safari's collapsing toolbar; timeline ticking + duration from real metadata; a phone camera reading the QR off another screen; the reconnect fix on real network loss. Deploy: `npm ci` (pulls `qrcode`) + `npm run build` on the VPS; nginx catch-all already forwards `/qr.svg`.
- **Open for Symone:** R9 truncated in her PDF ("suitable for all mobile devices, ensure the ___"); R8 game-end (a)/(b) not chosen (proposal: the track is the game clock). **Decision for Yewen:** whether the conversation transcript should persist to disk (currently in-memory only).
- **Earlier (15 Jul 2026)** — Agent-workflow audit + dialogue reorg. The canonical twee is `src/data/twine/thebodyisobsolete.twee`; `npm test` is the dialogue drift gate. Full findings in `__context__/agent-workflow-audit-2026-07-15.md`; pre-reorg tag `pre-dialogue-reorg-2026-07-15`. Still open from then: the global `/Users/yewenjin/CLAUDE.md` restructure (needs sign-off); `src/data/twine/thebodyisobsolete.html` is a stale Dec-2025 archive; `__test__/*.test.js` are empty placeholders.
