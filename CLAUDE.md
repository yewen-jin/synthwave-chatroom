# CLAUDE.md

This project's instructions live in **`AGENTS.md`** — one file, shared by every agent that reads this repo. Don't duplicate its content here; edit `AGENTS.md` instead.

@AGENTS.md

## Scope correction (read this first)

An ancestor file at `/Users/yewenjin/CLAUDE.md` is loaded automatically into sessions in this repo because Claude Code collects `CLAUDE.md` from the working directory up to the filesystem root. **It describes other projects and does not apply here.** Specifically, ignore all of the following when working in this repo:

- **SvelteKit / Svelte / SCSS / Tailwind guidance** — this is plain HTML/JS + Vite, no framework.
- **`npm run check`, `npm run lint`, `npm run format`, `npm run test:unit`** — none of these scripts exist in this `package.json`. Do not attempt them as gates.
- **"Node.js >=20.9.0 required"** — this project's `package.json` declares `>=18.0.0`.
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

## Current status

_Update at the end of each session: what's done, what's next, any blocker._

- 15 Jul 2026 — Agent-workflow audit + dialogue reorg. The documented Twine→JSON pipeline was dead end-to-end; the live source (`scripts/thebodyisobsoleteFV.twee`) is now canonical at `src/data/twine/thebodyisobsolete.twee`, the stale draft and unread `src/data/dialogues/` output are deleted, and `npm test` is now a real gate (dialogue drift check) instead of empty files. Verified: the canonical twee regenerates `public/data/dialogues/` byte-identically. Full findings in `__context__/agent-workflow-audit-2026-07-15.md`. Pre-reorg state: git tag `pre-dialogue-reorg-2026-07-15`.
- **Open:** (1) the global `/Users/yewenjin/CLAUDE.md` restructure — needs sign-off, touches other repos (see the audit's "fix the global routing"); (2) `src/data/twine/thebodyisobsolete.html` is a stale Dec-2025 Twine archive — re-export or delete; (3) `__test__/*.test.js` are empty placeholders — fill or remove.
