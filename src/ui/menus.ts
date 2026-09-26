// Sanctuary (main menu with equipment & stash), summary, pause and help modals.
import { G } from '../state';
import { SLOTS, SLOT_INFO } from '../data/items';
import { RUN } from '../data/balance';
import { WAVES } from '../data/waves';
import { CLASSES, CLASS_IDS } from '../data/classes/index';
import { rarityOf, rarityIndex, itemPower, byValue, OFFHAND_WEAPON } from '../loot/items';
import { SKILL_KEYS } from '../loot/loadout';
import { equipFromStash, unequip, salvage, salvageEquipped, resetProfile, slotsFor } from '../loot/profile';
import { saveSlot } from '../loot/saveSlots';
import { openSaves } from './saves';
import { bindTooltip, hideTooltip, itemTooltip } from './tooltip';
import { makeSkillSlot, KEY_LABEL, rarityChips } from './hud';
import { renderLoadoutEditor } from './loadoutEditor';
import { initSkillStrip, syncSkillStrip } from './skillStrip';
import { itemIconSVG, slotPlaceholderSVG } from './itemIcons';
import { renderAttributes } from './attributes';
import { initStashFilter, renderStashFilter, openStashFilter, sortStash, matchesFilter } from './stashFilter';
import { sfx } from '../core/audio';
import { isTouch } from './touch';
import { perfHudEnabled, setPerfHud } from './perfHud';
import { qualitySetting, qualityLevel, setQuality } from '../core/quality';
import { QUALITY, type QualitySetting } from '../data/quality';
import { BIOMES, BIOME_IDS, type BiomeSetting } from '../data/biomes';
import { biomeSetting, setBiomeSetting } from '../game/biome';
import { isCoop, isGuest, isHost } from '../net/role';
import { session, partnerInRun } from '../net/session';

import type { RunSummary } from '../game/run';

import type { Item, Slot, SkillKey } from '../types';

/** Commit and build time, set by vite.config.ts. */
declare const __BUILD__: { ref: string; time: string };

/** querySelector that asserts the element exists (menu markup is static). */
const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document): T => root.querySelector<T>(s)!;

export interface MenuHooks {
  start(): void;
  toMenu(): void;
  resume(): void;
  abandon(): void;
  profileChanged(): void;
  switchClass(id: string): void;
  /** the summary's button: back to the lobby, or to watching the rest of a co-op run */
  summaryDone(): void;
  /** the battleground or starting wave changed (a co-op host shows its guests) */
  lobbyChanged(): void;
}

let hooks: MenuHooks;
const newIds = new Set<string>();

/** Controls help reflects the current key bindings (or the touch controls, when a finger is the input). */
export function renderControlsHelp(): void {
  if (isTouch()) {
    const rows = [['Left half', 'Drag to move'], ['Big button', 'Attack (hold to keep attacking)'],
      ['Skill buttons', 'Tap: cast at the nearest foe'], ['', 'Drag, then let go: cast where you aim'], ['', 'Hold a channelled skill to keep it going'],
      ['Pinch', 'Zoom'], ['❚❚', 'Pause'], ['Bank / Continue', 'The buttons after each wave'], ['Revive', 'Hold it by a downed partner (co-op)']];
    const html = rows.map(([k, v]) => `<span class="k">${k}</span><span>${v}</span>`).join('');
    document.querySelectorAll('.controls-help').forEach((el) => { el.classList.remove('diagrams'); el.innerHTML = html; });
    return;
  }
  // each copy (pause menu, How to play) gets its own SVG ids: a hidden copy's gradients don't paint
  document.querySelectorAll('.controls-help').forEach((el, i) => { el.classList.add('diagrams'); el.innerHTML = keyboardDiagram() + mouseDiagram(`ms${i}`); });
}

/** What a skill key does, for the diagrams: the skill's icon, name and whether it is held. */
function skillOn(k: SkillKey): { icon: string; color: string; name: string; hold: boolean } | null {
  const s = G.player.skillAt(k);
  return s ? { icon: s.def.icon.glyph, color: s.def.icon.color, name: s.def.name, hold: !!s.def.channel } : null;
}

/**
 * The left of a keyboard, rows staggered like the real thing: the keys the game uses are lit and
 * show what they do (a skill's icon in its colour, or a word), the rest are dim.
 */
