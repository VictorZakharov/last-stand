// The hero selection screen (#heroes): the hall of heroes behind it (game/hall.ts), the hero in focus's name, role,
// how he plays, his skills and his records in this save slot in a panel beside him, and a choice that leads into the
// lobby. A first visit opens on it (no hero chosen yet, nothing to go back to); the lobby's "Change hero" opens it again.
// Picked by the arrows, the tabs, a click or tap on a hero, a swipe, or the keys (left and right, A and D; Enter or
// Space chooses, Esc goes back). Every class's card is laid over the others in one cell, the one in focus shown, so
// the panel is the largest's size and nothing moves as the focus does.
import { G } from '../state';
import { CLASSES, CLASS_IDS } from '../data/classes/index';
import { saveSlot } from '../loot/saveSlots';
import { wasPressed } from '../core/input';
import { sfx } from '../core/audio';
import { openHall, closeHall, focusHall, frameHall, hallFocus, hallHeroes, hallOpen } from '../game/hall';
import { makeSkillSlot } from './hud';
import { hideTooltip } from './tooltip';
import type { ClassDef, Profile } from '../types';

const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document): T => root.querySelector<T>(s)!;

export interface HeroSelectHooks {
  /** The hero of class `id` chosen, in the profile the hall shows him in (a class never played: its starter gear). */
  choose(id: string, profile: Profile): void;
  /** The screen closed, a hero chosen (after `choose`) or not (Back). */
  closed(): void;
}

let hooks: HeroSelectHooks;
/** opened on a first visit: no hero to go back to */
let first = false;
/** the view's shift that keeps the hero in focus in the screen's room beside the panel (css px), as last laid out */
let shift = { x: 0, y: 0 };
/** a press on the screen's backdrop: where it went down, to tell a tap on a hero from a swipe */
let press: { x: number; y: number } | null = null;
/** how far a press moves sideways to be a swipe (css px) */
const SWIPE = 48;
/** the most a tap may land from a hero's middle on screen to pick him, as a share of the screen's width */
const TAP_REACH = 0.12;
/** the hero in focus's height on the screen as the hall frames him, a share of its height (game/hall.ts `SHOT`), and
 *  the most of the room above an upright screen's panel he may take */
const HERO_SHARE = 0.585;
const ROOM_FILL = 0.8;

export const heroSelectOpen = (): boolean => !$('#heroes').classList.contains('hidden');

export function initHeroSelect(h: HeroSelectHooks): void {
  hooks = h;
  $('.hs-cards').replaceChildren(...CLASS_IDS.map((id) => card(CLASSES[id])));
  $('.hs-tabs').innerHTML = CLASS_IDS.map((id) => `<button data-c="${id}" style="--cc:${CLASSES[id].accent}">${CLASSES[id].name}</button>`).join('');
  document.querySelectorAll<HTMLElement>('.hs-tabs button').forEach((b) => {
    b.onclick = () => { sfx.click(); focusOn(CLASS_IDS.indexOf(b.dataset.c!)); };
  });
  $('.hs-prev').onclick = () => { sfx.click(); step(-1); };
  $('.hs-next').onclick = () => { sfx.click(); step(1); };
  $('.hs-choose').onclick = () => { sfx.click(); choose(); };
  $('.hs-back').onclick = () => { sfx.click(); if (!first) closeHeroSelect(); };
  const shade = $('.hs-shade');
  shade.addEventListener('pointerdown', (e) => { press = { x: e.clientX, y: e.clientY }; });
  shade.addEventListener('pointerup', (e) => {
    if (!press) return;
    const dx = e.clientX - press.x;
    press = null;
    if (Math.abs(dx) >= SWIPE) step(dx < 0 ? 1 : -1);
    else tapAt(e.clientX, e.clientY);
  });
  shade.addEventListener('pointercancel', () => { press = null; });
  new ResizeObserver(layOut).observe($('.hs-panel'));
  window.addEventListener('resize', layOut);
}

/** One class's card: its name in the logo's forged steel, its role, tagline, how it plays, its skills, its records. */
function card(cls: ClassDef): HTMLElement {
  const el = document.createElement('section');
  el.className = 'hs-card';
  el.dataset.c = cls.id;
  el.style.setProperty('--cc', cls.accent);
  const name = cls.name.toUpperCase();
  const steel = (fill: string, filter: string, cls = '') =>
    `<svg${cls} viewBox="0 0 600 110" aria-hidden="true"><text x="300" y="86" text-anchor="middle" font-family="Cinzel, Georgia, serif" `
    + `font-weight="900" font-size="92" letter-spacing="10" fill="${fill}" filter="url(#${filter})">${name}</text></svg>`;
  const pips = (n: number) => Array.from({ length: 5 }, (_, i) => `<i${i < n ? ' class="on"' : ''}></i>`).join('');
  el.innerHTML = `<div class="hs-name" role="heading" aria-level="2" aria-label="${cls.name}">`
      + `${steel('#e0280c', 'logo-glow-blur', ' class="logo-glow"')}${steel('url(#logo-steel)', 'logo-metal')}</div>`
    + `<div class="hs-role">${cls.hall.role}</div>`
    + `<p class="hs-tag">${cls.tagline}</p>`
    + `<dl class="hs-traits">${cls.hall.traits.map((t) => `<dt>${t.label}</dt><dd aria-label="${t.value} of 5">${pips(t.value)}</dd>`).join('')}</dl>`
    + '<div class="hs-label">Skills</div><div class="hs-skills"></div>'
    + '<div class="hs-records"></div>';
  const skills = $('.hs-skills', el);
  // (another hero's gear isn't the lobby's: each skill's base figures)
  for (const def of cls.skills) skills.appendChild(makeSkillSlot(def, undefined, 'base'));
  return el;
}

