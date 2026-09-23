// Damage rolls and application for both sides.
import type * as THREE from 'three';
import { G } from '../state';
import { DAMAGE_COLORS } from '../data/balance';
import { floatText } from '../ui/floaters';
import { rand } from '../util';
import type { Enemy } from '../entities/enemy';
import type { DamageType, XZ } from '../types';

const ELEMENTAL = new Set(['cold', 'fire', 'lightning']);

/** Roll outgoing player damage for a skill with the given tags. */
export function rollPlayerDamage(base: number, tags: readonly string[]): { amount: number; crit: boolean } {
  const s = G.player.stats;
  let pct = s.damagePct;
  if (tags.includes('arcane')) pct += s.arcanePct;
  if (tags.some((t) => ELEMENTAL.has(t))) pct += s.elementalPct;
  let amount = base * (1 + pct / 100) * rand(0.9, 1.1);
  const crit = Math.random() * 100 < s.crit;
  if (crit) amount *= 1 + s.critDmg / 100;
  return { amount, crit };
}

export interface HitOpts {
  tags?: readonly string[];
  type?: DamageType;
  knock?: number;
  from?: XZ;
  chill?: number;
  freeze?: number;
  /** suppress the damage number (crits are still shown) */
  silent?: boolean;
}

/** Hit an enemy with a skill. Returns damage dealt. */
export function hitEnemy(enemy: Enemy, base: number, opts: HitOpts = {}): number {
  if (!enemy.alive || enemy.invulnerable) return 0;
  const type: DamageType = opts.type ?? 'arcane';
  const tags = opts.tags ?? [type];
  const { amount, crit } = rollPlayerDamage(base, tags);
  const dealt = enemy.takeDamage(amount, { type, crit, knock: opts.knock, from: opts.from, chill: opts.chill, freeze: opts.freeze });
  if (!opts.silent || crit) {
    const p = enemy.pos;
    floatText(p.x, enemy.height * 0.9 + 0.3, p.z, Math.round(dealt), crit ? 'crit' : 'dmg', DAMAGE_COLORS[type]);
  }
  const pl = G.player;
  if (pl.stats.leech > 0 && pl.alive) pl.heal(dealt * pl.stats.leech / 100, true);
  return dealt;
}

/** Damage the player (after armor / resistance / ward). */
export function hurtPlayer(amount: number, type: DamageType = 'physical', from: THREE.Vector3 | null = null): number {
  const p = G.player;
  if (!p || !p.alive) return 0;
  const s = p.stats;
  const reduce = type === 'physical' ? s.armor : s.resist;
  return p.takeDamage(amount * (1 - reduce / 100), type, from);
}
