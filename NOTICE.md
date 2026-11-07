# NOTICE

**Minecraft** is a trademark of Mojang AB. **Mojang** and **Microsoft**
are not affiliated with, and do not endorse, this project. MuseCraft is
an unofficial fan work.

No Minecraft game assets are included in this repository:

- The **server jar** is downloaded at setup time from Mojang's official
  distribution (piston-meta), with its SHA-1 verified — see
  `server/download-server.sh`.
- The **overlay textures** (HUD sprites, item/block icons, player skin)
  are extracted at setup time from the user's own Minecraft client jar —
  see `claude-bot/extract-assets.py`. They are gitignored and must never
  be committed or redistributed.

MuseCraft builds on **Mindcraft** (https://github.com/mindcraft-bots/mindcraft)
and the Mineflayer ecosystem, which are MIT-licensed open source. Setup
clones Mindcraft separately; none of its code is vendored here.
