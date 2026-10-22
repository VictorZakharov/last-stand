// `lab rim`: the hero walked round the whole wall pressed into it (tools/lab). In each biome, each way round, he's
// put a few metres in from the wall and walks with the touch stick along the ring, turned out into the wall, so he
// slides along its faces and into every gap between its bushes, rocks and buttresses. Every frame he moves further
// than a run takes him is a jump (the wall threw him: kept off each stretch of its line alone, a body past one's end
// in a gap was put back on its inner side, metres in a frame); wherever he stops, he walks back in to the middle,
// and one that can't is stuck. `--canary` plants a jump and a stuck stop: both must be caught.
import * as THREE from 'three';
import type { Lab, Report } from './lab';
import { BIOME_IDS, type BiomeId } from '../../../src/data/biomes';
import { G } from '../../../src/state';
import { cameraYaw } from '../../../src/core/renderer';
import { TAU } from '../../../src/util';
import { WALL_R } from '../../../src/world/props';

export interface RimOptions {
  /** the biomes walked (every one by default) */
  biomes?: BiomeId[];
  canary: boolean;
}

/** how far in from the wall's line he starts, and is put again past a stop (m) */
const START_IN = 2.5;
/** how far his way is turned out from along the ring into the wall (degrees): pressed in, yet at a slant he slides
 *  at; and hugging it, walked along it as a player does */
const SLANTS = [40, 10];
/** the frames he stands on his spot before he walks (put there, his feet are where he was) */
const SETTLE_FRAMES = 20;
/** a frame's move further than this is a jump (m: a run goes about 0.1 m a frame) */
const JUMP = 0.2;
/** he's stopped when he's gone less than STILL round the ring (m) over STILL_FRAMES frames */
const STILL = 0.05;
const STILL_FRAMES = 40;
/** walking back in from a stop, he must get this much further in (m) within FREE_FRAMES frames */
const FREE = 1;
const FREE_FRAMES = 90;
/** past a stop, how far on round the ring he's put again (rad: a few metres at the wall) */
const ON_PAST = 0.12;
/** how far round the ring either side of him a stop's cause is looked for (m), in how many steps */
const AROUND = 1;
const AROUND_STEPS = 20;
/** the most frames a lap may take (a walk round at a slant takes about 3000) */
const LAP_FRAMES = 12000;

/** What went wrong on a lap, where (degrees round the ring) and how far (m). */
interface Fault {
  degrees: number;
  what: string;
}

/** A lap's account: its faults, and how many times he stopped and walked free. */
interface Lap {
  faults: Fault[];
  /** where he stopped (degrees round the ring), and what against */
  stops: { degrees: number; against: string }[];
  frames: number;
}

/** The touch stick's push that walks him along the world's `angle` (from +x toward +z) as the camera turns it. */
function stickToward(angle: number): [number, number] {
  const tx = Math.cos(angle);
  const tz = Math.sin(angle);
  const yaw = cameraYaw();
  return [tx * Math.cos(yaw) - tz * Math.sin(yaw), tx * Math.sin(yaw) + tz * Math.cos(yaw)];
}

/** Where round the ring the hero is (rad). */
const angleNow = (): number => Math.atan2(G.player.pos.z, G.player.pos.x);

/** How far from the middle the hero is (m). */
const outNow = (): number => Math.hypot(G.player.pos.x, G.player.pos.z);

/** An angle in degrees, between 0 and 360, as a line says it. */
const degreesOf = (angle: number): number => ((((angle * 180) / Math.PI) % 360) + 360) % 360;

/** What bounds the floor nearest the hero's body: the wall's point nearest him, among those within his radius and
 *  a little more round the ring either side (a tree from before the wall was drawn has none to say). */
function againstNow(): string {
  const wall = G.arena.wall as typeof G.arena.wall | undefined;
  if (!wall?.boundAt) return 'the ring';
  const hero = G.player.pos;
  const r = outNow();
  let best = Infinity;
  let said = 'the face';
  for (let k = -AROUND_STEPS; k <= AROUND_STEPS; k++) {
    const angle = angleNow() + (k / AROUND_STEPS) * (AROUND / r);
    const reach = wall.reachAt(Math.cos(angle), Math.sin(angle));
    const off = Math.hypot(Math.cos(angle) * reach - hero.x, Math.sin(angle) * reach - hero.z);
    if (off >= best) continue;
    best = off;
    const bound = wall.boundAt(Math.cos(angle), Math.sin(angle));
    said = bound ? `${bound.name || 'a mesh'} ${bound.use} at ${bound.y.toFixed(1)} m up` : 'the face';
  }
  return said;
}

/** The hero put START_IN in from the wall's line at `angle`, stood still a moment. */
async function putAt(lab: Lab, angle: number): Promise<void> {
  // (a tree from before the wall was drawn (#290) has no `wall`: its ring stood at the face)
  const wall = G.arena.wall as typeof G.arena.wall | undefined;
  const out = (wall?.reachAt(Math.cos(angle), Math.sin(angle)) ?? WALL_R) - START_IN;
  G.player.place(new THREE.Vector3(Math.cos(angle) * out, 0, Math.sin(angle) * out), 0);
  G.player.vel.set(0, 0, 0);
  await lab.step(SETTLE_FRAMES, () => ({ stick: [0, 0] }));
}

