# Agent Workflow Audit — 15 Jul 2026

Audit of how agent instructions are configured for `synthwave-chatroom`, and what to change. Every claim below was verified against the repo on the date above; the commands used are given so they can be re-run.

---

## The headline

**The documented dialogue pipeline is dead. Following it changes nothing about the show, while reporting success.**

`AGENTS.md` told agents:

```bash
node scripts/twee-to-json.js src/data/twine/<story>.twee src/data/dialogues/<story>.json
```

Every path in that command is wrong:

|          | Documented                                                          | Actual                                                                              |
| -------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Source   | `src/data/twine/thebodyisobsolete.twee` (Dec 2025 draft, 78 nodes)  | `scripts/thebodyisobsoleteFV.twee` (Feb 2026, 112 nodes)                            |
| Output   | `src/data/dialogues/…json` (71 nodes, hand-edited, read by nothing) | `public/data/dialogues/…json` (112 nodes)                                           |
| Consumer | —                                                                   | `server.js` → `loadDialogueData()` ~line 87 reads **only** `public/data/dialogues/` |

**Evidence.** Regenerating from the FV twee produces output **byte-identical** to the committed `public/` JSON:

```bash
node scripts/twee-to-json.js scripts/thebodyisobsoleteFV.twee /tmp/regen_FV.json
diff -q /tmp/regen_FV.json public/data/dialogues/thebodyisobsolete.json   # identical
```

Both were last committed in the same commit (`b57c370`, 23 Feb 2026). The `src/` twee was last touched in `f267a27` "add draft to twine folder" (21 Dec 2025) — it is a draft. The `src/` JSON was last touched 23 Dec 2025 by hand-edit commits ("Fix Liz says:", "corrected typo") and carries a `description` field that neither twee produces — i.e. it is hand-edited generated output, the one thing the pipeline forbids.

**Why this is the worst kind of wrong:** an agent following `AGENTS.md` would edit a stale draft, run the converter, watch it print `✓ Successfully converted … 78 nodes`, "verify" with a test that passes vacuously (see below), and report the dialogue updated — while the live show ran unchanged off a different file. Nothing errors. Nothing warns.

The frontend never fetches dialogue JSON (`grep` over `src/js/*.js` and `src/*.html` finds no reference); the server pushes each message over Socket.IO. So `src/data/` is vestigial for dialogue purposes entirely.

Usefully for show ops: `loadDialogueData()` has a single call site, inside `startDialogue()` (server.js:129), which runs on each narrator trigger — there is no boot-time preload or cache. **A regenerated dialogue therefore takes effect on the next transmission, with no server restart**, and an in-flight transmission keeps the copy it started with.

---

## Finding 2 — The instruction files were routed wrong

**`/Users/yewenjin/CLAUDE.md` is loaded into every session in this repo, and it is about other projects.**

Claude Code collects `CLAUDE.md` from the working directory up to the filesystem root. That file sits in the **home directory**, so it is picked up as an ancestor for every repo under `/Users/yewenjin/`. This session's context labelled it "project instructions, checked into the codebase" — it is checked into nothing; it is a stray home-directory file.

Result, before this audit:

- **155 lines loaded** about `skopetur-frontend` (SvelteKit/SCSS/Vitest), `hydra-server`, `Prefect` (.NET/Azure) — none of them this project.
- **0 lines loaded** about this project. `AGENTS.md` (24 lines, the only accurate file) was untracked and **did not appear in context at all**.
- `~/.claude/CLAUDE.md` — the actual user-scope location — **does not exist**.

Concrete conflicts this caused: the global file instructs "Always run `npm run check` before committing" and lists `npm run lint` / `format` / `test:unit` — **none of these scripts exist here**. It declares Node `>=20.9.0`; this `package.json` says `>=18.0.0`.

## Finding 3 — A test gate that lies

`AGENTS.md` and `.github/copilot-instructions.md` both said to verify with `node __test__/server.test.js`.

```bash
$ wc -l __test__/*
       0 __test__/dialoguecontroller.test.js
       0 __test__/main.test.js
       0 __test__/server.test.js
$ node __test__/server.test.js; echo $?
0
```

All three files are **0 bytes**. The command exits 0 because there is nothing to run. `jest` ^30.2.0 is installed as a devDependency, but there is **no `test` script** in `package.json` and no jest config — nothing ever invokes it. A green exit code here is proof of nothing, and an agent citing it is reporting a verification that never happened.

## Finding 4 — Three instruction files, one origin story

`.github/copilot-instructions.md` (228 lines) is titled **"Copilot Instructions - Void Space Chatroom"** — a different project, which the global file lists separately. This repo is a fork of Void-Space-Chatroom whose instruction files were only partially re-homed: `AGENTS.md` got rewritten, `copilot-instructions.md` never did. It still documents the dead `src/data/` pipeline and the empty-test gate, so it is stale by origin — it should be deleted or rewritten as a pointer, not merged.

So the repo carried 407 lines of instructions across three files: one accurate-but-unloaded, one about other projects, one about a different project.

## Finding 5 — Flagged, not resolved

- **Two divergent `.twee` files.** `scripts/thebodyisobsoleteFV.twee` (112 nodes) is demonstrably the live source, but `scripts/` is not a sensible permanent home for the authored script. `src/data/twine/` is the sensible home and holds a stale draft. Only you can decide which is canonical going forward — it's your text.
- **Possible `dist/` collision (unverified).** `vite.config.js` sets `root: "src"`, `publicDir: "../public"`, and a `viteStaticCopy` target of `src: "data", dest: "."`. Both `public/data/` and `src/data/` therefore appear to land on `dist/data/`. Since `server.js` always reads the repo's `public/` directly, this likely doesn't affect the show, but it is worth confirming that the build isn't shipping a stale 71-node dialogue into `dist/`.
- **`.gitignore` has no `.claude/` entry**, so `.claude/settings.local.json` (machine-local permissions) can be committed by accident.

