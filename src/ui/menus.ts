// Sanctuary (main menu with equipment & stash), summary, pause and help modals.
import { G } from '../state';
import { SLOTS, SLOT_INFO } from '../data/items';
import { RUN } from '../data/balance';
import { CLASSES } from '../data/classes/index';
import { rarityOf, rarityIndex, itemPower } from '../loot/items';
import { SKILL_KEYS } from '../loot/loadout';
import { equipFromStash, unequip, salvage, salvageEquipped, resetProfile } from '../loot/profile';
import { bindTooltip, hideTooltip, itemTooltip } from './tooltip';
import { makeSkillSlot, KEY_LABEL } from './hud';
import { renderLoadoutEditor } from './loadoutEditor';
import { itemIconSVG, slotPlaceholderSVG } from './itemIcons';
import { renderAttributes } from './attributes';
import { sfx } from '../core/audio';
import type { RunSummary } from '../game/run';
import type { Item, Slot } from '../types';

/** querySelector that asserts the element exists (menu markup is static). */
const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document): T => root.querySelector<T>(s)!;

export interface MenuHooks {
  start(): void;
  toMenu(): void;
  resume(): void;
  abandon(): void;
  profileChanged(): void;
}

let hooks: MenuHooks;
const newIds = new Set<string>();

/** Controls help reflects the current key bindings. */
export function renderControlsHelp(): void {
  const skillRows = SKILL_KEYS.map((k) => {
    const s = G.player.skillAt(k);
    const label = k === 'mouse0' ? 'Left click' : k === 'mouse2' ? 'Right click' : KEY_LABEL[k];
    return [s?.def.channel ? `${label} (hold)` : label, s ? s.def.name : '—'];
  });
  const rows = [['W A S D', 'Move'], ['Mouse', 'Aim'], ...skillRows, ['Mouse wheel', 'Zoom'], ['B / C', 'Bank / Continue after a wave'], ['Esc', 'Pause']];
  const html = rows.map(([k, v]) => `<span class="k">${k}</span><span>${v}</span>`).join('');
  document.querySelectorAll('.controls-help').forEach((el) => { el.innerHTML = html; });
}

