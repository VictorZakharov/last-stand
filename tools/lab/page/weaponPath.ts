// The path one point of the weapon makes through a cast (tools/lab `range`): its tip, frame by frame, drawn as a
// line in the pictures, and how far its fast frames stray sideways from a straight line seen from above. A heavy
// weapon swung hard keeps its line, its momentum too much to turn it aside in mid-blow (from play: "axe should go
// down in 1 line, without changing direction/turning", "its called keeping momentum", "just draw a line of the same
// point of the axe, at different intervals, and see which line it makes"): a blow kept in one upright plane draws a
// straight line from above, however its arc bends within that plane.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { bladeOffLine } from './weaponFloor';

/** a frame counts as fast from this speed of the tip (m a frame: 6 cm, 3.6 m/s) */
const FAST = 0.06;
/** a mark drawn on the line every this many frames, and the line's and the marks' radii (m) */
const MARK_EVERY = 3;
const LINE_RADIUS = 0.012;
/** how far back the path's pictures are taken from its middle (m) */
const FRAMED_FROM = 4.5;
const MARK_RADIUS = 0.03;
/** the canary moves one fast point this far aside (m): the path must then stray by at least `CANARY_CAUGHT` */
const CANARY_ASIDE = 0.3;
const CANARY_CAUGHT = 0.2;

/** A point of the path: where the tip was, its frame, whether it moved fast to get there, and how far its blade was
 *  off the blow's line (degrees, `bladeOffLine`). */
interface PathPoint {
  at: THREE.Vector3;
  frame: string;
  fast: boolean;
  blade: number;
}

/** How far the fast points stray from their straight line seen from above (m), at which frame, and over how many. */
interface Stray {
  most: number;
  at: string;
  fast: number;
}

const _tip = new THREE.Vector3();

/** The tip's path through a cast, and how straight its fast part runs. */
export class WeaponPath {
  private readonly points: PathPoint[] = [];
  private ended = false;

  /** Notes where the tip is this frame, while he casts (`frame`: the frame as the report names it). Returns whether
   *  the cast ended this frame: the moment to picture the path, the weapon where the blow left it. */
  observe(lab: Lab, frame: string): boolean {
    const tip = lab.model.tip;
    if (!tip) return false;
    if (!lab.player.casting) {
      const ended = this.points.length > 0 && !this.ended;
      this.ended ||= ended;
      return ended;
    }
    tip.getWorldPosition(_tip);
    const last = this.points.at(-1);
    const fast = last !== undefined && last.at.distanceTo(_tip) >= FAST;
    this.points.push({ at: _tip.clone(), frame, fast, blade: bladeOffLine(lab) });
    return false;
  }

  /** How straight the fast part ran on its way down, as words, or none if the tip never moved fast coming down.
   *  (Read from the tip's highest point on: the raise before it crosses the body from a guard held across it, and
   *  counted in, it read 39 cm with a downswing that kept its line.) */
  describe(): string {
    const stray = strayOf(downFrom(this.points));
    if (!stray) return '';
    const most = `${(stray.most * 100).toFixed(1)} cm (frame ${stray.at})`;
    const fast = `its ${stray.fast} fast frames on the way down from its highest`;
    return `the weapon's tip over ${fast}, seen from above, off a straight line by ${most}; ${this.describeBlade()}`;
  }

  /** How far the blade turned off the blow's line over the fast frames on the way down, as words: a blow leads
   *  with its edge all the way, not turned onto it as it lands (turned at its end alone, the tip whipped 106 cm). */
  private describeBlade(): string {
    const fast = downFrom(this.points).filter((point) => point.fast);
    const worst = fast.reduce((was: PathPoint | null, point) => (!was || point.blade > was.blade ? point : was), null);
    if (!worst) return '';
    const ends = `${fast[0].blade.toFixed(0)}° on the first, ${fast[fast.length - 1].blade.toFixed(0)}° on the last`;
    return `its blade up to ${worst.blade.toFixed(0)}° off the blow's line on them (frame ${worst.frame}; ${ends})`;
  }

  /** The path drawn as a line with a mark every few frames, pictured from `views`, and taken out again. */
  picture(lab: Lab, label: string): Pictured | null {
    if (this.points.length < 2) return null;
    const drawn = drawPath(this.points);
    G.scene.add(drawn);
    try {
      // (framed on the path's middle from far enough back to hold all of it: framed on him, most of it was cut off)
      const at = middleOf(this.points);
      return lab.picture(label, ['front', 'left', 'above'], [this.describe()], { at, distance: FRAMED_FROM });
    } finally {
      G.scene.remove(drawn);
      disposeDrawn(drawn);
    }
  }

