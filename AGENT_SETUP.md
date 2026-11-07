# AGENT_SETUP.md — the playbook

You are a Muse (or similar agent) whose user asked you to set up
MuseCraft so you can play Minecraft for them. This file is your complete
setup procedure. Follow it in order; every step ends with a verification.
Do not skip the verifications — this stack fails quietly in several
places, and each check below exists because of a real failure.

Total time: roughly 30–60 minutes, mostly downloads.

## 0. What you are building

```
                        stdin (line commands)
  You (the agent)  ───────────────────────────▶  bot.cjs ──▶ Minecraft server
                   ◀───────────────────────────         (vanilla 1.21.6,
                    stdout (tagged JSON events)          127.0.0.1:25565)
                                                              ▲
  User watches:  http://127.0.0.1:3008  (overlay: FP view +   │
                  real HUD + your thoughts feed)              │
                  http://127.0.0.1:3007  (prismarine-viewer) ──┘
```

- `bot.cjs` is a Mineflayer bridge that lives inside a Mindcraft
  checkout (for its node_modules). It needs **no LLM API key** — that is
  the point. Mindcraft's own AI loop stays off; you drive.
- Your harness must let you run long-lived background processes with a
  **writable stdin** and readable stdout. The bot is controlled entirely
  through that pipe.

## 1. Prerequisites

You need: a shell, `curl`, `git`, `python3`, ~2 GB free disk, ~2 GB RAM
headroom. Check what you have before installing anything.

## 2. Java 21 (for the server)

The vanilla 1.21.6 server needs Java 21. A portable Temurin JDK avoids
system package changes:

```bash
mkdir -p ~/tools && cd ~/tools
curl -fL -o jdk.tar.gz "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse"
tar xzf jdk.tar.gz   # creates jdk-21*/
~/tools/jdk-21*/bin/java -version   # verify: openjdk 21.x
```

(Adjust the Adoptium URL for your OS/arch. Any Java 21 works.)

## 3. Node 20 (for the bot) — NOT Node 24

Parts of the Mineflayer ecosystem fail to build/run on Node 24. Use a
portable Node 20:

```bash
cd ~/tools
curl -fL -o node.tar.xz "https://nodejs.org/dist/v20.20.2/node-v20.20.2-linux-x64.tar.xz"
tar xJf node.tar.xz  # creates node-v20.20.2-linux-x64/
~/tools/node-v20.20.2-linux-x64/bin/node --version   # verify: v20.x
```

Keep this Node's `bin/` on PATH for every bot-related command below.

## 4. The Minecraft server

```bash
cd server/
./download-server.sh          # official jar, SHA-1 verified against piston-meta
cp server.properties.template server.properties
echo "eula=true" > eula.txt   # only if your user accepts the Minecraft EULA
```

First boot test:

```bash
JAVA_HOME=~/tools/jdk-21* ../scripts/start-server.sh
# wait for "Done" in the log / port 25565 listening, then stop it (Ctrl-C / kill)
```

Notes:
- `online-mode=false` + `server-ip=127.0.0.1`: the bot uses offline auth.
  Never bind an offline-mode server to a public interface.
- The Yggdrasil/session-server SSL errors in the log are cosmetic in
  offline mode behind some proxies. Ignore them.
- The world persists in `server/world/`. Back it up before experiments.

## 5. Mindcraft + the bot

```bash
cd ~/tools   # or wherever you keep the checkout
git clone https://github.com/mindcraft-bots/mindcraft
cd mindcraft
git checkout e1c1fc3   # commit this setup was built/verified against
export PATH=~/tools/node-v20.20.2-linux-x64/bin:$PATH
npm install
```

Then copy the bridge in and extract the overlay textures:

```bash
cp -r /path/to/musecraft/claude-bot ./claude-bot
python3 claude-bot/extract-assets.py /path/to/client-1.21.6.jar
# verify: "All required overlay textures present."
```

- The client jar comes from the user's own Minecraft installation (see
  the extractor's docstring for paths, or the piston-meta client
  download). **Never redistribute the extracted assets** — they are
  Mojang's; `assets/` is gitignored in this repo for that reason.
- Mindcraft may want a `keys.json` for its own AI features. You are not
  using them; an empty/absent file is fine because you never start
  Mindcraft's main loop — only `claude-bot/bot.cjs`.

## 6. Launch (order matters)

1. Server (background): `scripts/start-server.sh` with `JAVA_HOME` set.
   Verify port 25565 is listening.
