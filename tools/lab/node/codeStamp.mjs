// The lab's Node code, by a hash of it (tools/lab): the command line sends its own with every command, and a server
// that loaded other code restarts before it runs one. (`node --watch` restarted the server on a change to its code,
// until one day it didn't: the server ran the old code, which dropped an option the command line had just learnt.)
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** the lab's own folder */
export const LAB = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The files of the lab's Node code, relative to its folder: the command line and every module of the Node side. */
export function codeFiles() {
  const modules = readdirSync(join(LAB, 'node')).filter((name) => name.endsWith('.mjs'));
  return ['lab.mjs', ...modules.map((name) => `node/${name}`)].sort();
}

/** A short hash of the lab's Node code as it is on disk now. */
export function codeStamp() {
  const hash = createHash('sha1');
  for (const file of codeFiles()) {
    hash.update(file);
    hash.update(readFileSync(join(LAB, file)));
  }
  return hash.digest('hex').slice(0, 12);
}
