// Where the loading screen's exit draws, as the window changes (tools/stalls, `--resize`): the window taken to
// another size and back as the loading screen shows, the first time as the exit is made ready and the rest after,
// while the exit's field (`src/ui/logoWind.ts`) is checked at each of its draws: the places its uniforms hold
// against where the loading screen's letters, the lobby's logo and the window are as it draws. A field placed once,
// as the lobby was laid out, blew the letters from where they had been and gathered them where the lobby's logo had
// been (the owner: full screen and back on the loading screen).

/** how long each size is held before the next (ms): frames drawn at each, the exit's own among them */
const HOLD_MS = 250;
/** how long the first size waits for the exit to be made ready, or the loading screen to leave without one (ms) */
const MADE_TIMEOUT_MS = 180_000;
/** the most a place may be off (css px): a float's rounding, where a place left behind is tens of px off */
export const FIT_MOST_PX = 0.1;

/**
 * Records where the exit's field draws against where things are (an init script, run on every load), into
 * `window.__windFit`: at each of the field's draws that's shown, the places its uniforms hold (`uBox`: the loading
 * letters' box; `uDst`: the lobby logo's corner and its scale over the letters; `uView`: the canvas's size, css px;
 * `uDpr` its pixels a css px) beside the boxes of the loading screen's letters and the lobby logo's, and the
 * window's size, as they are then, and the most each is off. The field is the context that asks for `uHomeAt` (the
 * game's fire has a `uBox` of its own). `stale` plants the fault it's for, the canary: each place the field sets
 * after its first ignored, as a field placed once and never again.
 */
export function windFitRecording({ stale }) {
  const record = { made: null, draws: 0, checked: 0, exitAt: null, lastAt: null, resizes: [], off: {}, worst: null };
  // (each shown draw's uniforms, the lobby logo's snapshot's size and the boxes as they were: `--resize`'s trace)
  record.trace = [];
  window.__windFit = record;
  const resized = () => record.resizes.push({ at: performance.now(), size: `${innerWidth}x${innerHeight}` });
  addEventListener('resize', resized);
  if (typeof WebGL2RenderingContext === 'undefined') return;
  const proto = WebGL2RenderingContext.prototype;
  const PLACES = ['uBox', 'uDst', 'uView', 'uDpr'];
  const KEPT = [...PLACES, 'uT', 'uHomeAt'];
  // (each kept uniform's location by its name, and the field's contexts, each with what its uniforms were set to)
  const names = new WeakMap();
  const fields = new WeakMap();
  const getUniformLocation = proto.getUniformLocation;
  proto.getUniformLocation = function (program, name) {
    const at = getUniformLocation.call(this, program, name);
    if (name === 'uHomeAt' && !fields.has(this)) fields.set(this, {});
    if (at && KEPT.includes(name)) names.set(at, name);
    return at;
  };
  const keep = (method) => {
    const original = proto[method];
    proto[method] = function (at, ...values) {
      const set = fields.get(this);
      const name = set && at ? names.get(at) : undefined;
      if (name) {
        if (stale && set[name] && PLACES.includes(name)) return undefined;
        set[name] = values;
        if (name === 'uBox') record.made ??= performance.now();
      }
      return original.call(this, at, ...values);
    };
  };
  for (const method of ['uniform1f', 'uniform2f', 'uniform3f', 'uniform4f']) keep(method);
  // (the lobby logo's snapshot, its size as uploaded: `texImage2D(target, level, format, width, height, ...)`)
  const texImage2D = proto.texImage2D;
  proto.texImage2D = function (...args) {
    const set = fields.get(this);
    if (set && args.length >= 9) set.texture = [args[3], args[4]];
    return texImage2D.apply(this, args);
  };
  const boxOf = (selector) => document.querySelector(`${selector} svg:not(.logo-glow)`)?.getBoundingClientRect();
  const offBy = (what, gap) => {
    const px = Math.abs(gap);
    record.off[what] = Math.max(record.off[what] ?? 0, px);
    if (!record.worst || px > record.worst.px) record.worst = { what, px, t: record.t };
  };
  // (the canvas: its size in css px is the window's in whole device pixels; its pixels are as many as it's drawn at)
  const checkView = (set, canvas) => {
    const dpr = set.uDpr[0];
    const width = Math.floor(innerWidth * dpr) / dpr;
    const height = Math.floor(innerHeight * dpr) / dpr;
    offBy('the canvas\'s width as drawn', set.uView[0] - width);
    offBy('the canvas\'s height as drawn', set.uView[1] - height);
    offBy('the canvas\'s width on the page', Number.parseFloat(canvas.style.width) - width);
    offBy('the canvas\'s height on the page', Number.parseFloat(canvas.style.height) - height);
    offBy('the canvas\'s pixels across', (canvas.width - width * dpr) / dpr);
    offBy('the canvas\'s pixels down', (canvas.height - height * dpr) / dpr);
  };
  // (the loading letters, where the points blow from; the lobby logo, where they land: its corner and size as the
  // shader puts it, `uDst.xy + n * uBox.zw * uDst.z`, none where it doesn't gather)
  const checkPlaces = (set, box, dst) => {
    const [left, top, width, height] = set.uBox;
    offBy('the letters\' left', left - box.left);
    offBy('the letters\' top', top - box.top);
    offBy('the letters\' width', width - box.width);
    offBy('the letters\' height', height - box.height);
    if (!dst || dst.width <= 10) return;
    const [x, y, scale, gathers] = set.uDst ?? [0, 0, 0, 0];
    const into = gathers > 0.5 ? scale : 0;
    offBy('the lobby logo\'s left', gathers > 0.5 ? x - dst.left : dst.width);
    offBy('the lobby logo\'s top', gathers > 0.5 ? y - dst.top : dst.height);
    offBy('the lobby logo\'s width', into * width - dst.width);
    offBy('the lobby logo\'s height', into * height - dst.height);
  };
  // (a draw on the page and shown: the field's first, as it's made, is drawn hidden and off the page, which shows
  // nothing; the lobby's layout had moved 5 px under it while the lobby logo was snapshotted)
  const shown = (canvas) => {
    const style = canvas.isConnected ? getComputedStyle(canvas) : null;
    return style !== null && style.visibility === 'visible' && style.display !== 'none';
  };
  const drawArrays = proto.drawArrays;
  proto.drawArrays = function (mode, first, count) {
    const set = fields.get(this);
    const box = set && shown(this.canvas) && boxOf('#loading .ld-logo');
    if (set) record.draws++;
    if (box && set.uBox && set.uView && set.uDpr) {
      const now = performance.now();
      record.t = set.uT?.[0] ?? 0;
      if (record.t > 0) record.exitAt ??= now;
      record.lastAt = now;
      record.checked++;
      checkView(set, this.canvas);
      const dst = boxOf('#menu .logo-art');
      checkPlaces(set, box, dst);
      const rect = (r) => r && [r.left, r.top, r.width, r.height];
      const { uBox, uDst, uHomeAt, texture } = set;
      const { clientWidth, clientHeight } = document.documentElement;
      const page = [innerWidth, innerHeight, clientWidth, clientHeight];
      record.trace.push({ at: now, t: record.t, uBox, uDst, uHomeAt, texture, box: rect(box), dst: rect(dst), page });
      record.left = rect(dst);
    }
    return drawArrays.call(this, mode, first, count);
  };
}

