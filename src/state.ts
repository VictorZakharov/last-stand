// Shared mutable game state. Systems read/write through this object instead of
// passing long parameter lists around. Keep it flat and documented.
import type * as THREE from 'three';
import type { Arena } from './world/arena';
import type { Player } from './entities/player';
import type { Enemy } from './entities/enemy';
import type { Projectile } from './combat/projectiles';
import type { Drop } from './loot/drops';
import type { RunState } from './game/run';
import type { Profile } from './types';

export interface GameState {
  time: number;                 // seconds since start (unpaused)
  dt: number;                   // frame delta (seconds, clamped)
  paused: boolean;
  mode: 'menu' | 'run';

  // three.js core (set by core/renderer)
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;

  // world
  arena: Arena;
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  drops: Drop[];

  // run / meta
  run: RunState | null;
  profile: Profile;
}

// Core references (scene, player, ...) are assigned during boot before the
// first frame, so they are typed as always present.
export const G = {
  time: 0,
  dt: 0,
  paused: false,
  mode: 'menu',
  enemies: [],
  projectiles: [],
  drops: [],
  run: null,
} as unknown as GameState;
