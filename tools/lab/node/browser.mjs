// The lab's browser (tools/lab): headless, and a page in it can never capture the real pointer or keyboard (pointer
// lock, keyboard lock and fullscreen are stubbed before any page script runs). Its profile and everything else it
// writes stay under tools/lab/out, never in the user's temp folder.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** Points TEMP and TMP at `dir`/tmp: Playwright puts the browser's profile under os.tmpdir(), which reads them. */
export function useLocalTemp(dir) {
  const tmp = join(dir, 'tmp');
  mkdirSync(tmp, { recursive: true });
  process.env.TEMP = tmp;
  process.env.TMP = tmp;
  process.env.TMPDIR = tmp;
}

/** the browsers tried, in order: Playwright's Chromium, then Edge, then Chrome */
const CHANNELS = ['chromium', 'msedge', 'chrome'];

/**
 * The GPU's flags: the machine's own graphics through ANGLE (Direct3D 11 on Windows, Metal on macOS; elsewhere the
 * browser's own choice), and the GPU used even where the browser's blocklist would turn it off.
 */
function gpuArgs() {
  const angle = { win32: 'd3d11', darwin: 'metal' }[process.platform];
  const args = ['--enable-gpu', '--ignore-gpu-blocklist'];
  if (angle) args.unshift(`--use-angle=${angle}`);
  return args;
}

/**
 * Launches a browser in its native headless mode: Playwright's Chromium (npx playwright install chromium), else Edge
 * or Chrome. (`channel: 'chromium'` is the full browser run headless, not Playwright's separate headless shell, a
 * console program that opened a console window of its own.)
 */
export async function launchBrowser() {
  const failures = [];
  for (const channel of CHANNELS) {
    try {
      return await chromium.launch({ headless: true, channel, args: gpuArgs() });
    } catch (error) {
      failures.push(`${channel}: ${String(error?.message ?? error).split('\n')[0]}`);
    }
  }
  const tried = failures.map((failure) => `\n  ${failure}`).join('');
  throw new Error(`lab: no browser would start (install one: npx playwright install chromium)${tried}`);
}

// ---- scripts run in every page before its own (each is serialized into the page: it can use nothing from here)

/** The capes step in the page from its boot (`cape.ts`, `__labCapesHere`): the lab never uses the cape's worker pool,
 *  and with eight pages booting side by side, one's failed to start and the page's error failed the command. */
function capesHere() {
  window.__labCapesHere = true;
}

/** The page can't take the pointer, the keyboard or the screen; attempts are counted in `window.__lockAttempts`. */
function noCapture() {
  window.__lockAttempts = 0;
  const refuse = function () {
    window.__lockAttempts++;
    return Promise.resolve();
  };
  for (const proto of [Element.prototype, HTMLElement.prototype, HTMLCanvasElement.prototype]) {
    Object.defineProperty(proto, 'requestPointerLock', { value: refuse, configurable: false, writable: false });
    Object.defineProperty(proto, 'requestFullscreen', { value: refuse, configurable: false, writable: false });
  }
  Object.defineProperty(Document.prototype, 'exitPointerLock', { value: () => {}, configurable: false });
  if (navigator.keyboard) Object.defineProperty(navigator.keyboard, 'lock', { value: refuse, configurable: false });
}

/**
 * The lab's clock (`window.__labClock`, read by page/lab.ts). It runs in real time until the loading screen reveals
 * the game; from then on (`manual`) the game's animation frames are queued for the lab to run, each `frame` ms long.
 *
 * Every time the page reads is on a grid of 1/1024 ms, and a frame is a whole number of its steps (a hair over a 60th
 * of a second), so the differences the game takes between them are exact. With the browser's own times and frames of
 * exactly 1000/60 ms, each boot's frame time came out a few bits apart (0.01666666666666606 s on one, ...697 on
 * another), and a cast lasting a whole number of 60ths ended a frame early or late, as its sum of them fell either
 * side. On the grid every boot has the same frame time, and a cast of n 60ths always takes n frames.
 */
function labClock() {
  const GRID = 1024;
  const onGrid = (ms) => Math.round(ms * GRID) / GRID;
  const browserFrame = window.requestAnimationFrame.bind(window);
  const browserNow = performance.now.bind(performance);
  // (`realNow`: the browser's own clock, off the grid, for timing the page's work: performance.now is the lab's)
  const clock = { mode: 'real', t: 0, frame: 17067 / GRID, queue: [], realNow: browserNow };
  window.__labClock = clock;
  window.requestAnimationFrame = (callback) => {
    if (clock.mode !== 'real') {
      clock.queue.push(callback);
      return 0;
    }
    return browserFrame((time) => {
      if (clock.mode !== 'real') {
        clock.queue.push(callback);
        return;
      }
      clock.t = onGrid(time);
      callback(clock.t);
    });
  };
  performance.now = () => (clock.mode === 'real' ? onGrid(browserNow()) : clock.t);
  // (manual from the moment the loading screen reveals the game, which starts its updates: the frames until the lab
  // took over ran on the browser's clock, as many as the page managed, and every boot's state was a little different)
  const reveal = new MutationObserver(() => {
    if (!document.getElementById('loading')?.classList.contains('done')) return;
    clock.mode = 'manual';
    reveal.disconnect();
  });
  reveal.observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
}

/**
 * `Math.random` seeded, the same sequence on every boot: a new profile rolls its weapons, and with the same seed
 * both sides of an A/B carry the same gear. `window.__labSeed(n)` starts the sequence again, as each set-up does.
 * What runs in a timer's callback draws from a stream of its own: timers fire by the browser's clock, and the
 * loading screen's tips, picked every 6 s, took numbers from the sequence as many times as the boot was long, so a
 * slower boot rolled other weapons (the two sides of a commit compared with itself had 360 and 392 energy).
 */
function seededRandom() {
  // mulberry32
  const generator = (seed) => {
    let state = seed | 0;
    const next = () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.reseed = (value) => {
      state = value | 0;
    };
    return next;
  };
  const sequence = generator(0x9e3779b9);
  const timerStream = generator(0x85ebca6b);
  window.__labSeed = (seed) => sequence.reseed(seed);
  Math.random = sequence;

  const ownStream = (callback) => function (...args) {
    const random = Math.random;
    Math.random = timerStream;
    try {
      return callback.apply(this, args);
    } finally {
      Math.random = random;
    }
  };
  const browserTimeout = window.setTimeout.bind(window);
  const browserInterval = window.setInterval.bind(window);
  window.setTimeout = (callback, ms, ...args) => {
    return browserTimeout(typeof callback === 'function' ? ownStream(callback) : callback, ms, ...args);
  };
  window.setInterval = (callback, ms, ...args) => {
    return browserInterval(typeof callback === 'function' ? ownStream(callback) : callback, ms, ...args);
  };
}

/**
 * Every boot a first boot: nothing kept from the last (a saved profile loaded where the first boot rolled one made
 * a frame's difference), and no logo wind (the loading screen's watchdog remembers it as switched off).
 */
function freshStorage() {
  try {
    localStorage.clear();
    localStorage.setItem('last-stand.logo-wind-off', '1');
  } catch {
    // storage blocked: the intro plays, slower but harmless
  }
}

export const PAGE_SCRIPTS = [noCapture, labClock, seededRandom, freshStorage, capesHere];