function keyboardDiagram(): string {
  type Cap = { k: string; w?: number; icon?: string; color?: string; cap?: string; tip?: string; hold?: boolean };
  const used: Record<string, Omit<Cap, 'k'>> = {
    esc: { cap: 'Pause', tip: 'Pause' },
    w: { icon: '▲', cap: 'Move', tip: 'Move' }, a: { icon: '◀', cap: 'Move', tip: 'Move' },
    s: { icon: '▼', cap: 'Move', tip: 'Move' }, d: { icon: '▶', cap: 'Move', tip: 'Move' },
    v: { icon: '◎', cap: 'View', tip: 'View: top-down, over the shoulder, first person' },
    b: { icon: '⛁', cap: 'Bank', tip: 'Bank after a wave' }, c: { icon: '➜', cap: 'Continue', tip: 'Continue after a wave' },
    e: { icon: '✚', cap: 'Revive', tip: 'Revive a downed partner (co-op)', hold: true },
  };
  for (const k of SKILL_KEYS) {
    if (k.startsWith('mouse')) continue;
    const sk = skillOn(k);
    used[k] = sk ? { icon: sk.icon, color: sk.color, cap: sk.name, tip: sk.name, hold: sk.hold } : { cap: '—', tip: 'No skill bound' };
  }
  const rows: Cap[][] = [
    [{ k: 'esc' }],
    [{ k: '`' }, ...'123456'.split('').map((k) => ({ k }))],
    [{ k: 'tab', w: 1.5 }, ...'qwerty'.split('').map((k) => ({ k }))],
    [{ k: 'caps', w: 1.75 }, ...'asdfgh'.split('').map((k) => ({ k }))],
    [{ k: 'shift', w: 2.25 }, ...'zxcvbn'.split('').map((k) => ({ k }))],
  ];
  const cap = (c: Cap): string => {
    const u = used[c.k];
    const label = c.k.length > 1 ? c.k[0].toUpperCase() + c.k.slice(1) : c.k.toUpperCase();
    const style = `--w:${c.w ?? 1}${u?.color ? `;--c:${u.color}` : ''}`;
    if (!u) return `<span class="kb-key" style="${style}"><b>${label}</b></span>`;
    return `<span class="kb-key on" style="${style}" title="${label}: ${u.tip}${u.hold ? ' (hold)' : ''}"><b>${label}</b>` +
      (u.icon ? `<i>${u.icon}</i>` : '') + `<small>${u.cap}</small>${u.hold ? '<em>hold</em>' : ''}</span>`;
  };
  return `<div class="kb" aria-label="Keyboard controls">${rows.map((r) => `<div class="kb-row">${r.map(cap).join('')}</div>`).join('')}</div>`;
}

/** A mouse with callouts: each button's skill, the wheel (zoom, drag to turn the camera) and aiming. */
function mouseDiagram(id: string): string {
  const btn = (k: SkillKey, side: string): string => {
    const sk = skillOn(k);
    return `<div class="ms-label ${side}" style="--c:${sk?.color ?? 'var(--ink-dim)'}"><span class="ms-what">${side === 'lb' ? 'Left' : 'Right'} click${sk?.hold ? ' <em>hold</em>' : ''}</span>` +
      `<span class="ms-do">${sk ? `<i>${sk.icon}</i>${sk.name}` : '—'}</span></div>`;
  };
  const l = skillOn('mouse0')?.color ?? '#555', r = skillOn('mouse2')?.color ?? '#555';
  return `<div class="ms" aria-label="Mouse controls">
    <svg viewBox="0 0 460 170" aria-hidden="true">
      <defs>
        <linearGradient id="${id}-body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3026"/><stop offset="1" stop-color="#110d0a"/></linearGradient>
        <radialGradient id="${id}-l" cx=".6" cy=".7" r=".9"><stop offset="0" stop-color="${l}" stop-opacity=".75"/><stop offset="1" stop-color="${l}" stop-opacity=".12"/></radialGradient>
        <radialGradient id="${id}-r" cx=".4" cy=".7" r=".9"><stop offset="0" stop-color="${r}" stop-opacity=".75"/><stop offset="1" stop-color="${r}" stop-opacity=".12"/></radialGradient>
      </defs>
      <path d="M230 12 C 196 12 184 36 184 64 L 184 118 C 184 146 204 162 230 162 C 256 162 276 146 276 118 L 276 64 C 276 36 264 12 230 12 Z" fill="url(#${id}-body)" stroke="#a07c46" stroke-width="2"/>
      <path d="M228 14 C 198 16 187 38 186 66 L 228 66 Z" fill="url(#${id}-l)"/>
      <path d="M232 14 C 262 16 273 38 274 66 L 232 66 Z" fill="url(#${id}-r)"/>
      <path d="M185 67 L 275 67 M 230 12 L 230 67" stroke="#a07c46" stroke-width="1.5"/>
      <rect x="224" y="26" width="12" height="26" rx="6" fill="#e2c07e" stroke="#15100a" stroke-width="2"/>
      <path d="M226 33 h8 M226 39 h8 M226 45 h8" stroke="#6a4f2a" stroke-width="1.5"/>
      <g fill="none" stroke="#a07c46" stroke-width="1" stroke-dasharray="3 3">
        <path d="M204 42 L 150 42"/><path d="M256 42 L 310 42"/><path d="M236 50 L 262 100 L 310 100"/><path d="M200 130 L 150 130"/>
      </g>
      <g fill="#e2c07e"><circle cx="204" cy="42" r="3"/><circle cx="256" cy="42" r="3"/><circle cx="236" cy="50" r="3"/><circle cx="200" cy="130" r="3"/></g>
    </svg>
    ${btn('mouse0', 'lb')}${btn('mouse2', 'rb')}
    <div class="ms-label wheel"><span class="ms-what">Wheel</span><span class="ms-do">Scroll to zoom · drag to turn the camera</span></div>
    <div class="ms-label move"><span class="ms-what">Move</span><span class="ms-do">Aim</span></div>
  </div>`;
}

