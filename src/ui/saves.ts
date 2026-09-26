// The save slots screen (the lobby's "Save slot N"): the three saves side by side, each showing what it
// holds (every hero's waves, gear, skills, attributes, stash and records), to play one or to delete one
// (typing DELETE confirms). An empty slot is a fresh start, to play from the beginning with a friend,
// say, while the other slots keep their heroes.
import { G } from '../state';
import { CLASSES, CLASS_IDS } from '../data/classes/index';
import { BIOMES, BIOME_IDS } from '../data/biomes';
import { SLOTS } from '../data/items';
import { RUN } from '../data/balance';
import { SAVE_SLOTS, saveSlot } from '../loot/saveSlots';
import { peekProfile, eraseProfiles } from '../loot/profile';
import { SKILL_KEYS, loadLoadout, eraseLoadouts } from '../loot/loadout';
import { computeStats, gearOf, itemPower, rarityOf } from '../loot/items';
import { eraseStashFilters } from './stashFilter';
import { ATTRIBUTE_GROUPS } from './attributes';
import { itemIconSVG, slotPlaceholderSVG } from './itemIcons';
import { bindTooltip, hideTooltip, itemTooltipHTML } from './tooltip';
import { makeSkillSlot, rarityChips } from './hud';
import { sfx } from '../core/audio';
import type { ClassDef, DerivedStats, Profile } from '../types';

const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document): T => root.querySelector<T>(s)!;

export interface SavesHooks {
  /** Play a save slot: its last hero takes the lobby (in an empty slot, a fresh one of the class on show). */
  use(slot: number): void;
}

let hooks: SavesHooks;
/** the slot whose deletion is being confirmed (0: none) */
let deleting = 0;

const NUMERALS = ['', 'I', 'II', 'III'];
/** the attributes shown for each hero (the lobby's Attributes tab has them all) */
const SHOWN: (keyof DerivedStats)[] = ['maxLife', 'maxEnergy', 'damagePct', 'crit', 'armor', 'resist'];
const ATTRS = ATTRIBUTE_GROUPS.flatMap(([, defs]) => defs).filter((d) => SHOWN.includes(d.value));

export function initSaves(h: SavesHooks): void {
  hooks = h;
  $('#btn-saves').onclick = () => { sfx.click(); openSaves(true); };
  $('#saves .sv-back').onclick = () => { sfx.click(); openSaves(false); };
  const box = $('#save-delete'), field = $<HTMLInputElement>('#sd-input', box), ok = $<HTMLButtonElement>('.sd-ok', box);
  field.oninput = () => { ok.disabled = !typedDelete(); };
  // the game ignores keys typed into a field, so its Esc is caught here
  field.onkeydown = (e) => { if (e.key === 'Escape') { e.preventDefault(); askDelete(0); } };
  $<HTMLFormElement>('.sd-form', box).onsubmit = (e) => { e.preventDefault(); if (typedDelete()) erase(deleting); };
  $('.sd-cancel', box).onclick = () => { sfx.click(); askDelete(0); };
  box.onclick = (e) => { if (e.target === box) askDelete(0); };
  window.addEventListener('resize', () => { if (savesOpen()) fades(); });
}

const typedDelete = (): boolean => $<HTMLInputElement>('#sd-input').value.trim() === 'DELETE';

export const savesOpen = (): boolean => !$('#saves').classList.contains('hidden');

/** Show or hide the screen. While it's up, the hero behind stands still: the keys are the screen's. */
export function openSaves(open: boolean): void {
  if (open === savesOpen()) return;
  hideTooltip();
  askDelete(0);
  $('#saves').classList.toggle('hidden', !open);
  G.player.idle = open;
  if (open) render();
}

/** Esc: out of the delete confirmation first, then off the screen. */
export function savesBack(): void {
  if (deleting) askDelete(0);
  else openSaves(false);
}

function render(): void {
  G.player.idle = true;   // a hero rebuilt for an erased slot stands still too
  $('#saves .sv-panes').replaceChildren(...SAVE_SLOTS.map(pane));
  document.querySelectorAll<HTMLElement>('#saves .sv-body').forEach((b) => { b.onscroll = () => fade(b); });
  fades();
}

/** A pane with more below fades out at its foot, until scrolled to the end. */
const fade = (b: HTMLElement): void => { b.classList.toggle('more', b.scrollTop + b.clientHeight < b.scrollHeight - 4); };
const fades = (): void => document.querySelectorAll<HTMLElement>('#saves .sv-body').forEach(fade);

interface Hero { cls: ClassDef; p: Profile }

