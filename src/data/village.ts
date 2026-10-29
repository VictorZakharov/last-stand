// The village the lobby stands in (world/village.ts builds it, game/village.ts makes its objects work): where each of
// its places is, and what each object the hero uses does. x is east, z south (the top view looks north, -z, up the
// screen); heights are over the village's ground. It's laid out as a hamlet grows, not on a grid: its palisade wanders
// round it, its roads wind, its cottages stand each its own way, and its two ways out are places of their own, the
// crypt's sunken entrance north-east and a grove of the Thornwood south-west, each with its portal before it.
import type { BiomeId } from './biomes';

/** What an object does when the hero uses it (game/village.ts `use`). */
export type VillageUse = 'portal' | 'stash' | 'heroes' | 'coop' | 'chronicle' | 'help';

/** An object of the village the hero walks to and uses: where it stands (its middle, x and z), how near he must be
 *  to use it (m, from that middle), where he stands to use it (x, z), the height its name hangs at (m), its name and
 *  what using it says. */
export interface VillageObject {
  id: string;
  use: VillageUse;
  /** the portal's battleground (`use: 'portal'`) */
  biome?: BiomeId;
  at: [number, number];
  reach: number;
  stand: [number, number];
  label: number;
  name: string;
  verb: string;
}

/** a point of the village's floor (x, z) */
export type Spot = [number, number];

/** The terrace the hall of heroes stands on: its middle across (x), its front edge (z), its back (z), its half width
 *  (x), how high it is; the stair up its middle (half width, and where its foot is, z) */
export const TERRACE = { x: -1.5, front: -11, back: -22, half: 10.5, high: 1.6, stairHalf: 2.4, stairFoot: -7.8 };
/** the steps of a stair: how high each rises (m), the same for every stair (a man's step) */
export const STEP_RISE = 0.16;

/** The hall of heroes on the terrace, a building (its room within is world/heroHall.ts): its back wall's inner face
 *  (z), its front wall's face with the door (z), and the door's half width and height (m) */
export const HALL = { wall: -20.4, door: -14.7, doorHalf: 1.1, doorHigh: 3.4 };

/** The chronicle's platform (the lectern on it): its middle, its half sides, how high; its stair comes down south,
 *  toward the crypt's road */
export const DAIS_EAST = { x: 12.5, z: -9.8, half: 2.6, high: 0.8 };

/** The training yard: a fenced field (its middle, half sides, turned `turn` rad about y), its gate's half width and
 *  where it opens along its north side (x in its own frame: toward the square, so its road comes straight in). Skills
 *  are cast here alone. */
export const YARD = { x: 9, z: 14.5, halfX: 6.5, halfZ: 5, gate: 1.6, gateAt: -3.4, turn: -0.3 };

/** A point of the yard's own frame (x across it, z from its gate side to the back) in the village's. */
export function yardToWorld(x: number, z: number): Spot {
  const c = Math.cos(YARD.turn), s = Math.sin(YARD.turn);
  return [YARD.x + x * c + z * s, YARD.z - x * s + z * c];
}

/** A point of the village's in the yard's own frame (`yardToWorld` undone). */
export function worldToYard(x: number, z: number): Spot {
  const dx = x - YARD.x, dz = z - YARD.z, c = Math.cos(YARD.turn), s = Math.sin(YARD.turn);
  return [dx * c - dz * s, dx * s + dz * c];
}

/** where the yard's dummies stand */
export const YARD_DUMMIES: readonly Spot[] = [yardToWorld(-3, 1.7), yardToWorld(0, 2.9), yardToWorld(3, 1.7)];

/** The palisade's line round the village, a closed curve through these points (clockwise from the east), and where
 *  its two ways out open in it (the middles of the gaps) and how wide (m). */
export const PALISADE_LINE: readonly Spot[] = [
  [29.5, -3], [27, 7], [26, 15], [19, 22.5], [10, 24], [2, 27.5], [-6, 25.5], [-13, 23.5], [-20.5, 19],
  [-27.5, 8], [-26.5, -1], [-29.5, -9], [-25, -16.5], [-17.5, -21], [-11, -27], [-1, -27.5], [9, -27.8], [16.5, -23.5],
  [22, -18], [27, -10],
];
export const GAP_HALF = 4.2;

/** A way out of the village: the gap in the palisade it opens from, the way it leads out (a unit vector), and where
 *  its portal stands along it (m out from the gap) facing back into the village. */
export interface Entrance { gap: Spot; out: Spot; portalOut: number }
const unit = (x: number, z: number): Spot => [x / Math.hypot(x, z), z / Math.hypot(x, z)];
export const ENTRANCES: Record<BiomeId, Entrance> = {
  // down into the crypt: a walled court, the portal at its far end before the crypt's sunken door
  crypt: { gap: [24.5, -14], out: unit(0.85, -0.53), portalOut: 5.2 },
  // into the Thornwood: a path into a grove, the portal between two of its roots
  forest: { gap: [-24.3, 13.2], out: unit(-0.85, 0.53), portalOut: 6.5 },
};

/** Where a way out's portal stands, and the way it faces (rad about y: 0 faces +z): back along its way. */
export function portalPlace(id: BiomeId): { x: number; z: number; facing: number } {
  const e = ENTRANCES[id];
  return {
    x: e.gap[0] + e.out[0] * e.portalOut, z: e.gap[1] + e.out[1] * e.portalOut,
    facing: Math.atan2(-e.out[0], -e.out[1]),
  };
}

/** The roads, cobbled, each a winding line from the square (its points) and its width (m): to each way out, to the
 *  hall's stair, to the yard's gate. */
