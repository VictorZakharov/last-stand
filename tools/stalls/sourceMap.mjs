// A build's source maps read (tools/stalls `--js`): where in the source each place in the built code came from, so
// the page's functions are named as they're written (`ui/perfHud.ts:138`), not by the bundle's lines.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const DIGITS = new Map([...BASE64].map((char, index) => [char, index]));
/** a base-64 VLQ digit's bit that says another follows, and the bits of its value */
const MORE = 32;
const VALUE = 31;

/** The numbers of one segment of a source map's mappings, each a base-64 VLQ. */
export function vlqs(segment) {
  const values = [];
  let value = 0;
  let shift = 0;
  for (const char of segment) {
    const digit = DIGITS.get(char);
    value += (digit & VALUE) * 2 ** shift;
    if (digit & MORE) {
      shift += 5;
      continue;
    }
    values.push(value % 2 ? -Math.floor(value / 2) : value / 2);
    value = 0;
    shift = 0;
  }
  return values;
}

/** A source map's mappings line by line of the built code: each line's segments that point into a source, as
 *  `[column, source, line]` (0-based), the earliest column first. */
export function decode(mappings) {
  const lines = [];
  let source = 0;
  let line = 0;
  for (const text of mappings.split(';')) {
    const segments = [];
    let column = 0;
    for (const segment of text.split(',')) {
      if (!segment) continue;
      const values = vlqs(segment);
      column += values[0];
      if (values.length < 4) continue;
      source += values[1];
      line += values[2];
      segments.push([column, source, line]);
    }
    lines.push(segments);
  }
  return lines;
}

/** The index of the last of `segments` (the earliest column first) at `column` or before, or -1. */
function lastAt(segments, column) {
  let low = 0;
  let high = segments.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (segments[middle][0] <= column) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}

/** A source's path as it's read in this repo: from `src/` on for the game's (`ui/perfHud.ts`), from `node_modules/`
 *  on for a package's (`three/build/three.core.js`). */
export function shortSource(path) {
  const parts = path.replace(/\\/g, '/').split('/');
  const from = Math.max(parts.lastIndexOf('src'), parts.lastIndexOf('node_modules'));
  return parts.slice(from + 1).join('/');
}

/** Where the built code's `line` and `column` (0-based) in `map` (`readMap`) came from: its source and line (1-based),
 *  or null where nothing maps it. */
export function placeIn(map, line, column) {
  const segments = map.lines[line];
  if (!segments?.length) return null;
  const found = lastAt(segments, column);
  if (found < 0) return null;
  const [, source, sourceLine] = segments[found];
  return { source: shortSource(map.sources[source] ?? '?'), line: sourceLine + 1 };
}

/** A source map as `placeIn` reads it: its sources and its lines' segments. */
export function readMap(json) {
  return { sources: json.sources ?? [], lines: decode(json.mappings ?? '') };
}

/**
 * Where a place in the built game served from `distDir` came from: `place(url, line, column)` gives its source and
 * line, read from the map beside the script the page loaded from `url`, or null (no map, or a script not the
 * build's). Each map is read once.
 */
export function sourcesOf(distDir) {
  const maps = new Map();
  const mapOf = (url) => {
    const path = new URL(url).pathname;
    if (!maps.has(path)) {
      const file = join(distDir, `${path}.map`);
      maps.set(path, existsSync(file) ? readMap(JSON.parse(readFileSync(file, 'utf8'))) : null);
    }
    return maps.get(path);
  };
  return (url, line, column) => {
    if (!/^https?:/.test(url)) return null;
    const map = mapOf(url);
    return map ? placeIn(map, line, column) : null;
  };
}
