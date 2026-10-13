# `src/audio/music`

The lobby's music, `quiet-beginnings.mp3`, played by `core/music.ts` (the Music gotcha in `src/core/AGENTS.md`: how the track was cut from its piece, where it loops and how it was encoded).

The rules across the game are the [root AGENTS.md](../../../AGENTS.md).

- **Never edit the track by hand.** It is one period of its piece, crossfaded so its end runs on into its start, and looped at `LOOP_START` and `LOOP_END` in `core/music.ts`. A track made again needs its loop there again, to the last digit.
- **The piece isn't committed.** It is a WAV the owner keeps; one in the repo's root is waiting to be made into a track: leave it untracked.
- The track is an MP3 at 44.1 kHz, LAME's VBR quality 5 (about 110 kbps); keep a new one the same.
