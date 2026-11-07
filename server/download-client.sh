#!/usr/bin/env bash
# Download the official Minecraft 1.21.6 CLIENT jar from Mojang and verify
# its SHA-1 against the official piston-meta manifest. The overlay asset
# extractor (claude-bot/extract-assets.py) needs a client jar; use this
# when the machine has no Minecraft installation of its own. Nothing here
# is redistributed Minecraft content: this fetches Mojang's own file from
# Mojang's own servers, the same file the official launcher downloads.
set -euo pipefail
cd "$(dirname "$0")"

VERSION="${1:-1.21.6}"
MANIFEST="https://piston-meta.mojang.com/mc/game/version_manifest_v2.json"
OUT="client-$VERSION.jar"

echo "Resolving $VERSION from the official version manifest..."
read -r URL SHA1 < <(python3 - "$MANIFEST" "$VERSION" << 'PYEOF'
import json, sys, urllib.request
manifest_url, version = sys.argv[1], sys.argv[2]
with urllib.request.urlopen(manifest_url) as fh:
    manifest = json.load(fh)
entry = next(v for v in manifest["versions"] if v["id"] == version)
with urllib.request.urlopen(entry["url"]) as fh:
    info = json.load(fh)
client = info["downloads"]["client"]
print(client["url"], client["sha1"])
PYEOF
)

echo "Downloading: $URL"
curl -fL -o "$OUT" "$URL"
echo "$SHA1  $OUT" | sha1sum -c -
echo "OK: $OUT verified (sha1 $SHA1)"
echo "Extract overlay textures with: python3 claude-bot/extract-assets.py server/$OUT"
