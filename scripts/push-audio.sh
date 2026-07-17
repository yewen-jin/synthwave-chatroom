#!/usr/bin/env bash
# push-audio.sh — push audio-assets/ to the VPS with rsync.
#
# audio-assets/ is gitignored by design (Symone's re-exports never enter git
# history), so neither git nor the CI build branch carries it — this is the
# one deploy artifact that travels outside git. It complements the GitHub
# Action, not competes with it: CI ships code + dist via the build branch,
# this ships the music. The VPS-side update-vps.sh never touches the result
# (git reset --hard leaves ignored files alone), so once pushed it survives
# every deploy.
#
# Deliberately no --delete: a stale track left on the VPS is harmless, a
# vanished one before a show is not. Delete remote files by hand if needed.
#
# Usage:
#   VPS_HOST=yewen@1.2.3.4 ./scripts/push-audio.sh
#   VPS_HOST=myalias     ./scripts/push-audio.sh   # alias from ~/.ssh/config
#
# Config (environment variables):
#   VPS_HOST   — required. user@host of the VPS, or an ssh alias
#   REMOTE_DIR — where the tracks live on the VPS

set -euo pipefail

vps_host="${VPS_HOST:?Set VPS_HOST, e.g. VPS_HOST=yewen@1.2.3.4 ./scripts/push-audio.sh}"
remote_dir="${REMOTE_DIR:-/home/yewen/voidspace/Void-Space-Chatroom/audio-assets}"
local_dir="$(cd "$(dirname "$0")/.." && pwd)/audio-assets"

if [ ! -d "$local_dir" ]; then
  echo "No local audio-assets/ — run 'npm run make:audio' or add a track first."
  exit 1
fi

# Trailing slash on the source = copy the directory's *contents*, not the
# directory itself. No -z: WAVs barely compress, and the VPS CPU is cheap
# to spare.
rsync -av --progress "$local_dir/" "$vps_host:$remote_dir/"

echo "Done — no server restart needed (currentTrack() reads the dir fresh)."
echo "Refresh the room page and 'begin conversation' will enable."
