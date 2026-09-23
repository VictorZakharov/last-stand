// Attributes tab: one table drives both the rows and the hover breakdown that
// lists the class base value and every equipped item contributing to a stat.
import { G } from '../state';
import { SLOTS, STATS } from '../data/items';
import { rarityOf } from '../loot/items';
import { itemIconSVG } from './itemIcons';
import { bindTooltip, type TooltipContent } from './tooltip';
import type { BaseStats, DerivedStats, StatKey } from '../types';

interface AttributeDef {
  label: string;
  /** derived value shown in the row */
  value: keyof DerivedStats;
  /** item stat that feeds it (if any) */
  stat?: StatKey;
  /** class base stat that feeds it (if any) */
  base?: keyof BaseStats;
  /** item contributions are a % bonus on the base (movement speed) */
  percentOfBase?: boolean;
  cap?: number;
  fmt: (v: number) => string;
  note?: string;
}

const pct = (v: number) => `${Math.round(v)}%`;
const plusPct = (v: number) => `+${Math.round(v)}%`;
const perSec = (v: number) => `${v.toFixed(1)} / s`;

export const ATTRIBUTE_GROUPS: [string, AttributeDef[]][] = [
  ['Vitals', [
    { label: 'Health', value: 'maxLife', stat: 'life', base: 'life', fmt: (v) => String(Math.round(v)) },
    { label: 'Health regeneration', value: 'lifeRegen', stat: 'lifeRegen', base: 'lifeRegen', fmt: perSec },
    { label: 'Energy', value: 'maxEnergy', stat: 'energy', base: 'energy', fmt: (v) => String(Math.round(v)) },
    { label: 'Energy regeneration', value: 'energyRegen', stat: 'energyRegen', base: 'energyRegen', fmt: perSec },
    { label: 'Movement speed', value: 'moveSpeed', stat: 'moveSpeed', base: 'moveSpeed', percentOfBase: true, cap: 40, fmt: (v) => v.toFixed(1),
      note: 'Items add a percentage of the base speed (bonus capped at 40%).' },
  ]],
  ['Offense', [
    { label: 'All damage', value: 'damagePct', stat: 'damagePct', fmt: plusPct, note: 'Applies to every skill.' },
    { label: 'Arcane damage', value: 'arcanePct', stat: 'arcanePct', fmt: plusPct, note: 'Applies to arcane skills.' },
    { label: 'Elemental damage', value: 'elementalPct', stat: 'elementalPct', fmt: plusPct, note: 'Applies to cold, fire and lightning skills.' },
    { label: 'Critical chance', value: 'crit', stat: 'crit', base: 'crit', cap: 75, fmt: (v) => `${v.toFixed(1)}%` },
    { label: 'Critical damage', value: 'critDmg', stat: 'critDmg', base: 'critDmg', fmt: plusPct },
    { label: 'Casting speed', value: 'castSpeed', stat: 'castSpeed', cap: 60, fmt: plusPct },
    { label: 'Cooldown reduction', value: 'cdr', stat: 'cdr', cap: 40, fmt: pct },
    { label: 'Life leech', value: 'leech', stat: 'leech', cap: 15, fmt: (v) => `${v.toFixed(1)}%`, note: 'Share of damage dealt returned as health.' },
  ]],
  ['Defense', [
    { label: 'Physical reduction', value: 'armor', stat: 'armor', base: 'armor', cap: 70, fmt: pct },
    { label: 'Magic resistance', value: 'resist', stat: 'resist', base: 'resist', cap: 75, fmt: pct },
  ]],
];

function breakdown(def: AttributeDef): TooltipContent {
  const p = G.player;
  const derived = p.stats[def.value];
  let html = `<div class="tt-card attr-card"><div class="tt-name">${def.label}</div>`;
  html += `<div class="attr-total">${def.fmt(derived)}</div>`;
  const rows: string[] = [];
  if (def.base) {
    rows.push(`<div class="attr-row"><span class="attr-src base">${p.cls.name} base</span><b>${formatBase(def, p.cls.base[def.base])}</b></div>`);
  }
  let itemTotal = 0;
  if (def.stat) {
    for (const slot of SLOTS) {
      const it = G.profile.equipped[slot];
      const v = it?.stats[def.stat!];
      if (!it || !v) continue;
      itemTotal += v;
      rows.push(`<div class="attr-row"><span class="attr-src">${itemIconSVG(it)}<span style="color:${rarityOf(it.rarity).color}">${it.name}</span></span><b class="up">+${v}${STATS[def.stat!].fmt.includes('%') ? '%' : ''}</b></div>`);
    }
  }
  if (!def.base && itemTotal === 0) rows.push('<div class="attr-empty">No equipped item provides this.</div>');
  else if (def.stat && itemTotal === 0) rows.push('<div class="attr-empty">No equipped item adds to this.</div>');
  html += `<div class="attr-rows">${rows.join('')}</div>`;
  if (def.cap !== undefined) {
    const raw = def.percentOfBase ? itemTotal : (def.base ? p.cls.base[def.base] : 0) + itemTotal;
    const capped = raw > def.cap;
    html += `<div class="tt-foot${capped ? ' capped' : ''}">Maximum ${def.cap}%${capped ? ` — capped (you have ${Math.round(raw)}%)` : ''}</div>`;
  }
  if (def.note) html += `<div class="tt-foot">${def.note}</div>`;
  return { html: html + '</div>', color: '#a07c46' };
}

/** Format the class base value like the row does. */
function formatBase(def: AttributeDef, v: number): string {
  return def.percentOfBase ? v.toFixed(1) : def.fmt(v);
}

/** Render the attributes list into `el` and bind the breakdown tooltips. */
export function renderAttributes(el: HTMLElement): void {
  const s = G.player.stats, unused = G.player.cls.excludeStats ?? [];
  // stats the class can never roll are left out
  el.innerHTML = ATTRIBUTE_GROUPS.map(([title, defs], gi) =>
    `<div class="grp">${title}</div>` + defs.map((d, di) => (d.stat && unused.includes(d.stat) ? '' :
      `<div class="row" data-attr="${gi}:${di}"><span>${d.label}</span><b>${d.fmt(s[d.value])}</b></div>`)).join('')).join('');
  el.querySelectorAll<HTMLElement>('[data-attr]').forEach((row) => {
    const [gi, di] = row.dataset.attr!.split(':').map(Number);
    bindTooltip(row, () => breakdown(ATTRIBUTE_GROUPS[gi][1][di]));
  });
}
