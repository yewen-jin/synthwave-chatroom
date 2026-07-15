#!/usr/bin/env node
/**
 * Dialogue drift check.
 *
 * The show runs on public/data/dialogues/<story>.json, which is generated from
 * src/data/twine/<story>.twee. Nothing enforces that the two stay in step: the
 * JSON is a committed artefact, so an edited .twee (or a hand-edited JSON) can
 * silently diverge from what the server actually serves.
 *
 * This regenerates each story to a temp file and compares. It never writes to
 * public/ — regenerating the shipped dialogue stays a deliberate act
 * (`npm run build:dialogue`), so a pre-show edit can't rewrite the live script
 * behind your back.
 *
 * Exit 0 = in sync. Exit 1 = drift (or a story that fails to convert).
 */

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const TWINE_DIR = join(repoRoot, "src", "data", "twine");
const SHIPPED_DIR = join(repoRoot, "public", "data", "dialogues");
const CONVERTER = join(repoRoot, "scripts", "twee-to-json.js");

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

function nodeIds(jsonPath) {
  try {
    return Object.keys(JSON.parse(readFileSync(jsonPath, "utf-8")).nodes ?? {});
  } catch {
    return null;
  }
}

if (!existsSync(TWINE_DIR)) {
  console.error(red(`No Twine source directory at ${TWINE_DIR}`));
  process.exit(1);
}

const stories = readdirSync(TWINE_DIR).filter((f) => f.endsWith(".twee"));

if (stories.length === 0) {
  console.error(red(`No .twee files in ${TWINE_DIR}`));
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), "dialogue-check-"));
let drifted = false;

for (const story of stories) {
  const name = basename(story, ".twee");
  const source = join(TWINE_DIR, story);
  const shipped = join(SHIPPED_DIR, `${name}.json`);
  const regenerated = join(tmp, `${name}.json`);

  process.stdout.write(`${name}  `);

  if (!existsSync(shipped)) {
    console.log(red("MISSING"));
    console.log(`  ${source} has no shipped JSON at ${shipped}`);
    console.log(dim("  fix: npm run build:dialogue"));
    drifted = true;
    continue;
  }

  try {
    execFileSync("node", [CONVERTER, source, regenerated], { stdio: "pipe" });
  } catch (error) {
    console.log(red("CONVERT FAILED"));
    console.log(`  ${source} does not compile:`);
    console.log(dim(`  ${(error.stderr?.toString() || error.message).trim()}`));
    drifted = true;
    continue;
  }

  if (readFileSync(regenerated, "utf-8") === readFileSync(shipped, "utf-8")) {
    console.log(green("in sync"));
    continue;
  }

  console.log(red("DRIFT"));
  drifted = true;

  const fresh = nodeIds(regenerated);
  const live = nodeIds(shipped);

  if (fresh && live) {
    const added = fresh.filter((id) => !live.includes(id));
    const removed = live.filter((id) => !fresh.includes(id));
    console.log(
      `  twee: ${fresh.length} nodes / shipped: ${live.length} nodes`,
    );
    if (added.length)
      console.log(
        `  in twee, not shipped:  ${added.slice(0, 5).join(", ")}${added.length > 5 ? ` (+${added.length - 5} more)` : ""}`,
      );
    if (removed.length)
      console.log(
        `  shipped, not in twee:  ${removed.slice(0, 5).join(", ")}${removed.length > 5 ? ` (+${removed.length - 5} more)` : ""}`,
      );
    if (!added.length && !removed.length)
      console.log(
        dim("  same nodes — message text, timing, or metadata differs"),
      );
  }
  console.log(
    dim(
      `  fix: npm run build:dialogue    (regenerates ${name}.json for the show)`,
    ),
  );
}

if (drifted) {
  console.log(
    `\n${red("Dialogue drift detected.")} The shipped dialogue does not match its Twine source.`,
  );
  console.log(
    dim(
      "Run `npm run build:dialogue` to sync, then restart nothing — it lands on the next transmission.",
    ),
  );
  process.exit(1);
}

console.log(`\n${green("All dialogue in sync with Twine source.")}`);
