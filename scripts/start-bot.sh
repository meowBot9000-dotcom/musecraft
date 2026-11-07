#!/usr/bin/env bash
# Start the MuseCraft bot inside a Mindcraft checkout.
# Layout expected:
#   <workspace>/mindcraft/          (git clone of mindcraft, deps installed)
#   <workspace>/mindcraft/claude-bot/bot.cjs   (copied from this repo)
# The bot reads line commands on stdin and prints tagged JSON on stdout.
# Env knobs (see bot.cjs): MC_HOST, MC_PORT, MC_USER, HUD_PORT, VIEW_PORT.
#
# IMPORTANT: use Node 20. Node 24 breaks some native deps in the
# mineflayer ecosystem. Point NODE_BIN at a Node 20 binary if your
# default node is newer.
set -euo pipefail
MINDIR="${MINDIR:-$(cd "$(dirname "$0")/../../mindcraft" && pwd)}"
NODE_BIN="${NODE_BIN:-node}"
cd "$MINDIR"
exec "$NODE_BIN" claude-bot/bot.cjs