export function initMenus(h: MenuHooks): void {
  hooks = h;
  $('#btn-start').onclick = () => { sfx.click(); hooks.start(); };
  $('#btn-summary').onclick = () => { sfx.click(); hooks.summaryDone(); };
  $('#btn-resume').onclick = () => { sfx.click(); hooks.resume(); };
  const built = new Date(__BUILD__.time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  $('#pause .build-info').textContent = `Build ${__BUILD__.ref} · ${built}${import.meta.env.DEV ? ' (dev server)' : ''}`;
  $('#btn-abandon').onclick = () => { sfx.click(); hooks.abandon(); };
  $<HTMLInputElement>('#opt-perf').onchange = (e) => setPerfHud((e.target as HTMLInputElement).checked);
  document.querySelectorAll<HTMLElement>('#opt-quality button').forEach((b) => {
    b.onclick = () => { sfx.click(); setQuality(b.dataset.q as QualitySetting); renderQualityOptions(); };
  });
  const classes = $('#opt-class');
  classes.innerHTML = CLASS_IDS.map((id) => `<button data-c="${id}">${CLASSES[id].name}</button>`).join('');
  classes.querySelectorAll<HTMLElement>('button').forEach((b) => {
    // the class's records set the starting wave: a co-op host shows its guests
    b.onclick = () => { sfx.click(); hooks.switchClass(b.dataset.c!); renderMenu(); hooks.lobbyChanged(); };
  });
  const biomes = $('#opt-biome');
  biomes.insertAdjacentHTML('afterbegin', BIOME_IDS.map((id) => `<button data-b="${id}">${BIOMES[id].label}</button>`).join(''));
  biomes.querySelectorAll<HTMLElement>('button').forEach((b) => {
    b.onclick = () => {
      if (isGuest()) return;   // the host picks
      sfx.click(); setBiomeSetting(b.dataset.b as BiomeSetting); renderBiomeOptions(); renderWaveOptions(); hooks.lobbyChanged();
    };
  });
  const waves = $('#opt-wave');
  waves.querySelectorAll<HTMLElement>('button').forEach((b) => {
    b.onclick = () => { sfx.click(); stepWave(Number(b.dataset.d)); };
  });
  waves.addEventListener('wheel', (e) => { e.preventDefault(); stepWave(e.deltaY < 0 ? 1 : -1); }, { passive: false });
  // short screens: the rail picks the one panel shown
  const menu = $('#menu');
  const pickTab = (t: string) => {
    menu.dataset.tab = t;
    document.querySelectorAll<HTMLElement>('#lobby-rail [data-lt]').forEach((b) => b.classList.toggle('active', b.dataset.lt === t));
  };
  document.querySelectorAll<HTMLElement>('#lobby-rail [data-lt]').forEach((b) => {
    b.onclick = () => { sfx.click(); toggleMenuStowed(false); pickTab(b.dataset.lt!); };
  });
  $('#rail-practice').onclick = () => { sfx.click(); toggleMenuStowed(); };
  $('#rail-play').onclick = () => { if (isGuest()) return; sfx.click(); hooks.start(); };
  $('.stow-hint').onclick = () => { sfx.click(); toggleMenuStowed(); };
  $('#btn-help').onclick = () => { renderControlsHelp(); $('#help').classList.remove('hidden'); };
  // fullscreen: the browser's bars take a lot of a phone's screen
  const fs = $('#btn-fullscreen');
  const syncFs = () => { fs.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen'; };
  fs.classList.toggle('hidden', !document.fullscreenEnabled);
  fs.onclick = () => { sfx.click(); (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen({ navigationUI: 'hide' })).catch(() => {}); };
  document.addEventListener('fullscreenchange', syncFs);
  syncFs();
  $('#btn-help-close').onclick = () => $('#help').classList.add('hidden');
  $('#btn-reset').onclick = () => {
    const name = CLASSES[G.profile.classId].name;
    if (!confirm(`Reset the ${name} of save slot ${saveSlot()}? Their stash, equipment and records will be erased (other classes and slots keep theirs).`)) return;
    G.profile = resetProfile(G.profile.classId);
    hooks.profileChanged();
    renderMenu();
  };
  document.querySelectorAll<HTMLElement>('.menu-right .tab').forEach((tab) => {
    tab.onclick = () => {
      sfx.click();
      document.querySelectorAll('.menu-right .tab').forEach((t) => t.classList.toggle('active', t === tab));
      document.querySelectorAll<HTMLElement>('.menu-right .tab-page').forEach((pg) => pg.classList.toggle('hidden', pg.dataset.page !== tab.dataset.tab));
    };
  });
  initStashFilter(renderMenu);
  initSkillStrip($('.cc-strip'));
  const stash = $('#stash');
  stash.addEventListener('contextmenu', (e) => e.preventDefault());
  stash.addEventListener('dragover', (e) => { if (drag?.from === 'equip') e.preventDefault(); });
  stash.addEventListener('drop', (e) => {
    e.preventDefault();
    if (drag?.from === 'equip') { unequip(G.profile, drag.slot); sfx.click(); endDrag(); changed(); }
  });
  const junk = $('#junk');
  junk.addEventListener('dragover', (e) => { if (drag) { e.preventDefault(); junk.classList.add('over'); } });
  junk.addEventListener('dragleave', () => junk.classList.remove('over'));
  junk.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!drag) return;
    const { from, item } = drag;
    newIds.delete(item.id);
    if (from === 'stash') salvage(G.profile, item.id);
    else salvageEquipped(G.profile, drag.slot);
    sfx.salvage();
    endDrag();
    changed();
  });
  // holding Shift in the sanctuary shows the junk bin: Shift-click salvages a stash item
  const setShift = (on: boolean): void => { if (on !== shiftHeld) { shiftHeld = on; syncJunk(); } };
  window.addEventListener('keydown', (e) => { if (e.key === 'Shift') setShift(true); });
  window.addEventListener('keyup', (e) => { if (e.key === 'Shift') setShift(false); });
  window.addEventListener('blur', () => setShift(false));
}

