// tools/lab `coat`: the hero's skirts (models/armor.ts `Skirt`: the ranger's coat, the mage's robe, the warrior's mail)
// as he stands at idle, frame by frame: every point of the cloth in its own space (hung from the hips, so the body's
// own sway is taken out), and where one jerks, its move a frame changing by more than `JERK_FROM` from the frame
// before. From play: "range[r] has a clothing bug, behind that right arm, in idle", "you should observe 3-5sec of
// frames to see it moving unnaturally", "under left arm/hand too, but less". The canary kicks one point out for a
// frame.
import * as THREE from 'three';
import type { WeaponStyle } from '../../../src/loot/loadout';
import type { Joints } from '../../../src/entities/models/rig';
import type { Lab, Report } from './lab';

/** What `lab coat` takes. */
export interface CoatOptions {
  gear?: WeaponStyle;
  weapon?: string;
  /** how long he stands (s) */
  seconds?: number;
  /** list every frame a point jerked */
  frames?: boolean;
  canary?: boolean;
}

/** a point's move a frame changing by this much from the frame before is a jerk (m): standing, the cloth sways a few
 *  millimetres a frame with his weight, and a point snapped behind a hand jumps by its width */
const JERK_FROM = 0.01;
/** how long he stands by default (s), and the frames let go first for the pose to settle */
const SECONDS = 5;
const SETTLE = 30;
/** the canary's frame (after `SETTLE`) and how far it kicks a point out (m) */
const CANARY_FRAME = 120;
const CANARY_KICK = 0.03;
/** how many of the frames are listed with `--frames` */
const LISTED = 40;

/** One skirt followed: its mesh and geometry, its points over the last two frames, and its jerks. */
interface Followed {
  name: string;
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  cols: number;
  last: Float32Array;
  before: Float32Array;
  frames: number;
  worst: number;
  worstAt: string;
  listed: string[];
}

const cm = (metres: number): string => (metres * 100).toFixed(1);

/** a commit from before skirts were named finds the ranger's coat by its mesh's name (an A/B against one) */
const OLD_NAMES = ['tunic hem'];

/** Each skirt the hero wears that's shown (`Skirt.geo`, named 'skirt'). */
function skirtsOf(root: THREE.Object3D): Followed[] {
  const found: Followed[] = [];
  root.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (mesh.geometry.name !== 'skirt' && !OLD_NAMES.includes(mesh.name))) return;
    const count = mesh.geometry.attributes.position.array.length;
    const name = mesh.name || `skirt ${found.length + 1}`;
    // (its first triangle runs from a point to the one below it, a row on: `Skirt`'s index)
    const index = mesh.geometry.getIndex()!;
    const cols = index.getX(1) - index.getX(0);
    found.push({
      name, mesh, geometry: mesh.geometry, cols, last: new Float32Array(count), before: new Float32Array(count),
      frames: 0, worst: 0, worstAt: '', listed: [],
    });
  });
  return found;
}

/** Where point `point` of a skirt with `cols` points a row is, in words: its height down the cloth and its side. */
function placeOf(point: number, cols: number, rows: number): string {
  const row = Math.floor(point / cols);
  const angle = ((point % cols) / (cols - 1)) * 360;
  // (0 is his front, +x his left: the cloth's angle runs from the front round by his left)
  const side = angle < 22.5 || angle >= 337.5 ? 'front' : angle < 67.5 ? 'front left' : angle < 112.5 ? 'left side'
    : angle < 157.5 ? 'back left' : angle < 202.5 ? 'back' : angle < 247.5 ? 'back right' : angle < 292.5
      ? 'right side' : 'front right';
  return `row ${row} of ${rows - 1}, ${angle.toFixed(0)}° round (his ${side})`;
}

const _point = new THREE.Vector3();
const _hand = new THREE.Vector3();

/** Which of the hero's hands point `point` of `skirt` is nearest, and how far (in words). */
function nearestHand(skirt: Followed, point: number, joints: Joints): string {
  const at = skirt.geometry.attributes.position;
  skirt.mesh.localToWorld(_point.fromBufferAttribute(at, point));
  const left = _point.distanceTo(joints.handL.getWorldPosition(_hand));
  const right = _point.distanceTo(joints.handR.getWorldPosition(_hand));
  return left < right ? `his left hand ${cm(left)} cm off` : `his right hand ${cm(right)} cm off`;
}

