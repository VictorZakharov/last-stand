// Shared mutable game state. Systems read/write through this object instead of
// passing long parameter lists around. Keep it flat and documented.
import type * as THREE from 'three';
import type { Arena } from './world/arena';
import type { Player } from './entities/player';
import type { Enemy } from './entities/enemy';
import type { Projectile } from './combat/projectiles';
import type { RunState } from './game/run';
import type { Profile } from './types';

export interface GameState {
  time: number;                 // seconds since start (unpaused)
  dt: number;                   // frame delta (seconds, clamped)
  /** the game is stopped (solo pause) */
  paused: boolean;
  /** the pause menu is open: solo it stops the game, in co-op the game carries on behind it */
  menuOpen: boolean;
  mode: 'menu' | 'run';

  // three.js core (set by core/renderer)
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;

  // world
  arena: Arena;
  /** the local player (the one this game controls) */
  player: Player;
  /** every player, the local one first; co-op partners are remote */
  players: Player[];
  enemies: Enemy[];
  projectiles: Projectile[];

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
  menuOpen: false,

  mode: 'menu',
  enemies: [],
  players: [],
  projectiles: [],
  run: null,
} as unknown as GameState;