/** Heroes played in a slot, the last played first. */
const heroesIn = (slot: number): Hero[] => CLASS_IDS
  .flatMap((id) => { const p = peekProfile(id, slot); return p ? [{ cls: CLASSES[id], p }] : []; })
  .sort((a, b) => (b.p.saved ?? 0) - (a.p.saved ?? 0));

function pane(n: number): HTMLElement {
  const current = n === saveSlot(), heroes = heroesIn(n);
  const last = Math.max(0, ...heroes.map((h) => h.p.saved ?? 0));
  const total = (f: (p: Profile) => number) => heroes.reduce((s, h) => s + f(h.p), 0);
  const time = total((p) => p.records.time ?? 0);
  const totals = [heroes.length ? count(heroes.length, 'hero', 'heroes') : '', heroes.length ? count(total((p) => p.records.runs), 'run') : '',
    time ? `${played(time)} in the arena` : ''].filter(Boolean).join(' · ');
  const status = current ? 'Playing now' : !heroes.length ? 'Empty' : last ? `Last played ${ago(last)}` : 'Saved';
  const play = current ? 'Keep playing' : heroes.length ? `Play slot ${n}` : `Start fresh in slot ${n}`;

  const el = document.createElement('section');
  el.className = `sv-pane${current ? ' current' : ''}${heroes.length ? '' : ' empty'}`;
  el.setAttribute('aria-label', `Save slot ${n}`);
  el.innerHTML = `<header class="sv-head"><div class="sv-gem" aria-hidden="true">${NUMERALS[n]}</div>
      <div class="sv-name">Slot ${n}<span class="sv-status">${status}</span></div></header>
    ${totals ? `<div class="sv-totals">${totals}</div>` : ''}
    <div class="sv-body"></div>
    <footer class="sv-foot"><button class="btn primary sv-play">${play}</button>`
      + `${heroes.length ? `<button class="btn danger sv-del" aria-label="Delete slot ${n}">${TRASH}<span>Delete</span></button>` : ''}</footer>`;
  const body = $('.sv-body', el);
  if (!heroes.length) body.innerHTML = emptyHTML(current);
  for (const h of heroes) body.appendChild(heroCard(h, n));
  if (heroes.length) for (const id of CLASS_IDS) if (!heroes.some((h) => h.cls.id === id)) body.appendChild(unplayed(CLASSES[id]));
  $('.sv-play', el).onclick = () => { sfx.click(); if (!current) hooks.use(n); openSaves(false); };
  const del = el.querySelector<HTMLElement>('.sv-del');
  if (del) del.onclick = () => { sfx.click(); askDelete(n); };
  return el;
}

/** Everything about one hero of a slot: records, starting waves, gear, skills, attributes, stash. */
function heroCard({ cls, p }: Hero, slot: number): HTMLElement {
  const r = p.records;
  const worn = SLOTS.flatMap((s) => { const it = p.equipped[s]; return it ? [it] : []; });
  const levels = worn.map((it) => it.ilvl);
  const avg = levels.length ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) : 0;
  const top = Math.max(0, ...levels, ...p.stash.map((it) => it.ilvl));
  const power = worn.reduce((s, it) => s + itemPower(it), 0);
  const stats = computeStats(cls.base, p.equipped);
  // the lobby lets a run start at any wave up to the best one banked there
  const starts = BIOME_IDS.map((b) => { const best = r.bestBanked[b] ?? 0; return `${BIOMES[b].label} ${best > 1 ? `1–${best}` : '1'}`; });
  const rec = (v: string | number, label: string) => `<div><b>${v}</b>${label}</div>`;
  /** a list whose entries don't break inside */
  const list = (xs: string[]) => xs.filter(Boolean).map((x) => `<span class="nw">${x}</span>`).join(' · ');

  const el = document.createElement('div');
  el.className = 'sv-hero';
  el.style.setProperty('--cc', cls.accent);
  el.innerHTML = `<div class="svh-top"><span class="svh-name">${cls.name}</span>`
      + `${p.saved ? `<span class="svh-when" title="${new Date(p.saved).toLocaleString()}">${ago(p.saved)}</span>` : ''}</div>`
    + `<div class="svh-recs">${rec(r.bestWave, 'Best wave')}${rec(r.bestScore.toLocaleString(), 'Best score')}${rec(r.runs, 'Runs')}${rec(r.time ? played(r.time) : '—', 'Played')}</div>`
    + '<div class="svh-gear"></div>'
    + `<div class="svh-cap">${worn.length ? `Item level <b>${avg}</b> on average, <b>${top}</b> at best · Power <b>${power.toLocaleString()}</b>` : 'Nothing equipped'}</div>`
    + '<div class="svh-skills"></div>'
    + `<div class="svh-attrs">${ATTRS.map((d) => `<div><span>${d.label}</span><b>${d.fmt(stats[d.value])}</b></div>`).join('')}</div>`
    + `<dl class="svh-rows"><dt>Starting wave</dt><dd>${list(starts)}</dd>`
      + `<dt>Stash</dt><dd class="svh-stash"><span>${p.stash.length} / ${RUN.bagLimit}</span>${rarityChips(p.stash)}</dd>`
      + `<dt>Records</dt><dd>${list([`${count(r.banked, 'item')} banked`, r.kills ? `${count(r.kills, 'foe')} slain` : ''])}</dd></dl>`;

  const gear = $('.svh-gear', el);
  for (const s of SLOTS) {
    const it = p.equipped[s], t = document.createElement('div');
    t.className = 'svh-item' + (it ? '' : ' empty');
    if (it) {
      t.style.setProperty('--c', rarityOf(it.rarity).color);
      t.innerHTML = itemIconSVG(it);
      bindTooltip(t, () => itemTooltipHTML(it, undefined, cls));
    } else t.innerHTML = slotPlaceholderSVG(s, cls);
    gear.appendChild(t);
  }
  // the keys as the hero left them, for the gear held
  const loadout = loadLoadout(cls, gearOf(cls, p.equipped), slot);
  const skills = $('.svh-skills', el);
  for (const k of SKILL_KEYS) skills.appendChild(makeSkillSlot(cls.skills.find((s) => s.impl === loadout[k]) ?? null, k));
  return el;
}