/** From a stop, whether he walks FREE further in within FREE_FRAMES (with `planted`, he's held where he is). */
async function walksFree(lab: Lab, planted: boolean): Promise<boolean> {
  const from = outNow();
  const held = G.player.pos.clone();
  for (let f = 0; f < FREE_FRAMES; f++) {
    await lab.step(1, () => ({ stick: stickToward(angleNow() + Math.PI) }));
    if (planted) G.player.pos.copy(held);
    if (from - outNow() >= FREE) return true;
  }
  return false;
}

/** One lap round `biome`'s wall, `way` 1 anticlockwise (seen from above, +x toward +z) or -1 the other, his way
 *  turned `slant` (rad) out into the wall (with `canary`, a jump planted on its 100th frame and its first stop
 *  held). */
async function lap(lab: Lab, way: 1 | -1, slant: number, canary: boolean): Promise<Lap> {
  const faults: Fault[] = [];
  const start = 0.01;
  await putAt(lab, start);
  let gone = 0;
  const stops: Lap['stops'] = [];
  let frames = 0;
  let last = G.player.pos.clone();
  let lastAngle = angleNow();
  const goneAt: number[] = [];
  while (gone < TAU && frames < LAP_FRAMES) {
    const along = angleNow() + (way * Math.PI) / 2;
    const stick = stickToward(along - way * slant);
    await lab.step(1, () => ({ stick }));
    frames++;
    if (canary && frames === 100) G.player.pos.x += 1;
    const moved = Math.hypot(G.player.pos.x - last.x, G.player.pos.z - last.z);
    if (moved > JUMP) faults.push({ degrees: degreesOf(angleNow()), what: `thrown ${moved.toFixed(2)} m in a frame` });
    last = G.player.pos.clone();
    const now = angleNow();
    gone += way * Math.atan2(Math.sin(now - lastAngle), Math.cos(now - lastAngle));
    lastAngle = now;
    goneAt.push(gone * outNow());
    const back = goneAt[goneAt.length - 1 - STILL_FRAMES];
    if (back === undefined || goneAt[goneAt.length - 1] - back >= STILL) continue;
    stops.push({ degrees: degreesOf(now), against: againstNow() });
    if (!(await walksFree(lab, canary && stops.length === 1))) {
      faults.push({ degrees: degreesOf(now), what: `stuck: walking back in, not ${FREE} m in ${FREE_FRAMES} frames` });
    }
    await putAt(lab, now + way * ON_PAST);
    gone += ON_PAST;
    last = G.player.pos.clone();
    lastAngle = angleNow();
    goneAt.length = 0;
  }
  // (the stick let go: it's kept between frames, and the next set-up's hero walked off his spot)
  await lab.step(1, () => ({ stick: [0, 0] }));
  if (gone < TAU) faults.push({ degrees: degreesOf(angleNow()), what: `never got round in ${LAP_FRAMES} frames` });
  return { faults, stops, frames };
}

/** A stop as its line says it. */
const stopLine = (stop: Lap['stops'][number]): string => `${stop.degrees.toFixed(0)}° (${stop.against})`;

/** A fault as its line says it. */
const faultLine = (fault: Fault): string => `${fault.degrees.toFixed(1)}°: ${fault.what}`;

/** `lab rim`: the hero walked round each biome's wall each way, pressed into it: its jumps and stuck stops. */
export async function wallRim(lab: Lab, options: RimOptions): Promise<Report> {
  const was = G.arena.biome;
  const lines: string[] = [];
  const problems: string[] = [];
  const caught = { jump: false, stuck: false };
  let planted = false;
  for (const biome of options.biomes ?? [...BIOME_IDS]) {
    if (G.arena.biome !== biome) G.arena.setBiome(biome);
    await lab.setup({});
    for (const [way, slant] of SLANTS.flatMap((s) => [[1, s], [-1, s]] as const)) {
      const canary: boolean = options.canary && !planted;
      planted ||= canary;
      const one = await lap(lab, way, (slant * Math.PI) / 180, canary);
      const name = `${biome} ${way > 0 ? 'anticlockwise' : 'clockwise'}, ${slant}° into it`;
      if (canary) {
        caught.jump = one.faults.some((fault) => fault.what.startsWith('thrown'));
        caught.stuck = one.faults.some((fault) => fault.what.startsWith('stuck'));
        continue;
      }
      lines.push(`${name}: ${one.frames} frames, stopped ${one.stops.length} times, `
        + `${one.faults.length} faults`);
      lines.push(`  stopped at ${one.stops.map(stopLine).join(', ')}`);
      for (const fault of one.faults) {
        lines.push(`  ${faultLine(fault)}`);
        problems.push(`${name}: ${faultLine(fault)}`);
      }
    }
  }
  if (G.arena.biome !== was) G.arena.setBiome(was);
  if (!options.canary) return { text: lines.join('\n'), problems };
  const said = (seen: boolean) => (seen ? 'caught' : 'missed');
  lines.push(`canary: a planted jump ${said(caught.jump)}, a held stop ${said(caught.stuck)}`);
  if (!caught.jump) problems.push('canary: a jump of 1 m went unseen');
  if (!caught.stuck) problems.push('canary: a stop held in place went unseen');
  return { text: lines.join('\n'), problems };
}
