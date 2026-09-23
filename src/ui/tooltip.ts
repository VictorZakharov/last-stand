// Item & skill tooltips. Item tooltips can show a side-by-side comparison
// with the item currently equipped in the same slot.
import { SLOT_INFO, STATS } from '../data/items';
import { rarityOf, formatStat, itemPower, statEntries, implicitsFor, isTwoHanded } from '../loot/items';
import { G } from '../state';
import { input } from '../core/input';
import { itemIconSVG } from './itemIcons';
import type { Item, SkillDef, StatKey } from '../types';

/** Tooltip content: HTML, accent color and optional footer hint. */
export interface TooltipContent { html: string; color: string; foot?: string }

const el = (): HTMLElement => document.getElementById('tooltip')!;

// Keep the tooltip fully on screen: flip left/up when needed, stack comparison
// cards vertically when side-by-side is too wide, and clamp as a last resort.
function place(e: MouseEvent): void {
  const t = el();
  const maxW = window.innerWidth - 16, maxH = window.innerHeight - 16;
  const cards = t.querySelector<HTMLElement>('.tt-cards');
  if (cards) {
    cards.classList.remove('stack');
    if (t.offsetWidth > maxW) cards.classList.add('stack');
  }
  const w = t.offsetWidth, h = t.offsetHeight;
  let x = e.clientX + 18, y = e.clientY + 14;
  if (x + w > maxW + 8) x = e.clientX - w - 18;
  if (y + h > maxH + 8) y = e.clientY - h - 14;
  x = Math.max(8, Math.min(x, maxW + 8 - w));
  y = Math.max(8, Math.min(y, maxH + 8 - h));
  t.style.left = x + 'px'; t.style.top = y + 'px';
}

const round = (k: StatKey, v: number): number => { const f = 10 ** (STATS[k].dec || 0); return Math.round(v * f) / f; };

function deltaHTML(k: StatKey, d: number): string {
  if (Math.abs(d) < 0.05) return '';
  const cls = d > 0 ? 'up' : 'down';
  return ` <span class="tt-delta ${cls}">(${d > 0 ? '+' : '−'}${round(k, Math.abs(d))})</span>`;
}

/** One item card. `other` (optional) = item to diff against (shows per-stat deltas). */
function card(item: Item, { header = '', other = null as Item | null, showDelta = false } = {}): string {
  const r = rarityOf(item.rarity);
  const cls = G.player.cls;
  const implicit = new Set(implicitsFor(item.slot, cls).map(([k]) => k));
  let html = `<div class="tt-card" style="--c:${r.color}">`;
  if (header) html += `<div class="tt-header">${header}</div>`;
  html += `<div class="tt-head"><div class="tt-icon" style="--c:${r.color}">${itemIconSVG(item)}</div><div class="tt-name" style="color:${r.color}">${item.name}</div></div>`;
  const pw = itemPower(item), opw = other ? itemPower(other) : 0;
  const pdelta = showDelta && other && pw !== opw ? `<span class="tt-delta ${pw > opw ? 'up' : 'down'}">${pw > opw ? '▲' : '▼'} ${Math.abs(pw - opw)}</span>` : '';
  html += `<div class="tt-type">${r.name} ${isTwoHanded(item, cls) ? 'Two-handed ' : ''}${SLOT_INFO[item.slot].label} · Item level ${item.ilvl} · Power ${pw}${pdelta ? ' ' + pdelta : ''}</div>`;
  for (const [k, v] of statEntries(item.stats)) {
    const d = showDelta ? v - (other?.stats[k] || 0) : 0;
    html += `<div class="tt-stat ${implicit.has(k) ? 'implicit' : ''}">${formatStat(k, v)}${showDelta ? deltaHTML(k, d) : ''}</div>`;
  }
  // stats the other item has that this one lacks
  if (showDelta && other) {
    for (const [k, v] of statEntries(other.stats)) {
      if (k in item.stats) continue;
      html += `<div class="tt-stat lost"><s>${formatStat(k, v)}</s> <span class="tt-delta down">(−${round(k, v)})</span></div>`;
    }
  }
  return html + '</div>';
}

