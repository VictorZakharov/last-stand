// `lab village`'s hero's shadow from a lamp: patches of paving behind him, away from the street lamp he stands by at
// midnight, each read from straight over it with the lamps' shadows at their strength and held off, while he casts
// and while he doesn't: what more they take while he casts is his. The lamps' shadows are drawn once of what stands
// still, and drawn with him hidden he cast none from them (from play: "no shadows from lights"). Read on the grass,
// the meadow's blades took no lamp's shadow, so only paving is read. `canary` stops him casting, which must be found.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { groundHeight } from '../../../src/world/ground';
import { drawFrame, topLight, type Canvas } from './light';
import { castingAsOne } from '../../../src/entities/models/castAsOne';
import { roadLines, SQUARE_R, toPolyline } from '../../../src/world/villagePlan';
import type { LightsChecked } from './villageLights';

/** how far from the lamp he stands (m) */
const BY = 3;
/** the patches of ground read behind him: their turns off the line from the lamp through him (radians), how far
 *  behind him each lies and how far across it is (m), and the camera's height over them */
const SECTOR = [-0.3, -0.15, 0, 0.15, 0.3];
const OFFS = [0.6, 1.2, 1.8, 2.6];
const ACROSS = 0.4;
const OVER = 8;
/** the least his shadow must take of a patch's light, the spots round the lamp tried for paving behind him, and the
 *  frames he's given at each (the casting lights to settle) */
const LEAST_DARKER = 0.15;
const SPOTS = 32;
/** how far inside a road's edge the ground read must lie (m): the meadow's blades over the grass take no lamp's
 *  shadow */
const ON_ROAD = 0.5;
const SETTLE = 150;

/** The mean light of the ground `ACROSS` m square round `at`, in the frame drawn from over it. */
function lightRound(canvas: Canvas, at: THREE.Vector3): number {
  const middle = at.clone().project(G.camera);
  const side = at.clone().add(new THREE.Vector3(ACROSS / 2, 0, 0)).project(G.camera);
  const x = ((middle.x + 1) / 2) * canvas.width;
  const y = ((middle.y + 1) / 2) * canvas.height;
  const half = Math.max(2, Math.abs(((side.x - middle.x) / 2) * canvas.width));
  let sum = 0;
  let count = 0;
  for (let py = Math.floor(y - half); py <= y + half; py++) {
    for (let px = Math.floor(x - half); px <= x + half; px++) {
      if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
      sum += topLight(canvas, (py * canvas.width + px) * 4);
      count++;
    }
  }
  return count ? sum / count : 0;
}

/** The point lights casting now (the lamps' at midnight). */
function castingLights(): THREE.PointLight[] {
  const lights: THREE.PointLight[] = [];
  G.scene.traverse((o) => {
    const light = o as THREE.PointLight;
    if (light.isPointLight && light.castShadow && light.intensity > 0) lights.push(light);
  });
  return lights;
}

/** The ground's light round `at` drawn from straight over it, the point lights' shadows at `strength` (or as they
 *  are), the game's camera given back after. */
function readOver(lab: Lab, at: THREE.Vector3, strength: number | null): number {
  const camera = G.camera;
  const kept = { at: camera.position.clone(), turn: camera.quaternion.clone() };
  const lights = castingLights();
  const strengths = lights.map((light) => light.shadow.intensity);
  if (strength !== null) for (const light of lights) light.shadow.intensity = strength;
  camera.position.set(at.x + 0.01, at.y + OVER, at.z);
  camera.lookAt(at);
  camera.updateMatrixWorld();
  try {
    return lightRound(drawFrame(lab), at);
  } finally {
    lights.forEach((light, i) => {
      light.shadow.intensity = strengths[i];
    });
    camera.position.copy(kept.at);
    camera.quaternion.copy(kept.turn);
    camera.updateMatrixWorld();
  }
}

/** The hero casting no shadow (the canary's fault, and the reading without his): every part of him, and the shadow
 *  his pieces are cast as one by (`castAsOne`, which casts whatever they say), or casting again as he did. */