/** The frame's jerks of `skirt` (`judged`: the frame counts), its points moved on. Returns the largest. */
function follow(skirt: Followed, frame: number, judged: boolean, listing: boolean, joints: Joints): number {
  const now = skirt.geometry.attributes.position.array as Float32Array;
  const { last, before, cols } = skirt;
  const rows = now.length / 3 / cols;
  let largest = 0;
  let largestAt = -1;
  for (let i = 0; i < now.length; i += 3) {
    const jx = now[i] - 2 * last[i] + before[i];
    const jy = now[i + 1] - 2 * last[i + 1] + before[i + 1];
    const jz = now[i + 2] - 2 * last[i + 2] + before[i + 2];
    const jerk = Math.hypot(jx, jy, jz);
    if (jerk > largest) {
      largest = jerk;
      largestAt = i / 3;
    }
  }
  before.set(last);
  last.set(now);
  if (!judged || largest <= JERK_FROM) return largest;
  skirt.frames++;
  const at = `frame ${frame}, ${placeOf(largestAt, cols, rows)}, ${nearestHand(skirt, largestAt, joints)}`;
  if (listing && skirt.listed.length < LISTED) skirt.listed.push(`  ${skirt.name} ${cm(largest)} cm (${at})`);
  if (largest > skirt.worst) {
    skirt.worst = largest;
    skirt.worstAt = at;
  }
  return largest;
}

/** Runs `lab coat`. */
export async function coat(lab: Lab, options: CoatOptions): Promise<Report> {
  await lab.setup({ at: [14, 17], facing: 0, gear: options.gear, weapon: options.weapon });
  await lab.step(SETTLE);
  const skirts = skirtsOf(lab.model.root);
  if (!skirts.length) return { text: `the ${lab.player.cls.id} wears no skirt`, problems: [] };
  const frames = Math.round((options.seconds ?? SECONDS) * 60);
  let frame = 0;
  let canaryJerk: number | null = null;
  await lab.step(frames, undefined, () => {
    const planted = !!options.canary && frame === CANARY_FRAME;
    const kicked = skirts[0].geometry.attributes.position.array as Float32Array;
    const { cols } = skirts[0];
    // (a point half way down his right side, kicked out for this frame and back)
    const point = Math.floor(kicked.length / 3 / cols / 2) * cols + Math.round(cols * 0.75);
    if (planted) kicked[point * 3] -= CANARY_KICK;
    // (the canary's frame and the two after it are its own)
    const judged = frame >= 2 && !(options.canary && frame >= CANARY_FRAME && frame <= CANARY_FRAME + 2);
    lab.model.root.updateMatrixWorld(true);
    for (const skirt of skirts) {
      const jerk = follow(skirt, frame, judged, !!options.frames, lab.model.joints!);
      if (planted && skirt === skirts[0]) canaryJerk = jerk;
    }
    if (planted) kicked[point * 3] += CANARY_KICK;
    frame++;
  });
  return reportOf(lab.player.cls.id, frames, skirts, canaryJerk);
}

/** The report: each skirt's jerks, the frames listed, and the canary. */
function reportOf(id: string, frames: number, skirts: Followed[], canaryJerk: number | null): Report {
  const text = [`the ${id} standing at idle, ${frames} frames (${(frames / 60).toFixed(1)} s)`];
  const problems: string[] = [];
  for (const skirt of skirts) {
    if (!skirt.frames) {
      text.push(`  ${skirt.name}: no point jerked over ${cm(JERK_FROM)} cm`);
      continue;
    }
    const worst = `the worst ${cm(skirt.worst)} cm (${skirt.worstAt})`;
    text.push(`  ${skirt.name}: jerked on ${skirt.frames} frames, ${worst}`);
    problems.push(`coat: the ${skirt.name} jerked on ${skirt.frames} frames, ${worst}`);
  }
  for (const skirt of skirts) text.push(...skirt.listed);
  if (canaryJerk !== null) {
    const caught = canaryJerk > JERK_FROM;
    text.push(`canary, a point kicked out for a frame: ${caught ? 'caught' : 'MISSED'} (${cm(canaryJerk)} cm)`);
    if (!caught) problems.push('coat: the canary (a point kicked out for a frame) was missed');
  }
  return { text: text.join('\n'), problems };
}
