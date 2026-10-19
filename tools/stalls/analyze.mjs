// What a measure of the stalls found (tools/stalls): the page's frames and the trace's Skia program links put on one
// clock, each stall with the programs built in it, the tasks they were built inside, and what the page changed just
// before it.

/** a frame this long or longer is a stall (ms), and one this long is listed on its own unless the command says
 *  (`--listed`, down to `LISTED_LEAST`: the trace keeps tasks of 20 ms and more, `trace.mjs`) */
export const STALL_MS = 100;
export const LISTED_MS = 300;
export const LISTED_LEAST = 20;
/** the page's changes this long before a stall are listed with it (ms) */
const CHANGES_BEFORE_MS = 400;
/** the most kinds of change listed with a stall */
const CHANGES_SHOWN = 6;
/** the page's changes this long before a program's link are listed with it (ms), and how many kinds */
const CHANGES_BEFORE_LINK_MS = 150;
const CHANGES_SHOWN_FOR_LINK = 3;
/** the most of the longest tasks listed with a stall: what each thread was busy with through it */
const BUSY_SHOWN = 4;
/** a task this long or longer is listed as one a stall was busy with (ms: the trace keeps work from 0.5 ms) */
const BUSY_LEAST_MS = 20;
/** the most kinds of work listed for each phase, the most of a frame's time first, and for each stall */
const WORK_SHOWN = 10;
const STALL_WORK_SHOWN = 6;
/** the threads whose tasks are waits, not work, left out of a phase's: the GPU process's waits for the screen's
 *  vertical blank (a frame's whole time, whatever the frame cost) */
const WAITING_THREADS = new Set(['GpuVSyncThread']);
/** the work that is the page's own rather than the browser's for it: its scripts (the game's frame among them), and
 *  the GPU process running the commands it's sent (the game's WebGL with the rest, slowed by whatever else is on the
 *  GPU). What's left (style, layout, paint, layers, raster, the compositor's frames) is a phase's `browserWork`. */
const PAGE_OWN_WORK = new Set(['FunctionCall', 'EvaluateScript', 'CommandBufferService:PutChanged']);
/** Skia's own events, listed as the programs built rather than as tasks */
const SKIA_EVENTS = new Set(['driver_link_program', 'driver_compile_shader']);

/** The page's time (ms) of a trace time (µs), given the mark's trace time and the page's time at it. */
const onPageClock = (ts, markTs, pageStart) => (ts - markTs) / 1000 + pageStart;

/** A C++ function's readable name: `virtual void __cdecl ns::Type::method(args)` → `Type::method`. */
export function shortName(name) {
  // (the anonymous namespace first: its parenthesis comes before the arguments')
  const named = name.replace(/\(anonymous namespace\)::/g, '');
  const withoutArgs = named.replace(/\(.*$/s, '');
  const words = withoutArgs.split(' ');
  const last = words[words.length - 1];
  const parts = last.split('::').filter(Boolean);
  return parts.slice(-2).join('::') || name;
}

/** Each thread's name by `pid:tid`, from the trace's metadata. */
function threadNames(events) {
  const processes = new Map();
  const threads = new Map();
  for (const event of events) {
    if (event.ph !== 'M') continue;
    if (event.name === 'process_name') processes.set(event.pid, event.args?.name ?? '?');
    if (event.name === 'thread_name') threads.set(`${event.pid}:${event.tid}`, event.args?.name ?? '?');
  }
  const named = new Map();
  for (const [key, thread] of threads) {
    const pid = Number(key.split(':')[0]);
    named.set(key, `${processes.get(pid) ?? pid} ${thread}`);
  }
  return named;
}

/** The trace time of the page's mark, or null when the trace never saw it. */
function markTime(events, mark) {
  const stamp = events.find((event) => event.name === 'TimeStamp' && event.args?.data?.message === mark);
  return stamp ? stamp.ts : null;
}

/** The tasks on the same thread that hold `link` (outermost first), by their readable names. */
function heldIn(link, tasks) {
  return tasks
    .filter((task) => task.pid === link.pid && task.tid === link.tid && task !== link)
    .filter((task) => task.ts <= link.ts && task.ts + task.dur >= link.ts + link.dur)
    .sort((a, b) => a.ts - b.ts)
    .map((task) => shortName(task.name));
}

/** A task's thread by name (`GPU Process CrGpuMain`), or its ids when the trace didn't name it. */
const threadOf = (task, names) => names.get(`${task.pid}:${task.tid}`) ?? `${task.pid}:${task.tid}`;

/** The longest tasks (on any thread) that overlap the page's `[from, to]`, longest first: how long, where and what. */
function busyIn(tasks, from, to, toPage, names) {
  return tasks
    .filter((task) => !SKIA_EVENTS.has(task.name) && task.dur >= BUSY_LEAST_MS * 1000)
    .map((task) => ({ task, at: toPage(task.ts), ms: task.dur / 1000 }))
    .filter(({ at, ms }) => at !== null && at < to && at + ms > from)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, BUSY_SHOWN)
    .map(({ task, ms }) => ({ ms, thread: threadOf(task, names), name: shortName(task.name) }));
}

