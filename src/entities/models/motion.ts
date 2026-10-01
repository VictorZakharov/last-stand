// Tools for the heroes' authored motion: keyframed curves (a move written as keys over its progress, with a
// smooth monotone cubic between them, so it eases in and out of each key without overshooting what isn't
// keyed) and a pose crossfade that hides every cut between poses (an action starting, restarting or ending).
import * as THREE from 'three';
import type { Joints } from './rig';

/** a keyframed curve: [progress, value] pairs, progress rising; held flat before the first and after the last */
export type Keys = readonly (readonly [number, number])[];

/**
 * The value of `keys` at `k`: a monotone cubic (Fritsch-Carlson) through the keys, so a curve between two
 * keys never leaves their range (an overshoot is written as a key of its own).
 */
export function curve(keys: Keys, k: number): number {
  const n = keys.length;
  if (k <= keys[0][0]) return keys[0][1];
  if (k >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0;
  while (k > keys[i + 1][0]) i++;
  const [x0, y0] = keys[i], [x1, y1] = keys[i + 1], h = x1 - x0, d = (y1 - y0) / h;
  const tan = (j: number): number => {
    if (j <= 0 || j >= n - 1) return 0;
    const a = (keys[j][1] - keys[j - 1][1]) / (keys[j][0] - keys[j - 1][0]), b = (keys[j + 1][1] - keys[j][1]) / (keys[j + 1][0] - keys[j][0]);
    // (a key where the curve turns back is held: its tangent is flat)
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  };
  let m0 = tan(i), m1 = tan(i + 1);
  // (the tangents limited so the piece stays monotone)
  if (d === 0) m0 = m1 = 0;
  else { m0 = Math.min(Math.abs(m0), 3 * Math.abs(d)) * Math.sign(d); m1 = Math.min(Math.abs(m1), 3 * Math.abs(d)) * Math.sign(d); }
  const t = (k - x0) / h, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m1;
}

const JOINTS = ['body', 'hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'handL', 'handR', 'thighL', 'thighR', 'kneeL', 'kneeR', 'ankleL', 'ankleR'] as const;

/**
 * A crossfade over the cuts between poses: each frame `apply` is given the new pose and whether it cut from
 * the last one (an action began, restarted or ended); after a cut the pose shown eases from the one shown
 * just before it to the new one over `dur` seconds, the new one moving on beneath it. Run after the pose
 * and before the leg IK (whatever the IK and the hands do afterwards stays exact).
 */
export class PoseFade {
  private readonly js: THREE.Object3D[];
  private readonly shown: THREE.Quaternion[];
  private readonly from: THREE.Quaternion[];
  private readonly shownP = new THREE.Vector3();
  private readonly fromP = new THREE.Vector3();
  private w = 0;
  private dur = 0.2;
  private primed = false;

  constructor(private readonly j: Joints) {
    this.js = JOINTS.map((k) => j[k]);
    this.shown = this.js.map(() => new THREE.Quaternion());
    this.from = this.js.map(() => new THREE.Quaternion());
  }

  /** start a fade from the pose shown last frame (a cut), over `dur` seconds */
  cut(dur = 0.2): void {
    if (!this.primed) return;
    for (let i = 0; i < this.js.length; i++) this.from[i].copy(this.shown[i]);
    this.fromP.copy(this.shownP);
    this.w = 1; this.dur = dur;
  }

  apply(dt: number): void {
    const js = this.js;
    if (this.w > 0) {
      this.w = Math.max(0, this.w - dt / this.dur);
      // (eased: it leaves the old pose gently and settles into the new one)
      const e = this.w * this.w * (3 - 2 * this.w);
      for (let i = 0; i < js.length; i++) js[i].quaternion.slerp(this.from[i], e);
      this.j.body.position.lerp(this.fromP, e);
    }
    for (let i = 0; i < js.length; i++) this.shown[i].copy(js[i].quaternion);
    this.shownP.copy(this.j.body.position);
    this.primed = true;
  }

  /** forget the last pose (a rebuild, a teleport): the next cut does nothing */
  reset(): void { this.primed = false; this.w = 0; }
}
