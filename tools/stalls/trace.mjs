// A trace of the whole browser while the stalls are measured (tools/stalls): Skia's shader compiles and program links
// on the GPU process, every piece of work on every thread but the shortest, and the mark the page puts on its clock.
// Its events stream back as they come (a trace read back at the end was too large for Chrome's stream), and only
// those are kept, each work's slimmed to its name, thread and times: a 20 s trace with Skia's draws in it was 250 MB.

/** what the trace records: each thread's tasks, the GPU process, Skia's shaders and the page's timeline marks */
const CATEGORIES = [
  'toplevel',
  'gpu',
  'viz',
  'disabled-by-default-skia.shaders',
  'disabled-by-default-devtools.timeline',
  'devtools.timeline',
];

/** with `--js`, V8's sampling profiler too, a sample every 0.1 ms (`profile.mjs`) */
const JS_CATEGORIES = ['disabled-by-default-v8.cpu_profiler', 'disabled-by-default-v8.cpu_profiler.hires'];

/** the events kept whatever their length: Skia building a program, the page's mark, and the profiler's (each whole:
 *  its samples are its arguments) */
const KEPT_NAMES = new Set(['driver_link_program', 'driver_compile_shader', 'TimeStamp', 'Profile', 'ProfileChunk']);
/** a piece of work this long or longer is kept (µs): what each thread spent a frame's time on (`analyze.mjs`
 *  `workIn`), long tasks among them (one may hold a program's link, and anything 20 ms long stalls a frame) */
const WORK_US = 500;

/** Whether `event` is one the measure reads. */
function kept(event) {
  if (event.ph === 'M') return event.name === 'process_name' || event.name === 'thread_name';
  if (KEPT_NAMES.has(event.name)) return true;
  return event.ph === 'X' && event.dur >= WORK_US;
}

/** `event` as it's kept: a piece of work by its name, thread and times alone (its arguments are most of its size). */
function slim(event) {
  if (event.ph !== 'X') return event;
  const { ph, name, pid, tid, ts, dur } = event;
  return { ph, name, pid, tid, ts, dur };
}

/**
 * Starts tracing `browser` (connected over CDP), with `js` the page's JS sampled too. Returns `stop`, which ends the
 * trace and gives its kept events.
 */
export async function startTrace(browser, { js = false } = {}) {
  const session = await browser.newBrowserCDPSession();
  const events = [];
  session.on('Tracing.dataCollected', ({ value }) => {
    for (const event of value) {
      if (kept(event)) events.push(slim(event));
    }
  });
  const categories = js ? [...CATEGORIES, ...JS_CATEGORIES] : CATEGORIES;
  const traceConfig = { includedCategories: categories, recordMode: 'recordContinuously' };
  await session.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig });
  return {
    async stop() {
      const complete = new Promise((resolve) => session.once('Tracing.tracingComplete', resolve));
      await session.send('Tracing.end');
      await complete;
      return events;
    },
  };
}
