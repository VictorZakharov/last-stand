// What runs in the game's page for a measure of its stalls (tools/stalls). Each function is serialized into the page,
// so it can use nothing from here.

/**
 * Records every animation frame's interval (and whether a tooltip was shown in it) and every change to the page's
 * HTML from now on, into `window.__stalls`, and marks the trace (`console.timeStamp`) at the moment its clock starts,
 * so the trace's times can be put on it. A scenario marks its phases on it (`markPhase`).
 */
export function startRecording(mark) {
  const record = { start: performance.now(), frames: [], changes: [], phases: [] };
  window.__stalls = record;
  console.timeStamp(mark);
  let last = record.start;
  const tooltip = document.getElementById('tooltip');
  const tick = (now) => {
    const tip = Boolean(tooltip && !tooltip.classList.contains('hidden'));
    record.frames.push({ at: now, ms: now - last, tip });
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

/** Puts `css` on the page in a stylesheet of its own, in place of the one put there before (a variant's, while the
 *  page runs: `--rounds`). */
export function useStyle(css) {
  const id = 'stalls-variant';
  let style = document.getElementById(id);
  if (!style) {
    style = document.createElement('style');
    style.id = id;
    document.head.append(style);
  }
  style.textContent = css;
}

/** Marks the start of a scenario's phase `name` on the recording (its frames are summed up apart). */
export function markPhase(name) {
  window.__stalls.phases.push({ name, at: performance.now() });
}

/** Stops the recording and returns it (the times are the page's, ms). */
export function stopRecording() {
  const record = window.__stalls;
  record.stopped = true;
  record.observer.disconnect();
  return { start: record.start, frames: record.frames, changes: record.changes, phases: record.phases };
}

/** The boxes (css px) of the items shown in the lobby, each hovered for its tooltip: the hero's equipment slots,
 *  and the stash's items in its view (hovering one lights up those that fit its slot). */
export function itemBoxes() {
  const stash = document.getElementById('stash')?.getBoundingClientRect();
  const boxOf = (element) => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  };
  const shown = (box) => box.width > 0 && box.height > 0;
  const inStash = (box) => stash && box.y >= stash.y && box.y + box.height <= stash.y + stash.height;
  const slots = [...document.querySelectorAll('#equip .eslot')].map(boxOf).filter(shown);
  const items = [...document.querySelectorAll('#stash .sitem')].map(boxOf).filter((box) => shown(box) && inStash(box));
  return { slots, items };
}

/** Whether the lobby has the hero's equipment shown (its panels loaded). */
export function equipmentShown() {
  return document.querySelectorAll('#equip .eslot').length > 0;
}

/**
 * Fills the stash of the hero's saved profile with `count` items, copies of those he has, in each rarity in turn (a
 * copy of his own has a base the game draws an icon for), and keeps it in the session for `seededProfile` to put back
 * after the next load's fresh storage. Returns how many it put there: 0 if no profile is saved (one is, once an item
 * is moved).
 */
export function seedStash(count) {
  const key = Object.keys(localStorage).find((name) => /^last-stand\.profile\.[a-z]+\.v1$/.test(name));
  if (!key) return 0;
  const profile = JSON.parse(localStorage.getItem(key));
  const own = [...profile.stash, ...Object.values(profile.equipped)];
  const rarities = ['common', 'magic', 'rare', 'epic', 'legendary'];
  profile.stash = Array.from({ length: count }, (_, index) => ({
    ...own[index % own.length],
    id: `stalls-${index}`,
    rarity: rarities[index % rarities.length],
  }));
  sessionStorage.setItem('stalls.seed', JSON.stringify({ key, value: JSON.stringify(profile) }));
  return profile.stash.length;
}

/** Puts back the profile `seedStash` kept, before the page's scripts and after its storage was made fresh (an init
 *  script, run on every load). */
export function seededProfile() {
  try {
    const seed = sessionStorage.getItem('stalls.seed');
    if (!seed) return;
    const { key, value } = JSON.parse(seed);
    localStorage.setItem(key, value);
  } catch {
    // storage blocked: the stash stays empty, as the scenario's notes say
  }
}

/** Whether the loading screen is gone. */
export function loaded() {
  const loading = document.getElementById('loading');
  return !loading || loading.classList.contains('done');
}

/** Whether the lobby's panels are stowed (`ui/menus.ts` `toggleMenuStowed`). */
export function menuStowed() {
  return Boolean(document.getElementById('menu')?.classList.contains('stowed'));
}

/** How many times the recording saw the lobby's panels stowed or shown again (a change of the menu's class). */
export function stowsRecorded() {
  const onMenu = (change) => change.what === 'attr class' && /^div#menu(\.|$)/.test(change.where);
  return window.__stalls.changes.filter(onMenu).length;
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

/** The local hero's kills and damage dealt in the scores held up on Tab (`ui/scoreboard.ts`: its row's columns
 *  headed Kills and Damage, as they read), or null while they aren't shown. */
export function scoresShown() {
  const board = document.getElementById('scoreboard');
  if (!board || board.classList.contains('hidden')) return null;
  const heads = [...board.querySelectorAll('th')].map((head) => head.textContent);
  const cells = [...board.querySelectorAll('tr.me td')].map((cell) => cell.textContent);
  const kills = cells[heads.indexOf('Kills')];
  const damage = cells[heads.indexOf('Damage')];
  return kills === undefined ? null : { kills: Number(kills), damage: damage ?? '?' };
}

/** Whether the run is over (its summary is up). */
export function runOver() {
  const summary = document.getElementById('summary');
  return Boolean(summary && !summary.classList.contains('hidden'));
}
