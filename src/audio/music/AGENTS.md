# `src/audio/music`

The music's tracks, an MP3 each, played by `core/music.ts` where each biome's `music` says (`data/biomes.ts`) and looped where `TRACKS` says (`data/music.ts`). How the music plays is the Music gotcha in `src/core/AGENTS.md`.

The rules across the game are the [root AGENTS.md](../../../AGENTS.md).

- **Never edit a track by hand.** Each is made from the composer's piece by `npm run music -- make` (`tools/music/README.md` says how each was cut, with the command that made it), which also prints the loop to put in `TRACKS`. A track made again needs its loop there again, to the last digit.
- **The pieces aren't committed.** They are WAVs the owner keeps; one in the repo's root is waiting to be made into a track: leave it untracked.
- Each track is an MP3 at 44.1 kHz, LAME's VBR quality 5 (about 110 kbps), its loudness within a dB of the others (`npm run music -- levels`).
- **A new track:** made with `make`, its seam clean; its id in `TrackId` and `TRACKS`; its import in `core/music.ts`; a biome's `music` naming it; and `npm run lab -- music`, with its `EXPECTED` naming it, finding it plays there.
