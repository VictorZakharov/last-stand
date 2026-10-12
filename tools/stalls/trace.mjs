// A trace of the whole browser while the stalls are measured (tools/stalls): Skia's shader compiles and program links
// on the GPU process, every long task on every thread, and the mark the page puts on its clock. Its events stream
// back as they come (a trace read back at the end was too large for Chrome's stream), and only those are kept:
// a 20 s trace with Skia's draws in it was 250 MB.

/** what the trace records: each thread's tasks, the GPU process, Skia's shaders and the page's timeline marks */
const CATEGORIES = [
  'toplevel',
  'gpu',
  'viz',
  'disabled-by-default-skia.shaders',
  'disabled-by-default-devtools.timeline',
  'devtools.timeline',
];

/** the events kept whatever their length: Skia building a program, and the page's mark */
const KEPT_NAMES = new Set(['driver_link_program', 'driver_compile_shader', 'TimeStamp']);
/** a task this long or longer is kept (µs): it may hold a program's link, and anything that long stalls a frame */
const LONG_TASK_US = 20_000;

/** Whether `event` is one the measure reads. */
function kept(event) {
  if (event.ph === 'M') return event.name === 'process_name' || event.name === 'thread_name';
  if (KEPT_NAMES.has(event.name)) return true;
  return event.ph === 'X' && event.dur >= LONG_TASK_US;
}

/**
 * Starts tracing `browser` (connected over CDP). Returns `stop`, which ends the trace and gives its kept events.
 */
export async function startTrace(browser) {
  const session = await browser.newBrowserCDPSession();
  const events = [];
  session.on('Tracing.dataCollected', ({ value }) => {
    for (const event of value) {
      if (kept(event)) events.push(event);
    }
  });
  const traceConfig = { includedCategories: CATEGORIES, recordMode: 'recordContinuously' };
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
