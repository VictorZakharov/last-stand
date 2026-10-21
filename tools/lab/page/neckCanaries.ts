// tools/lab neck --canary: the faults the neck's measures must catch, planted on the hero as he stands and read by
// the same slices: a ridge round the neck, skin laid over the collar, the neck's skin paler and wider, and a neck that
// stops short inside a loose collar (then with a floor under it, which must read closed). A canary missed is a
// problem.
import * as THREE from 'three';
import type { Model } from '../../../src/types';
import { HEAD_MM } from '../../../src/entities/models/head';
import { sliceNeck, ANGLES, type Slices } from './neckSlices';
import { fellThrough } from './neckGaps';
import { freeNecks, ridgeOf, type Kind, type Line } from './neckMeasure';
import { readLines, mm, percent, RIDGE_MOST, SEAM_DE_MOST, STEP_MOST, THROUGH_MOST } from './neckRead';

/** the canary's neck that stops short (face mm out from what each line met, up from its row: a band of skin 20 mm
 *  tall, the hero's own all hidden), the loose collar round its foot (a band 12 mm off it, its top 2 mm over the
 *  skin's foot), and that collar with a floor under it, across under the neck: a line of sight into the gap as
 *  steep as the game's cameras look passes under the short neck's foot, and meets nothing but the floor */
const SHORT_NECK: Profile = [[0, 0], [0, 20]];
const LOOSE_COLLAR: Profile = [[12, -12], [12, 2]];
const FLOORED_COLLAR: Profile = [[-40, -12], [12, -12], [12, 2]];

/** the share of the lines a canary's fault must be read on, of those that show skin where it's planted */
const CANARY_LEAST = 0.5;

/** The neck's skin on `model`: its mesh (head.ts `buildNeck` names it). */
function neckSkinOf(model: Model): THREE.Mesh {
  let found: THREE.Mesh | null = null;
  model.joints!.neck.traverse((object) => {
    if (object.name === 'neck' && (object as THREE.Mesh).isMesh) found = object as THREE.Mesh;
  });
  if (!found) throw new Error('lab: neck: the hero has no mesh named neck on his neck joint (head.ts buildNeck)');
  return found;
}

/** A ring's profile round what a line met: each corner how far out from it and how far up from the row (face mm). */
type Profile = [number, number][];
/** the ridge's: from inside the skin out and up, a foot, its outside 3 mm out, a bevel back in at 45 degrees */
const RIDGE_PROFILE: Profile = [[-6, -2], [3, 0], [3, 4], [-6, 13]];
/** the skin's planted on the clothes: a band 2 mm outside them, its top and foot back under them */
const OVER_CLOTHES: Profile = [[-2, -3], [2, -1], [2, 5], [-2, 7]];

/** The skin the canary plants round the neck at height `y` (face mm), `radii` out on each line: a ring of `profile`,
 *  drawn as the neck is. */
