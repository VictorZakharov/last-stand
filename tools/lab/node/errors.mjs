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

/** a terminal colour in a message */
const ANSI_COLOUR = /\u001b\[[0-9;]*m/g;
/** the compiler's own line for an error: oxc's `[PARSE_ERROR] <why>`, or esbuild's `<file>:<l>:<c>: ERROR: <why>` */
const COMPILE_ERROR = /^\s*(?:\[[A-Z_]+\]|.*\bERROR:)\s*(.+)$/m;
/** where in the file the error is, as the compiler's message has it: `<file>:<line>:<column>` */
const COMPILE_PLACE = /([^\s[\]]+):(\d+):(\d+)/;

/**
 * Why a module didn't compile and where (`:line:column`, or nothing), from what Vite threw: the compiler's own words on
 * one line, or the error's first line.
 */
export function compileError(error) {
  const message = String(error?.message ?? error).replace(ANSI_COLOUR, '');
  const reason = message.match(COMPILE_ERROR)?.[1] ?? message.split('\n')[0];
  const place = message.match(COMPILE_PLACE);
  const line = error?.loc?.line ?? place?.[2];
  const column = error?.loc?.column ?? place?.[3];
  return { reason: reason.trim(), where: line ? `:${line}:${column}` : '' };
}
