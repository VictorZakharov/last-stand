# `tools/stalls`

The stalls harness (`README.md`): the game played in the installed Chrome on this machine's GPU, traced, for the stalls the lab's Chromium never shows (Chrome on Windows holding its GPU process up while it builds a Skia program the page needs).

The rules across the game are the [root AGENTS.md](../../AGENTS.md); each directory under this one has an AGENTS.md of its own.

- **Look at the machine first.** Stalls of 1.4 to 1.9 s in the owner's Chrome went away with a reinstall of the GPU driver; another agent's browser on the same GPU is in no trace of this one.
- It starts Chrome on a fresh profile of its own: a Chrome it started outlives a lost connection, so make sure it's closed afterwards.
- Why page elements moved every frame stalled the lobby, and what replaced them: the overlays gotcha in `src/ui/overlay/AGENTS.md`.
- **Set the page up as the report's player had it** (`--hero`, `--stash`, `--view`, `--biome`, `--scale`, `--perf`): a first boot's lobby has an empty stash, and hovering it lit nothing, so four measures of #267 read 145 frames a second where the owner had 44. A report gives the mode, the view, the pixel ratio and, in its late shaders, the weapon.
- **A variant is a script and its argument** (`variants.mjs`): `styled` adds a stylesheet, so a cause is A/B'd on production with no build (the glow's loops held still, each alone, on a layer of its own).
- **Measure what the player did, the way they did it:** moving between items isn't gliding over them. #269's first preview read 143 frames a second in every glide and 72 in the sweep, which the owner saw (34 in their overlay). A scenario for each way a complaint describes, before calling it fixed.
- **Compare a phase with its own run's away phase**, never with another run's: on a machine shared with other agents, one run's `noFocusFilter` read 7.0 ms, the next run's 13.9 with its away phase at 6.9 in both. `--scenario sweep` starts over the world for that.
- **Read frames a second and the share missed, never a median alone:** #269's sweep read a median of 7.0 ms (every refresh) at 99 frames a second, the owner's 105.
- **Compare variants by the browser's work, over `--rounds`:** frames a second hang on the whole GPU, which the owner's own browsers share (another game's preview open beside it moved one variant from 102 to 124). The browser's work for the page held within a tenth; a variant that gains frames but no work (the glow's fade cut) may be noise. The screen off or locked paces every frame at 60.
- **Read a frame's work before trying variants** (each phase's breakdown, `analyze.mjs` `workIn`): it says which thread pays and for what (the README's Reading it), where variants only say whether a guess was right. Six variants of #269's sweep missed what one breakdown showed: the number of looping layers, not any one loop.
- Chrome is started with `--mute-audio` (the page's sound still runs, its cost measured): a browser a harness starts must never play into the room.
