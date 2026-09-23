// In-run HUD: bars, hotbar, score, target frame, minimap, spoils, decision panel.
import { G } from '../state';
import { input } from '../core/input';
import { cameraYaw } from '../core/renderer';
import { rarityOf, byValue } from '../loot/items';
import { WAVES } from '../data/waves';
import { BIOMES } from '../data/biomes';
import { bindTooltip, itemTooltip, skillTooltip } from './tooltip';
import { on } from '../events';

import { SKILL_KEYS } from '../loot/loadout';
import type { Player } from '../entities/player';
import type { Item, SkillDef, SkillKey } from '../types';

/** querySelector that asserts the element exists (HUD markup is static). */
const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document): T => root.querySelector<T>(s)!;
export const KEY_LABEL: Record<SkillKey, string> = { mouse0: 'LMB', mouse2: 'RMB', '1': '1', '2': '2', '3': '3', '4': '4', q: 'Q' };

interface HotbarSlot { key: SkillKey; el: HTMLElement; cd: HTMLElement; cdt: HTMLElement; boundId: string | null }
let slots: HotbarSlot[] = [];
let bannerTimer: ReturnType<typeof setTimeout> | undefined;
let lastMult = 1;
let mmCtx: CanvasRenderingContext2D;

export function initHud(): void {
  mmCtx = $<HTMLCanvasElement>('#minimap').getContext('2d')!;
  on('itemPicked', renderSpoils);
  on('waveStarted', renderSpoils);
}

export function showHud(v: boolean): void { $('#hud').classList.toggle('hidden', !v); }

/** Build the in-run hotbar from the player's current loadout. */
export function buildHotbar(player: Player): void {
  const bar = $('#hotbar');
  bar.innerHTML = '';
  slots = SKILL_KEYS.map((key) => {
    const el = makeSkillSlot(player.skillAt(key)?.def ?? null, key);
    if (key === 'q') el.classList.add('sep');
    bar.appendChild(el);
    return { key, el, cd: $('.cd', el), cdt: $('.cdt', el), boundId: player.loadout[key] };
  });
}

/** A skill icon slot. `def` null renders an empty slot; `key` adds a key label. */
export function makeSkillSlot(def: SkillDef | null, key?: SkillKey): HTMLElement {
  const el = document.createElement('div');
  el.className = 'slot' + (def ? '' : ' empty');
  const label = key ? `<span class="key">${KEY_LABEL[key]}</span>` : '';
  if (!def) {
    el.innerHTML = `<div class="cd"></div><div class="cdt"></div>${label}`;
    return el;
  }
  const c = def.icon.color;
  el.style.background = `radial-gradient(circle at 50% 40%, ${c}40, #0b0a0c 75%)`;
  el.innerHTML = `<span class="icon" style="color:${c}">${def.icon.glyph}</span><div class="cd"></div><div class="cdt"></div>${label}`;
  bindTooltip(el, skillTooltip(def));
  return el;
}
export function banner(title: string, sub = ''): void {
  const b = $('#banner');
  b.classList.add('hidden');
  void b.offsetWidth; // restart animation
  $('.b-title', b).textContent = title;
  $('.b-sub', b).textContent = sub;
  b.classList.remove('hidden');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.add('hidden'), 2800);
}

function chip(item: Item): HTMLSpanElement {
  const d = document.createElement('span');
  d.className = 'chip';
  d.style.color = rarityOf(item.rarity).color;
  d.textContent = item.name;
  bindTooltip(d, itemTooltip(item));
  return d;
}

let refreshDecision: (() => void) | null = null;

export function showDecision(): void {
  const r = G.run;
  if (!r) return;
  const box = $('#decision');
  box.classList.remove('hidden');
  const refresh = () => {
    if (box.classList.contains('hidden')) return;
    $('.dc-title', box).textContent = `Wave ${r.wave} is broken`;
    $('.dc-sub', box).textContent = `Score ${Math.round(r.score).toLocaleString()} · ${r.kills} slain · Health ${Math.round(G.player.life)}/${Math.round(G.player.stats.maxLife)}`;
    const bag = $('.dc-bag', box);
    bag.innerHTML = '';
    if (!r.bag.length) bag.innerHTML = '<span class="chip" style="color:#9a8f7c">No spoils yet — loot on the floor will be collected automatically</span>';
    for (const it of r.bag.slice().sort(byValue)) bag.appendChild(chip(it));
    const onFloor = G.drops.length;
    $('.dc-risk', box).innerHTML = `If you fall, <b>${r.bag.length + onFloor} unbanked item${r.bag.length + onFloor === 1 ? '' : 's'}</b> will be lost forever.`;
    const next = r.wave + 1;
    $('.cont-label', box).textContent = next % WAVES.bossEvery === 0 ? `Face wave ${next} (${BIOMES[G.arena.biome].bossShort})` : `Continue to wave ${next}`;
  };
  refresh();
  refreshDecision = refresh;
}