  /** The canary: one fast point moved `CANARY_ASIDE` across its line. Returns whether the stray then read caught it. */
  canary(): boolean {
    const down = downFrom(this.points);
    const fast = down.filter((point) => point.fast);
    if (fast.length < 3) return false;
    const moved = down.map((point) => ({ ...point, at: point.at.clone() }));
    const middle = moved.filter((point) => point.fast)[Math.floor(fast.length / 2)];
    const line = lineOf(fast);
    middle.at.x += -line.z * CANARY_ASIDE;
    middle.at.z += line.x * CANARY_ASIDE;
    const stray = strayOf(moved);
    return stray !== null && stray.most >= CANARY_CAUGHT;
  }
}

/** The points from the highest on: the way down. */
function downFrom(points: PathPoint[]): PathPoint[] {
  let highest = 0;
  points.forEach((point, i) => {
    if (point.at.y > points[highest].at.y) highest = i;
  });
  return points.slice(highest);
}

/** The fast points' most distance from their straight line seen from above, or none with fewer than two. */
function strayOf(points: PathPoint[]): Stray | null {
  const fast = points.filter((point) => point.fast);
  if (fast.length < 2) return null;
  const line = lineOf(fast);
  const middle = middleOf(fast);
  let worst: Stray = { most: 0, at: fast[0].frame, fast: fast.length };
  for (const point of fast) {
    const across = Math.abs((point.at.x - middle.x) * -line.z + (point.at.z - middle.z) * line.x);
    if (across > worst.most) worst = { ...worst, most: across, at: point.frame };
  }
  return worst;
}

/** The level way the points run along, seen from above: the main axis of their spread (x, z in a vector's x, z). */
function lineOf(points: PathPoint[]): THREE.Vector3 {
  const middle = middleOf(points);
  let xx = 0;
  let xz = 0;
  let zz = 0;
  for (const { at } of points) {
    const dx = at.x - middle.x;
    const dz = at.z - middle.z;
    xx += dx * dx;
    xz += dx * dz;
    zz += dz * dz;
  }
  const angle = 0.5 * Math.atan2(2 * xz, xx - zz);
  return new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
}

/** The middle of the points (their mean). */
function middleOf(points: PathPoint[]): THREE.Vector3 {
  const sum = new THREE.Vector3();
  for (const { at } of points) sum.add(at);
  return sum.divideScalar(points.length);
}

/** The path as a tube from point to point, the fast part in red and the rest in yellow, a white mark every few
 *  frames: drawn over everything (a line one pixel wide was lost against the grass). */
function drawPath(points: PathPoint[]): THREE.Group {
  const group = new THREE.Group();
  const slow = new THREE.MeshBasicMaterial({ color: 0xffd81a, depthTest: false });
  const fast = new THREE.MeshBasicMaterial({ color: 0xff2618, depthTest: false });
  for (let i = 1; i < points.length; i++) {
    group.add(segmentBetween(points[i - 1].at, points[i].at, points[i].fast ? fast : slow));
  }
  const mark = new THREE.SphereGeometry(MARK_RADIUS, 10, 8);
  const markMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
  points.forEach((point, i) => {
    if (i % MARK_EVERY !== 0) return;
    const sphere = new THREE.Mesh(mark, markMaterial);
    sphere.position.copy(point.at);
    group.add(sphere);
  });
  group.renderOrder = 999;
  group.traverse((object) => {
    object.renderOrder = 999;
  });
  return group;
}

/** A cylinder from `from` to `to`. */
function segmentBetween(from: THREE.Vector3, to: THREE.Vector3, material: THREE.Material): THREE.Mesh {
  const length = from.distanceTo(to);
  const geometry = new THREE.CylinderGeometry(LINE_RADIUS, LINE_RADIUS, Math.max(length, 1e-4), 6);
  const segment = new THREE.Mesh(geometry, material);
  segment.position.lerpVectors(from, to, 0.5);
  if (length > 1e-6) {
    const way = new THREE.Vector3().subVectors(to, from).normalize();
    segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), way);
  }
  return segment;
}

/** Frees what `drawPath` made. */
function disposeDrawn(group: THREE.Group): void {
  group.traverse((object) => {
    const drawn = object as THREE.Mesh;
    drawn.geometry?.dispose();
    const material = drawn.material as THREE.Material | undefined;
    material?.dispose();
  });
}
