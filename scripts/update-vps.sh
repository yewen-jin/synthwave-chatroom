#!/usr/bin/env bash
# update-vps.sh — pull the latest CI-built deploy on the VPS.
#
# The build branch is force-pushed by .github/workflows/build.yml on every
# push to main, so this script never merges: it snaps the checkout to the
# newest snapshot with `git fetch` + `git reset --hard` (never `git pull`).
# It then does only the work that snapshot actually needs:
#   - dependencies changed (package.json / package-lock.json) → npm install + restart
#     (a restart, not just the install: the running process still holds the
#     old dependency code in memory)
#   - server code changed (server.js / shared/)               → restart node
#   - dist/-only change                                       → nothing; live on next page load
#
# Usage:
#   ./scripts/update-vps.sh
#   RESTART_CMD="pm2 restart chatroom" ./scripts/update-vps.sh
#   RESTART_CMD="sudo systemctl restart chatroom" ./scripts/update-vps.sh
#
# Config (environment variables):
#   APP_DIR     — repo checkout on the VPS
#   BRANCH      — deploy branch to track (CI force-pushes this)
#   RESTART_CMD — how to restart the node server. Empty = print a reminder
#                 instead. Set it once in your shell profile or cron line.

set -euo pipefail

main() {
  local app_dir="${APP_DIR:-/home/yewen/voidspace/Void-Space-Chatroom}"
  local branch="${BRANCH:-build}"
  local restart_cmd="${RESTART_CMD:-}"

  cd "$app_dir"

  # The deploy only ever runs from the build branch — refuse to clobber a
  # checkout that is sitting on main or a detached HEAD.
  if [ "$(git branch --show-current)" != "$branch" ]; then
    echo "Switching to $branch branch..."
    git checkout "$branch"
  fi

  local old_head new_head
  old_head="$(git rev-parse HEAD)"

  git fetch origin
  git reset --hard "origin/$branch"

  new_head="$(git rev-parse HEAD)"

  if [ "$old_head" = "$new_head" ]; then
    echo "Already up to date (${new_head:0:7})."
    exit 0
  fi

  echo "Updated: ${old_head:0:7} -> ${new_head:0:7}"

  local deps_changed=false
  if ! git diff --quiet "$old_head" "$new_head" -- package.json package-lock.json; then
    echo "Dependencies changed — installing production dependencies..."
    npm install --omit=dev
    deps_changed=true
  fi

  # Restart on server-code changes AND on dependency changes: npm install
  # swaps the files on disk, but the running process keeps the dependency
  # code it already loaded. Without this, a deps-only deploy would install
  # and then misreport itself as a "dist/-only update".
  if ! git diff --quiet "$old_head" "$new_head" -- server.js shared/ || [ "$deps_changed" = true ]; then
    if [ -n "$restart_cmd" ]; then
      echo "Server code or dependencies changed — restarting with: $restart_cmd"
      $restart_cmd
    else
      echo "WARNING: server code or dependencies changed — restart the node process manually,"
      echo "or re-run with RESTART_CMD set (see script header)."
    fi
  else
    echo "dist/-only update — live on next page load, no restart needed."
  fi
}

# The script itself ships in the repo, so `git reset --hard` can replace it
# mid-run. Defining everything in main() makes bash parse the whole body
# before the reset can swap the file underneath it.
main "$@"