/** Open the screen, the hall built behind it, the hero of `focusId` in focus. `firstVisit`: there's nothing to go back
 *  to (no Back, no Esc). */
export function openHeroSelect(focusId: string, firstVisit = false): void {
  if (heroSelectOpen()) return;
  first = firstVisit;
  hideTooltip();
  openHall(focusId, first);
  const box = $('#heroes');
  box.classList.toggle('first', first);
  $('.hs-slot').textContent = `Save slot ${saveSlot()}`;
  for (const h of hallHeroes()) $(`.hs-card[data-c="${h.id}"] .hs-records`).innerHTML = records(h.profile);
  box.classList.remove('hidden');
  document.body.classList.add('in-hall');
  shown();
  layOut();
}

/** Close the screen and take the hall down (the lobby's hero shown again), the hero of `chosen` chosen (none: Back). */
export function closeHeroSelect(chosen?: { id: string; profile: Profile }): void {
  if (!heroSelectOpen()) return;
  hideTooltip();
  $('#heroes').classList.add('hidden');
  document.body.classList.remove('in-hall');
  closeHall();
  if (chosen) hooks.choose(chosen.id, chosen.profile);
  hooks.closed();
}

/** The hero in focus's records in this slot, or that he's yet to play here. */
function records(p: Profile): string {
  const r = p.records;
  if (!r.runs) return '<span class="hs-new">Not yet played in this slot</span>';
  const rec = (v: string | number, label: string) => `<div><b>${v}</b>${label}</div>`;
  return rec(r.bestWave, 'Best wave') + rec(r.bestScore.toLocaleString(), 'Best score') + rec(r.runs, r.runs === 1 ? 'Run' : 'Runs');
}

function step(d: number): void { focusOn(hallFocus() + d); }

function focusOn(i: number): void {
  if (!hallOpen()) return;
  hideTooltip();
  focusHall(i);
  shown();
}

/** The card, tab and choice of the hero in focus shown. */
function shown(): void {
  const id = hallHeroes()[hallFocus()].id, cls = CLASSES[id];
  document.querySelectorAll<HTMLElement>('.hs-card').forEach((c) => c.classList.toggle('active', c.dataset.c === id));
  document.querySelectorAll<HTMLElement>('.hs-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.c === id));
  $('#heroes').style.setProperty('--cc', cls.accent);
  $('.hs-choose').textContent = !first && id === G.profile.classId ? `Stay the ${cls.name}` : `Play the ${cls.name}`;
}

function choose(): void {
  if (!hallOpen()) return;
  const { id, profile } = hallHeroes()[hallFocus()];
  closeHeroSelect({ id, profile });
}

/** A tap or click on the backdrop: the hero nearest it on screen in focus, if it landed near one. */
function tapAt(x: number, y: number): void {
  const w = innerWidth, h = innerHeight;
  let best = -1, bd = TAP_REACH * w;
  for (const [i, hero] of hallHeroes().entries()) {
    const p = hero.player.pos.clone().setY(hero.player.model.height * 0.55).project(G.camera);
    const sx = (p.x + 1) / 2 * w, sy = (1 - p.y) / 2 * h;
    const d = Math.hypot(sx - x, (sy - y) * 0.4);
    if (p.z < 1 && d < bd) { bd = d; best = i; }
  }
  if (best >= 0 && best !== hallFocus()) { sfx.click(); focusOn(best); }
}

/** The screen's keys, while it's open (main.ts gives them to it alone). */
export function heroSelectKeys(): void {
  if (wasPressed('arrowleft') || wasPressed('a')) step(-1);
  if (wasPressed('arrowright') || wasPressed('d')) step(1);
  if (wasPressed('enter') || wasPressed('numpadenter') || wasPressed('space')) choose();
  else if (wasPressed('escape') && !first) closeHeroSelect();
}

/** Where the view shifts so the hero in focus stands in the room the panel leaves: beside it on a wide screen, above
 *  it on an upright one (`setViewShift`'s px). */
export const heroSelectShift = (): { x: number; y: number } => shift;

function layOut(): void {
  if (!heroSelectOpen()) return;
  const r = $('.hs-panel').getBoundingClientRect();
  const beside = r.top < innerHeight * 0.4;
  shift = beside ? { x: -(innerWidth - r.left) / 2, y: 0 } : { x: 0, y: -(innerHeight - r.top) / 2 };
  // (above an upright screen's panel he'd stand taller than the room: the camera further back)
  const room = beside ? 1 : r.top / innerHeight;
  frameHall(Math.max(1, HERO_SHARE / (room * ROOM_FILL)), !beside);
}
