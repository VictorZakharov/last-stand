// Warrior: armoured blade and shield, fighting up close.
// Same shape as mage.ts: base stats, a skill loadout, a model id and starter gear.
import type { ClassDef } from '../../types';

const warrior: ClassDef = {
  id: 'warrior',
  name: 'Warrior',
  tagline: 'Plate, steel and the will to stand where others fall.',
  model: 'warrior',
  accent: '#ffc27a',
  book: 'Arsenal',
  aura: { light: 0xff9a4a, intensity: 0.8 },

  base: {
    life: 1300,
    energy: 320,
    lifeRegen: 6,
    energyRegen: 16,
    moveSpeed: 6.2,
    crit: 5,
    critDmg: 60,
    armor: 12,
    resist: 6,
  },

  skills: [
    {
      key: 'mouse0', impl: 'cleave', name: 'Rending Cleave',
      desc: 'A wide sweep of the blade that strikes every foe in front of you. Each hit restores Energy.',
      tags: ['physical'], cost: 0, cooldown: 0, castTime: 0.42,
      damage: 62, range: 3.3, arc: 2.2, knock: 2.2, gain: 4,
      color: 0xffd9a0,
      icon: { glyph: '⚔', color: '#ffd9a0' },
    },
    {
      key: 'mouse2', impl: 'crescent', name: 'Thunder Crescent',
      desc: 'Swing a crescent of lightning that tears through every foe in its path.',
      tags: ['lightning'], cost: 24, cooldown: 0.8, castTime: 0.45,
      damage: 95, speed: 17, range: 15, width: 2.1,
      color: 0x9fc8ff,
      icon: { glyph: '☾', color: '#9fc8ff' },
    },
    {
      key: '1', impl: 'tempest', name: 'Steel Tempest',
      desc: 'Spin with your blade outstretched, shredding everything around you. Drains Energy while held.',
      tags: ['physical'], cost: 30, cooldown: 0, castTime: 0, channel: true,
      damage: 150, radius: 2.9, moveMult: 0.8,
      icon: { glyph: '✺', color: '#e8eef8' },
    },
    {
      key: '2', impl: 'bullRush', name: 'Bull Rush',
      desc: 'Charge behind your shield, trampling and hurling aside everything in your way.',
      tags: ['physical'], cost: 28, cooldown: 5, castTime: 0,
      damage: 120, range: 9, speed: 26, knock: 9,
      icon: { glyph: '➹', color: '#ffb46a' },
    },
    {
      key: '3', impl: 'moltenRift', name: 'Molten Rift',
      desc: 'Drive your blade into the ground to split it open in a line of erupting fire.',
      tags: ['fire'], cost: 45, cooldown: 6, castTime: 0.55,
      damage: 175, length: 13, width: 1.7,
      icon: { glyph: '♨', color: '#ff7a36' },
    },
    {
      key: '4', impl: 'ironBellow', name: 'Iron Bellow',
      desc: 'A war cry that hurls back nearby foes and steels you against the next blows.',
      tags: ['defense'], cost: 30, cooldown: 14, castTime: 0.3,
      damage: 40, radius: 6, knock: 8, absorbPct: 0.3, duration: 6,
      icon: { glyph: '⛨', color: '#ffd36a' },
    },
    {
      key: 'q', impl: 'potion', name: 'Healing Draught',
      desc: 'Instantly restore a large portion of Health.',
      tags: ['consumable'], cost: 0, cooldown: 11, castTime: 0,
      healPct: 0.45,
      icon: { glyph: '⚗', color: '#ff5b5b' },
    },
  ],

  starterGear: [
    { slot: 'weapon', rarity: 'common', ilvl: 1 },
    { slot: 'offhand', rarity: 'common', ilvl: 1 },
  ],

  // Health, cast speed, cooldowns and so on still roll; arcane damage has no warrior skill to feed
  bases: {
    weapon: ['Sword', 'Axe', 'Mace'],
    offhand: ['Shield', 'Buckler'],
    head: ['Helm', 'Greathelm'],
    chest: ['Cuirass', 'Hauberk'],
    hands: ['Gauntlets', 'Grips', 'Handguards'],
  },
  excludeStats: ['arcanePct'],
};

export default warrior;
