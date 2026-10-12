// What runs in the game's page for a measure of its stalls (tools/stalls). Each function is serialized into the page,
// so it can use nothing from here.

/**
 * Records every animation frame's interval and every change to the page's HTML from now on, into `window.__stalls`,
 * and marks the trace (`console.timeStamp`) at the moment its clock starts, so the trace's times can be put on it.
 */
export function startRecording(mark) {
  const record = { start: performance.now(), frames: [], changes: [] };
  window.__stalls = record;
  console.timeStamp(mark);
  let last = record.start;
  const tick = (now) => {
    record.frames.push({ at: now, ms: now - last });
    last = now;
    if (!record.stopped) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const label = (node) => {
    const element = node.nodeType === 1 ? node : node.parentElement;
    if (!element) return '?';
    const id = element.id ? `#${element.id}` : '';
    const classes = typeof element.className === 'string' && element.className
      ? `.${element.className.trim().split(/\s+/).join('.')}`
      : '';
    return `${element.tagName.toLowerCase()}${id}${classes}`;
  };
  record.observer = new MutationObserver((mutations) => {
    const at = performance.now();
    for (const mutation of mutations) {
      const what = mutation.type === 'attributes' ? `attr ${mutation.attributeName}` : mutation.type;
      record.changes.push({ at, what, where: label(mutation.target) });
    }
  });
  record.observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
}

/** Stops the recording and returns it (the times are the page's, ms). */
export function stopRecording() {
  const record = window.__stalls;
  record.stopped = true;
  record.observer.disconnect();
  return { start: record.start, frames: record.frames, changes: record.changes };
}

/** Whether the loading screen is gone. */
export function loaded() {
  const loading = document.getElementById('loading');
  return !loading || loading.classList.contains('done');
}

/** Whether the bank-or-continue choice is up. */
export function deciding() {
  const box = document.getElementById('decision');
  return Boolean(box && !box.classList.contains('hidden') && !box.classList.contains('closing'));
}

/** Whether the bank-or-continue choice has closed (folded away, or never up). */
export function choiceClosed() {
  const box = document.getElementById('decision');
  return !box || box.classList.contains('hidden');
}

/** Whether a run is under way (the run's HUD is shown). */
export function inRun() {
  const hud = document.getElementById('hud');
  return Boolean(hud && !hud.classList.contains('hidden') && !hud.classList.contains('lobby'));
}

/** Whether the run is over (its summary is up). */
export function runOver() {
  const summary = document.getElementById('summary');
  return Boolean(summary && !summary.classList.contains('hidden'));
}
