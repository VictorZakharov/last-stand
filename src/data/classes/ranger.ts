// Ranger: physical bow shots and woodland control, with a separate gear pool.
import type { ClassDef } from '../../types';

const ranger: ClassDef = {
  id: 'ranger', name: 'Ranger', model: 'ranger',
  tagline: 'A patient hunter with a swift bow and thorn-bound wards.',
  accent: '#c9d993', book: 'Fieldcraft',
  aura: { light: 0xc9d993, intensity: 0.45 },
  base: { life: 1050, energy: 360, lifeRegen: 5, energyRegen: 20, moveSpeed: 7, crit: 8, critDmg: 60, armor: 6, resist: 0 },
  skills: [
    {
      key: 'mouse0', impl: 'nockShot', name: 'Nockshot',
      desc: 'Loose a swift arrow at your target. Costs no Energy.', tags: ['physical'],
      cost: 0, cooldown: 0, castTime: 0.4, fireAt: 0.55,
      damage: 62, missiles: 1, spread: 0, speed: 32, range: 24, knock: 0.5,
      icon: { glyph: '➶', color: '#dfce99' },
    },
    {
      key: 'mouse2', impl: 'fanShot', name: 'Briarflight',
      desc: 'Loose five arrows in a broad fan. Each arrow can strike a foe.', tags: ['physical'],
      cost: 32, cooldown: 3, castTime: 0.65, fireAt: 0.55,
      damage: 85, missiles: 5, spread: 0.15, speed: 30, range: 22, knock: 1,
      icon: { glyph: '⋔', color: '#c9d993' },
    },
    {
      key: '1', impl: 'heavyShot', name: 'Heartwood Shot',
      desc: 'Draw the bow slowly and loose a heavy arrow that drives its target back.', tags: ['physical'],
      cost: 38, cooldown: 5, castTime: 1.1, fireAt: 0.55,
      damage: 300, missiles: 1, spread: 0, speed: 38, range: 26, knock: 6,
      icon: { glyph: '↟', color: '#f0d58a' },
    },
    {
      key: '2', impl: 'briarSnare', name: 'Briar Bind',
      desc: 'Raise a tangle of thorns at the target area, wounding foes and rooting them briefly.', tags: ['physical'],
      cost: 45, cooldown: 7, castTime: 0.6,
      damage: 100, radius: 3.8, range: 16, freeze: 2.2,
      icon: { glyph: '♧', color: '#a9cf7c' },
    },
    {
      key: '3', impl: 'thornRepulse', name: 'Thornwake',
      desc: 'Scatter thorns around yourself, driving nearby foes back and slowing their pursuit.', tags: ['physical'],
      cost: 40, cooldown: 8, castTime: 0.5,
      damage: 110, radius: 5, knock: 7, chill: 2.5,
      icon: { glyph: '✺', color: '#d9b878' },
    },
    {
      key: '4', impl: 'woodlandWard', name: 'Woven Guard',
      desc: 'Wrap yourself in a woodland ward that absorbs damage for a short time.', tags: ['defense'],
      cost: 40, cooldown: 16, castTime: 0.5, absorbPct: 0.35, duration: 5,
      icon: { glyph: '◇', color: '#c9d993' },
    },
    {
      key: 'q', impl: 'potion', name: 'Healing Draught',
      desc: 'Instantly restore a large portion of Health.', tags: ['consumable'],
      cost: 0, cooldown: 11, castTime: 1.4, fireAt: 0.5, freeMove: true, healPct: 0.45,
      icon: { glyph: '⚗', color: '#ff5b5b' },
    },
  ],
  bases: {
    weapon: ['Hunting Bow', 'Recurve Bow', 'Longbow'],
    offhand: ['Trail Charm'], head: ['Scout Cap'], chest: ['Trailcoat'], hands: ['Bowguards'],
  },
  twoHanded: ['Hunting Bow', 'Recurve Bow', 'Longbow'],
  excludeStats: ['arcanePct', 'elementalPct', 'block', 'blockAmount'],
  excludeSlots: ['offhand'],
  implicits: { weapon: [['damagePct', 1]], offhand: [['crit', 1]], chest: [['life', 1], ['armor', 1]] },
  starterGear: [{ slot: 'weapon', rarity: 'common', ilvl: 1 }, { slot: 'chest', rarity: 'common', ilvl: 1 }],
};

export default ranger;
