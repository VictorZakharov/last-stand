// The stalls' boot measure (tools/stalls, `--scenario boot`): a made-up boot's record and trace, each step's findings,
// and the report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeBoot, REVEALED, SLOW_LAUNCHES } from '../analyze.mjs';
import { bootRecording, loaded, stopBootRecording } from '../page.mjs';
import { bootRoundsText, bootText } from '../report.mjs';

const MARK = 'stalls:boot';
/** the page's renderer and one of its workers */
const PAGE = { pid: 9, tid: 90 };
const WORKER = { pid: 9, tid: 91 };
/** the page's clock (ms) as the recording started, and the trace's time (µs) of the mark made then */
const START = 50;
const MARK_TS = 1_000_000;
/** A piece of work `name` on `thread`, starting at the page's `at` (ms) for `ms`. */
const workAt = (name, thread, at, ms) => {
  return { ph: 'X', name, ...thread, ts: MARK_TS + (at - START) * 1000, dur: ms * 1000 };
};

/** A trace: the threads named, the mark, the bundle run on the page's thread and the maps made in a worker. */
function trace() {
  return [
    { ph: 'M', name: 'process_name', pid: PAGE.pid, args: { name: 'Renderer' } },
    { ph: 'M', name: 'thread_name', ...PAGE, args: { name: 'CrRendererMain' } },
    { ph: 'M', name: 'thread_name', ...WORKER, args: { name: 'DedicatedWorker thread' } },
    { ph: 'I', name: 'TimeStamp', ...PAGE, ts: MARK_TS, args: { data: { message: MARK } } },
    workAt('EvaluateScript', PAGE, 120, 60),
    workAt('FunctionCall', WORKER, 400, 300),
  ];
}

/** A boot's record: the document fetched by 50 ms, its scripts run, the arena from 300, the lobby revealed at 900. */
function record() {
  return {
    start: START,
    frames: [{ at: 200, ms: 150 }, { at: 500, ms: 300 }, { at: 950, ms: 10 }, { at: 960, ms: 10 }],
    changes: [],
    phases: [
      { name: 'the document fetched', at: 0 },
      { name: 'Loading…', at: 100 },
      { name: 'Forging the arena', at: 300 },
      { name: REVEALED, at: 900 },
    ],
    longTasks: [{ at: 120, ms: 60 }, { at: 400, ms: 250 }],
    paint: { 'first-contentful-paint': 80 },
    files: [
      { name: '(the page)', kind: 'navigation', bytes: 50_000, at: 0, end: 40 },
      { name: 'index.js', kind: 'script', bytes: 900_000, at: 60, end: 110 },
      { name: 'music.ogg', kind: 'fetch', bytes: 2_000_000, at: 1000, end: 1400 },
      { name: 'maps.worker.js', kind: 'other', bytes: 60_000, at: 300, end: 0 },
    ],
    maps: [
      { name: 'steel()', at: 310, ms: 100, kept: false },
      { name: 'face(warrior)', at: 310, ms: 400, kept: false },
      { name: 'slabs(21,6,3)', at: 410, ms: 200, kept: false },
      { name: 'cobblestone()', at: 610, ms: 50, kept: false },
    ],
    exit: { kind: 'blown', before: { slow: 0, off: false }, after: { slow: 0, off: false } },
  };
}

/** `loaded` asked of a document in `readyState`, its loading screen `loading` (null: none) with `classes`. */
function loadedIn(readyState, classes) {
  const loading = classes === null ? null : { classList: { contains: (name) => classes.includes(name) } };
  globalThis.document = { readyState, getElementById: (id) => (id === 'loading' ? loading : null) };
  try {
    return loaded();
  } finally {
    delete globalThis.document;
  }
}

test('takes no document for loaded until it was parsed and its loading screen is done or gone', () => {
  // (just after a navigation commits the document is empty: a slowed CPU's boot was taken as loaded then)
  assert.equal(loadedIn('loading', null), false);
  assert.equal(loadedIn('interactive', []), false);
  assert.equal(loadedIn('interactive', ['blowing']), false);
  assert.equal(loadedIn('interactive', ['blowing', 'done']), true);
  assert.equal(loadedIn('complete', null), true);
});

