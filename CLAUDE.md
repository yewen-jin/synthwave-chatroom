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
- Ask before anything irreversible — this repo backs a live performance.
- Verify by running the app, not by citing empty tests.
- British English in prose and docs.

## Current status

_Update at the end of each session: what's done, what's next, any blocker._

- 15 Jul 2026 — Agent-workflow audit + dialogue reorg. The documented Twine→JSON pipeline was dead end-to-end; the live source (`scripts/thebodyisobsoleteFV.twee`) is now canonical at `src/data/twine/thebodyisobsolete.twee`, the stale draft and unread `src/data/dialogues/` output are deleted, and `npm test` is now a real gate (dialogue drift check) instead of empty files. Verified: the canonical twee regenerates `public/data/dialogues/` byte-identically. Full findings in `__context__/agent-workflow-audit-2026-07-15.md`. Pre-reorg state: git tag `pre-dialogue-reorg-2026-07-15`.
- **Open:** (1) the global `/Users/yewenjin/CLAUDE.md` restructure — needs sign-off, touches other repos (see the audit's "fix the global routing"); (2) `src/data/twine/thebodyisobsolete.html` is a stale Dec-2025 Twine archive — re-export or delete; (3) `__test__/*.test.js` are empty placeholders — fill or remove.