/** The exit's record (`windFitRecording`), with the window's changes counted (in all, and while the exit drew) and
 *  the sizes it took, and how far the lobby logo is now (where it rests, the exit gone) from where the exit left it
 *  (its box at the exit's last draw, css px: `moved`, null where the exit never drew it). */
export function windFitRead() {
  const record = window.__windFit;
  if (!record) return null;
  const { made, draws, checked, exitAt, lastAt, resizes, off, worst, trace, left } = record;
  const during = exitAt === null ? 0 : resizes.filter(({ at }) => at >= exitAt && at <= lastAt).length;
  const sizes = [...new Set(resizes.map(({ size }) => size))];
  const rest = document.querySelector('#menu .logo-art svg:not(.logo-glow)')?.getBoundingClientRect();
  const now = rest ? [rest.left, rest.top, rest.width, rest.height] : null;
  const moved = left && now ? Math.max(...now.map((value, i) => Math.abs(value - left[i]))) : null;
  return { made, draws, checked, resized: resizes.length, during, sizes, off, worst, moved, trace, resizes };
}

/** Whether the exit's field is made (its first place set), or the loading screen left without one. */
export function fieldMadeOrGone() {
  return window.__windFit?.made != null || Boolean(document.querySelector('#loading.done'));
}

/**
 * Chrome's window taken to `options.resize` (css px, its outer size, as `--window` sizes it) and back to the size it
 * had, `options.trips` times, each size held `HOLD_MS`: the first time to the other size as the page loads, waiting
 * there till the exit is made ready, then back, so the exit is made at one size and shown at another.
 */
export async function resizeTrips(page, options) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { windowId, bounds } = await cdp.send('Browser.getWindowForTarget');
    const sizeTo = async ({ width, height }) => {
      await cdp.send('Browser.setWindowBounds', { windowId, bounds: { width, height } });
      await page.waitForTimeout(HOLD_MS);
    };
    await sizeTo(options.resize);
    await page.waitForFunction(fieldMadeOrGone, null, { timeout: MADE_TIMEOUT_MS, polling: 50 });
    await sizeTo(bounds);
    for (let trip = 1; trip < options.trips; trip++) {
      await sizeTo(options.resize);
      await sizeTo(bounds);
    }
  } finally {
    await cdp.detach();
  }
}
