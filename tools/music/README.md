# Music

Makes the game's music tracks (`src/audio/music/`) from the composer's pieces. The tool finds where a piece repeats
and cuts one loop of it. It crossfades the loop's end into its start and writes the result as an MP3. Then it checks
the seam as a browser decodes the MP3 and loops it.

Needs Python with `pip install -r tools/music/requirements.txt`, and ffmpeg on the path. The pieces are WAVs, which
aren't kept in the repo: no binary asset is, apart from the tracks themselves.

```bash
npm run music -- loops piece.wav                                  # where it can loop, the best first
npm run music -- loops piece.wav --lag 67.88                      # how alike it sounds 67.88 s on, along the piece
npm run music -- map piece.wav                                    # its self-similarity: tools/music/out/
npm run music -- make piece.wav src/audio/music/x.mp3 --from 9.46 --to 77.34   # the track, its seam checked
npm run music -- seam src/audio/music/x.mp3 --start 11.9592 --end 79.8399 --canary
npm run music -- levels src/audio/music/*.mp3                     # how loud each is
```

## How a track is made

1. **Find the loop.** `loops` compares the piece with itself, moment by moment, by its harmony and timbre. It lists
   pairs of moments at least 30 s apart that sound alike for 6 s after them. The loop runs from the first moment to
   the second. A loop starts on a beat. Its end is placed by the onsets where they line up, or else a whole number
   of bars on. Where the two ends are the same samples, the waveform lines it up to the sample. `map` draws the same
   comparison as a picture, where repeats show as diagonal lines.
2. **Make the track.** `make` writes the piece from its start up to the loop's end. Then comes a crossfade (2 s by
   default) from what plays there into what played at the loop's start, and 1 s more of the loop's start. The
   crossfade is straight when the two ends are the same samples, and equal power when they aren't. Whatever followed
   the loop's end in the piece, such as a section played again or an ending, is cut.
3. **Loop it in the game.** `make` prints where to loop the track: from just past the crossfade to the same distance
   past the loop's end. Both sides of that seam are the same samples of the piece. A browser's decoder may add up to
   half a second of delay at a file's start, and the seam stays exact through any of it. Put that loop in
   `TRACKS` (`src/data/music.ts`).
4. **Check it.** `make` checks its own track, and `seam` checks any track:
   - **The seam:** decoded as a browser decodes it, at 0, 25 and 50 ms of decoder delay. The joined samples must differ
     from the same samples played straight by 20 dB under the music at least, with no step between samples larger
     than straight's by half. With `--canary`, the seam is put 37 ms off, and the check must hear it.
   - **The crossfade's level:** it must stay within the music's own range round it, give or take 3 dB.

The tracks are MP3s at 44.1 kHz and LAME's VBR quality 5, about 110 kbps. Opus would be smaller, but iOS Safari plays
it unreliably.

## The tracks

| Track | Piece | Plays | Made with | Loop in the track (s) |
| --- | --- | --- | --- | --- |
| `quiet-beginnings.mp3` | Quiet Beginnings | the forest's lobby and between waves | `--from 0 --to 70` | 3.3156 to 73.318 |
| `shadowed-dusk.mp3` | Shadowed Forest Dusk | the crypt's lobby and between waves | `--from 26 --to 73.27` | 28.3119 to 75.5877 |
| `sunlit-battle.mp3` | Sunlit Forest Battle | the forest's fights | `--from 9.46 --to 77.34` | 11.9592 to 79.8399 |
| `crypt-motif.mp3` | Crypt Motif | the crypt's fights | `--from 0 --to 104` | 2.7119 to 106.6937 |

- **Quiet Beginnings:** its harmony repeats every 70.000 s. The track is one period, from the first beat, and the
  original's other 36 s played it again.
- **Shadowed Forest Dusk:** an intro, then a section of 104 beats that comes back twice. The track plays the intro
  once, then loops the section.
- **Sunlit Forest Battle:** it comes back to sound as it did at 9.5 s, 67.9 s on. The track loops there, and the
  piece's ending is cut.
- **Crypt Motif:** nothing in it comes back. Its best match held for about 4 s, so the track loops the whole piece,
  from its first downbeat to its last downbeat before the fade.

Which track plays where is each biome's `music` (`src/data/biomes.ts`). `npm run lab -- music` plays every biome's
music through in the game and judges it (`tools/lab/README.md`).

## The sources

Each module has one job:

- `audio.py`: reads, decodes and encodes audio.
- `period.py`: the frames' features and a piece's periods.
- `match.py`: lines up waveforms.
- `beats.py`: the beat and the onsets.
- `loops.py`: finds the loops.
- `track.py`: makes the track.
- `seam.py`: checks the seam and the crossfade's level.
- `similarity.py`: draws the map.
- `music.py`: the command line. `music.mjs` runs it with the system's Python.