export function showMenu(v: boolean): void {
  $('#menu').classList.toggle('hidden', !v);
  if (v) { toggleMenuStowed(false); renderMenu(); }
  else openSaves(false);   // a co-op host can start the run while the save slots are open
  syncJunk();
}

/** Fade the lobby panels out (to walk around and practice on the dummies) or back in. */
export function toggleMenuStowed(stowed?: boolean): void {
  const menu = $('#menu');
  menu.classList.toggle('stowed', stowed);
  focusSlot(null);
  hideTooltip();
  if (menu.classList.contains('stowed')) { endDrag(); openStashFilter(false); }
  syncJunk();
}
// Short screens and upright tablets show one lobby panel at a time over the scene; the view moves
// so the character stands in the free space beside it (or below it, upright).
const onePanel = matchMedia('(max-height: 520px), (orientation: portrait) and (max-width: 1000px)');
export function lobbyViewShift(): { x: number; y: number } {
  const menu = $('#menu');
  if (!onePanel.matches || menu.classList.contains('hidden') || menu.classList.contains('stowed')) return { x: 0, y: 0 };
  const panel = [...menu.querySelectorAll<HTMLElement>('.menu-left, .menu-center, .menu-right')].find((p) => p.offsetParent);
  if (!panel) return { x: 0, y: 0 };
  const r = panel.getBoundingClientRect();
  return window.innerWidth > window.innerHeight ? { x: r.right / 2, y: 0 } : { x: 0, y: r.bottom / 2 };
}

