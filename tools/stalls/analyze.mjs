// What a measure of the stalls found (tools/stalls): the page's frames and the trace's Skia program links put on one
// clock, each stall with the programs built in it, the tasks they were built inside, and what the page changed just
// before it.

/** a frame this long or longer is a stall (ms), and one this long is listed on its own unless the command says
 *  (`--listed`) */
export const STALL_MS = 100;
export const LISTED_MS = 300;
/** the page's changes this long before a stall are listed with it (ms) */
const CHANGES_BEFORE_MS = 400;
/** the most kinds of change listed with a stall */
const CHANGES_SHOWN = 6;
/** the page's changes this long before a program's link are listed with it (ms), and how many kinds */
const CHANGES_BEFORE_LINK_MS = 150;
const CHANGES_SHOWN_FOR_LINK = 3;
/** the most of the longest tasks listed with a stall: what each thread was busy with through it */
const BUSY_SHOWN = 4;
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
    .filter((task) => !SKIA_EVENTS.has(task.name))
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

/** The frames' summary: how many, their median, the stalls and the worst. */
function frameSummary(frames) {
  const intervals = frames.map((frame) => frame.ms).sort((a, b) => a - b);
  const stalls = frames.filter((frame) => frame.ms >= STALL_MS);
  return {
    count: frames.length,
    median: intervals.length ? intervals[Math.floor(intervals.length / 2)] : 0,
    stalls: stalls.length,
    stalled: stalls.reduce((sum, frame) => sum + frame.ms, 0),
    worst: intervals.slice(-5).reverse(),
  };
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
    programs: {
      count: inRecording.length,
      total: inRecording.reduce((sum, link) => sum + link.ms, 0),
      longest: Math.max(0, ...inRecording.map((link) => link.ms)),
    },
    listedMs,
    stalls,
  };
}
