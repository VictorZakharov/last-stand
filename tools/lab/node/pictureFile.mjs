// A picture on disk as a data URL, for the page to draw (tools/lab): a reference laid over a picture (`live picture
// --over`), or a reference sheet's panels set beside ours (`turnaround --ref`).
import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { labError } from './errors.mjs';
import { REPO } from './paths.mjs';

const PICTURE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

/** `path` (from the repo's root, or absolute) as a data URL; `what` names the option it came from in an error. */
export function pictureUrl(path, what) {
  const file = resolve(REPO, path);
  const type = PICTURE_TYPES[extname(file).toLowerCase()];
  if (!type) throw labError(`${what}: a PNG, JPEG or WebP picture, not ${path}`);
  return `data:${type};base64,${readFileSync(file).toString('base64')}`;
}
