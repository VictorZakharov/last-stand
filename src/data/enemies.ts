// Enemy archetypes. `ai` selects a behavior in entities/enemyAI.js,
// `model` selects a builder in entities/models/index.js.
// Stats are wave-1 values; see SCALING for per-wave growth.
import type { EnemyDef } from '../types';

export type EnemyId = 'imp' | 'husk' | 'witch' | 'brute' | 'colossus' | 'dummy';

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  imp: {
    name: 'Voidling', model: 'imp', ai: 'melee',
    life: 70, damage: 14, damageType: 'physical', speed: 6.2, radius: 0.45,
    range: 1.3, windup: 0.45, recover: 0.5, cooldown: 0.9,
    cost: 1, score: 1,
  },
  husk: {
    name: 'Hollow Husk', model: 'husk', ai: 'melee',
    life: 135, damage: 24, damageType: 'physical', speed: 3.7, radius: 0.55,
    range: 1.75, windup: 0.6, recover: 0.6, cooldown: 1.3,
    cost: 1.5, score: 1.5,
  },
  witch: {
    name: 'Rift Witch', model: 'witch', ai: 'ranged',
    life: 105, damage: 34, damageType: 'vitality', speed: 4.3, radius: 0.5,
    range: 13, keepAway: 8.5, windup: 0.75, recover: 0.4, cooldown: 2.2,
    projectile: { speed: 13, radius: 0.35, color: 0xc050ff },
    cost: 2, score: 2,
  },
  brute: {
    name: 'Cinder Brute', model: 'brute', ai: 'slam',
    life: 620, damage: 80, damageType: 'fire', speed: 3.0, radius: 1.0,
    range: 3.0, slamRadius: 3.4, windup: 1.05, recover: 0.8, cooldown: 2.6,
    cost: 5, score: 6, knockbackResist: 0.7,
  },
  colossus: {
    name: 'The Hollow Colossus', model: 'colossus', ai: 'boss',
    life: 5200, damage: 110, damageType: 'fire', speed: 2.9, radius: 1.8,
    range: 4.2, slamRadius: 5.5, windup: 1.2, recover: 1.0, cooldown: 2.0,
    projectile: { speed: 12, radius: 0.5, color: 0xff6a2a },
    summon: 'imp',
    cost: 0, score: 60, knockbackResist: 1, freezeResist: 0.7, boss: true,
  },
  // lobby target practice; never part of a wave
  dummy: {
    name: 'Training Dummy', model: 'dummy', ai: 'idle',
    life: 1, damage: 0, damageType: 'physical', speed: 0, radius: 0.55,
    range: 0, windup: 0, recover: 0, cooldown: 0,
    cost: 0, score: 0, knockbackResist: 1, dummy: true,
  },
};

// Elite ("hero") modifiers applied on top of a base archetype.
export const HERO = {
  lifeMult: 3.2,
  damageMult: 1.5,
  scale: 1.22,
  score: 5,
  prefixes: ['Grim', 'Dread', 'Ashen', 'Wailing', 'Ruinous', 'Vile', 'Hungering', 'Pale'],
  auraColors: [0xff5030, 0xb050ff, 0x40c8ff, 0xffd040],
};

export const SCALING = {
  life: (w: number) => 1 + 0.24 * (w - 1) + 0.018 * (w - 1) ** 2,
  damage: (w: number) => 1 + 0.11 * (w - 1),
  speed: (w: number) => Math.min(1.25, 1 + 0.012 * (w - 1)),
};
