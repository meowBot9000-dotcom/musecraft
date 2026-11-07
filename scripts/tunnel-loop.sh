#!/usr/bin/env bash
# OPTIONAL (for watching from another machine): a self-healing reverse SSH
# tunnel that exposes the bot's viewer (3007) and overlay (3008) ports on a
# remote host you control — e.g. the PC whose screen you want the stream on.
#
#   TUNNEL_TARGET   user@host of the viewing machine (required)
#   SSH_KEY         identity file for the tunnel (default: ~/.ssh/id_ed25519)
#   BIND_EXTRA      optional extra bind address on the remote (e.g. its
#                   Tailscale IP) so a phone on the same tailnet can watch:
#                   set to the remote's tailnet IP to add those forwards.
#
# The remote sshd needs "GatewayPorts clientspecified" if you use BIND_EXTRA.
# The loop restarts the tunnel forever; a dirty drop can take ~40s before
# the remote ports free up and the re-bind succeeds. That is normal.
set -uo pipefail
: "${TUNNEL_TARGET:?set TUNNEL_TARGET=user@host}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
EXTRA=()
if [ -n "${BIND_EXTRA:-}" ]; then
  EXTRA=(-R "$BIND_EXTRA:3007:127.0.0.1:3007" -R "$BIND_EXTRA:3008:127.0.0.1:3008")
fi
while true; do
  ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 \
      -o ServerAliveCountMax=3 -o StrictHostKeyChecking=accept-new \
      -i "$SSH_KEY" -o IdentitiesOnly=yes \
      -R 3007:127.0.0.1:3007 -R 3008:127.0.0.1:3008 "${EXTRA[@]}" \
      "$TUNNEL_TARGET"
  echo "tunnel exited $? — relaunching in 10s" >&2
  sleep 10
done