export function markNew(items: Item[]): void { for (const it of items) newIds.add(it.id); }

/** The battleground and starting wave (a co-op guest sees the host's, and the start button waits for it). */
export function renderLobbyOptions(): void { renderBiomeOptions(); renderWaveOptions(); }

function renderBiomeOptions(): void {
  // a co-op guest sees the host's battleground (Random shows the one rolled at the start)
  const guest = isGuest(), s = guest ? session.biome : biomeSetting();
  document.querySelectorAll<HTMLButtonElement>('#opt-biome button').forEach((b) => { b.classList.toggle('active', b.dataset.b === s); b.disabled = guest; });
  // a co-op host waits for a partner still finishing a run; a guest, for the host
  const start = $<HTMLButtonElement>('#btn-start');
  const busy = !guest && isHost() && partnerInRun();
  start.disabled = guest || busy;
  $<HTMLButtonElement>('#rail-play').disabled = start.disabled;
  start.textContent = guest ? (partnerInRun() ? 'The host is in a run' : 'The host starts the run')
    : busy ? 'Your partner is still in a run' : 'Enter the Arena';
}

// Starting wave: any wave up to the best one cleared and banked in the chosen biome (on
// Random, in every biome), defaulting to that best and jumping back to it when the biome or
// best changes.
let startWave = 1, maxWave = 1, seen = '';
export const selectedWave = (): number => startWave;

function stepWave(d: number): void {
  if (isGuest()) return;   // the host picks
  const w = Math.min(Math.max(startWave + d, 1), maxWave);
  if (w !== startWave) { startWave = w; renderWaveOptions(); hooks.lobbyChanged(); }
}

function renderWaveOptions(): void {
  const s = biomeSetting(), bests = G.profile.records.bestBanked;
  const best = Math.max(1, s === 'random' ? Math.min(...BIOME_IDS.map((id) => bests[id] ?? 0)) : bests[s] ?? 0);
  if (`${s}:${best}` !== seen) { seen = `${s}:${best}`; startWave = maxWave = best; }
  // a co-op guest plays the host's choice
  const guest = isGuest(), wave = guest ? session.wave : startWave;
  const box = $('#opt-wave');
  $('.wv-val', box).innerHTML = `Wave ${wave}${wave % WAVES.bossEvery === 0 ? ' <small>Boss</small>' : ''}`;
  box.querySelectorAll<HTMLButtonElement>('button').forEach((b) => { b.disabled = guest || (Number(b.dataset.d) < 0 ? startWave <= 1 : startWave >= maxWave); });
}