function canaryRing(model: Model, y: number, radii: number[], profile: Profile): THREE.Mesh {
  const headJoint = model.joints!.head.position.y;
  const positions: number[] = [];
  for (let ray = 0; ray <= ANGLES; ray++) {
    const angle = (ray / ANGLES) * Math.PI * 2;
    const radius = radii[ray % ANGLES];
    for (const [out, up] of profile) {
      const r = (radius + out) * HEAD_MM;
      positions.push(Math.sin(angle) * r, headJoint + (y + up) * HEAD_MM, Math.cos(angle) * r);
    }
  }
  const index: number[] = [];
  const across = profile.length;
  for (let ray = 0; ray < ANGLES; ray++) {
    for (let k = 0; k + 1 < across; k++) {
      const [a, b] = [ray * across + k, (ray + 1) * across + k];
      // (wound to face out, as the slices read only what faces them)
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const ring = new THREE.Mesh(geometry, neckSkinOf(model).material);
  ring.name = 'neck';
  return ring;
}

/** `geometry` made `share` as wide round its axis, and what puts it back (its places, as a skinned mesh's own scale
 *  is undone by its bind: every hero's neck is skinned). */
function widened(geometry: THREE.BufferGeometry, share: number): () => void {
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const kept = Float32Array.from(position.array as ArrayLike<number>);
  for (let i = 0; i < position.count; i++) {
    position.setX(i, position.getX(i) * share);
    position.setZ(i, position.getZ(i) * share);
  }
  return () => {
    (position.array as Float32Array).set(kept);
    position.needsUpdate = true;
  };
}

/** Whether `line`'s free neck reaches well below and above `row`: room for the canary's ring on it. */
function spans(line: Line, row: number): boolean {
  return freeNecks(line.samples).some(([first, last]) => first + 4 <= row && row + 8 <= last);
}

/** The row where most lines show their free neck, where the canary plants its ring, and those lines' angles. */
function plantRow(slices: Slices): { row: number; angles: number[] } {
  const rows = slices.lines[0].samples.length;
  let best = { row: 0, angles: [] as number[] };
  for (let row = 0; row < rows; row++) {
    const angles = slices.lines.filter((line) => spans(line, row)).map((line) => line.angle);
    if (angles.length > best.angles.length) best = { row, angles };
  }
  return best;
}

/** The share of `angles` whose line in `lines` reads a ridge past `RIDGE_MOST`. */
function ridgedShare(lines: Line[], angles: number[]): number {
  const ridged = lines.filter((line) => {
    if (!angles.includes(line.angle)) return false;
    return freeNecks(line.samples).some((run) => ridgeOf(line.samples, run).turn > RIDGE_MOST);
  });
  return angles.length ? ridged.length / angles.length : 0;
}

/** What each line met at `row`, the farthest of them where one met nothing. */
function radiiAt(slices: Slices, row: number, kind?: Kind): number[] {
  const met = slices.lines.map((line) => line.samples[row]);
  const radii = met.map((sample) => (kind === undefined || sample.kind === kind ? sample.r : 0));
  const farthest = Math.max(...radii);
  return radii.map((r) => r || farthest);
}

/** The collar's top: the highest row below the chin where half the lines or more first meet clothes, and how many
 *  do; where the canary lays skin over them. (The row where the most did was the slices' floor, on the warrior's fur
 *  out past their reach.) */
function collarRow(slices: Slices): { row: number; lines: number } {
  let collar = { row: 0, lines: 0 };
  slices.lines[0].samples.forEach((sample, row) => {
    if (sample.y > 0) return;
    const lines = slices.lines.filter((line) => line.samples[row].kind === 'cloth').length;
    if (lines >= slices.lines.length / 2) collar = { row, lines };
  });
  return collar;
}

/** What `planted` reads as on `model`: each added to the neck joint for `read`, then taken away. */
function withPlanted<T>(model: Model, planted: THREE.Mesh | THREE.Mesh[], read: () => T): T {
  const meshes = Array.isArray(planted) ? planted : [planted];
  for (const mesh of meshes) model.joints!.neck.add(mesh);
  model.root.updateMatrixWorld(true);
  try {
    return read();
  } finally {
    for (const mesh of meshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
    model.root.updateMatrixWorld(true);
  }
}

/** The canaries on `model` as it stands: a ridge round the neck that the lines must read past their limits, skin laid
 *  over the collar that must read as come out through the clothes, and the neck's skin paler and wider, which every
 *  seam in view must read as a step and another colour. */
export function canaries(what: string, model: Model, clean: Slices): { lines: string[]; problems: string[] } {
  const lines: string[] = [];
  const problems: string[] = [];
  const report = (text: string, caught: boolean) => (caught ? lines : problems).push(`${what}: the canary's ${text}`);
  const planted = plantRow(clean);
  if (!planted.angles.length) {
    problems.push(`${what}: the canary found no free neck to plant its ridge on`);
    return { lines, problems };
  }
  const y = clean.lines[0].samples[planted.row].y;
  const ring = canaryRing(model, y, radiiAt(clean, planted.row), RIDGE_PROFILE);
  const share = withPlanted(model, ring, () => ridgedShare(sliceNeck(model).lines, planted.angles));
  report(`ridge round the neck at ${mm(y)} read past ${RIDGE_MOST}° on ${percent(share)} of the `
    + `${planted.angles.length} lines it was planted on`, share >= CANARY_LEAST);
  const collar = collarRow(clean);
  if (!collar.lines) lines.push(`${what}: the canary's skin over the collar: no clothes in view to lay it on`);
  else {
    const at = clean.lines[0].samples[collar.row].y;
    const over = canaryRing(model, at, radiiAt(clean, collar.row, 'cloth'), OVER_CLOTHES);
    const through = withPlanted(model, over, () => sliceNeck(model).through);
    report(`skin over the collar at ${mm(at)} read as come out through the clothes on ${percent(through)} of the rays`
      + ' round it', through > THROUGH_MOST);
  }
  const skin = neckSkinOf(model);
  const material = skin.material as THREE.MeshStandardMaterial;
  const colour = material.color.clone();
  material.color.multiplyScalar(1.3);
  const restore = widened(skin.geometry, 1.06);
  try {
    const seamed = readLines(sliceNeck(model).lines);
    const cleanRead = readLines(clean.lines);
    if (!cleanRead.step) lines.push(`${what}: the canary's paler, wider neck: no seam in view to read it on`);
    else {
      const caught = !!seamed.step && seamed.step.mm > STEP_MOST && !!seamed.dE && seamed.dE.value > SEAM_DE_MOST;
      report(`paler, wider neck read a step of ${seamed.step?.mm.toFixed(1)} mm and dE `
        + `${seamed.dE?.value.toFixed(1)}`, caught);
    }
  } finally {
    material.color.copy(colour);
    restore();
    model.root.updateMatrixWorld(true);
  }
  const holes = (profile: Profile) => holesRound(model, clean, planted.row, profile);
  const loose = holes(LOOSE_COLLAR);
  const floored = holes(FLOORED_COLLAR);
  if (loose === null || floored === null) problems.push(`${what}: the canary's collar left no gap round the neck`);
  else {
    report(`neck stopping short in a loose collar read seen through on ${percent(loose)} of the lines`,
      loose >= CANARY_LEAST);
    report(`collar with a floor under it read closed on ${percent(1 - floored)} of the lines`,
      1 - floored >= CANARY_LEAST);
  }
  return { lines, problems };
}

/** The share of the lines where a line of sight into the gap round the neck fell through, of those with a gap, with
 *  the short neck and a collar of `profile` planted at `row` in place of all of the hero's own; null where none has a
 *  gap. */
function holesRound(model: Model, clean: Slices, row: number, profile: Profile): number | null {
  const hidden: THREE.Object3D[] = [];
  model.root.traverse((object) => {
    if ((object as THREE.Mesh).isMesh && object.visible) hidden.push(object);
  });
  for (const object of hidden) object.visible = false;
  const [y, radii] = [clean.lines[0].samples[row].y, radiiAt(clean, row)];
  const neck = canaryRing(model, y, radii, SHORT_NECK);
  const collar = canaryRing(model, y, radii, profile);
  const cloth = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
  collar.material = cloth;
  collar.name = 'canary collar';
  try {
    const falls = withPlanted(model, [neck, collar], () => sliceNeck(model).falls);
    return falls.length ? falls.filter(fellThrough).length / falls.length : null;
  } finally {
    cloth.dispose();
    for (const object of hidden) object.visible = true;
  }
}
