// Enemy spawning with a summoning effect.
import { G } from '../state';
import { Enemy } from './enemy';
import { shockwave } from '../fx/effects';
import { flash } from '../fx/lights';
import { sfx } from '../core/audio';
import type * as THREE from 'three';
import type { EnemyId } from '../data/enemies';

export function spawnEnemy(type: EnemyId, pos: THREE.Vector3, { wave = 1, hero = false }: { wave?: number; hero?: boolean } = {}): Enemy {
  const e = new Enemy(type, { wave, hero, pos });
  G.enemies.push(e);
  shockwave(pos, { color: 0xb050ff, intensity: 2.5, from: 0.2, to: e.radius * 2.5, life: 0.6 });
  if (hero || e.boss) flash({ color: 0xb050ff, intensity: 30, distance: 8, life: 0.8, pos: { x: pos.x, y: 1.5, z: pos.z } });
  sfx.spawn();
  return e;
}