---

## What was changed

1. **`AGENTS.md` — corrected.** The Dialogue Data section now documents the real pipeline, the operational facts (no restart needed; next transmission picks it up), the deliberate no-auto-sync choice, and a **What NOT to do** ban list. The fake test gate is replaced with an explicit statement of what `npm test` does and does not prove.
2. **`CLAUDE.md` — created.** Imports `AGENTS.md` via `@AGENTS.md` so there is one source of truth for every agent, and adds a **scope correction** naming the ancestor guidance to ignore, plus a living status footer.
3. **Dialogue layout — reorganised** (your call, 15 Jul 2026). `scripts/thebodyisobsoleteFV.twee` → `src/data/twine/thebodyisobsolete.twee` (canonical); the Dec-2025 draft it replaces and the unread `src/data/dialogues/` output are deleted. **Verified after the move:** the canonical twee regenerates `public/data/dialogues/thebodyisobsolete.json` byte-identically (112 nodes), and the twee is byte-identical to the committed FV file — no content changed, only location. Recoverable at git tag `pre-dialogue-reorg-2026-07-15`.
4. **A real gate — added.** `scripts/check-dialogue.js` regenerates each `src/data/twine/*.twee` to a temp file and diffs it against the shipped JSON, reporting drift with the specific node IDs that differ. It never writes to `public/`. Wired as `npm run check:dialogue` and as **`npm test`** — replacing empty files that always exited 0 with a gate that tests something real. `npm run build:dialogue` performs the deliberate regeneration.

   Exercised end-to-end, not just written: in-sync → exit 0; a passage appended to the twee → exit 1 naming `drift_test_passage` (113 vs 112 nodes); restored → exit 0. `build:dialogue` confirmed idempotent (regenerates byte-for-byte, git stays clean).

**Why a detector rather than an auto-sync hook:** a `PostToolUse` hook regenerating on every `.twee` save makes drift impossible, but means a typo fix 30 minutes before a performance silently rewrites the shipped script. Regeneration stays deliberate; the check tells you when you owe one.

Note the repo-local `CLAUDE.md` does _not_ stop the home-directory file loading — Claude Code merges ancestor files rather than overriding them. The scope-correction section is a mitigation; the fix is below and needs your sign-off because it touches other repos.

## Recommended: fix the global routing

This is a **cross-repo migration** — skopetur, hydra, and Prefect sessions currently get their command references from that home-directory file, accidentally or not. Stripping it means distributing per-project content into each of those repos first. Suggested shape:

```bash
# 1. Move the genuinely global content to the real user-scope location
#    (keep only: platform, British English, verification habits, model-check rule — ~10 lines)
mkdir -p ~/.claude && $EDITOR ~/.claude/CLAUDE.md

# 2. Distribute the per-project sections into the repos they describe
#    skopetur-frontend/CLAUDE.md, hydra-server/CLAUDE.md, Prefect/CLAUDE.md

# 3. Delete the stray ancestor file once its content has a home
rm /Users/yewenjin/CLAUDE.md
```

Rule of thumb going forward: **`~/.claude/CLAUDE.md` for how you work; `<repo>/CLAUDE.md` for how a repo works. Never a `CLAUDE.md` in a directory that is merely an ancestor of your repos.**

## Still open

- **`src/data/twine/thebodyisobsolete.html`** — the Dec-2025 Twine archive, now older than the `.twee` beside it. Opening it in Twine yields the draft, not the current script. Re-export from Twine or delete.
- **`.github/copilot-instructions.md`** — stale by origin (titled "Void Space Chatroom"; line 118 still cites `src/data/dialogues/*.json`, now deleted). Delete it, or reduce it to a pointer at `AGENTS.md`. This is the last instruction file still describing the dead pipeline as current.
- **`__context__/SESSION_SUMMARY.md`** (lines 168, 267, 302) also names the dead paths. It's a dated historical record, so it was left as-is rather than rewritten — but an agent reading `__context__/` could mistake it for current. Worth a one-line "historical — see AGENTS.md for the current pipeline" header at the top.
- **`scripts/README.md` — fixed in passing.** It documented the dead `src/data/dialogues/` output _and_ a `require("./src/data/dialogues/episode2.json")` server edit that doesn't match `server.js` (which reads `public/data/dialogues/${dialogueId}.json` per trigger — no hardcoded filename, no `require`). Its link to `interaction.md` was also broken (`../interaction.md`; the file is in `__context__/`). Now corrected.
- **`__test__/*.test.js`** — three empty placeholders. Now that `npm test` runs the drift check, they're orphaned. Fill or remove them.
- **`.gitignore` has no `.claude/` entry** — `.claude/settings.local.json` can be committed by accident. Add `.claude/settings.local.json`.
- **The `dist/` collision** described above — worth confirming the build isn't shipping stale dialogue.

## Principle worth keeping

Every finding here is the same failure: **an instruction that describes a system that no longer exists.** The dead pipeline, the home-directory `CLAUDE.md`, the fork's copilot file, the empty tests — each was true once. None failed loudly when it stopped being true.

So the durable habit isn't "write better docs", it's **make the doc's claims executable**. `npm test` now fails if the dialogue claim goes stale. The equivalent for the rest: prefer a checked assertion over a described one, and when you can't check it, date it and say how it was verified — as the Dialogue Data section in `AGENTS.md` now does.
