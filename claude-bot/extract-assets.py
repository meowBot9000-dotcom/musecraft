#!/usr/bin/env python3
"""
Extract the textures MuseCraft's stream overlay needs from YOUR OWN
Minecraft 1.21.6 client jar.

Why: the overlay renders the real in-game HUD sprites, item/block icons and
the player skin. Those textures are Mojang/Microsoft property, so they are
NOT distributed with MuseCraft. This script pulls them out of a client jar
you already own (from your Minecraft installation) into ./assets/ next to
bot.cjs, which is where the overlay serves them from.

Usage:
    python3 extract-assets.py /path/to/client-1.21.6.jar

Finding your client jar:
  * Official launcher (Windows): %APPDATA%\\.minecraft\\versions\\1.21.6\\1.21.6.jar
  * Official launcher (macOS):   ~/Library/Application Support/minecraft/versions/1.21.6/1.21.6.jar
  * Official launcher (Linux):   ~/.minecraft/versions/1.21.6/1.21.6.jar
  * Or ask the piston-meta manifest for the official client download:
    https://piston-meta.mojang.com/mc/game/version_manifest_v2.json
    (version 1.21.6 -> "url" -> downloads.client.url; verify downloads.client.sha1)
"""
import os
import sys
import zipfile

JAR_PREFIX = "assets/minecraft/textures/"

# (path inside the jar's textures/ tree, destination dir relative to assets/)
COPY_TREES = [
    ("item/", "item"),                    # flat item icons (swords, picks, food...)
    ("block/", "block"),                  # block faces (rendered as 3D cubes in hand)
    ("gui/sprites/hud/", "hud"),          # hearts, hunger, xp bar, hotbar, crosshair...
]
COPY_FILES = [
    ("entity/player/wide/steve.png", "entity/player/wide/steve.png"),
]

REQUIRED = [
    "hud/heart/full.png",
    "hud/food_full.png",
    "hud/experience_bar_background.png",
    "item/stone_sword.png",
    "block/dirt.png",
    "entity/player/wide/steve.png",
]


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    jar_path = sys.argv[1]
    here = os.path.dirname(os.path.abspath(__file__))
    out_root = os.path.join(here, "assets")

    count = 0
    with zipfile.ZipFile(jar_path) as jar:
        names = set(jar.namelist())
        for src_dir, dst_dir in COPY_TREES:
            prefix = JAR_PREFIX + src_dir
            for name in names:
                if not name.startswith(prefix) or not name.endswith(".png"):
                    continue
                rel = name[len(prefix):]
                dest = os.path.join(out_root, dst_dir, rel)
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                with open(dest, "wb") as fh:
                    fh.write(jar.read(name))
                count += 1
        for src_rel, dst_rel in COPY_FILES:
            name = JAR_PREFIX + src_rel
            if name not in names:
                print(f"WARNING: {name} not found in jar, skipped")
                continue
            dest = os.path.join(out_root, dst_rel)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with open(dest, "wb") as fh:
                fh.write(jar.read(name))
            count += 1

    missing = [r for r in REQUIRED if not os.path.exists(os.path.join(out_root, r))]
    print(f"Extracted {count} textures into {out_root}")
    if missing:
        print("MISSING REQUIRED FILES (wrong jar/version?):")
        for m in missing:
            print("  -", m)
        sys.exit(1)
    print("All required overlay textures present.")


if __name__ == "__main__":
    main()
