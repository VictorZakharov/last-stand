// Where a command's time goes in the page (tools/lab, `--profile`): the browser's sampling profiler run round it,
// and the functions it found busiest, by their own time and by the time spent in them and what they called, each at
// its line in the source (the page runs the modules as Vite compiled them; sourceMaps.mjs traces them back).

/** the profiler's sampling interval, µs */
const SAMPLING_US = 200;
/** how many functions each list shows */
const SHOWN = 14;

/**
 * Runs `work` with the page's sampling profiler on; resolves with what `work` returned and the profile (the
 * DevTools protocol's `Profiler.Profile`).
 */
export async function profiled(page, work) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: SAMPLING_US });
  await cdp.send('Profiler.start');
  let result;
  let profile;
  try {
    result = await work();
  } finally {
    ({ profile } = await cdp.send('Profiler.stop'));
    await cdp.detach().catch(() => {});
  }
  return { result, profile };
}

/** The addresses of the scripts a profile's functions are in. */
export function scriptsIn(profile) {
  return [...new Set(profile.nodes.map((node) => node.callFrame.url).filter(Boolean))];
}

/** a script's file name, from its address or its path */
const fileName = (address) => address.replace(/[?#].*$/, '').split(/[\\/]/).pop();

/**
 * A function's name and place, as the lists show it (`bake geometry.ts:212`): its file and line in the source when
 * `sourceOf(url, line, column)` knows them (`{ file, line }`, lines from 0), else where it ran.
 */
function placeOf(callFrame, sourceOf) {
  const name = callFrame.functionName || '(anonymous)';
  const found = sourceOf(callFrame.url, callFrame.lineNumber, callFrame.columnNumber);
  const file = fileName(found?.file ?? callFrame.url) || '(native)';
  return `${name} ${file}:${(found?.line ?? callFrame.lineNumber) + 1}`;
}

/**
 * The profile's busiest functions: by self time, and by total time (each function once per sample's stack), each
 * placed by `sourceOf` (see `placeOf`; by where it ran when not given).
 */
export function summarize(profile, sourceOf = () => null) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parentOf = new Map();
  for (const node of profile.nodes) {
    for (const child of node.children ?? []) parentOf.set(child, node.id);
  }
  const self = new Map();
  const total = new Map();
  let sampled = 0;
  profile.samples.forEach((id, index) => {
    const ms = (profile.timeDeltas[index] ?? 0) / 1000;
    sampled += ms;
    const place = placeOf(nodes.get(id).callFrame, sourceOf);
    self.set(place, (self.get(place) ?? 0) + ms);
    const seen = new Set();
    for (let at = id; at !== undefined; at = parentOf.get(at)) {
      const stackPlace = placeOf(nodes.get(at).callFrame, sourceOf);
      if (seen.has(stackPlace)) continue;
      seen.add(stackPlace);
      total.set(stackPlace, (total.get(stackPlace) ?? 0) + ms);
    }
  });
  const idle = new Set(['(idle) (native):0', '(program) (native):0', '(root) (native):0']);
  const row = ([place, ms]) => {
    const share = (ms / sampled * 100).toFixed(1).padStart(5);
    return `  ${share} %  ${ms.toFixed(0).padStart(6)} ms  ${place}`;
  };
  const busiest = (times) => [...times]
    .filter(([place]) => !idle.has(place))
    .sort((a, b) => b[1] - a[1])
    .slice(0, SHOWN)
    .map(row);
  return [
    `profile: ${sampled.toFixed(0)} ms sampled`,
    'by own time',
    ...busiest(self),
    'by total time (with what it called)',
    ...busiest(total),
  ].join('\n');
}