/** equipped: undefined = no comparison, null = empty slot, Item = compare against it. */
export function itemTooltipHTML(item: Item, equipped?: Item | null): TooltipContent {
  const r = rarityOf(item.rarity);
  // equipped === undefined: no comparison; null: slot is empty; item: compare against it
  if (equipped === undefined) return { html: card(item), color: r.color };
  let html = '<div class="tt-cards">';
  html += card(item, { other: equipped, showDelta: true });
  if (equipped) {
    html += card(equipped, { header: 'Currently equipped' });
  } else {
    html += `<div class="tt-card empty"><div class="tt-header">Currently equipped</div><div class="tt-type">Nothing in the ${SLOT_INFO[item.slot].label} slot — this is a pure upgrade.</div></div>`;
  }
  html += '</div>';
  return { html, color: r.color };
}

function show(c: TooltipContent, at: { clientX: number; clientY: number }): void {
  const t = el();
  t.innerHTML = c.html + (c.foot ? `<div class="tt-footbar">${c.foot}</div>` : '');
  t.classList.remove('hidden');
  place(at as MouseEvent);
}

// With a mouse the tooltip follows hovering. With touch (where the browser's emulated mouse events
// are ignored) a tap opens it pinned beside the element, and the next tap anywhere closes it.
let pinned = false;
document.addEventListener('pointerdown', (e) => {
  if (pinned && !el().contains(e.target as Node)) hideTooltip();
}, true);

export function bindTooltip(node: HTMLElement, getContent: () => TooltipContent | null): void {
  node.addEventListener('mouseenter', (e) => {
    if (input.touchMode) return;
    const c = getContent();
    if (c) show(c, e);
  });
  node.addEventListener('mousemove', (e) => { if (!input.touchMode && !pinned) place(e); });
  node.addEventListener('mouseleave', () => { if (!input.touchMode) hideTooltip(); });
  node.addEventListener('click', () => {
    if (!input.touchMode) return;
    const c = getContent();
    if (!c) return;
    const r = node.getBoundingClientRect();
    show(c, { clientX: r.right - 6, clientY: r.top });
    pinned = true;
    el().classList.add('pinned');
  });
}

export function hideTooltip(): void {
  el().classList.add('hidden');
  el().classList.remove('pinned');
  pinned = false;
}

export function itemTooltip(item: Item, withCompare = true): () => TooltipContent {
  return () => {
    const eq = G.profile.equipped[item.slot];
    // no comparison against itself
    const cmp = withCompare && eq?.id !== item.id ? (eq ?? null) : undefined;
    return itemTooltipHTML(item, cmp);
  };
}

export function skillTooltip(def: SkillDef): () => TooltipContent {
  return () => {
    let html = `<div class="tt-card" style="--c:${def.icon.color}"><div class="tt-name" style="color:${def.icon.color}">${def.name}</div>`;
    html += `<div class="tt-type">${def.tags.join(' · ')}</div>`;
    html += `<div class="tt-desc">${def.desc}</div>`;
    const bits = [];
    if (def.cost) bits.push(def.channel ? `${def.cost} Energy / sec` : `${def.cost} Energy`);
    if (def.gain) bits.push(`+${def.gain} Energy per hit`);
    if (def.castTime >= 1) bits.push(`${def.castTime}s to charge`);
    if (def.cooldown) bits.push(`${def.cooldown}s cooldown`);
    if (def.damage) bits.push(`${def.damage}${def.channel || def.impl === 'maelstrom' ? ' dmg / sec' : ' damage'}`);
    html += `<div class="tt-foot">${bits.join(' · ')}</div>`;
    const alt = (id?: string) => (id ? G.player.known.get(id)?.def.name : undefined);
    if (def.needs === 'shield') {
      const two = alt(def.fallback?.twoHanded), one = alt(def.fallback?.oneHanded);
      html += `<div class="tt-foot">Needs a shield. Without one this key uses ${[two && `${two} with a two-handed weapon`, one && `${one} with a one-handed weapon`].filter(Boolean).join(', or ')}.</div>`;
    } else if (def.needs === 'noShield') {
      const sh = alt(def.fallback?.shield);
      html += `<div class="tt-foot">Can't be used with a shield${sh ? `: with one, this key uses ${sh}` : ''}.</div>`;
    }
    html += '</div>';
    return { html, color: def.icon.color };
  };
}