function unplayed(cls: ClassDef): HTMLElement {
  const el = document.createElement('div');
  el.className = 'sv-hero unplayed';
  el.style.setProperty('--cc', cls.accent);
  el.innerHTML = `<span class="svh-name">${cls.name}</span><span class="svh-when">Not played in this slot</span>`;
  return el;
}

/** The junk bin's can (narrow panes show only it) */
const TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h16M9.5 6V4.2h5V6M6.2 6.8l1 13.2h9.6l1-13.2M10 10v7M14 10v7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** An empty heraldic shield */
const EMBLEM = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 5 54 13v17c0 14-10 24-22 29C20 54 10 44 10 30V13z" fill="none" stroke="currentColor" stroke-width="2"/>'
  + '<path d="M32 21 38 31 32 41 26 31z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';

function emptyHTML(current: boolean): string {
  return `<div class="sv-empty">${EMBLEM}
    <p>${current ? 'Nothing saved here yet: your hero is fresh, and your next run saves here.' : 'An empty slot: a fresh start, every hero at wave 1 with starter gear.'}</p>
    <p class="sv-note">Starting over with a friend? Play an empty slot: your other slots keep their heroes.</p></div>`;
}

// --- deleting: a popup over the screen, confirmed by typing DELETE ------------------------------
function askDelete(n: number): void {
  deleting = n;
  const box = $('#save-delete');
  box.classList.toggle('hidden', !n);
  if (!n) return;
  const names = heroesIn(n).map((h) => `the ${h.cls.name}`);
  const who = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? 'the heroes';
  $('.sm-title', box).textContent = `Delete slot ${n}?`;
  $('.sd-what', box).innerHTML = `<p>${who[0].toUpperCase() + who.slice(1)} of this slot will be gone for good: gear, stash, records and skill loadouts. Your other slots keep theirs.</p>`
    + (n === saveSlot() ? '<p>You are playing this slot: your hero starts over with starter gear.</p>' : '');
  const field = $<HTMLInputElement>('#sd-input', box), ok = $<HTMLButtonElement>('.sd-ok', box);
  field.value = '';
  ok.disabled = true;
  ok.textContent = `Delete slot ${n}`;
  field.focus();
}

function erase(n: number): void {
  eraseProfiles(n);
  eraseLoadouts(n);
  eraseStashFilters(n);
  sfx.salvage();
  askDelete(0);
  // the slot in play: its hero starts over where it stands
  if (n === saveSlot()) hooks.use(n);
  render();
}

// --- wording ------------------------------------------------------------------------------------
const count = (n: number, word: string, many = word + 's'): string => `${n.toLocaleString()} ${n === 1 ? word : many}`;

/** Time in the arena: "4h 12m", "35m". */
function played(s: number): string {
  const m = Math.round(s / 60);
  return m < 1 ? 'under a minute' : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];

/** "3 days ago", "yesterday", "just now". */
function ago(t: number): string {
  const s = (t - Date.now()) / 1000;
  for (const [unit, n] of UNITS) if (-s >= n) return rtf.format(Math.round(s / n), unit);
  return 'just now';
}
