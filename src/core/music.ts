// Music: the lobby's track (`audio/music/`), looped while the game is in the lobby and faded out for a run, which has
// none. It plays through the sound effects' WebAudio context, so it starts with the first user gesture that resumes it,
// faded by a gain node (iOS ignores an audio element's own volume).
import { audioContext } from './audio';
import lobbyTrack from '../audio/music/quiet-beginnings.mp3?url';

/** the music's level under the effects' */
const LEVEL = 0.32;
/** seconds to fade in from silence on entering the lobby, and out on leaving it */
const FADE_IN = 3, FADE_OUT = 1.2;
/** The track is one period of the piece (70 s: the rest of the original played it again), its start crossfaded from
 *  what followed the period so its end runs on into it, and 1 s of its start again after the end. Looped over one
 *  period from half a second in, it is seamless whatever delay a browser's decoder leaves at the file's start (an
 *  audio element's own loop left a gap of the MP3's padding). */
const LOOP_START = 0.5, LOOP_END = 70.5;

let buffer: AudioBuffer | null = null;
let gain: GainNode | null = null;
let source: AudioBufferSourceNode | null = null;
let loading = false;
/** whether the context was asked to start before a gesture */
let asked = false;
let level = 0;
/** where in the track it was left (s), and the context's time it was started from there */
let offset = 0;
let startedAt = 0;

/** Fetches and decodes the track (fetched whole, it plays from the service worker's cache everywhere). */
async function load(ctx: AudioContext): Promise<void> {
  loading = true;
  try {
    const data = await (await fetch(lobbyTrack)).arrayBuffer();
    buffer = await ctx.decodeAudioData(data);
    gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
  } catch {
    // no music, the game plays on without it
  }
}

/** Where the track is now (s), looping round its period. */
function position(ctx: AudioContext): number {
  const at = offset + ctx.currentTime - startedAt;
  return at < LOOP_END ? at : LOOP_START + ((at - LOOP_START) % (LOOP_END - LOOP_START));
}

function play(ctx: AudioContext, from: number): void {
  if (!buffer || !gain || source) return;
  source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.loopStart = LOOP_START;
  source.loopEnd = LOOP_END;
  source.connect(gain);
  source.start(0, from);
  offset = from;
  startedAt = ctx.currentTime;
}

function stop(ctx: AudioContext): void {
  if (!source) return;
  offset = position(ctx);
  source.stop();
  source.disconnect();
  source = null;
}

/** Fades the lobby's music in while `inLobby` and out otherwise, called every frame. The track starts again from its
 *  beginning each time the lobby is entered. */
export function updateMusic(dt: number, inLobby: boolean): void {
  const ctx = audioContext();
  if (!ctx) return;
  // (loaded and asked to start as the lobby shows: a browser lets sound start before the page's first click or key
  // only where it allows autoplay, as Chrome does on a site visited often or an installed app; elsewhere it starts
  // with that first gesture, the track already decoded)
  if (!buffer) {
    if (inLobby && !loading) void load(ctx);
    return;
  }
  if (ctx.state !== 'running') {
    if (inLobby && !asked) void ctx.resume().catch(() => undefined);
    asked = true;
    return;
  }
  if (inLobby && !source && !document.hidden) play(ctx, level === 0 ? 0 : offset);
  const step = dt / (inLobby ? FADE_IN : FADE_OUT);
  level = Math.max(0, Math.min(1, level + (inLobby ? step : -step)));
  if (gain) gain.gain.value = LEVEL * level * level;
  if (level === 0) stop(ctx);
}

// a lobby left open in a background tab stays quiet (the frames stop there, and with them the fade); it plays on from
// where it was when the tab comes back
document.addEventListener('visibilitychange', () => {
  const ctx = audioContext();
  if (ctx && document.hidden) stop(ctx);
});
