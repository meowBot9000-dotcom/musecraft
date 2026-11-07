#!/usr/bin/env bash
# Download the official Minecraft 1.21.6 server jar from Mojang and verify
# its SHA-1 against the official piston-meta manifest. Nothing here is
# redistributed Minecraft content: this fetches Mojang's own file from
# Mojang's own servers, the same file the official launcher ecosystem uses.
set -euo pipefail
cd "$(dirname "$0")"

VERSION="${1:-1.21.6}"
MANIFEST="https://piston-meta.mojang.com/mc/game/version_manifest_v2.json"

echo "Resolving $VERSION from the official version manifest..."
read -r URL SHA1 < <(python3 - "$MANIFEST" "$VERSION" << 'PYEOF'
import json, sys, urllib.request
manifest_url, version = sys.argv[1], sys.argv[2]
with urllib.request.urlopen(manifest_url) as fh:
    manifest = json.load(fh)
entry = next(v for v in manifest["versions"] if v["id"] == version)
with urllib.request.urlopen(entry["url"]) as fh:
    info = json.load(fh)
server = info["downloads"]["server"]
print(server["url"], server["sha1"])
PYEOF
)

echo "Downloading: $URL"
curl -fL -o server.jar "$URL"
echo "$SHA1  server.jar" | sha1sum -c -
echo "OK: server.jar verified (sha1 $SHA1)"
