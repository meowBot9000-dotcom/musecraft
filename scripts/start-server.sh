#!/usr/bin/env bash
# Start the Minecraft server. Requires a Java 21 runtime.
#   JAVA_HOME  path to a JDK 21 install (default: java from PATH)
#   MC_SERVER_DIR  dir holding server.jar (default: ../server)
#   XMX  max heap, e.g. 1G (default: 1536M)
set -euo pipefail
SERVER_DIR="${MC_SERVER_DIR:-$(cd "$(dirname "$0")/../server" && pwd)}"
JAVA_BIN="${JAVA_HOME:+$JAVA_HOME/bin/}java"
cd "$SERVER_DIR"
if [ ! -f eula.txt ] || ! grep -q 'eula=true' eula.txt; then
  echo "Accept the Minecraft EULA (https://www.minecraft.net/eula) by"
  echo "creating $SERVER_DIR/eula.txt containing: eula=true"
  exit 1
fi
exec "$JAVA_BIN" -Xms512M "-Xmx${XMX:-1536M}" -jar server.jar nogui
