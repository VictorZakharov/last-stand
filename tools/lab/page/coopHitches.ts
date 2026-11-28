// `coop --scenarios hitches`: each game's long frames, as a busy game has them. A page's own messages wait for the
// frame it's drawing: a game at wave 44 drew frames of 35 to 75 ms with longer ones among them, and its ping read 56
// to 97 ms on a 22 ms route. Its partners' messages wait the same way, and judged by when they were handed over, each
// long frame read as a late link and a partner's play-out waited longer for every report (80 to 210 ms of the
// scoreboard's "shown N ms behind"). The link stamps when each message arrived (`src/net/relaySocket.ts`, a worker's),
// and the play-out judges its lateness by that. Here each game holds its messages for a hitch's length every so
// often, as a long frame does, and the play-out must wait no longer for it. Read by the page (page/coop.ts) and the
// judge (node/coopHitches.mjs): no imports.

/** the frames of the recording played with no hitch, before the hitches start */
export const HITCH_CALM = 900;
/** a hitch every so many frames on each game (the guest's half way between the host's) */
export const HITCH_EVERY = 120;
/** how many frames a hitch holds the game's messages: 150 ms */
export const HITCH_HOLD = 9;
/** the frames from the hitches' start before the play-out is read again (it grows at most 40 ms a second) */
export const HITCH_GROWN = 240;
/** the frames `hitches` records */
export const HITCH_FRAMES = HITCH_CALM + HITCH_GROWN + 480;

/** Whether a game holds its messages at frame `at` of the recording (`guest`: half a period after the host). */
export function inHitch(at: number, guest: boolean): boolean {
  const since = at - HITCH_CALM + (guest ? HITCH_EVERY / 2 : 0);
  if (at < HITCH_CALM) return false;
  return since % HITCH_EVERY < HITCH_HOLD;
}