test('the page names the step a boot ends on as the analysis looks for it', () => {
  assert.ok(String(bootRecording).includes(`'${REVEALED}'`));
});

test('the page reads the maps\' measures by the name and detail the game gives them', () => {
  const game = readFileSync(new URL('../../../src/core/textures.ts', import.meta.url), 'utf8');
  assert.match(game, /performance\.measure\(`map \$\{key\}`, \{ [^}]*detail: \{ kept \} \}\)/);
  assert.ok(String(stopBootRecording).includes("startsWith('map ')"));
  assert.ok(String(stopBootRecording).includes('entry.detail?.kept === true'));
});

test('times each step of a boot, with what held the page up and what each thread did in it', () => {
  const findings = analyzeBoot(record(), trace(), MARK);
  assert.equal(findings.clockFound, true);
  assert.equal(findings.revealedAt, 900);
  assert.equal(findings.painted, 80);
  assert.deepEqual(findings.steps.map((step) => [step.name, step.from, step.ms]), [
    ['the document fetched', 0, 100],
    ['Loading…', 100, 200],
    ['Forging the arena', 300, 600],
    [REVEALED, 900, 60],
  ]);
  const [, scripts, arena] = findings.steps;
  assert.deepEqual(scripts.longTasks, { count: 1, ms: 60, longest: 60 });
  assert.deepEqual(scripts.work, [{ name: 'EvaluateScript', thread: 'Renderer CrRendererMain', ms: 60 }]);
  assert.equal(arena.frames.worst[0], 300);
  assert.deepEqual(arena.work, [{ name: 'FunctionCall', thread: 'Renderer DedicatedWorker thread', ms: 300 }]);
  assert.deepEqual(findings.files, {
    count: 4,
    bytes: 3_010_000,
    later: 1,
    largest: [
      { name: 'music.ogg', bytes: 2_000_000, ms: 400 },
      { name: 'index.js', bytes: 900_000, ms: 50 },
      { name: 'maps.worker.js', bytes: 60_000, ms: null },
    ],
  });
  assert.deepEqual(findings.maps, {
    count: 4,
    kept: 0,
    from: 310,
    to: 710,
    ms: 750,
    longest: [{ name: 'face(warrior)', ms: 400 }, { name: 'slabs(21,6,3)', ms: 200 }, { name: 'steel()', ms: 100 }],
  });
});

