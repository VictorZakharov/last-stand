// A failed command's error as the lab reports it (tools/lab). An error the lab raised on purpose (its message starts
// `lab: `: a set-up that didn't take, a bad option) is its message alone; anything else is a bug somewhere, so it
// keeps the top of its stack, the page's addresses shortened to the files they name.

/** Playwright's prefix on what a page threw: `page.evaluate: Error: ...` */
const PAGE_PREFIX = /^page\.\w+: (?:\w*Error: )?/;
/** a stack frame's line */
const STACK_LINE = /^\s+at /;
/** how many stack frames an unexpected error keeps */
const FRAMES_KEPT = 6;

/** An error the lab raises on purpose: `lab: ` and what went wrong, reported without a stack. */
export function labError(text) {
  return new Error(`lab: ${text}`);
}

/** A stack frame's line with the page's addresses shortened (`http://localhost:5190/src/x.ts?t=1` to `src/x.ts`). */
function shortFrame(line) {
  return line.replace(/https?:\/\/[^/\s]+\//g, '').replace(/\?t=\d+/g, '');
}

/** The text to report for `error`, thrown in Node or in the page. */
export function describeError(error) {
  const text = String(error?.message ?? error);
  const fromPage = PAGE_PREFIX.test(text);
  const lines = (fromPage ? text.replace(PAGE_PREFIX, '') : text).split('\n');
  const message = lines.filter((line) => !STACK_LINE.test(line)).join('\n').trim();
  if (message.startsWith('lab: ')) return message;
  // (a page's stack comes in its message; Node's is the error's own)
  const stack = fromPage ? lines : String(error?.stack ?? '').split('\n');
  const frames = stack.filter((line) => STACK_LINE.test(line)).slice(0, FRAMES_KEPT).map(shortFrame);
  return [message, ...frames].join('\n');
}
