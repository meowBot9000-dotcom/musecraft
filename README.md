# MuseCraft

A complete, self-hosted setup that enables a Muse — or another capable LLM agent — to play Minecraft Java Edition on a real server, with a live first-person stream, an authentic in-game HUD, and a real-time feed of the agent's stated intentions.

MuseCraft is not a separate AI. There is no external model service and no API key: the agent itself operates the bot directly through a small command bridge, in the same way it operates any other tool. The project packages everything required to reproduce that setup: the bridge, the streaming overlay, the server configuration, a step-by-step setup playbook written for agents, and a set of gameplay notes recording the failure modes of a complete survival run.

**[Agent Setup](AGENT_SETUP.md)** | **[Gameplay Notes](GAMEPLAY_NOTES.md)** | **[Built on: Mindcraft](https://github.com/mindcraft-bots/mindcraft)**

> [!CAUTION]
> This setup is designed for a local, single-user environment. The Minecraft server runs in offline mode and binds to the loopback interface only. Do not expose the server, viewer, or overlay ports to a network you do not control: offline mode performs no account authentication. Game textures are the intellectual property of Mojang/Microsoft; they are not distributed with this repository and must be extracted from a legitimately owned client installation (see [NOTICE.md](NOTICE.md)).

![The MuseCraft overlay: first-person view, authentic 1.21.6 HUD, and the live intentions feed](docs/overview.png)

## Overview

The system has four components:

| Component | Description |
| --- | --- |
| Minecraft server | The official Mojang Java Edition 1.21.6 server, running locally in offline mode on `127.0.0.1:25565`. |
| Bot bridge | `claude-bot/bot.cjs` — a [Mineflayer](https://github.com/PrismarineJS/mineflayer) client that runs inside a [Mindcraft](https://github.com/mindcraft-bots/mindcraft) checkout and is driven by line-delimited commands on standard input. Commands execute sequentially through a promise queue; `stop`, `state`, and `think` bypass the queue and run immediately. |
| Viewer | A first-person renderer (prismarine-viewer) served on port `3007`. |
| Overlay | A web page served on port `3008` combining the first-person view, the client HUD reconstructed from the 1.21.6 client itself (hotbar, health, hunger, experience, selected-item label), a first-person arm and held-item render, and a panel displaying the agent's intentions in real time. A JSON state endpoint is exposed at `/state`. |

Intentions are first-class: before acting, the agent issues `think <text>`, which is displayed on the overlay as it works. A person watching the stream can therefore follow not only what the bot does, but what it is trying to do.

## Built on Mindcraft

MuseCraft is built on **[Mindcraft](https://github.com/mindcraft-bots/mindcraft)** (mindcraft-bots), the open-source framework for running LLM-driven agents in Minecraft on the Mineflayer stack. The relationship is structural, not incidental:

- **The bot runs inside a Mindcraft checkout.** Setup clones Mindcraft at a pinned commit (`e1c1fc3`) and installs the bridge into it; the bridge imports its modules — `mineflayer`, `mineflayer-pathfinder`, `mineflayer-collectblock`, `mineflayer-tool`, `mineflayer-pvp`, and `prismarine-viewer` — from Mindcraft's installed dependency tree.
- **What MuseCraft changes is the driver.** Mindcraft's own agent loop, bot profiles, and model integrations are not used: no API key is configured (`keys.json` remains empty) and code execution stays disabled (`allow_insecure_coding` remains `false`). In their place, the bridge exposes the bot to an external agent over standard input, and adds the streaming overlay, the reconstructed client HUD, and the intentions feed.
- **No Mindcraft code is vendored in this repository.** Mindcraft is cloned separately during setup and remains under its own MIT license; see [NOTICE.md](NOTICE.md). Credit for the underlying bot framework belongs to the Mindcraft team and the wider [PrismarineJS](https://github.com/PrismarineJS) ecosystem.

# Getting Started

## Requirements

- Minecraft Java Edition **1.21.6**, with a legitimate client installation available locally (required twice: the server verifies against the version manifest, and the overlay's textures are extracted from the client jar).
- **Node.js 20 LTS.** Node 24 is known to break native dependencies in the Mineflayer stack.
- **Temurin JDK 21** (or equivalent) to run the server.
- An agent capable of running shell commands and reading/writing files — for example, Muse. The setup playbook is written for the agent, not for manual installation.
- Approximately 2 GB of free RAM for the server and bot processes.

No LLM API key is required. The stock Mindcraft agent loop and its model profiles are not used; `keys.json` remains empty and `allow_insecure_coding` remains `false`.

## Install and Run

The intended installation method is to give the repository to an agent:

> Clone this repository and set up MuseCraft by following `AGENT_SETUP.md`.

The playbook covers, in order: portable installation of the JDK and Node.js runtimes; download of the official server jar with SHA-1 verification against Mojang's version manifest; server configuration; a pinned clone of Mindcraft (commit `e1c1fc3`); extraction of the client textures; launch order and verification at each stage; and optional remote viewing (reverse tunnel, Windows kiosk mode, and phone access), including the constraints that apply to each.

For reference, the manual sequence is:

1. Download and verify the server: `server/download-server.sh`
2. Configure the server from `server/server.properties.template`.
3. Extract textures from your client jar: `python3 claude-bot/extract-assets.py <path-to-client-1.21.6.jar>`
4. Start the server: `scripts/start-server.sh`
5. Start the bot: `scripts/start-bot.sh`
6. Open the overlay: `http://127.0.0.1:3008`

# Configuration

The bridge is configured through environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `MC_HOST` | `127.0.0.1` | Minecraft server host. |
| `MC_PORT` | `25565` | Minecraft server port. |
| `MC_USER` | `MuseCraft` | Offline-mode username the bot joins with. |
| `VIEW_PORT` | `3007` | First-person viewer port. |
| `HUD_PORT` | `3008` | Overlay and `/state` port. |

The server template enforces the properties the setup depends on — `online-mode=false`, `server-ip=127.0.0.1`, `spawn-protection=0` — and leaves world generation and difficulty at survival defaults. Gameplay is unmodified vanilla survival: no commands, no cheats.

# Repository Layout

| Path | Contents |
| --- | --- |
| `AGENT_SETUP.md` | The complete setup playbook, written for an agent to execute. |
| `GAMEPLAY_NOTES.md` | Operational lessons from a full survival run — pathfinder behaviour, item-despawn timing, weather and mob hazards, and the command-queue semantics that matter in play. |
| `claude-bot/bot.cjs` | The bot bridge and overlay server. |
| `claude-bot/extract-assets.py` | Extracts the HUD, item, block, and player textures the overlay needs from a client jar. |
| `server/` | Server download script (with checksum verification) and properties template. |
| `scripts/` | Launchers for the server and bot, and an optional self-healing reverse-tunnel loop for remote viewing. |
| `windows/Setup-Kiosk.ps1` | Optional: registers a fullscreen kiosk view, focus, screenshot, and window-listing tasks on a Windows viewing machine. |
| `docs/overview.png` | The overlay as it appears in use. |

# Gameplay Notes

The bridge's command set is deliberately small (`goto`, `dig`, `collect`, `craft`, `equip`, `attack`, `state`, and related verbs), which makes the operational lessons correspondingly important. [GAMEPLAY_NOTES.md](GAMEPLAY_NOTES.md) records them in full; the most consequential are:

- Verify the bot's Y coordinate numerically after every movement command. A bot below its expected floor is wedged or sinking, and digging in that state makes it worse.
- The command queue survives the bot's death. A respawned bot will resume executing stale movement commands unless the process is restarted — the queue has no clear operation.
- Dropped items despawn after 6,000 ticks in *loaded* chunks only. Recover death piles before doing anything else, and treat rain as a hard stop for surface travel: undead do not burn in rain.
- Inventory displays can desynchronise after failed crafts. The inventory snapshot returned by a *successful* craft is authoritative.

# Contributing

Issues and pull requests are welcome, particularly: corrections to the setup playbook from clean-room installations, overlay fidelity fixes against the reference client, and gameplay notes from other agents' runs. Please keep the security posture intact — loopback-only binding, offline mode for local use, and no redistribution of Mojang assets.

# License

The code in this repository is released under the [MIT License](LICENSE). This project is not affiliated with Mojang or Microsoft; Minecraft is a trademark of Mojang Synergies AB. Texture assets are extracted locally from the user's own client installation and are governed by the [Minecraft EULA](https://www.minecraft.net/eula) — see [NOTICE.md](NOTICE.md).
