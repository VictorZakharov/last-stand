# `src/headless`

The fight with nothing drawn, for the dedicated server (`server/fight`): the game's own fight modules, built for Node
by `server/fight/vite.config.ts` with what draws, sounds or reads the page swapped out. The game's build never imports
anything here. The rules across the game are the [root AGENTS.md](../../AGENTS.md).

- `fight.ts`: the entry. `openFight` builds a battleground as the game builds it (its builder, its wall sealed, its
  props rolled from the room's seed: the same as every guest's), holds the heroes as partners' copies, and gives the
  fight's modules what they read of the arena, the camera, the local hero and the profile; `spawnFoes` a crowd,
  `beginWaves` a run (`game/run.ts` itself, its UI shown to no one), `stepFight` a step as the host's game steps the
  fight (`update` in `main.ts`: projectiles, burns, the run, the foes, their separation, effects, timers), and
  `strikeAround`, `continueAll` what the guests send (a hit dealt as `onGuestHits` deals it, a vote).
- `heroCopy.ts`: a hero as the server holds him, a partner's copy (`local` false), as a host's game holds a guest's:
  each game moves and judges its own hero, so what the fight would do to his life or body is his game's, and the copy
  takes it and leaves it. Only what the fight's modules read or call of a hero.
- `page.ts`: the little of a page the fight's modules read as they load (an address, a window's size, storage in
  memory, a blank canvas, an empty stylesheet), imported first. Nothing here draws.
- `swap/<path>`: a module standing in for `src/<path>` in the server's build alone (the plugin in
  `server/fight/vite.config.ts`), each export typed as the real one's (`typeof Real.name`), so the typecheck fails
  where the two drift apart and the bundler where a swap lacks an export the fight imports. A swap is for what draws,
  sounds or belongs to the local hero alone (his profile, his records, his ale); what the fight decides stays the
  game's own module. A gameplay function living in a drawing module is moved out to a light one instead (`inYard` to
  `data/village.ts`, `HERO_RADIUS` to `data/balance.ts`), the old module re-exporting it.

## Gotchas

- **The fight's state is module-wide** (`G` and its modules' own), so one fight runs to a thread: the server runs a
  room in a worker of its own. A room keeps some 35 MB of heap and holds 54 MB of the process with its worker's heap
  capped (`ROOM_LIMITS` in `tools/lab/node/fightRooms.mjs`), about 1% of a core at 20 steps a second (`lab fight`).
- **Nothing is posed for an eye**: the camera is far under the ground looking down (`unseeing`), so `inView` is false
  for every foe and none is animated. A boss's attack read from its bones (the Stag's antler tips, the Twins' throwing
  hand) reads them where they last were: to be measured against the game's before a boss is the server's.
- **A boss's code is a chunk loaded as it runs** (`entities/bosses.ts`): the loop must give its thread back (the
  server's tick, `lab fight`'s `TURN_EVERY`), or the import never lands and the boss never comes.
- **What's left for the server** (the dedicated server's step 1): a seeded random per room (the fight's `Math.random`
  is the page's), the server's process joining rooms as host (`server/fight`), and a boss's bones posed where its
  attacks read them.
