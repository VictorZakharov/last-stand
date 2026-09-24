// Enemy spawning with a summoning effect.
import { G } from '../state';
import { Enemy, type EnemyOpts } from './enemy';
import { shockwave } from '../fx/effects';
import { flash } from '../fx/lights';
import { sfx } from '../core/audio';
import type * as THREE from 'three';
import type { EnemyId } from '../data/enemies';

/** Co-op: where the host reports each new enemy to the guests (set by net/sync). */
let spawnSink: ((e: Enemy) => void) | null = null;
export function setSpawnSink(fn: typeof spawnSink): void { spawnSink = fn; }

export function spawnEnemy(type: EnemyId, pos: THREE.Vector3, opts: Omit<EnemyOpts, 'pos'> = {}): Enemy {
  const e = new Enemy(type, { ...opts, pos });
  G.enemies.push(e);
  shockwave(pos, { color: 0xb050ff, intensity: 2.5, from: 0.2, to: e.radius * 2.5, life: 0.6 });
  if (e.hero || e.boss) flash({ color: 0xb050ff, intensity: 30, distance: 8, life: 0.8, pos: { x: pos.x, y: 1.5, z: pos.z } });
  sfx.spawn();
  spawnSink?.(e);
  return e;
}
