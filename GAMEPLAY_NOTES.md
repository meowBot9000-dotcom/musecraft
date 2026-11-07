# GAMEPLAY_NOTES.md — how not to die

Hard-won lessons from the first MuseCraft run (24 deaths in 31 days).
Each one cost a corpse run. Read them before your first night.

## 1. The command queue is a loaded gun

Commands run **sequentially** through a promise queue. Three facts that
will kill you if you forget them:

- `stop`, `state`, `think` bypass the queue and act immediately.
  Everything else waits its turn — including when you're dead.
- **`stop` does NOT clear the queue.** Pending `goto`/`dig` commands
  survive your death and execute on your freshly respawned body. A
  queued trek will drag your naked respawn straight back into whatever
  killed you. This caused an 8-death loop in one night.
- **The only way to clear the queue is to restart the bot process.**
  After ANY death: restart the bot first, then decide what to do.

## 2. Verify everything numerically

The pathfinder's arrival cell varies ±1 cell between identical commands,
and a `goto` can report success while leaving the bot floating, wedged,
or one cell past the target — including inside a wall or under water.

- After every arrival that matters, check `/state`: `pos.y` must equal
  the floor you expect, `onGround` true, HP stable across two reads.
- If `pos.y` is below the expected floor, the bot is wedged or sinking.
  Back out immediately. Do not queue more commands "to see".
- HP that sawtooths (regenerating, then −2, then regenerating) means the
  bot is taking damage *right now* — drowning or suffocating. Interrupt
  everything; find out why before doing anything else.

## 3. Death piles despawn — grab first, scout later

Dropped items vanish after **6000 ticks (~5 real minutes) in loaded
chunks**. Unloaded chunks pause the clock — so a distant pile is safe
until you approach it, and your approach starts the countdown.

- On a corpse run, go *straight* to the pile. Do not stop to screenshot,
  scout, or verify "one quick thing" with the pile's chunks loaded.
  (One pile — a full stone kit — despawned during a 3-minute photo
  scout of the room it was lying in.)
- Write the pile's coordinates and contents in PROGRESS.md the moment
  you die, from the last `/state` you have.

## 4. Water is a silent killer underground

- A flooded staircase or cave cell **drowns** the bot: it sinks to the
  floor, and the pathfinder cannot climb a 2-block step while swimming,
  so it sits on the bottom and dies. The damage looks exactly like
  suffocation — check the server log for the true cause
  (`drowned` vs `suffocated` vs `was slain by`).
- Never send a `goto` into a below-ground cell you have not seen.
  Scout first: stand in a verified-safe stance, `look` at the target,
  and screenshot the overlay view. Water renders bright blue. You'll
  see it.
- Items *float* in water. Surface-floating items can often be vacuumed
  from the last dry stance at the water's edge — try before swimming.
- If you must fix a flooded passage, dig a **bypass** column beside it
  and leave a solid wall between you and the water at its level. Don't
  dig into the water cell itself.

## 5. Rain changes everything

- In rain, undead don't burn. Zombies and skeletons roam the surface
  all day, including at the spawn point.
- **Never trek naked in the rain.** Burrow, wait for clear daylight.
- A zombie that aggroes during a multi-hop trek may follow you across
  hops; damage between waypoints means stop and deal with it (or dig
  in), not "one more hop".

## 6. Night protocol

- Be somewhere safe *before* ~12000 ticks: a 3-deep burrow (dig straight
  down where you stand) or a pre-dug shelter you trust.
- Sealing a 1×1 pit from inside with `place` does not work reliably.
  Depth is your seal: 3+ blocks down, mobs mostly lose interest.
- Mobs can fall into your pit. One skeleton spent a night in the cell
  next to mine, shooting the wall between us. Adjacent ≠ safe — keep
  digging down if something lands on your level.
- `attack` **paths toward its target** (it once dug me out of a safe
  pit chasing a skeleton across the map). Never use it as a panic
  button; it's for deliberate hunting on open, flat ground.
- Fists lose to zombies. If you have no weapon and something finds you,
  dig or run — don't trade hits.

## 7. Pathfinder terrain rules

- Long cross-country `goto`s "descend" in ~5-block drops and cut
  corners through hazards. Travel as a chain of short hops between
  **known-safe waypoints** (write them in PROGRESS.md), on ground you've
  already crossed.
- Terraces, shelves and staircases are the worst terrain: the bot
  wedges under overhangs and suffocates. Dig staircases **one cell at a
  time from a verified stance**: dig the next cell's leg and head
  blocks first, then step in, then verify `pos.y` before digging on.
- `dig` paths the bot adjacent to the target block first. A `dig`
  queued before a death will walk your respawn toward it (see lesson 1).
- `collect` is slow, gives up on ledges and high blocks, and wanders.
  Prefer manual `dig` batches in confined spaces where drops land at
  your feet.

## 8. Drops and inventory desync

- Dug blocks drop **where the block was**, not on the bot. If you dig
  from a stance and leave, the drops stay behind (and start their
  despawn clock). Step onto the cell to vacuum them before moving on.
- Inventory displays can lie in both directions (updateSlot desync).
  Even a **successful** craft's own snapshot can be a phantom: the craft
  reports done, the snapshot shows the product, and a moment later the
  items do not exist. Ground truth is only a later, independent `state`
  read — verify every count your plan depends on with a fresh `state`
  before acting on it.

## 9. Regen is a food fire

Regeneration burns hunger fast. A bot at 20 HP with enemies nearby is
spending food to stay there. Keep food above ~17 in caves, eat before
descents, and treat "HP fine but food falling" as a retreat signal.

## 10. The run itself

- Keep the phases moving (see AGENT_SETUP.md §8), but survival first:
  a day spent re-kitting after a preventable death is the slowest
  progress there is.
- Narrate with `think` before and during work sequences — your user is
  watching you think, and a quiet bot reads as a stuck bot.
- Landmarks, stashes, safe cells, water, cave mouths: if it isn't in
  PROGRESS.md, you don't know it.

*Deaths so far, for calibration: 14 learning the world, 1 suffocation
that was really a drowning, 1 drowning that was reported as
suffocation, 8 in one rainy night to a command queue that wouldn't
die. Don't repeat them.*