/** The page's changes in `[from, to]`, by kind and place, the most frequent first. */
function changesBetween(changes, from, to, shown = CHANGES_SHOWN) {
  const counts = new Map();
  for (const change of changes) {
    if (change.at < from || change.at > to) continue;
    const key = `${change.what} on ${change.where}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, shown)
    .map(([key, count]) => `${count} x ${key}`);
}

/** The interval at share `share` (0..1) of `sorted` intervals, or 0 without any. */
function atShare(sorted, share) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
}

/** a frame this many times the screen's refresh or longer missed one (the refresh: the fastest phase's median) */
const MISSED_SHARE = 1.5;

/** The frames' summary: how many, how many a second over their time, their median and 90th percentile, the stalls
 *  and the worst. */
function frameSummary(frames) {
  const intervals = frames.map((frame) => frame.ms).sort((a, b) => a - b);
  const stalls = frames.filter((frame) => frame.ms >= STALL_MS);
  const total = intervals.reduce((sum, ms) => sum + ms, 0);
  return {
    count: frames.length,
    rate: total > 0 ? (frames.length * 1000) / total : 0,
    median: atShare(intervals, 0.5),
    p90: atShare(intervals, 0.9),
    stalls: stalls.length,
    stalled: stalls.reduce((sum, frame) => sum + frame.ms, 0),
    worst: intervals.slice(-5).reverse(),
  };
}

/**
 * Each task with its own time (ms): its length less its children's, those on its thread inside it that the trace
 * kept (work shorter than it keeps counts as its holder's). A thread's run loop holding the work keeps little.
 */
export function selfTimes(tasks) {
  const byThread = new Map();
  for (const task of tasks) {
    const key = `${task.pid}:${task.tid}`;
    if (!byThread.has(key)) byThread.set(key, []);
    byThread.get(key).push(task);
  }
  const owned = [];
  for (const thread of byThread.values()) {
    // (the outer of two that start together first: it holds the other)
    thread.sort((a, b) => a.ts - b.ts || b.dur - a.dur);
    const open = [];
    for (const task of thread) {
      while (open.length && open[open.length - 1].end <= task.ts) open.pop();
      const entry = { task, end: task.ts + task.dur, children: 0 };
      if (open.length) open[open.length - 1].children += task.dur;
      open.push(entry);
      owned.push(entry);
    }
  }
  return owned.map(({ task, children }) => ({ task, ms: Math.max(0, task.dur - children) / 1000 }));
}

/** Whether a piece of work counts as a thread's: not Skia's builds (listed apart) nor a thread's waits. */
const isWork = ({ task, thread }) => !SKIA_EVENTS.has(task.name) && !WAITING_THREADS.has(thread.split(' ').pop());

/** Each piece of work (`selfTimes`) with its thread and its start on the page's clock, the earliest first (none the
 *  trace couldn't put on it). */
function placedWork(owned, toPage, names) {
  return owned
    .map(({ task, ms }) => ({ task, ms, at: toPage(task.ts), thread: threadOf(task, names) }))
    .filter((placed) => placed.at !== null && isWork(placed))
    .sort((a, b) => a.at - b.at);
}

/** The index of the first of `placed` (the earliest first) that starts at `at` or later. */
function firstFrom(placed, at) {
  let low = 0;
  let high = placed.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (placed[middle].at < at) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** What the threads spent `frames` frames' time on in the page's `spans` (`[from, to)` each): each kind of work on
 *  each thread that started in them, its own time summed and shared out a frame, the most first. */
function workIn(placed, spans, frames) {
  const totals = new Map();
  for (const [from, to] of spans) {
    for (let index = firstFrom(placed, from); index < placed.length && placed[index].at < to; index++) {
      const { task, ms, thread } = placed[index];
      const key = `${shortName(task.name)}\n${thread}`;
      totals.set(key, (totals.get(key) ?? 0) + ms);
    }
  }
  return [...totals]
    .sort((a, b) => b[1] - a[1])
    .slice(0, WORK_SHOWN)
    .map(([key, total]) => {
      const [name, thread] = key.split('\n');
      return { name, thread, ms: frames ? total / frames : 0 };
    });
}

/** The browser's own work for the page (ms) that started in the page's `[from, to)`: all but `PAGE_OWN_WORK`. */
function browserWorkIn(placed, from, to) {
  let total = 0;
  for (let index = firstFrom(placed, from); index < placed.length && placed[index].at < to; index++) {
    const { task, ms } = placed[index];
    if (!PAGE_OWN_WORK.has(shortName(task.name))) total += ms;
  }
  return total;
}

/**
 * Each phase the scenario marked (`page.mjs` `markPhase`): its frames' summary, from its mark to the next's (the
 * last's to the end), the share of them that missed the screen's refresh (`missedShare`), the share a tooltip was
 * shown in, what the threads spent their time on, a frame of the phase's and a frame of those that missed, and the
 * browser's own work for the page a second (`browserWork`, ms). A median alone hides the misses: #269's sweep read
 * 7.0 ms, a frame every refresh, at 99 frames a second where the screen gave 145. And frames a second hang on the
 * whole GPU: with another game in a browser beside it, one variant read 102 to 124 measure to measure, where the
 * browser's work for it held within a tenth. `work` is `workIn` and `browserWorkIn` on the trace's work.
 */
function phaseSummaries(record, work) {
  const phases = record.phases ?? [];
  const framed = phases.map((phase, index) => {
    const end = phases[index + 1]?.at ?? Infinity;
    return { phase, end, frames: record.frames.filter((frame) => frame.at > phase.at && frame.at <= end) };
  });
  const refresh = refreshOf(framed.map(({ frames }) => frames), record.frames);
  return framed.map(({ phase, end, frames }) => {
    const tipped = frames.filter((frame) => frame.tip).length;
    const last = frames.length ? frames[frames.length - 1].at : phase.at;
    const missed = missedOf(frames, refresh);
    return {
      name: phase.name,
      ...frameSummary(frames),
      missedShare: frames.length ? missed.length / frames.length : 0,
      tipShare: frames.length ? tipped / frames.length : 0,
      work: work.kinds([[phase.at, Math.min(end, last)]], frames.length),
      missedWork: work.kinds(missed.map((frame) => [frame.at - frame.ms, frame.at]), missed.length),
      browserWork: perSecond(work.browser(phase.at, Math.min(end, last)), frames),
    };
  });
}

/** `total` ms of work as ms a second of `frames`' time. */
function perSecond(total, frames) {
  const seconds = frames.reduce((sum, frame) => sum + frame.ms, 0) / 1000;
  return seconds > 0 ? total / seconds : 0;
}

/** The screen's refresh (ms): the fastest phase's median frame, or all the frames' without phases. */
function refreshOf(phaseFrames, all) {
  const medians = phaseFrames
    .filter((frames) => frames.length > 0)
    .map((frames) => frameSummary(frames).median);
  return medians.length ? Math.min(...medians) : frameSummary(all).median;
}

/** Those of `frames` that took `MISSED_SHARE` times the screen's refresh or longer. */
function missedOf(frames, refresh) {
  if (refresh <= 0) return [];
  return frames.filter((frame) => frame.ms >= refresh * MISSED_SHARE);
}

/**
 * The findings of one measure: `record` is the page's (`page.mjs` `stopRecording`), `events` the trace's kept events
 * and `mark` the page's mark in them.
 */
export function analyze(record, events, mark, listedMs = LISTED_MS) {
  const markTs = markTime(events, mark);
  const names = threadNames(events);
  const tasks = events.filter((event) => event.ph === 'X');
  const toPage = (ts) => (markTs === null ? null : onPageClock(ts, markTs, record.start));
  const placed = placedWork(selfTimes(tasks), toPage, names);
  const links = tasks
    .filter((event) => event.name === 'driver_link_program')
    .map((link) => ({
      at: toPage(link.ts),
      ms: link.dur / 1000,
      thread: threadOf(link, names),
      heldIn: heldIn(link, tasks),
    }));
  const inRecording = links.filter((link) => link.at === null || link.at >= record.start);
  const stalls = record.frames
    .filter((frame) => frame.ms >= listedMs)
    .map((frame) => {
      const from = frame.at - frame.ms;
      const built = inRecording.filter((link) => link.at !== null && link.at + link.ms >= from && link.at <= frame.at);
      return {
        at: (frame.at - record.start) / 1000,
        ms: frame.ms,
        built,
        busy: busyIn(tasks, from, frame.at, toPage, names),
        work: workIn(placed, [[from, frame.at]], 1).slice(0, STALL_WORK_SHOWN),
        changes: changesBetween(record.changes, from - CHANGES_BEFORE_MS, from + 20),
      };
    });
  const built = inRecording.map((link) => ({
    ...link,
    at: link.at === null ? null : (link.at - record.start) / 1000,
    changes: link.at === null ? []
      : changesBetween(record.changes, link.at - CHANGES_BEFORE_LINK_MS, link.at, CHANGES_SHOWN_FOR_LINK),
  }));
  return {
    clockFound: markTs !== null,
    built,
    frames: frameSummary(record.frames),
    phases: phaseSummaries(record, {
      kinds: (spans, count) => workIn(placed, spans, count),
      browser: (from, to) => browserWorkIn(placed, from, to),
    }),
    programs: {
      count: inRecording.length,
      total: inRecording.reduce((sum, link) => sum + link.ms, 0),
      longest: Math.max(0, ...inRecording.map((link) => link.ms)),
    },
    listedMs,
    stalls,
  };
}
