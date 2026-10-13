// The game's music (src/audio/music/, each made from its piece by tools/music): where each track loops, and how the
// music fades where it plays. Which track plays where is each biome's (`BiomeDef.music`): one in its lobby, and one
// through each wave's fight in its runs.

export type TrackId = 'quiet-beginnings' | 'shadowed-dusk' | 'sunlit-battle' | 'crypt-motif';

export interface TrackDef {
  /** where it loops (s): from just past the crossfade into the loop to as far past where the music comes back
   *  (`npm run music -- make` says both), so both sides of the seam are the same samples of the piece, whatever
   *  delay a browser's decoder leaves at the file's start (up to half a second) */
  loop: [number, number];
}

export const TRACKS: Record<TrackId, TrackDef> = {
  // (one 70 s period of the piece, from its first beat to where its start comes back: it played it again)
  'quiet-beginnings': { loop: [3.3156, 73.318] },
  // (an intro, then a section of 104 beats that came back twice: the intro once, the section looped)
  'shadowed-dusk': { loop: [28.3119, 75.5877] },
  // (looped from 9.5 s back from where the music comes back to sound so, 67.9 s on; its ending cut)
  'sunlit-battle': { loop: [11.9592, 79.8399] },
  // (nothing in it comes back: looped whole, from its last downbeat before its fade to its first)
  'crypt-motif': { loop: [2.7119, 106.6937] },
};

/** how the music fades where it plays (s): in from silence, and out to it */
export interface Fade {
  in: number;
  out: number;
}

export const FADES = {
  /** a lobby's, faded in as it's entered and out as a run starts */
  lobby: { in: 3, out: 1.2 },
  /** a run's, in as a wave's fight starts and out once it's won */
  battle: { in: 1, out: 2.5 },
} satisfies Record<string, Fade>;