export function initMenus(h: MenuHooks): void {
  hooks = h;
  $('#btn-start').onclick = () => { sfx.click(); hooks.start(); };
  $('#btn-summary').onclick = () => { sfx.click(); hooks.toMenu(); };
  $('#btn-resume').onclick = () => { sfx.click(); hooks.resume(); };
  $('#btn-abandon').onclick = () => { sfx.click(); hooks.abandon(); };
  $('#btn-help').onclick = () => { renderControlsHelp(); $('#help').classList.remove('hidden'); };
  $('#btn-help-close').onclick = () => $('#help').classList.add('hidden');
  $('#btn-reset').onclick = () => {
    if (!confirm('Reset your profile? Your stash, equipment and records will be erased.')) return;
    G.profile = resetProfile();
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
  const stash = $('#stash');
  stash.addEventListener('contextmenu', (e) => e.preventDefault());
  stash.addEventListener('dragover', (e) => { if (drag?.from === 'equip') e.preventDefault(); });
  stash.addEventListener('drop', (e) => {
    e.preventDefault();
    if (drag?.from === 'equip') { unequip(G.profile, drag.item.slot); sfx.click(); endDrag(); changed(); }
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
    else salvageEquipped(G.profile, item.slot);
    sfx.salvage();
    endDrag();
    changed();
  });
}

export function showMenu(v: boolean): void { $('#menu').classList.toggle('hidden', !v); if (v) renderMenu(); }
export function markNew(items: Item[]): void { for (const it of items) newIds.add(it.id); }

export function renderMenu(): void {
  const p = G.profile;
  const cls = CLASSES[p.classId];
  $('.cc-name').textContent = cls.name;
  $('.cc-tag').textContent = cls.tagline;
  const sk = $('.cc-skills');
  sk.innerHTML = '';
  for (const def of cls.skills) sk.appendChild(makeSkillSlot(def));

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
    d.addEventListener('dragover', (e) => { if (drag?.from === 'stash' && drag.item.slot === slot) { e.preventDefault(); d.classList.add('over'); } });
    d.addEventListener('dragleave', () => d.classList.remove('over'));
    d.addEventListener('drop', (e) => {
      e.preventDefault();
      if (drag?.from === 'stash' && drag.item.slot === slot) { newIds.delete(drag.item.id); equipFromStash(p, drag.item.id); sfx.click(); endDrag(); changed(); }
    });
    const color = it ? rarityOf(it.rarity).color : '#666';
    d.style.boxShadow = `inset 0 0 0 1px ${it ? color : 'rgba(160,124,70,.5)'}`;
    d.style.setProperty('--c', color);
    d.innerHTML = `<span class="elabel">${SLOT_INFO[slot].label}</span>${it ? itemIconSVG(it) : slotPlaceholderSVG(slot)}
      <span class="ename2" style="color:${color}">${it ? it.name : ''}</span>${GLOW}`;
    bindSlotFocus(d, slot);
    if (it) {
      bindTooltip(d, itemTooltip(it, false));
      const doUnequip = () => { unequip(p, slot); hideTooltip(); sfx.click(); changed(); };
      d.onclick = doUnequip;
      d.oncontextmenu = (e) => { e.preventDefault(); doUnequip(); };
      makeDraggable(d, { from: 'equip', item: it });
    }
    eq.appendChild(d);
  }

  // stats
  G.player.recomputeStats(p.equipped);
  renderAttributes($('#stats'));

  // stash (sorted: rarity desc, then power)
  $('#stash-count').textContent = `(${p.stash.length}/${RUN.bagLimit})`;
  const st = $('#stash');
  st.innerHTML = '';
  const sorted = p.stash.slice().sort((a, b) => rarityIndex(b.rarity) - rarityIndex(a.rarity) || itemPower(b) - itemPower(a));  for (const it of sorted) {
    const d = document.createElement('div');
    const color = rarityOf(it.rarity).color;
    const eqd = p.equipped[it.slot];
    d.className = 'sitem' + (newIds.has(it.id) ? ' new' : '') + (!eqd || itemPower(it) > itemPower(eqd) ? ' up' : '');
    d.style.setProperty('--c', color);
    d.style.color = color;
    d.dataset.slot = it.slot;
    d.innerHTML = itemIconSVG(it) + GLOW;
    bindSlotFocus(d, it.slot);
    bindTooltip(d, () => ({ ...itemTooltip(it)(), foot: 'Right-click or drag to equip · Drag to the junk bin to salvage' }));
    const equip = () => { newIds.delete(it.id); equipFromStash(p, it.id); hideTooltip(); sfx.click(); changed(); };
    d.onclick = equip;
    d.oncontextmenu = (e) => { e.preventDefault(); equip(); };
    makeDraggable(d, { from: 'stash', item: it });
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
interface ItemDrag { from: 'stash' | 'equip'; item: Item }
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
  $('#junk').classList.add('hidden');
  document.querySelectorAll('.droppable, .over').forEach((n) => n.classList.remove('droppable', 'over'));
}

function changed(): void {
  hooks.profileChanged();
  renderMenu();
}

export function showSummary({ outcome, wave, score, kills, bag, lost = 0 }: RunSummary): void {
  const box = $('#summary');
  const dead = outcome === 'dead';
  const t = $('.sm-title', box);
  t.textContent = dead ? 'You Have Fallen' : 'Spoils Secured';
  t.classList.toggle('dead', dead);
  $('.sm-sub', box).innerHTML = dead
    ? (bag.length ? `The arena claims your <b class="red">${bag.length}</b> unbanked item${bag.length === 1 ? '' : 's'}.` : 'You carried nothing out — and lost nothing.')
    : `${bag.length} item${bag.length === 1 ? '' : 's'} moved to your stash.${lost ? ` <b class="red">${lost} discarded — stash full.</b>` : ''}`;
  $('.sm-stats', box).innerHTML = `<div><b>${wave}</b>Wave</div><div><b>${score.toLocaleString()}</b>Score</div><div><b>${kills}</b>Slain</div>`;
  const items = $('.sm-items', box);
  items.className = 'sm-items' + (dead ? ' lost' : '');
  items.innerHTML = '';
  for (const it of bag) {
    const c = document.createElement('span');
    c.className = 'chip';
    c.style.color = rarityOf(it.rarity).color;
    c.textContent = it.name;
    if (!dead) bindTooltip(c, itemTooltip(it));
    items.appendChild(c);
  }
  if (!dead) markNew(bag);
  box.classList.remove('hidden');
}

export function hideSummary(): void { $('#summary').classList.add('hidden'); hideTooltip(); }
export function showPause(v: boolean): void { if (v) renderControlsHelp(); $('#pause').classList.toggle('hidden', !v); }
