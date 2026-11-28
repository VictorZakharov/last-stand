# `lab fight`

The fight as the dedicated server will run it: `npm run lab -- fight [--biome forest|crypt] [--foe id] [--count n]
[--rooms n] [--seconds s]`. No page, no browser: the command line builds the game's fight for Node
(`server/fight/vite.config.ts`: `src/headless/fight.ts`, the drawing side swapped out by `src/headless/swap/`), and
runs rooms side by side, each in a worker thread of its own (the fight's state is the game's module-wide `G`, one
fight to a thread), as the server will hold each room. A room builds its battleground as the game builds it (its wall
sealed, its props rolled from the room's seed), holds a hero's copy in the middle (a partner's, `local` false: blows
at him are judged on his own game), spawns the wave's foes in a ring 12 m out and steps the fight 20 times a second
(the snapshots' rate) for `--seconds`.

It says, a room a line, the bundle's load, the battleground's build, the step's median, 90th percentile and most, the
room's own heap kept (its garbage collected) and before, and how many of its foes alive came within 4 m of the hero;
then the step over every room, the share of a core a room keeps busy, and the process's memory with every room up and
collected. A room fails if fewer than 90% of its foes alive came to the hero (`CAME_SHARE`: one husk may be held
behind a crypt's prop, as in play). Its canary is a room with no hero, run after: its foes must come to no one, or the
measure reads foes that didn't fight as foes that did.

With `--wave n` each room plays a run from wave n instead (`beginWaves`: the countdown, the wave's groups at their
gates, a boss at its wave, its code loaded as the server loads it), the party's hits dealt as the guests' come to the
host (`strikeAround`, every 0.5 s: 15% of the life of each foe within 2.5 m of a hero, 4% of every other's, as the
party's shots), its Continue voted after each wave (`continueAll`). It says the waves from and to, how many it cleared,
its kills, and each boss that came, fallen or standing; a room fails if it cleared none. Its canary is the same run
with no one striking: it must clear none. From wave 4, 90 s: both rooms reached wave 7, 3 waves cleared, the Elder
Thornheart came and fell; a step 0.13 ms at its median (the boss's first, its model built, 170 to 200 ms).

Measured on the owner's PC (2026-11-28), 4 rooms of 38 Thornlings in the forest: built in 3.0 to 3.6 s, a step 0.2 ms
at its median and 0.7 at its 90th (the most, 25 to 35 ms, is the first step's navigation field), about 1% of a core a
room; 35 MB of heap kept a room, and 54 MB of the process's a room with each worker's heap capped (`ROOM_LIMITS`): 178
uncapped, V8 keeping what the build had used. The crypt builds in 1.8 s. Every foe of both battlegrounds' rosters
fights in Node (thornling, sporecaller, mossback, barkhulk; husk, imp, witch, brute), and a run's waves and bosses (`--wave`).