export function hideDecision(): void { $('#decision').classList.add('hidden'); }

export function renderSpoils(): void {
  const r = G.run;
  if (!r) return;
  $('.sp-count').textContent = String(r.bag.length);
  const list = $('.sp-list');
  list.innerHTML = '';
  for (const it of r.bag.slice().sort(byValue).slice(0, 9)) {
    const d = document.createElement('div');
    d.style.color = rarityOf(it.rarity).color;
    d.textContent = it.name;
    list.appendChild(d);
  }
  refreshDecision?.();
}

const fmtTime = (s: number): string => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

let lastBuffs = '';

// The HUD updates every frame. Look static elements up once, and only write values that
// changed: every DOM write invalidates style, which the browser then recalculates.
const hudEls = new Map<string, HTMLElement>();
const h = (s: string): HTMLElement => { let e = hudEls.get(s); if (!e) hudEls.set(s, e = $(s)); return e; };
const written = new WeakMap<Element, string>();
function setText(el: Element, v: string): void { if (written.get(el) !== v) { el.textContent = v; written.set(el, v); } }
function setStyle(el: HTMLElement, prop: string, v: string): void {
  const key = `${prop}:${v}`;
  if (written.get(el) !== key) { el.style.setProperty(prop, v); written.set(el, key); }
}
const pct = (k: number): string => `${(k * 100).toFixed(1)}%`;
let minimapT = 0;

export function updateHud(): void {
  const p = G.player, r = G.run;
  if (!p || !r) return;
  const s = p.stats;
  const lifeK = Math.max(0, p.life / s.maxLife);
  setStyle(h('.bar.life .fill'), 'width', pct(lifeK));
  setStyle(h('.bar.life .lag'), 'width', pct(lifeK));
  h('.bar.life').classList.toggle('low', lifeK < 0.3);
  setText(h('.bar.life .txt'), `${Math.ceil(p.life)} / ${Math.round(s.maxLife)}`);
  setStyle(h('.bar.energy .fill'), 'width', pct(p.energy / s.maxEnergy));
  setText(h('.bar.energy .txt'), `${Math.floor(p.energy)} / ${Math.round(s.maxEnergy)}`);
  setText(h('.gem-num'), String(r.wave));

  for (const slot of slots) {
    const sk = p.skillAt(slot.key);
    if (!sk) continue;
    // cooldowns belong to the skill, so duplicates on several keys share one timer
    const left = p.cooldownLeft(sk.def.impl), total = p.cooldownOf(sk.def);
    const k = total > 0 ? left / total : 0;
    setStyle(slot.cd, '--p', pct(k));
    setText(slot.cdt, left > 0.05 ? (left < 1 ? left.toFixed(1) : String(Math.ceil(left))) : '');
    slot.el.classList.toggle('nomana', p.energy < (sk.def.channel ? sk.def.cost * 0.2 : sk.def.cost));
    slot.el.classList.toggle('active', p.channel?.key === slot.key || p.casting?.skill === sk);
  }

  // buffs
  const buffs = h('#buffs');
  const wardHtml = p.ward ? `<div class="buff" style="color:#c9b8ff">◈<span class="bt">${Math.ceil(p.ward.t)}</span></div>` : '';
  if (lastBuffs !== wardHtml) { buffs.innerHTML = wardHtml; lastBuffs = wardHtml; }

  // score box
  setText(h('.sb-score'), Math.round(r.score).toLocaleString());
  setText(h('.sb-kills b'), String(r.phase === 'fighting' ? r.remaining : 0));
  setText(h('.sb-time b'), r.phase === 'countdown' ? `-${Math.ceil(r.timer)}` : fmtTime(r.waveTime));
  const m = h('.sb-mult');
  setText(m, `x${r.multiplier}`);
  if (r.multiplier !== lastMult) { m.classList.add('bump'); setTimeout(() => m.classList.remove('bump'), 180); lastMult = r.multiplier; }
  setText(h('.sb-wave'), String(r.wave));

  // objectives
  const ol = h('.obj-line');
  const txt = r.phase === 'countdown' ? `Wave ${r.wave} begins in ${Math.ceil(r.timer)}…`
    : r.phase === 'fighting' ? `Eliminate all enemies (${r.remaining})`
    : r.phase === 'cleared' ? 'Bank your spoils or continue' : 'Fallen';
  setText(h('.obj-line .obj-text'), txt);
  ol.classList.toggle('done', r.phase === 'cleared');

  updateTarget();
  // the minimap is a 200px canvas: 30 Hz is plenty
  minimapT -= G.dt;
  if (minimapT <= 0) { minimapT = 1 / 30; drawMinimap(); }
}