export const ROADS: readonly { points: readonly Spot[]; width: number }[] = [
  { points: [[5.2, -0.8], [10.5, -2.4], [16, -5.6], [21, -10.6], [24.7, -14.1], [27.5, -15.8]], width: 3.2 },
  { points: [[-5.2, 0.9], [-10.5, 2.4], [-15.5, 5.1], [-20.5, 9.6], [-24.4, 13.3], [-27.5, 15.2]], width: 3.0 },
  { points: [[-0.6, -5.2], [-1.0, -6.6], [-1.5, -8.0]], width: 4.4 },
  { points: [[4.6, 4.3], [6.3, 5.9], yardToWorld(YARD.gateAt, -6.6), yardToWorld(YARD.gateAt, -5.0)], width: 2.6 },
];

/** The cottages: each one's middle, the way its door faces (rad about y: 0 faces +z) and its size (1 a cottage, under
 *  it a shed), and its footpath's way to a road from its door (worn into the grass), if it has one. */
export interface Cottage { x: number; z: number; facing: number; size: number; path?: readonly Spot[] }
export const COTTAGES: readonly Cottage[] = [
  { x: -14.2, z: -3.4, facing: 0.22, size: 1, path: [[-13.4, 0.2], [-12.8, 1.8], [-12.6, 3.0]] },
  { x: -21.6, z: -6.2, facing: 0.62, size: 0.85, path: [[-19.4, -3.4], [-18.2, 1.0], [-17.8, 5.6]] },
  { x: -16.5, z: -15.2, facing: 0.75, size: 0.7 },
  { x: -15.6, z: 15.6, facing: Math.PI - 0.35, size: 0.9, path: [[-14.8, 12.8], [-15.6, 9.8], [-17.0, 7.0]] },
  { x: -3.8, z: 17.2, facing: Math.PI + 0.42, size: 1, path: [[-2.6, 14.6], [-0.4, 11.0], [2.2, 7.4]] },
  { x: 19.2, z: 1.4, facing: Math.PI - 0.1, size: 1, path: [[19.0, -1.2], [18.6, -4.0], [18.0, -7.2]] },
  { x: 21.6, z: 9.6, facing: -2.3, size: 0.8, path: [[22.4, 6.4], [23.4, 1.5], [22.8, -3.6], [22.0, -7.4]] },
  { x: 14.6, z: -17.4, facing: -0.35, size: 0.9, path: [[13.6, -14.6], [15.8, -11.4], [17.6, -7.6]] },
];

/** the campfire's middle */
export const CAMPFIRE: Spot = [-9.2, 10.4];
/** the notice board's middle, and the way it faces (rad, about y: 0 faces +z): beside the Thornwood's road, facing it */
export const NOTICE = { x: -8.6, z: -1.6, facing: 0.25 };
/** the chest at the hall's entrance: on the terrace, beside the stair's top, and the way it faces */
export const CHEST = { x: TERRACE.x + 3.8, z: -12.0, facing: 0 };

/** The portals' objects: each before its way out's portal, used from in front of it. */
function portalObject(id: BiomeId, name: string, verb: string): VillageObject {
  const p = portalPlace(id), front = [Math.sin(p.facing), Math.cos(p.facing)];
  return {
    id, use: 'portal', biome: id, at: [p.x, p.z], reach: 4.2, stand: [p.x + front[0] * 3.2, p.z + front[1] * 3.2],
    label: 5.6, name, verb,
  };
}

/** Every object the hero uses, in the order the touch Use button and the keys look for one. */
export const VILLAGE_OBJECTS: readonly VillageObject[] = [
  portalObject('crypt', 'Portal to the Crypt', 'Enter the Crypt'),
  portalObject('forest', 'Portal to the Thornwood', 'Enter the Thornwood'),
  {
    // (stood beside it on the stair's top: before it, the terrace's edge is a step away and the ground under it too low)
    id: 'chest', use: 'stash', at: [CHEST.x, CHEST.z], reach: 2.2, stand: [CHEST.x - 1.5, CHEST.z - 0.4], label: 1.4,
    name: 'Stash', verb: 'Open the stash',
  },
  {
    id: 'hall', use: 'heroes', at: [TERRACE.x, HALL.door], reach: 3.6, stand: [TERRACE.x, HALL.door + 1.8], label: 3.9,
    name: 'Hall of Heroes', verb: 'Choose your hero',
  },
  {
    id: 'campfire', use: 'coop', at: CAMPFIRE, reach: 2.8, stand: [CAMPFIRE[0] + 1.9, CAMPFIRE[1] - 0.4], label: 1.8,
    name: 'Campfire', verb: 'Play together',
  },
  {
    id: 'chronicle', use: 'chronicle', at: [DAIS_EAST.x, DAIS_EAST.z], reach: 2.4, stand: [DAIS_EAST.x, DAIS_EAST.z + 1.1],
    label: 2.4, name: 'Chronicle', verb: 'Save slots',
  },
  {
    id: 'notice', use: 'help', at: [NOTICE.x, NOTICE.z], reach: 2.4,
    stand: [NOTICE.x + Math.sin(NOTICE.facing) * 1.4, NOTICE.z + Math.cos(NOTICE.facing) * 1.4], label: 2.6,
    name: 'Notice board', verb: 'How to play',
  },
];

/** The hours of the village's day: its light from the hour of the player's clock (a co-op guest's, the host's).
 *  `dawn` and `dusk` are when the sun is on the horizon. */
export const DAY = { dawn: 6.5, dusk: 19.5 };
