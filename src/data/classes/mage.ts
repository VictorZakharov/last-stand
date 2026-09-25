// Mage: arcane + elemental caster.
// A class = base stats + a skill loadout + a model id + starter gear.
// Each skill's `impl` names a behavior registered in src/combat/skills/index.ts;
// every other field is tuning data read by that behavior.
import type { ClassDef } from '../../types';

const mage: ClassDef = {
  id: 'mage',
  name: 'Mage',
  tagline: 'Wielder of raw arcana and the fury of the heavens.',
  model: 'mage',
  accent: '#9fffd0',
  book: 'Spellbook',
  aura: { light: 0x5dffa8, intensity: 3, motes: [0x5dffa8, 0x1060ff] },

  base: {
    life: 950,
    energy: 480,
    lifeRegen: 4,        // per second
    energyRegen: 22,     // per second
    moveSpeed: 6.4,      // units per second
    crit: 5,             // %
    critDmg: 50,         // bonus %
    armor: 0,            // % damage reduction vs physical
    resist: 0,           // % damage reduction vs elemental / arcane
  },

  // Key bindings: 'mouse0', 'mouse2', '1'..'4', 'q'
  skills: [
    {
      key: 'mouse0', impl: 'splinterBolt', name: 'Splintering Bolt',
      desc: 'Launch a seeking arcane bolt that shatters into smaller bolts on impact. Costs no Energy.',
      tags: ['arcane'], cost: 0, cooldown: 0, castTime: 0.34,
      damage: 36, missiles: 1, spread: 0.22, speed: 24, splitCount: 2, splitDamage: 0.6, range: 22,
      color: 0xff4fd8, trailEnd: 0x6a1cff,   // VFX colors
      icon: { glyph: '✧', color: '#ff6fe0' },
    },
    {
      key: 'mouse2', impl: 'starfall', name: 'Starfall',
      desc: 'Call down arcane crystals from the heavens on the target area, chilling survivors.',
      tags: ['arcane', 'cold'], cost: 38, cooldown: 3, castTime: 0.4,
      damage: 150, shards: 3, radius: 2.5, edge: 0.35, scatter: 1.9, chill: 2.0,
      icon: { glyph: '☄', color: '#8fd8ff' },
    },
    {
      key: '1', impl: 'voidLance', name: 'Void Lance',
      desc: 'Draw a portal in the air, then channel a piercing lance of raw arcana through it. Drains energy while held.',
      tags: ['arcane'], cost: 34, cooldown: 0, castTime: 0, channel: true, opening: 0.75,
      damage: 210, length: 17, width: 0.75, moveMult: 0.35,
      icon: { glyph: '⟿', color: '#5dffa8' },
    },
    {
      key: '2', impl: 'glacialNova', name: 'Glacial Nova',
      desc: 'A burst of absolute cold freezes all nearby enemies solid.',
      tags: ['cold'], cost: 55, cooldown: 7, castTime: 0.3,
      damage: 150, radius: 7, freeze: 2.4,
      icon: { glyph: '❄', color: '#8fd8ff' },
    },
    {
      key: '3', impl: 'maelstrom', name: 'Maelstrom',
      desc: 'Conjure a roaming storm vortex that drags enemies in and lashes them with lightning.',
      tags: ['lightning', 'fire'], cost: 60, cooldown: 5, castTime: 0.4,
      damage: 95, radius: 3.6, duration: 4.5, speed: 3.5, pull: 5,
      icon: { glyph: '༄', color: '#9fb2ff' },
    },
    {
      key: '4', impl: 'aegis', name: 'Arcane Aegis',
      desc: 'A shimmering ward absorbs incoming damage for a short time.',
      tags: ['defense'], cost: 40, cooldown: 16, castTime: 0.15,
      absorbPct: 0.45, duration: 5,
      icon: { glyph: '◈', color: '#c9b8ff' },
    },
    {
      key: 'q', impl: 'potion', name: 'Healing Draught',
      desc: 'Instantly restore a large portion of Health.',
      tags: ['consumable'], cost: 0, cooldown: 11, castTime: 0,
      healPct: 0.45,
      icon: { glyph: '⚗', color: '#ff5b5b' },
    },
  ],

  // Common items granted to a brand-new profile (see loot/items.ts makeItem).
  // the block stats only come on warrior shields
  excludeStats: ['block', 'blockAmount'],

  starterGear: [
    { slot: 'weapon', rarity: 'common', ilvl: 1 },
    { slot: 'chest', rarity: 'common', ilvl: 1 },
  ],
};

export default mage;