export function renderMenu(): void {
  const p = G.profile;
  renderBiomeOptions();
  renderWaveOptions();
  const cls = CLASSES[p.classId];
  document.querySelectorAll<HTMLElement>('#opt-class button').forEach((b) => b.classList.toggle('active', b.dataset.c === cls.id));
  $('.class-card').style.setProperty('--cc', cls.accent);
  $('.lo-title').textContent = cls.book;
  document.querySelectorAll<HTMLElement>('#equip .doll').forEach((d) => d.classList.toggle('hidden', d.dataset.class !== cls.id));
  $('.cc-name').textContent = cls.name;
  $('.cc-tag').textContent = cls.tagline;
  const sk = $('.cc-skills');
  if (sk.dataset.cls !== cls.id) { sk.dataset.cls = cls.id; sk.scrollLeft = 0; }   // another class starts at its first skills
  sk.innerHTML = '';
  for (const def of cls.skills) sk.appendChild(makeSkillSlot(def)).classList.toggle('unusable', !G.player.usable(def));
  syncSkillStrip();

  $('#btn-saves').textContent = `Save slot ${saveSlot()}`;
  const r = p.records;
  const rec = (icon: string, value: string | number, label: string) =>
    `<div class="rec"><span class="rec-icon">${icon}</span><span class="rec-val">${value}</span><span class="rec-label">${label}</span></div>`;
  $('.records').innerHTML = rec('⚔', r.bestWave, 'Best wave') + rec('✦', r.bestScore.toLocaleString(), 'Best score')
    + rec('⟳', r.runs, 'Runs') + rec('⛁', r.banked, 'Items banked');

  // equipment
  focusSlot(null); // hovered nodes are about to be replaced
  const eq = $('#equip');
  eq.querySelectorAll('.eslot').forEach((n) => n.remove()); // keep the silhouette svg
  for (const slot of SLOTS) {
    const it = p.equipped[slot];
    const d = document.createElement('div');
    d.className = 'eslot' + (it ? '' : ' empty');
    d.dataset.slot = slot;
    // a slot takes the items that fit it (a one-handed weapon also fits a dual-wielder's off-hand)
    const fits = (): boolean => drag?.from === 'stash' && slotsFor(p, drag.item).includes(slot);
    d.addEventListener('dragover', (e) => { if (fits()) { e.preventDefault(); d.classList.add('over'); } });
    d.addEventListener('dragleave', () => d.classList.remove('over'));
    d.addEventListener('drop', (e) => {
      e.preventDefault();
      if (drag && fits()) { newIds.delete(drag.item.id); equipFromStash(p, drag.item.id, slot); sfx.click(); endDrag(); changed(); }
    });
    const color = it ? rarityOf(it.rarity).color : '#666';
    d.style.boxShadow = `inset 0 0 0 1px ${it ? color : 'rgba(160,124,70,.5)'}`;
    d.style.setProperty('--c', color);
    d.innerHTML = `<span class="elabel">${SLOT_INFO[slot].label}</span>${it ? itemIconSVG(it) : slotPlaceholderSVG(slot, cls)}
      <span class="ename2" style="color:${color}">${it ? it.name : ''}</span>${GLOW}`;
    bindSlotFocus(d, slot);
    if (it) {
      // a weapon in the off-hand: its damage (the implicit) counts for less
      bindTooltip(d, slot === 'offhand' && it.slot === 'weapon'
        ? () => ({ ...itemTooltip(it, false)(), foot: `In the off-hand its damage bonus (the implicit) counts at ${OFFHAND_WEAPON * 100}%` })
        : itemTooltip(it, false));
      const doUnequip = () => { unequip(p, slot); hideTooltip(); sfx.click(); changed(); };
      d.onclick = () => {
        if (!isTouch()) { doUnequip(); return; }
        openItemSheet(it, false, 'Unequip', p.stash.length < RUN.bagLimit ? doUnequip : null, () => { salvageEquipped(p, slot); newIds.delete(it.id); sfx.salvage(); changed(); });
      };
      d.oncontextmenu = (e) => { e.preventDefault(); doUnequip(); };
      makeDraggable(d, { from: 'equip', item: it, slot });
    }
    eq.appendChild(d);
  }

  // stats
  G.player.recomputeStats(p.equipped);
  renderAttributes($('#stats'));

  // stash (sorted: rarity desc, then power; the stat filter moves its matches first)
  $('#stash-count').textContent = `(${p.stash.length}/${RUN.bagLimit})`;
  renderStashFilter();
  const st = $('#stash');
  st.innerHTML = '';
  const sorted = sortStash(p.stash);
  for (const it of sorted) {
    const d = document.createElement('div');
    const color = rarityOf(it.rarity).color;
    const eqd = p.equipped[it.slot];
    d.className = 'sitem' + (newIds.has(it.id) ? ' new' : '') + (!eqd || itemPower(it) > itemPower(eqd) ? ' up' : '')
      + (matchesFilter(it) ? '' : ' filtered');
    d.style.setProperty('--c', color);
    d.style.color = color;
    d.dataset.slot = it.slot;
    d.innerHTML = itemIconSVG(it) + GLOW;
    bindSlotFocus(d, it.slot);
    bindTooltip(d, () => ({ ...itemTooltip(it)(), foot: 'Right-click or drag to equip · Shift-click or drag to the junk bin to salvage' }));
    const equip = () => { newIds.delete(it.id); equipFromStash(p, it.id); hideTooltip(); sfx.click(); changed(); };
    d.onclick = (e) => {
      if (isTouch()) { openItemSheet(it, true, 'Equip', equip, () => { newIds.delete(it.id); salvage(p, it.id); sfx.salvage(); changed(); }); return; }
      if (!e.shiftKey) { equip(); return; }
      flyToJunk(d);
      newIds.delete(it.id);
      salvage(p, it.id);
      hideTooltip();
      sfx.salvage();
      changed();
    };
    d.oncontextmenu = (e) => { e.preventDefault(); equip(); };
    makeDraggable(d, { from: 'stash', item: it, slot: it.slot });
    st.appendChild(d);
  }
  for (let i = sorted.length; i < RUN.bagLimit; i++) {
    const d = document.createElement('div');
    d.className = 'sitem';
    d.style.cursor = 'default';
    st.appendChild(d);
  }

  renderLoadoutEditor();
}

