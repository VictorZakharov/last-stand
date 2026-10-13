# `tools/music`

The music's tracks cut from the composer's pieces (`README.md`: how a track is made, and how each of the game's was cut).

The rules across the game are the [root AGENTS.md](../../AGENTS.md).

- The pieces (WAVs) are never committed: they stay untracked in the repo's root.
- A track made again prints its loop, which goes in `TRACKS` (`src/data/music.ts`); then `npm run lab -- music` plays the game's music through and judges it.
- A change to the seam's check is run with `seam --canary`, which must catch a seam 37 ms off.
