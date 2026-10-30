// `lab village`'s lamps: a street lamp at midnight as the player meets it, 3 m off its post and looked at in each
// close view, its lantern's pixels read back from the frame drawn. A lamp mustn't blind: drawn in a lit, glowing
// material with its light a hand's breadth off the glass, the lanterns burned white and the bloom round them hid the
// lantern whole (from play: "lights too bright, can't see geometry even", "we should always check all lights for
// blinding"). `canary` hangs a glaring orb in the lantern, which must be caught.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { groundHeight } from '../../../src/world/ground';
import { holdHour } from '../../../src/game/clock';
import * as renderer from '../../../src/core/renderer';
import { drawFrame, topLight, type Canvas } from './light';

/** One check's lines, its problems, and whether its canary was caught (null: no canary ran). */
export interface LampsChecked { lines: string[]; problems: string[]; caught: boolean | null }

/** how far from the lantern the hero stands (m, on the ground), and the frames he's given to settle and look */
const STAND_OFF = 3;
const SETTLE = 15;
const LOOK = 60;
/** the lantern's own size to count over (m across, round its middle: its glass, crown and cup), and the ring round it
 *  where a glare would spread (out to this many times as far) */
const LANTERN_SPAN = 0.6;
const RING_OUT = 2.5;
/** a pixel blown out: its brightest channel's light at least this (1 is white) */
const BLOWN = 0.97;
/** the most of the lantern's own box, and of the ring round it, that may be blown out */
const LANTERN_MOST = 0.12;
const RING_MOST = 0.02;
/** the canary's orb: its radius (m) and its colour, far past white */
const ORB_RADIUS = 0.16;
const ORB_GLARE = 12;

/** A box round a point on the canvas, in its pixels from its bottom left, as its half width and middle. */
interface ScreenBox { x: number; y: number; half: number }

/** Where `point` falls on the canvas and how many of its pixels `span` m across it covers there, or null behind. */
function boxOn(canvas: Canvas, point: THREE.Vector3, span: number): ScreenBox | null {
  const camera = G.camera;
  const middle = point.clone().project(camera);
  if (middle.z > 1) return null;
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const side = point.clone().addScaledVector(right, span / 2).project(camera);
  const x = ((middle.x + 1) / 2) * canvas.width;
  const y = ((middle.y + 1) / 2) * canvas.height;
  const half = Math.abs(((side.x - middle.x) / 2) * canvas.width);
  return { x, y, half };
}

/** The share of pixels blown out inside `inner` (or between it and `outer`, a ring, when one is given). */
function blownShare(canvas: Canvas, inner: ScreenBox, outer?: ScreenBox): number {
  const box = outer ?? inner;
  const inside = (px: number, py: number, b: ScreenBox): boolean =>
    Math.abs(px - b.x) <= b.half && Math.abs(py - b.y) <= b.half;
  let counted = 0;
  let blown = 0;
  const left = Math.max(0, Math.floor(box.x - box.half));
  const right = Math.min(canvas.width - 1, Math.ceil(box.x + box.half));
  const bottom = Math.max(0, Math.floor(box.y - box.half));
  const top = Math.min(canvas.height - 1, Math.ceil(box.y + box.half));
  for (let py = bottom; py <= top; py++) {
    for (let px = left; px <= right; px++) {
      if (outer && inside(px, py, inner)) continue;
      counted++;
      if (topLight(canvas, (py * canvas.width + px) * 4) >= BLOWN) blown++;
    }
  }
  return counted ? blown / counted : 0;
}

/** The hero stood `STAND_OFF` from the lantern's foot on open ground, facing it; false if no spot round it holds
 *  him. */
async function standBy(lab: Lab, lantern: THREE.Vector3): Promise<boolean> {
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const x = lantern.x + Math.sin(a) * STAND_OFF;
    const z = lantern.z + Math.cos(a) * STAND_OFF;
    G.player.walkTo = null;
    G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), a + Math.PI);
    await lab.step(SETTLE);
    if (Math.hypot(G.player.pos.x - x, G.player.pos.z - z) < 0.2) return true;
  }
  return false;
}

/** The lantern nearest the square's middle (lit by a pooled light once he's by it). */
function aLantern(): THREE.Vector3 {
  const lanterns = [...G.arena.village.lanterns];
  lanterns.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  return lanterns[0];
}

/** The canary's orb, far past white, hung in the lantern. */
function plantOrb(at: THREE.Vector3): () => void {
  const glare = new THREE.Color(ORB_GLARE, ORB_GLARE * 0.9, ORB_GLARE * 0.7);
  const material = new THREE.MeshBasicMaterial({ color: glare });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(ORB_RADIUS, 12, 8), material);
  orb.position.copy(at);
  G.scene.add(orb);
  return () => {
    G.scene.remove(orb);
    orb.geometry.dispose();
    material.dispose();
  };
}

/** One close view's reading of the lantern: its line, and whether it blinds. */
function readView(view: string, lantern: THREE.Vector3, lab: Lab): { line: string; blinds: boolean } {
  const canvas = drawFrame(lab);
  const own = boxOn(canvas, lantern, LANTERN_SPAN);
  if (!own || own.half < 3) return { line: `lamps: ${view}: the lantern not in view`, blinds: false };
  const ring = { ...own, half: own.half * RING_OUT };
  const ownBlown = blownShare(canvas, own);
  const ringBlown = blownShare(canvas, own, ring);
  const blinds = ownBlown > LANTERN_MOST || ringBlown > RING_MOST;
  const percent = (v: number): string => `${(v * 100).toFixed(1)}%`;
  const line = `lamps: ${view}: lantern ${percent(ownBlown)} blown out (${Math.round(own.half * 2)} px across), `
    + `round it ${percent(ringBlown)}${blinds ? ' (blinding)' : ''}`;
  return { line, blinds };
}

/** A lamp at midnight read in each close view: neither its lantern nor the ring round it blown out. */
export async function lampsNotBlinding(lab: Lab, canary: boolean): Promise<LampsChecked> {
  const lantern = aLantern();
  holdHour(0);
  if (!(await standBy(lab, lantern))) throw new Error('lab: village: no open ground 3 m round the lamp to stand on');
  const unplant = canary ? plantOrb(lantern) : () => {};
  const lines: string[] = [];
  const problems: string[] = [];
  let blinding = false;
  let read = 0;
  try {
    for (let press = 0; press < 3; press++) {
      await lab.step(1, () => ({ keys: ['v'] }));
      const view = renderer.viewMode();
      if (view === 'top') break;
      await lab.step(LOOK, () => ({ sight: lantern }));
      const { line, blinds } = readView(view, lantern, lab);
      lines.push(line);
      read++;
      if (blinds) {
        blinding = true;
        problems.push(`${line}: a lamp blinds`);
      }
    }
  } finally {
    unplant();
    holdHour(null);
    while (renderer.viewMode() !== 'top') await lab.step(1, () => ({ keys: ['v'] }));
    await lab.step(SETTLE);
  }
  if (!read) throw new Error('lab: village: V never took the village into a close view to see the lamp');
  return { lines, problems: canary ? [] : problems, caught: canary ? blinding : null };
}
