// What drew the page's random numbers (tools/lab, `--randoms`): the seeded `Math.random` (browser.mjs) tallies each
// draw by the functions it was drawn from while a command runs, and the busiest are listed, each at its line in the
// source. Two sides of an A/B that drew differently show where: a picture of anything random (particles, sparks)
// differs after the first draw one side made and the other didn't, however the same the rest of the frame is (three's
// `generateUUID` draws four for every object made, a skeleton's bone texture made as it's first drawn among them).

/** how many places each list shows */
const SHOWN = 14;

/**
 * Runs `work` with the page's draws tallied; resolves with what `work` returned and the tally, as the page keeps it:
 * `[callers, count]`, the callers the lines of the draw's stack under `Math.random` (browser.mjs `__labRandoms`).
 */
export async function tallied(page, work) {
  await page.evaluate(() => window.__labRandoms.start());
  let result;
  let entries = [];
  try {
    result = await work();
  } finally {
    entries = await page.evaluate(() => window.__labRandoms.stop()).catch(() => []);
  }
  return { result, entries };
}

/** A stack line's function and place (`at bake (http://…/geometry.ts:212:9)`), lines and columns from 0; or null. */
export function frameOf(line) {
  const match = /at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(line.trim());
  if (!match) return null;
  return { name: match[1] ?? '(anonymous)', url: match[2], line: Number(match[3]) - 1, column: Number(match[4]) - 1 };
}

/** The addresses of the scripts a tally's callers are in. */
export function scriptsOfTally(entries) {
  const urls = entries.flatMap(([callers]) => callers.split('\n').map(frameOf).filter(Boolean).map((f) => f.url));
  return [...new Set(urls)];
}

/** a script's file name, from its address */
const fileName = (url) => url.replace(/[?#].*$/, '').split('/').pop();

/** A draw's callers as the list shows them: `inner file:line ← outer file:line`, placed by `sourceOf` when it can. */
function placesOf(callers, sourceOf) {
  return callers.split('\n').map(frameOf).filter(Boolean).map((frame) => {
    const found = sourceOf(frame.url, frame.line, frame.column);
    const file = found ? fileName(found.file) : fileName(frame.url);
    return `${frame.name} ${file}:${(found?.line ?? frame.line) + 1}`;
  }).join(' ← ');
}

/**
 * The tally by its callers' places in the source, each placed by `sourceOf(url, line, column)` (`{ file, line }`,
 * lines from 0; by where it ran when it doesn't know them): callers that land on the same lines are one.
 */
export function placedTally(entries, sourceOf = () => null) {
  const byPlace = new Map();
  for (const [callers, count] of entries) {
    const places = placesOf(callers, sourceOf);
    byPlace.set(places, (byPlace.get(places) ?? 0) + count);
  }
  return byPlace;
}

/** A placed tally's busiest callers, most draws first, under the draws in all. */
export function summarizeRandoms(placed) {
  const drawn = [...placed.values()].reduce((sum, count) => sum + count, 0);
  const rows = [...placed].sort((a, b) => b[1] - a[1]).slice(0, SHOWN);
  const shown = rows.map(([places, count]) => `  ${String(count).padStart(7)}  ${places}`);
  return [`random numbers drawn: ${drawn}`, ...shown].join('\n');
}

/**
 * Where two sides' placed tallies differ, the smallest differences first: what `mine` drew more of (+) or fewer of
 * (-) than `other`. The first draw one side made and the other didn't moves every random thing after it, so a small
 * difference (four: a three.js object made) is where to look before the large ones it brought after it.
 */
export function randomsDiffer(mine, other) {
  const places = new Set([...mine.keys(), ...other.keys()]);
  const rows = [...places]
    .map((place) => [place, (mine.get(place) ?? 0) - (other.get(place) ?? 0)])
    .filter(([, more]) => more !== 0)
    .sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]))
    .slice(0, SHOWN);
  if (!rows.length) return 'random numbers: both sides drew the same, caller by caller';
  const shown = rows.map(([place, more]) => `  ${(more > 0 ? `+${more}` : String(more)).padStart(7)}  ${place}`);
  return ['random numbers this tree drew more (+) or fewer (-) of, the smallest differences first:', ...shown]
    .join('\n');
}
