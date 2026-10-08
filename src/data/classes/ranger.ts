// Ranger: physical bow shots, a hunter's tricks (a mark on his quarry, a scarecrow to draw foes off), a separate gear pool.
import type { ClassDef } from '../../types';

const ranger: ClassDef = {
  id: 'ranger', name: 'Ranger', model: 'ranger',
  tagline: 'A patient hunter who marks his quarry and rains arrows on the pack.',
  accent: '#c9d993', book: 'Fieldcraft',
  aura: { light: 0xc9d993, intensity: 0.45 },
  // (an arrow nocked between shots, back in the quiver after 3 s without one; the next shot takes one out first)
  quiver: { fetch: 0.8, idle: 3 },
  base: { life: 1050, energy: 360, lifeRegen: 5, energyRegen: 20, moveSpeed: 7, crit: 8, critDmg: 60, armor: 6, resist: 0 },
  skills: [
    {
      key: 'mouse0', impl: 'nockShot', name: 'Nockshot',
      desc: 'Hold to draw an arrow, release to loose it: the further it is drawn, the faster and harder it flies. Costs no Energy.', tags: ['physical'],
      // (drawn to full in `draw` s, loosed no sooner than `minDraw` of that; then the follow-through and the next arrow, `castTime`:
      // an archer's pace, about a second each; drawn in 0.7 s and reloaded in 0.45, it was a blur)
      cost: 0, cooldown: 0, castTime: 0.9, draw: 1.1, minDraw: 0.5,
      damage: 240, missiles: 1, spread: 0, speed: 60, range: 26, knock: 0.8,
      icon: { glyph: '➶', color: '#dfce99' },
    },
    {
      key: 'mouse2', impl: 'fanShot', name: 'Briarflight',
      desc: 'Hold to draw five arrows at once, release to loose them in a broad fan. Each arrow can strike a foe.', tags: ['physical'],
      cost: 32, cooldown: 3, castTime: 0.95, draw: 1.3, minDraw: 0.5,
      damage: 123, missiles: 5, spread: 0.13, speed: 55, range: 24, knock: 1.2,
      icon: { glyph: '⋔', color: '#c9d993' },
    },
    {
      key: '1', impl: 'piercingShot', name: 'Lancewood Shot',
      desc: 'Hold to draw a heavy lancewood arrow, release to drive it through every foe in its line. Each foe it passes through takes less (100%, 80%, 60%, then 40%); drawn to full, it strikes half again as hard.', tags: ['physical'],
      cost: 30, cooldown: 4, castTime: 0.95, draw: 1.5, minDraw: 0.4,
      damage: 300, missiles: 1, spread: 0, speed: 80, range: 30, knock: 1.2, falloff: [1, 0.8, 0.6, 0.4], fullBonus: 0.5,
      icon: { glyph: '➳', color: '#ff6a55' },
    },
    {
      key: '2', impl: 'arrowRain', name: 'Hailfletch',
      desc: 'Hold to stand and shoot arrow after arrow high over the target area, each splitting into a shower of 24 that comes down at random across it: each arrow strikes the foe it falls on. The area follows your aim at a walk. You cannot move while you shoot.', tags: ['physical'],
      // (energy a second, and damage an arrow; the volleys are an archer's, drawn, loosed and the next taken from the quiver)
      cost: 24, cooldown: 0, castTime: 0, channel: true, moveMult: 0,
      damage: 95, missiles: 24, radius: 4.2, range: 18,
      icon: { glyph: '⇊', color: '#6f9bff' },
    },
    {
      key: '3', impl: 'quarryMark', name: 'Quarry Mark',
      desc: 'Mark the foe nearest your aim as your quarry: it takes 25% more damage from everyone. When it dies your cooldowns are refreshed.', tags: ['physical'],
      cost: 15, cooldown: 8, castTime: 0.35, amp: 0.25, duration: 12, range: 26, aimed: true,
      icon: { glyph: '⌖', color: '#ff9a6c' },
    },
    {
      key: '4', impl: 'strawman', name: 'Strawman',
      desc: 'Raise a scarecrow at the target spot. For 3 seconds every nearby foe but elites and bosses leaves you for it and gathers round it, striking at it. It takes no harm and does none.', tags: ['physical'],
      cost: 35, cooldown: 12, castTime: 0.45, duration: 3, radius: 9, range: 14, aimed: true,
      icon: { glyph: 'ᛉ', color: '#d9b878' },
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
