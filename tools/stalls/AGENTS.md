# `tools/stalls`

The stalls harness (`README.md`): the game played in the installed Chrome on this machine's GPU, traced, for the stalls the lab's Chromium never shows (Chrome on Windows holding its GPU process up while it builds a Skia program the page needs).

The rules across the game are the [root AGENTS.md](../../AGENTS.md); each directory under this one has an AGENTS.md of its own.

- **Look at the machine first.** Stalls of 1.4 to 1.9 s in the owner's Chrome went away with a reinstall of the GPU driver; another agent's browser on the same GPU is in no trace of this one.
- It starts Chrome on a fresh profile of its own: a Chrome it started outlives a lost connection, so make sure it's closed afterwards.
- Why page elements moved every frame stalled the lobby, and what replaced them: the overlays gotcha in `src/ui/overlay/AGENTS.md`.
- **Set the page up as the report's player had it** (`--hero`, `--stash`, `--view`, `--biome`, `--scale`, `--perf`): a first boot's lobby has an empty stash, and hovering it lit nothing, so four measures of #267 read 145 frames a second where the owner had 44. A report gives the mode, the view, the pixel ratio and, in its late shaders, the weapon.
- **A variant is a script and its argument** (`variants.mjs`): `styled` adds a stylesheet, so a cause is A/B'd on production with no build (the glow's loops held still, each alone, on a layer of its own).
