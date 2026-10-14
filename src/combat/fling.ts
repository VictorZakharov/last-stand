// What a killing blow does to the body it kills: thrown the way the blow drove it (a sword's swing sweeps it along the
// swing, an arrow carries it on along its flight, a blast throws it out and up), as hard as the damage past the life
// it had left (the overkill: a foe killed with a hair to spare drops, one hit for three times its life flies), less
// for a heavy one; turned by where across it the blow landed (shot in the shoulder, it spins away from the shot); and
// how it falls by what killed it (frozen stiff, shocked, burnt). The body is entities/corpse.ts.
import { FLING } from '../data/balance';
import type { DamageType, EnemyDef, XZ } from '../types';

/** How a body falls: as any body, frozen stiff (shattering where it lands), shocked (twitching, sparking) or burnt
 *  (charring and smoking). */
export type FallStyle = 'plain' | 'frozen' | 'shock' | 'burn';
/** the styles by number, as co-op's messages carry them */
export const FALL_STYLES: FallStyle[] = ['plain', 'frozen', 'shock', 'burn'];

/** How a skill's blow drives what it kills (`HitOpts.blow`); what it leaves out goes by `FLING`'s defaults. */
export interface Blow {
  /** the way it drives along the ground (its length doesn't count); away from where it came from when not given */
  dir?: XZ;
  /** how much of its drive goes up (down, below 0), a share of its drive along the ground */
  lift?: number;
  /** its weight: the speed it throws what it kills at, as a multiple */
  force?: number;
  /** where on the body it lands, from the feet (0) to the top (1): struck high, a body topples over its feet */
  at?: number;
  /** how the body falls, when not by what the hit was */
  style?: FallStyle;
  /** where across the body it struck, seen from above (a world point): off its middle (a shoulder, an arm, a blade
   *  meeting its near side) it turns the body as it throws it; when not given, through its middle, turning it not */
  on?: XZ;
}

/** The throw a kill gives its body: its speed (m/s), where it landed on the body (`at` up it, from the feet to the
 *  top; `ox`, `oz` across it from its middle, m) and how the body falls. The killer's game works it out and co-op sends
 *  it, so every game throws the body alike. */
export interface Fling { vx: number; vy: number; vz: number; at: number; style: FallStyle; ox: number; oz: number }

/** What a fling needs of the foe it throws. */
interface Thrown { pos: XZ; radius: number; maxLife: number; def: EnemyDef; facing: number }

/**
 * The throw a kill of `foe` gives, `overkill` the damage past the life it had left: along `blow.dir` (or away from
 * `from`, or straight back), at a speed that grows with the overkill's share of its life, up to `FLING.most` at
 * `FLING.full` of it, and less for a foe that stands its ground (`knockbackResist`) or a boss.
 */
export function flingOf(foe: Thrown, overkill: number, type: DamageType, frozen: boolean, from?: XZ, blow?: Blow): Fling {
  const share = Math.min(1, Math.max(0, overkill / foe.maxLife / FLING.full));
  const heft = (1 - FLING.stand * (foe.def.knockbackResist ?? 0)) * (foe.def.boss ? FLING.boss : 1);
  const speed = (FLING.base + (FLING.most - FLING.base) * share ** FLING.curve) * (blow?.force ?? 1) * heft;
  let dx = blow?.dir?.x ?? (from ? foe.pos.x - from.x : 0), dz = blow?.dir?.z ?? (from ? foe.pos.z - from.z : 0);
  const len = Math.hypot(dx, dz);
  if (len > 1e-6) { dx /= len; dz /= len; } else { dx = -Math.sin(foe.facing); dz = -Math.cos(foe.facing); }
  const lift = blow?.lift ?? FLING.lift;
  // (where across it the blow landed, within the body)
  let ox = blow?.on ? blow.on.x - foe.pos.x : 0, oz = blow?.on ? blow.on.z - foe.pos.z : 0;
  const off = Math.hypot(ox, oz);
  if (off > foe.radius) { ox *= foe.radius / off; oz *= foe.radius / off; }
  return {
    vx: dx * speed, vy: speed * lift, vz: dz * speed,
    at: blow?.at ?? FLING.at,
    style: blow?.style ?? (frozen ? 'frozen' : type === 'lightning' ? 'shock' : type === 'fire' ? 'burn' : 'plain'),
    ox, oz,
  };
}

/** The way a sweep from `from` facing `facing` drives a foe at `at`: along the swing (`dir` +1 sweeps from the right
 *  to the left, -1 the other way) and out from the swinger, by `along` and `out`. */
export function swingWay(from: XZ, at: XZ, dir: number, along = 0.75, out = 0.6): XZ {
  let ox = at.x - from.x, oz = at.z - from.z;
  const len = Math.hypot(ox, oz) || 1;
  ox /= len; oz /= len;
  // (a heading's turn to the left, as a sweep from the right goes: d/dθ of (sin θ, cos θ))
  return { x: oz * dir * along + ox * out, z: -ox * dir * along + oz * out };
}

/** Where a sweep from `from` meets a foe at `at` of `radius` (`dir` as `swingWay`'s): its near side, a little to the
 *  side the blade comes from. Pushed there along the swing, the body cut down turns with its front carried on along the
 *  blade's way. */
export function swingOn(from: XZ, at: XZ, dir: number, radius: number): XZ {
  let ox = at.x - from.x, oz = at.z - from.z;
  const len = Math.hypot(ox, oz) || 1;
  ox /= len; oz /= len;
  const tx = oz * dir, tz = -ox * dir;
  return { x: at.x - (ox * SWING_NEAR + tx * SWING_LEAD) * radius, z: at.z - (oz * SWING_NEAR + tz * SWING_LEAD) * radius };
}
/** a sweep meets a body this far to its near side and to the side the blade comes from (shares of its radius) */
const SWING_NEAR = 0.6, SWING_LEAD = 0.3;

/** A fling as co-op's messages carry it: its speed, where it landed and its style by number. */
export const flingRow = (f: Fling): number[] => [
  r2(f.vx), r2(f.vy), r2(f.vz), r2(f.at), FALL_STYLES.indexOf(f.style), r2(f.ox), r2(f.oz),
];
/** The fling a message carried (none when it carried none). */
export function flingFrom(row: readonly number[] | undefined): Fling | undefined {
  if (!row || row.length < 5) return undefined;
  const [vx, vy, vz, at, style, ox = 0, oz = 0] = row;
  return { vx, vy, vz, at, style: FALL_STYLES[style] ?? 'plain', ox, oz };
}
const r2 = (v: number): number => Math.round(v * 100) / 100;
