// The weapon in the hero's hand against the floor through a scenario (tools/lab `range`): the frames any part of it
// is under the floor, and the deepest. Every corner of its surface is read, so a blade is read within its width
// and an axe's or a maul's head whole (a part's box would not do: a weapon's pieces are merged into one mesh per
// material, whose box holds the head's breadth all down the haft). Thunder Crescent's blow, stopped by its tip,
// put an axe's or a maul's head into the floor to its middle.
import * as THREE from 'three';
import type { Lab } from './lab';
import { groundHeight } from '../../../src/world/ground';

/** under the floor by this much a part counts (m): a blow stopped on it rests its tip there */
const UNDER_FROM = 0.02;
/** the canary sinks the hero this far further than the weapon's lowest point is over the floor (m), and it must be
 *  found under the floor by at least `CANARY_CAUGHT` (sunk 2 m alone, a weapon raised overhead in a cast's charge,
 *  over 2 m up, was still over the floor, and the canary was missed on every commit) */
const CANARY_SINK = 2;
export const CANARY_CAUGHT = 0.5;

/** A frame's deepest point of the weapon: how far under the floor (m), the frame, and how far along the weapon from
 *  the grip it is (m: less than 0, the pommel's side). */
interface Under {
  depth: number;
  at: string;
  along: number;
}

const _corner = new THREE.Vector3();
const _flat = new THREE.Vector3();
const _gripAt = new THREE.Vector3();
const _gripWay = new THREE.Vector3();

/** The frames the weapon was under the floor, and the deepest. */
export class WeaponFloor {
  private frames = 0;
  private deepest: Under | null = null;
  /** the weapon's lowest point at its nearest the floor (under it, or how far over it as a negative depth) */
  private nearest: Under | null = null;
  /** how far its blade was off upright then (degrees: 0, its edge to the floor; 90, lying flat on it) */
  private nearestTilt = 0;
  /** each frame it was under, as words */
  readonly listed: string[] = [];

  /** `scenario`: the scenario's name, as its listed frames say it */
  constructor(private readonly scenario: string) {}

  /** Notes how far under the floor the weapon is this frame (`frame`: the frame as the report names it). */
  observe(lab: Lab, frame: string): void {
    const under = deepestUnder(lab, frame);
    if (under && (!this.nearest || under.depth > this.nearest.depth)) {
      this.nearest = under;
      this.nearestTilt = bladeTilt(lab);
    }
    if (!under || under.depth < UNDER_FROM) return;
    this.frames++;
    this.listed.push(`  ${this.scenario} frame ${frame}: the weapon ${describeUnder(under)}`);
    if (!this.deepest || under.depth > this.deepest.depth) this.deepest = under;
  }

  /** The frames under the floor as words, or none if it never was. */
  describe(): string {
    if (!this.deepest) return '';
    return `the weapon under the floor on ${this.frames} frames, the deepest ${describeUnder(this.deepest)}`;
  }

  /** How near the floor the weapon's lowest point came, as words (a blow into the ground must reach it: Thunder
   *  Crescent's two-handed end, held where it was placed, stopped short of it unseen), or none if none was held. */
  describeNearest(): string {
    const nearest = this.nearest;
    if (!nearest) return '';
    const tilt = `its blade ${this.nearestTilt.toFixed(0)}° off upright`;
    const over = { ...nearest, depth: -nearest.depth };
    const point = nearest.depth >= 0 ? describeUnder(nearest) : describeUnder(over, 'over it');
    return `the weapon nearest the floor ${point}, ${tilt}`;
  }
}

/** The canary: the hero sunk `CANARY_SINK` under the floor for one measure, and back. Returns how far under the
 *  weapon read (m; none held, 0). */
export function weaponCanary(lab: Lab): number {
  const root = lab.model.root;
  const over = Math.max(0, -(deepestUnder(lab, 'canary')?.depth ?? 0));
  root.position.y -= over + CANARY_SINK;
  const depth = deepestUnder(lab, 'canary')?.depth ?? 0;
  root.position.y += over + CANARY_SINK;
  root.updateMatrixWorld(true);
  return depth;
}

/** How far the blade in the main hand is off upright (degrees): its flat's normal, the grip's own x (the warrior's
 *  `FLAT_IN_GRIP`), against level. An axe driven into the ground bites it edge first, its flat upright (from play: "axe
 *  needs to strike with blade perpendicular to ground"). */
function bladeTilt(lab: Lab): number {
  const grip = lab.model.tip?.parent;
  if (!grip) return 0;
  const normal = _flat.set(1, 0, 0).transformDirection(grip.matrixWorld);
  return THREE.MathUtils.radToDeg(Math.asin(Math.min(1, Math.abs(normal.y))));
}

/** A point under the floor as words: how deep, where along the weapon, and in which frame (`side`: over it, for a
 *  point over the floor by `depth`). */
function describeUnder(under: Under, side = 'under'): string {
  const along = under.along < 0 ? `${cm(-under.along)} behind the grip` : `${cm(under.along)} along it from the grip`;
  return `${cm(under.depth)} ${side} (frame ${under.at}, ${along})`;
}

const cm = (metres: number) => `${(metres * 100).toFixed(1)} cm`;

/** The weapon's point deepest under the floor this frame (none if he holds none): every corner of the surface of
 *  the parts shown in the main hand's grip. */
function deepestUnder(lab: Lab, at: string): Under | null {
  const grip = lab.model.tip?.parent;
  if (!grip) return null;
  grip.updateWorldMatrix(true, true);
  grip.getWorldPosition(_gripAt);
  _gripWay.set(0, 1, 0).transformDirection(grip.matrixWorld);
  let deepest: Under | null = null;
  grip.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const corners = mesh.geometry.attributes.position;
    for (let i = 0; i < corners.count; i++) {
      _corner.fromBufferAttribute(corners, i).applyMatrix4(mesh.matrixWorld);
      const depth = groundHeight(_corner.x, _corner.z) - _corner.y;
      if (deepest && depth <= deepest.depth) continue;
      deepest = { depth, at, along: _corner.sub(_gripAt).dot(_gripWay) };
    }
  });
  return deepest;
}
