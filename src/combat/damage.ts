// Damage rolls and application for both sides.
import type * as THREE from 'three';
import { DAMAGE_COLORS } from '../data/balance';
import { floatText } from '../ui/floaters';
import { dealsDamage, simulates } from '../net/role';
import { rand } from '../util';
import type { Enemy } from '../entities/enemy';
import type { Player } from '../entities/player';
import type { DamageType, XZ } from '../types';

const ELEMENTAL = new Set(['cold', 'fire', 'lightning']);

/** Roll a player's outgoing damage for a skill with the given tags. */
export function rollPlayerDamage(by: Player, base: number, tags: readonly string[]): { amount: number; crit: boolean } {
  const s = by.stats;
  let pct = s.damagePct;
  if (tags.includes('arcane')) pct += s.arcanePct;
  if (tags.some((t) => ELEMENTAL.has(t))) pct += s.elementalPct;
  let amount = base * (1 + pct / 100) * rand(0.9, 1.1);
  const crit = Math.random() * 100 < s.crit;
  if (crit) amount *= 1 + s.critDmg / 100;
  return { amount, crit };
}

export interface HitOpts {
  /** the player whose skill it is (its stats, its kill, its leech) */
  by: Player;
  tags?: readonly string[];
  type?: DamageType;
  knock?: number;
  from?: XZ;
  chill?: number;
  freeze?: number;
  /** suppress the damage number (crits are still shown) */
  silent?: boolean;
}

/** Co-op: the damage number of a partner's hit, sent to the partner's game (set by net/sync). */
let numberSink: ((by: Player, enemy: Enemy, amount: number, crit: boolean, type: DamageType) => void) | null = null;
export function setNumberSink(fn: typeof numberSink): void { numberSink = fn; }

/** A damage number over an enemy. */
export function damageNumber(enemy: Enemy, amount: number, crit: boolean, type: DamageType): void {
  const p = enemy.pos;
  floatText(p.x, enemy.height * 0.9 + 0.3, p.z, Math.round(amount), crit ? 'crit' : 'dmg', DAMAGE_COLORS[type]);
}

/** Hit an enemy with a skill. Returns damage dealt (0 where the fight isn't simulated: a co-op guest). */
export function hitEnemy(enemy: Enemy, base: number, opts: HitOpts): number {
  if (!enemy.alive || enemy.invulnerable || !dealsDamage(opts.by)) return 0;
  const type: DamageType = opts.type ?? 'arcane';
  const tags = opts.tags ?? [type];
  const by = opts.by;
  const { amount, crit } = rollPlayerDamage(by, base, tags);
  const dealt = enemy.takeDamage(amount, { type, crit, knock: opts.knock, from: opts.from, chill: opts.chill, freeze: opts.freeze, by });
  // everyone sees their own numbers
  if (!opts.silent || crit) {
    if (by.local) damageNumber(enemy, dealt, crit, type);
    else numberSink?.(by, enemy, dealt, crit, type);
  }
  if (by.stats.leech > 0 && by.alive) by.heal(dealt * by.stats.leech / 100, true);
  return dealt;
}

/** Damage a player (after armor / resistance / ward). Only where the fight is simulated. */
export function hurtPlayer(p: Player, amount: number, type: DamageType = 'physical', from: THREE.Vector3 | null = null): number {
  if (!p.active || !simulates()) return 0;
  const s = p.stats;
  const reduce = type === 'physical' ? s.armor : s.resist;
  return p.takeDamage(amount * (1 - reduce / 100), type, from);
}