function heroCasts(on: boolean, kept: Map<THREE.Object3D, boolean>): void {
  castingAsOne.on = on;
  G.player.obj.traverse((part) => {
    if (!on) {
      if (!kept.has(part)) kept.set(part, part.castShadow);
      part.castShadow = false;
    } else if (kept.has(part)) {
      part.castShadow = kept.get(part)!;
    }
  });
  if (on) kept.clear();
}

/** The share of the ground's light round `at` the lamps' shadows take, read with them at their strength and held
 *  off. */
function lampsTake(lab: Lab, at: THREE.Vector3): number {
  const shadowed = readOver(lab, at, null);
  const unshadowed = readOver(lab, at, 0);
  return 1 - shadowed / Math.max(unshadowed, 1e-3);
}

/** Whether (x, z) is paved: on the square or a road, `ON_ROAD` inside its edge. */
function paved(x: number, z: number): boolean {
  if (Math.hypot(x, z) < SQUARE_R - ON_ROAD) return true;
  return roadLines.some((road) => toPolyline(x, z, road.line) < road.width / 2 - ON_ROAD);
}

/** The patches of ground behind the hero, away from `lamp`: across a sector of it, near and far. */
function behind(lamp: THREE.Vector3): THREE.Vector3[] {
  const p = G.player.pos;
  const away = Math.atan2(p.x - lamp.x, p.z - lamp.z);
  const patches: THREE.Vector3[] = [];
  for (const turn of SECTOR) {
    for (const off of OFFS) {
      const at = new THREE.Vector3(p.x + Math.sin(away + turn) * off, 0, p.z + Math.cos(away + turn) * off);
      at.y = groundHeight(at.x, at.z);
      patches.push(at);
    }
  }
  return patches;
}

/** The hero stood `BY` m off `lamp` where the ground behind him is paved, and those patches of it. */
async function standBy(lab: Lab, lamp: THREE.Vector3): Promise<THREE.Vector3[] | null> {
  for (let k = 0; k < SPOTS; k++) {
    const a = (k / SPOTS) * Math.PI * 2;
    const spot = new THREE.Vector3(lamp.x + Math.sin(a) * BY, 0, lamp.z + Math.cos(a) * BY);
    spot.y = groundHeight(spot.x, spot.z);
    G.player.walkTo = null;
    G.player.place(spot, a + Math.PI);
    await lab.step(SETTLE);
    if (Math.hypot(G.player.pos.x - spot.x, G.player.pos.z - spot.z) > 0.2) continue;
    const patches = behind(lamp);
    if (patches.every((at) => paved(at.x, at.z))) return patches;
  }
  return null;
}

/** The most of a patch's light his shadow takes: what the lamps' shadows take there while he casts, less what they
 *  take while he doesn't (what stands still there). */
function mostHeTakes(lab: Lab, patches: THREE.Vector3[], casts: Map<THREE.Object3D, boolean>, canary: boolean): number {
  if (canary) heroCasts(false, casts);
  const casting = patches.map((at) => lampsTake(lab, at));
  heroCasts(false, casts);
  const bare = patches.map((at) => lampsTake(lab, at));
  heroCasts(true, casts);
  return Math.max(...casting.map((take, i) => take - bare[i]));
}

/** The hero by a street lamp at midnight: the lamps' shadows taking more of the ground behind him while he casts. */
export async function heroShadowByLamp(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const lanterns = [...G.arena.village.lanterns].sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  const lamp = lanterns[0];
  holdHour(0);
  const casts = new Map<THREE.Object3D, boolean>();
  try {
    // (each spot settled long enough for the lamps' casting lights to take their lamps)
    await lab.step(SETTLE);
    if (!castingLights().length) throw new Error('lab: village: no lamp casting at midnight');
    const patches = await standBy(lab, lamp);
    if (!patches) throw new Error('lab: village: no paved ground by a lamp');
    const his = mostHeTakes(lab, patches, casts, canary);
    const line = `hero's lamp shadow: the most the lamps' shadows take of a patch of paving behind him ${BY} m `
      + `from a lamp while he casts, over what they take there while he doesn't: ${(his * 100).toFixed(1)}%`;
    const missing = his < LEAST_DARKER;
    const problems = missing && !canary ? [`${line}: he casts no shadow from the lamp`] : [];
    return { lines: [line], problems, caught: canary ? missing : null, moments: [] };
  } finally {
    heroCasts(true, casts);
    holdHour(null);
  }
}