2. Bot (background, stdin attached):
   `MINDIR=~/tools/mindcraft scripts/start-bot.sh`
   with the Node 20 PATH from step 3. Env knobs: `MC_USER` (in-game
   name, default `MuseCraft`), `MC_HOST/MC_PORT`, `HUD_PORT` (3008),
   `VIEW_PORT` (3007).
3. Verify the bot connected:
   - Its stdout shows a `SPAWNED` JSON line with position/inventory.
   - `curl http://127.0.0.1:3008/state` returns JSON state.
   - The server log shows the bot joining.

First commands to send on stdin (one per line):

```
state
think Hello — MuseCraft is live. First day: wood, then stone, then shelter before dark.
near oak_log 32
```

## 7. Optional: let the user watch from another screen

Local viewing needs nothing else — the overlay is at
`http://127.0.0.1:3008` on the machine running the bot.

For a second machine (typically the user's Windows PC):

1. Run `scripts/tunnel-loop.sh` with `TUNNEL_TARGET=user@pc` — a
   self-healing reverse SSH tunnel forwarding 3007/3008.
2. On the Windows PC, run `windows/Setup-Kiosk.ps1` once (elevated),
   then `Start-ScheduledTask -TaskName MCBotView` to open the stream
   fullscreen in Edge. The other tasks (MCFocus/MCShot/MCWins) let you
   raise the window and screenshot it to verify what the user sees —
   over SSH you cannot see desktop windows any other way.
3. Phone: on the same Tailscale tailnet, run the tunnel with
   `BIND_EXTRA=<pc-tailnet-ip>` (the PC's sshd needs
   `GatewayPorts clientspecified`) and open `http://<pc-tailnet-ip>:3008/`
   directly in the phone browser. Do **not** embed the HTTP overlay in an
   HTTPS page/iframe — browsers block it as mixed content; a direct page
   load works.

After changing the overlay page itself, restart the browser on the
viewing machine — Edge caches the page HTML.

## 8. Operating the run

- **You are the player.** Read `GAMEPLAY_NOTES.md` before your first
  night. Seriously — it is a list of verified ways to die.
- Keep a `PROGRESS.md` journal in your workspace: position landmarks,
  safe shelters, stash locations, deaths and their causes, current
  phase. Your memory of the world lives there, not in your head.
- Narrate through `think` — the user is watching the thoughts feed, not
  your chat. Keep chat for milestones (first iron, first diamond, portal
  lit, dragon dead) and for anything that needs their decision.
- Phases (from the community "complete main adventure" route):
  wood → stone kit → iron kit (~33 ingots: armor 24 + sword, pick,
  shield, bucket) → diamonds (first 3 = pickaxe) → ≥10 obsidian +
  flint & steel → Nether (blaze rods ≥7, ender pearls 15–20) → eyes of
  ender → stronghold → End portal → kill the Ender Dragon (destroy all
  10 crystals first; bring a bow + ~128 arrows, ≥32 food, ~2 stacks of
  blocks, a water bucket).

## 9. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Native module build errors during `npm install` | Wrong Node. Use Node 20 (step 3) and retry. |
| Server won't start, mentions EULA | Create `eula.txt` with `eula=true` (step 4). |
| Bot can't connect / connection refused | Server not up yet, or wrong port. Check 25565 is listening; check `MC_PORT`. |
| Overlay page loads but no textures (magenta/broken icons) | Assets not extracted, or extracted from the wrong version jar. Re-run the extractor with a 1.21.6 client jar. |
| `goto` "succeeds" but the bot is somewhere odd | Normal pathfinder variance (±1 cell). Always verify with `/state` — see GAMEPLAY_NOTES. |
| Crafting says "missing ingredients" you know you have | Inventory display desync. Trust the inventory snapshot printed by a *successful* craft; see GAMEPLAY_NOTES. |
| Stream view on the PC didn't update after a code change | Edge cached the page. Kill `msedge`, re-run MCBotView. |
| Tunnel forwards fail right after a drop | Ports take ~40 s to free. The loop retries forever; wait. |
| Bot ignores `stop` and keeps walking later | `stop` doesn't clear the command queue. Restart the bot process — see GAMEPLAY_NOTES, lesson 1. |

## 10. Safety rails

- Survival, no cheats: no console commands, no gamemode switches. The
  run is legit or it doesn't count.
- The server stays on localhost (or behind the user's own tunnel).
- Do not publish the extracted `assets/`, the world, or the server jar.
- Everything you do in the world is visible on the user's stream. Play
  like it.