// --- touch: a tapped item opens a sheet with its card and what can be done with it ----
function openItemSheet(it: Item, compare: boolean, label: string, act: (() => void) | null, salvageIt: () => void): void {
  hideTooltip();
  const box = $('#item-sheet');
  const close = () => box.classList.add('hidden');
  $('.is-card', box).innerHTML = itemTooltip(it, compare)().html;
  const a = $<HTMLButtonElement>('.is-a', box);
  a.textContent = act ? label : `${label} (stash full)`;
  a.className = 'btn primary is-a';
  a.disabled = !act;
  a.onclick = () => { close(); act?.(); };
  $('.is-salvage', box).onclick = () => { close(); salvageIt(); };
  $('.is-close', box).onclick = () => { sfx.click(); close(); };
  box.onclick = (e) => { if (e.target === box) close(); };
  box.classList.remove('hidden');
}

// --- slot focus -------------------------------------------------------------------
// Hovering an equipment slot lights up every stash item that fits it (and dims the
// rest); hovering a stash item lights up the slot it goes into.
const GLOW = '<span class="slot-glow"></span>';

function focusSlot(slot: Slot | null): void {
  const menu = $('#menu');
  menu.classList.toggle('slot-focus', slot !== null);
  menu.querySelectorAll('.match').forEach((n) => n.classList.remove('match'));
  if (slot) menu.querySelectorAll(`.sitem[data-slot="${slot}"], .eslot[data-slot="${slot}"]`).forEach((n) => n.classList.add('match'));
}

function bindSlotFocus(el: HTMLElement, slot: Slot): void {
  el.addEventListener('pointerenter', () => { if (!drag) focusSlot(slot); });
  el.addEventListener('pointerleave', () => focusSlot(null));
}

// --- item drag & drop -------------------------------------------------------------
/** `slot`: where an equipped item came from (a weapon can sit in the off-hand) */
interface ItemDrag { from: 'stash' | 'equip'; item: Item; slot: Slot }
let drag: ItemDrag | null = null;

function makeDraggable(el: HTMLElement, payload: ItemDrag): void {
  el.draggable = true;
  el.addEventListener('dragstart', (e) => {
    drag = payload;
    hideTooltip();
    focusSlot(null);
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', payload.item.id);
    $('#junk').classList.remove('hidden');
    if (payload.from === 'stash') document.querySelector(`.eslot[data-slot="${payload.item.slot}"]`)?.classList.add('droppable');
    else $('#stash').classList.add('droppable');
  });
  el.addEventListener('dragend', endDrag);
}

// Also called from drop handlers: a re-render may remove the dragged node before 'dragend' fires.
function endDrag(): void {
  drag = null;
  syncJunk();
  document.querySelectorAll('.droppable, .over').forEach((n) => n.classList.remove('droppable', 'over'));
}

// --- junk bin -----------------------------------------------------------------------
let shiftHeld = false;

/** The bin shows while an item is dragged, or while Shift is held over the open sanctuary. */
function syncJunk(): void {
  const menu = $('#menu');
  const discard = shiftHeld && !drag && !menu.classList.contains('hidden') && !menu.classList.contains('stowed');
  menu.classList.toggle('discard', discard);
  const junk = $('#junk');
  junk.classList.toggle('hidden', !drag && !discard);
  junk.classList.toggle('shift', discard);
}

/** A copy of the item's icon arcs into the junk bin, spinning and shrinking, and the bin gulps. */
function flyToJunk(from: HTMLElement): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const bin = $('#junk .junk-icon');
  const a = from.getBoundingClientRect(), b = bin.getBoundingClientRect();
  const ghost = from.cloneNode(true) as HTMLElement;
  ghost.classList.add('junk-fly');
  Object.assign(ghost.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
  document.body.appendChild(ghost);
  // a quadratic arc that rises before dropping into the bin
  const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const cx = dx * 0.35, cy = Math.min(dy, 0) - 90 - Math.abs(dx) * 0.15;
  const spin = dx < 0 ? -1 : 1;
  const frames: Keyframe[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, u = 1 - t;
    const x = 2 * u * t * cx + t * t * dx, y = 2 * u * t * cy + t * t * dy;
    frames.push({ transform: `translate(${x}px, ${y}px) rotate(${spin * 320 * t * t}deg) scale(${1 - 0.72 * t})`, opacity: t < 0.85 ? 1 : (1 - t) / 0.15 });
  }
  ghost.animate(frames, { duration: 560, easing: 'cubic-bezier(.35,0,.65,1)' }).finished.then(() => {
    ghost.remove();
    bin.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35) rotate(-10deg)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
  });
}