test('reports a boot step by step, and the boots by visit over the rounds', () => {
  const findings = analyzeBoot(record(), trace(), MARK);
  const text = bootText({ name: 'http://x/ base, a first visit', notes: ['a fresh profile'], findings });
  assert.match(text, /^http:\/\/x\/ base, a first visit: a fresh profile/);
  assert.match(text, /the lobby revealed at 0\.90 s, first painted at 0\.08 s; 4 files, 3\.01 MB over the network /);
  assert.match(text, /\(1 after the reveal; the largest music\.ogg 2\.00 MB in 0\.40 s, /);
  assert.match(text, /, index\.js 0\.90 MB in 0\.05 s, /);
  assert.match(text, /maps\.worker\.js 0\.06 MB\)/);
  assert.match(text, /\n {2}4 maps made in the workers from 0\.31 s to 0\.71 s, 0\.75 s of work /);
  assert.match(text, / of work \(the longest face\(warrior\) 0\.40 s, /);
  assert.match(text, /, slabs\(21,6,3\) 0\.20 s, steel\(\) 0\.10 s\)\n/);
  const arena = / {3}0\.30 s {2}Forging the arena: 0\.60 s; 1 frames, the page held up 300 ms at most, 1 long tasks/;
  assert.match(text, arena);
  assert.match(text, /its work, ms: 300\.0 FunctionCall on Renderer DedicatedWorker thread/);
  const later = { ...findings, revealedAt: 1100 };
  const boots = [
    { group: 'x, a first visit', findings },
    { group: 'x, a first visit', findings: later },
    { group: 'x, a return', findings: { ...findings, revealedAt: 400 } },
  ];
  const rounds = bootRoundsText(boots);
  assert.match(rounds, /x, a first visit: 2 boots; the lobby revealed at 0\.90 \(0\.90–1\.10 s\)/);
  assert.match(rounds, /\n {4}the workers' maps done at 0\.71 \(0\.71–0\.71 s\)/);
  assert.match(rounds, /\n {4}Forging the arena: 0\.60 \(0\.60–0\.60 s\)/);
  assert.match(rounds, /x, a return: 1 boots; the lobby revealed at 0\.40 \(0\.40–0\.40 s\)/);
});

test('says when a boot never revealed the lobby', () => {
  const unrevealed = record();
  unrevealed.phases.pop();
  const findings = analyzeBoot(unrevealed, trace(), MARK);
  assert.equal(findings.revealedAt, null);
  assert.equal(findings.files.later, 0);
  assert.match(bootText({ name: 'x', notes: [], findings }), /the lobby never revealed/);
});

test('says how many maps were read back from a visit before', () => {
  const returned = record();
  for (const map of returned.maps.slice(1)) map.kept = true;
  const findings = analyzeBoot(returned, trace(), MARK);
  assert.equal(findings.maps.kept, 3);
  const text = bootText({ name: 'x', notes: [], findings });
  assert.match(text, /\n {2}4 maps made in the workers \(3 of them read back from a visit before\) from 0\.31 s /);
});

test('the page reads the exit\'s marks of a slow device by the names and limit the game gives them', () => {
  const game = readFileSync(new URL('../../../src/ui/logoWind.ts', import.meta.url), 'utf8');
  assert.match(game, /SLOW_KEY = 'last-stand\.logo-wind-slow'/);
  assert.match(game, new RegExp(`SLOW_LAUNCHES = ${SLOW_LAUNCHES}\\b`));
  assert.match(game, /OLD_OFF_KEY = 'last-stand\.logo-wind-off'/);
  const page = String(bootRecording);
  assert.ok(page.includes("'last-stand.logo-wind-slow'") && page.includes("'last-stand.logo-wind-off'"));
});

test('says how the loading screen left: blown away, cut short by its watchdog, or a plain fade and why', () => {
  const exitWith = (kind, before, after) => {
    const boot = record();
    boot.exit = { kind, before, after };
    const findings = analyzeBoot(boot, trace(), MARK);
    return { findings, text: bootText({ name: 'x', notes: [], findings }) };
  };
  const none = { slow: 0, off: false };
  assert.match(exitWith('blown', none, none).text, /\n {2}the loading screen left: the logo blown away\n/);
  const cut = exitWith('blown', none, { slow: 1, off: false });
  assert.equal(cut.findings.exit.kind, 'cut');
  assert.match(cut.text, /left: the logo's blow cut short by its watchdog \(slow launches in a row: 1\)/);
  // (a build before this one switched the blow off for good on one launch cut short)
  const forGood = exitWith('blown', none, { slow: 0, off: true });
  assert.equal(forGood.findings.exit.kind, 'cut');
  assert.match(forGood.text, /left: the logo's blow cut short by its watchdog, which switched it off for good\n/);
  assert.match(exitWith('plain', { slow: 0, off: true }, none).text, /a plain fade \(the device marked slow/);
  const marked = { slow: SLOW_LAUNCHES, off: false };
  assert.match(exitWith('plain', marked, marked).text, /a plain fade \(the device marked slow/);
  assert.match(exitWith('plain', none, none).text, /a plain fade \(reduced motion, low graphics, or the blow /);
  const boots = [cut, exitWith('blown', none, none), exitWith('blown', none, none)]
    .map(({ findings }) => ({ group: 'x', findings }));
  assert.match(bootRoundsText(boots), /\n {4}the loading screen left: the logo's blow cut short by its watchdog /);
  assert.match(bootRoundsText(boots), /\(slow launches in a row: 1\) 1, the logo blown away 2\n/);
});

test('lists no maps for a build that times none', () => {
  const untimed = record();
  delete untimed.maps;
  const findings = analyzeBoot(untimed, trace(), MARK);
  assert.equal(findings.maps, null);
  assert.doesNotMatch(bootText({ name: 'x', notes: [], findings }), /maps made/);
  assert.doesNotMatch(bootRoundsText([{ group: 'x', findings }]), /maps done/);
});