function updateTarget() {
  const box = h('#target');
  let e = G.enemies.find((x) => x.boss && x.alive);
  if (!e) {
    let best = 2.2;
    for (const x of G.enemies) {
      if (!x.alive || x.spawning) continue;
      const d = Math.hypot(x.pos.x - input.ground.x, x.pos.z - input.ground.z) - x.radius;
      if (d < best) { best = d; e = x; }
    }
  }
  if (!e) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  box.classList.toggle('boss', e.boss);
  setText(h('#target .t-name'), e.name);
  setText(h('#target .t-sub'), e.boss ? 'Boss' : e.hero ? 'Hero' : '');
  const k = pct(e.life / e.maxLife);
  setStyle(h('#target .t-fill'), 'width', k);
  setStyle(h('#target .t-ghost'), 'width', k);
}

function drawMinimap() {
  const c = mmCtx, W = 200, S = W / 64; // world units -> px
  c.clearRect(0, 0, W, W);
  c.save();
  c.translate(W / 2, W / 2);
  c.rotate(cameraYaw()); // screen-up on the map is screen-up in the view
  // boundary: the crypt's octagon wall or the forest's ring of thicket
  const mm = BIOMES[G.arena.biome].minimap;
  c.strokeStyle = 'rgba(200,190,170,.55)'; c.lineWidth = 3;
  c.fillStyle = 'rgba(60,58,62,.35)';
  c.beginPath();
  if (mm.wall === 'circle') c.arc(0, 0, 29 * S, 0, Math.PI * 2);
  else for (let k = 0; k <= 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8, R = 30 * S;
    k ? c.lineTo(Math.cos(a) * R, Math.sin(a) * R) : c.moveTo(Math.cos(a) * R, Math.sin(a) * R);
  }
  c.fill(); c.stroke();
  // dais
  c.strokeStyle = 'rgba(200,190,170,.4)'; c.lineWidth = 1.5;
  c.strokeRect(-5.9 * S, -5.9 * S, 11.8 * S, 11.8 * S);
  // portals
  for (const pt of G.arena.portals) {
    c.fillStyle = mm.portal;
    c.beginPath(); c.arc(pt.pos.x * S * 1.08, pt.pos.z * S * 1.08, 3.5, 0, Math.PI * 2); c.fill();
  }
  // drops
  for (const d of G.drops) {
    c.fillStyle = rarityOf(d.item.rarity).color;
    c.fillRect(d.to.x * S - 2, d.to.z * S - 2, 4, 4);
  }
  // enemies
  for (const e of G.enemies) {
    if (!e.alive) continue;
    c.fillStyle = e.boss ? '#c070ff' : e.hero ? '#ffb040' : '#ff3a30';
    c.beginPath(); c.arc(e.pos.x * S, e.pos.z * S, e.boss ? 5 : e.hero ? 3.5 : 2.2, 0, Math.PI * 2); c.fill();
  }
  // player arrow
  const p = G.player;
  c.translate(p.pos.x * S, p.pos.z * S);
  c.rotate(-p.facing + Math.PI);
  c.fillStyle = '#6dffb0';
  c.beginPath(); c.moveTo(0, -6); c.lineTo(4.5, 5); c.lineTo(0, 2.5); c.lineTo(-4.5, 5); c.closePath(); c.fill();
  c.restore();
}