function changed(): void {
  hooks.profileChanged();
  renderMenu();
}

export function showSummary({ outcome, wave, score, kills, bag, lost = [], replaced = [], note }: RunSummary): void {
  const box = $('#summary');
  const dead = outcome === 'dead';
  const gone = new Set(lost.map((it) => it.id));
  const kept = bag.filter((it) => !gone.has(it.id));
  const t = $('.sm-title', box);
  t.textContent = dead ? 'You Have Fallen' : 'Spoils Secured';
  t.classList.toggle('dead', dead);
  $('.sm-sub', box).innerHTML = dead
    ? (bag.length ? `The arena claims your <b class="red">${bag.length}</b> unbanked item${bag.length === 1 ? '' : 's'}, never seen.` : 'You carried nothing out — and lost nothing.')
    : `${kept.length} item${kept.length === 1 ? '' : 's'} moved to your stash.${
      replaced.length ? ` Stash full: ${replaced.length} weaker stash item${replaced.length === 1 ? '' : 's'} salvaged to make room.` : ''}${
      lost.length ? ` <b class="red">${lost.length} discarded — nothing weaker left in the stash.</b>` : ''}`;
  $('.sm-stats', box).innerHTML = `<div><b>${wave}</b>Wave</div><div><b>${score.toLocaleString()}</b>Score</div><div><b>${kills}</b>Slain</div>`;
  const items = $('.sm-items', box);
  items.className = 'sm-items';
  items.innerHTML = '';
  clearReveal();
  // a fall loses them unseen (only their rarities show); banking reveals them one by one, the best last
  if (dead) items.innerHTML = rarityChips(bag, 'chip lost');
  else {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    bag.slice().sort(byValue).reverse().forEach((it, i) => {
      const c = document.createElement('span');
      c.className = 'chip reveal' + (gone.has(it.id) ? ' lost' : '');
      c.style.color = rarityOf(it.rarity).color;
      c.style.animationDelay = `${0.3 + i * REVEAL_STEP}s`;
      c.textContent = it.name;
      bindTooltip(c, itemTooltip(it));
      items.prepend(c);   // the best ends up first in the list
      if (!still) revealTimers.push(setTimeout(() => sfx.loot(rarityIndex(it.rarity)), (0.3 + i * REVEAL_STEP) * 1000));
    });
  }
  if (!dead) markNew(kept);
  $('.sm-note', box).textContent = note ?? '';
  // in co-op the others may fight on: the button then watches them, and the lobby follows the run's end
  const watching = G.run && G.run.phase !== 'over' && G.players.some((p) => !p.local && p.inRun);
  $('#btn-summary').textContent = watching ? 'Watch the rest of the run' : 'Return to the Sanctuary';
  box.classList.remove('hidden');
}

export function hideSummary(): void { $('#summary').classList.add('hidden'); hideTooltip(); clearReveal(); }

/** seconds between one cache opening and the next on the summary */
const REVEAL_STEP = 0.22;
let revealTimers: ReturnType<typeof setTimeout>[] = [];
function clearReveal(): void { revealTimers.forEach(clearTimeout); revealTimers = []; }
function renderQualityOptions(): void {
  const s = qualitySetting();
  document.querySelectorAll<HTMLElement>('#opt-quality button').forEach((b) => b.classList.toggle('active', b.dataset.q === s));
  // Auto shows the level it is currently running at
  $('#opt-quality [data-q="auto"] small').textContent = s === 'auto' ? `(${QUALITY[qualityLevel()].label})` : '';
}

export function showPause(v: boolean): void {
  if (v) {
    renderControlsHelp();
    $<HTMLInputElement>('#opt-perf').checked = perfHudEnabled();
    renderQualityOptions();
    // in the lobby there is no run to abandon; in co-op it leaves the others to it
    $('#btn-abandon').classList.toggle('hidden', G.mode !== 'run');
    $('#btn-abandon').textContent = isCoop() ? 'Leave the run (lose spoils)' : 'Abandon run (lose spoils)';
    $('.pause-note').classList.toggle('hidden', !isCoop() || G.mode !== 'run');
  }
  $('#pause').classList.toggle('hidden', !v);
}
