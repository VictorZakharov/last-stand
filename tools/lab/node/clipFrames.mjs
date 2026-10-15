// tools/lab clip frames: a moment of a reference clip as a picture (`lab match <clip> --frame <s>`): a strike is
// matched moment by moment, and its references are videos of another game's swings. Each frame is cut by ffmpeg (on
// the path) once into tools/lab/out/match/frames, and cut again when the clip changes; its marks are a file of their
// own beside the clip, as a screenshot's are beside it.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { labError } from './errors.mjs';
import { OUT } from './paths.mjs';

/** the clips a reference may be */
const CLIP = /\.(mp4|webm|mkv|mov)$/i;
/** where the frames cut from clips are kept */
const FRAMES = join(OUT, 'match', 'frames');

/** Whether `file` is a clip (a frame of it is the reference) rather than a picture. */
export const isClip = (file) => CLIP.test(file);

/** A frame's name: the clip's and the moment's, in ms (`swing@1250`). */
export function frameName(clip, at) {
  return `${basename(clip).replace(CLIP, '')}@${Math.round(at * 1000)}`;
}

/** The marks file of the frame of `clip` at `at` s: beside the clip, `<clip>@<ms>.marks.json`. */
export function frameMarksFile(clip, at) {
  return join(dirname(clip), `${frameName(clip, at)}.marks.json`);
}

/** The frame of `clip` at `at` s, as a PNG cut from it (once: again only when the clip is newer than the frame). */
export function frameOf(clip, at) {
  if (!existsSync(clip)) throw labError(`match: no reference clip ${clip}`);
  if (!(at >= 0)) throw labError(`match: ${basename(clip)} is a clip: --frame <s> says the moment of it matched`);
  mkdirSync(FRAMES, { recursive: true });
  const frame = join(FRAMES, `${frameName(clip, at)}.png`);
  const fresh = existsSync(frame) && statSync(frame).mtimeMs >= statSync(clip).mtimeMs;
  if (!fresh) cut(clip, at, frame);
  return frame;
}

/** The frame of `clip` at `at` s written to `frame` by ffmpeg (seeking before the input: the nearest frame, fast). */
function cut(clip, at, frame) {
  const args = ['-y', '-loglevel', 'error', '-ss', String(at), '-i', clip, '-frames:v', '1', frame];
  try {
    execFileSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (error) {
    const said = error.stderr?.toString().trim() || error.message;
    throw labError(`match: ffmpeg couldn't cut ${basename(clip)} at ${at} s: ${said}`);
  }
  if (!existsSync(frame)) throw labError(`match: ${basename(clip)} has no frame at ${at} s (past its end?)`);
}
