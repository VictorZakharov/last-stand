// `lab village --only sightBlacksOut`: what he can't see from where he stands, from above (from play, "we have a bug
// that allows character to see inside buildings while staying outside ... hide the areas player cannot possibly see
// (black out)"). At noon, so nothing is dark by itself: stood outside the hall its floor is black and the ground
// beside him lit; stood in it the floor is lit and the ground beyond its wall black; stood before its door the floor
// in line with the door is lit; stood before a cottage the ground behind it is black; and over the shoulder none of it
// is. `canary` holds the blacking off, which must be found.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { COTTAGES, HALL, TERRACE } from '../../../src/data/village';
import { COTTAGE } from '../../../src/world/villagePlan';
import { holdHour } from '../../../src/game/clock';
import { viewMode } from '../../../src/core/renderer';
import { holdSightOff } from '../../../src/core/sight';
import { groundHeight } from '../../../src/world/ground';
import { drawFrame, type Canvas } from './light';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the frames given to settle (the blacking eases in), half the box read (px), under this a box's mean lightest channel
 *  is black, over this lit */
const SETTLE = 90;
const HALF_BOX = 10;
const BLACK = 0.02;
const LIT = 0.05;
/** how far out of a wall he stands, and how far past it what's read lies (m) */
const OUT_OF_WALL = 1.5;
const PAST_WALL = 2;
/** how far further back from the door the hall's floor is read (m), and how far off a cottage's end (m) */
const BACK_OF_PORTICO = 4;
const JUST_OUT = 0.8;

/** A place read from a stand, and which way it should come out. */
interface Reading {
  name: string;
  stand: [number, number];
  read: [number, number];
  seen: boolean;
}

/** The floor's height at (x, z), a hair over it. */
const floorAt = (x: number, z: number): number => groundHeight(x, z) + 0.05;

/** What's read, each from where it's read from. */
function readings(): Reading[] {
  const middleZ = (HALL.door + TERRACE.back) / 2;
  const east = TERRACE.x + HALL.half;
  const cottage = COTTAGES[0];
  const out = COTTAGE.d / 2 * cottage.size + OUT_OF_WALL;
  const facingX = Math.sin(cottage.facing);
  const facingZ = Math.cos(cottage.facing);
  const before: [number, number] = [cottage.x + facingX * out, cottage.z + facingZ * out];
  // (along it: from behind it, the ground before it lay under the frame)
  const along = COTTAGE.w / 2 * cottage.size + JUST_OUT;
  const alongX = Math.cos(cottage.facing);
  const alongZ = -Math.sin(cottage.facing);
  const westOf: [number, number] = [cottage.x - alongX * along, cottage.z - alongZ * along];
  const eastOf: [number, number] = [cottage.x + alongX * along, cottage.z + alongZ * along];
  return [
    {
      name: 'the hall\'s floor from outside it',
      // (far enough back that no column of the portico, which he does see, stands over it)
      stand: [east + OUT_OF_WALL, middleZ - BACK_OF_PORTICO],
      read: [east - PAST_WALL, middleZ - BACK_OF_PORTICO],
      seen: false,
    },
    {
      name: 'the ground beside him outside it',
      stand: [east + OUT_OF_WALL, middleZ],
      read: [east + OUT_OF_WALL + 1.5, middleZ],
      seen: true,
    },
    {
      name: 'the hall\'s floor from in it',
      stand: [east - OUT_OF_WALL, middleZ],
      read: [east - OUT_OF_WALL - 2, middleZ],
      seen: true,
    },
    {
      name: 'the ground past its wall from in it',
      stand: [east - OUT_OF_WALL, middleZ],
      read: [east + PAST_WALL, middleZ],
      seen: false,
    },
    {
      name: 'the hall\'s floor through its door',
      stand: [TERRACE.x, HALL.door + 3],
      read: [TERRACE.x, HALL.door - 3],
      seen: true,
    },
    { name: 'the ground before a cottage', stand: before, read: [before[0] + 1.2, before[1]], seen: true },
    { name: 'the ground across the cottage from him', stand: westOf, read: eastOf, seen: false },
  ];
}

/** The mean lightest channel of a box round (x, z) on the floor as `canvas` shows it, null where it's off the frame. */
function lightAt(canvas: Canvas, x: number, z: number): number | null {
  const place = new THREE.Vector3(x, floorAt(x, z), z).project(G.camera);
  const middleX = Math.round((place.x + 1) / 2 * canvas.width);
  const middleY = Math.round((place.y + 1) / 2 * canvas.height);
  const inFrame = middleX > HALF_BOX && middleY > HALF_BOX
    && middleX < canvas.width - HALF_BOX && middleY < canvas.height - HALF_BOX;
  if (!inFrame) return null;
  let sum = 0;
  let count = 0;
  for (let y = middleY - HALF_BOX; y < middleY + HALF_BOX; y++) {
    for (let x0 = middleX - HALF_BOX; x0 < middleX + HALF_BOX; x0++) {
      const at = (y * canvas.width + x0) * 4;
      sum += Math.max(canvas.pixels[at], canvas.pixels[at + 1], canvas.pixels[at + 2]);
      count++;
    }
  }
  return sum / count;
}

/** He placed at `stand`, settled, and the frame drawn. */
async function drawnFrom(lab: Lab, stand: [number, number]): Promise<Canvas> {
  const [x, z] = stand;
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), 0);
  await lab.step(SETTLE);
  return drawFrame(lab);
}

/** Each place read from its stand, from above, and what's unseen over the shoulder left whole. */
export async function sightBlacksOut(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  if (canary) holdSightOff(true);
  holdHour(12);
  try {
    await viewBy(lab, 'top');
    for (const reading of readings()) {
      const canvas = await drawnFrom(lab, reading.stand);
      const light = lightAt(canvas, reading.read[0], reading.read[1]);
      if (light === null) {
        problems.push(`${reading.name}: off the frame`);
        continue;
      }
      lines.push(`${reading.name}: ${light.toFixed(3)} (${reading.seen ? 'seen' : 'unseen'})`);
      const right = reading.seen ? light > LIT : light < BLACK;
      if (!right) problems.push(`${reading.name}: ${light.toFixed(3)}, should be ${reading.seen ? 'lit' : 'black'}`);
      if (!canary) moments.push(await lab.screen(reading.name, []));
    }
    const behind = readings()[readings().length - 1];
    await viewBy(lab, 'third');
    const shoulder = await drawnFrom(lab, behind.stand);
    const whole = shoulder.pixels.reduce((sum, value) => sum + value, 0) / shoulder.pixels.length;
    lines.push(`over the shoulder the frame's mean ${whole.toFixed(3)}`);
    if (whole < LIT) problems.push(`over the shoulder the frame is dark: ${whole.toFixed(3)}`);
  } finally {
    holdSightOff(false);
    holdHour(null);
    await viewBy(lab, kept);
  }
  if (canary) return { lines, problems: [], caught: problems.length > 0, moments: [] };
  return { lines, problems, caught: null, moments };
}
