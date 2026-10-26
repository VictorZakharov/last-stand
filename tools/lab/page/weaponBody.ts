// The weapon in the hero's hand against his own body through a scenario (tools/lab `range`): the frames any part of
// it passes into a leg (a thigh or a shin, each a capsule round its bone) or the trunk (the belly and the chest, the
// anatomy's own solids), and the deepest. Every corner of its surface is read, as `weaponFloor.ts` reads them. The
// arms aren't parts here: the hands hold it. A two-handed blow ending in the floor before him put the haft through
// his thigh, and no measure said so (from play: "main problem here is axe shaft going through leg").
import * as THREE from 'three';
import type { Lab } from './lab';
import { bodyShape } from '../../../src/entities/models/anatomy';
import { capsuleDepth, ellipsoidDepth } from './bodyDepth';

/** into the body by this much a point counts (m): armour and cloth stand a little off the bones' capsules */
const INTO_FROM = 0.01;
/** the canary is caught when the weapon, its grip moved to the left thigh's middle, reads at least this deep (m) */
export const BODY_CANARY_CAUGHT = 0.03;

/** A frame's deepest point of the weapon in the body: how deep (m), in which part, the frame, and how far along the
 *  weapon from the grip it is (m: less than 0, the pommel's side). */
interface Into {
  depth: number;
  part: string;
  at: string;
  along: number;
}

/** a part of the body the weapon is read against */
interface Part {
  name: string;
  depthAt(point: THREE.Vector3): number;
}

const _corner = new THREE.Vector3();
const _local = new THREE.Vector3();
const _gripAt = new THREE.Vector3();
const _gripWay = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();

/** The frames the weapon was in the body, and the deepest. */
export class WeaponBody {
  private readonly scenario: string;
  private frames = 0;
  private deepest: Into | null = null;
  /** each frame it was in the body, as words */
  readonly listed: string[] = [];

  /** `scenario`: the scenario's name, as its listed frames say it */
  constructor(scenario: string) {
    this.scenario = scenario;
  }

  /** Notes how far into the body the weapon is this frame (`frame`: the frame as the report names it). Returns the
   *  point as words if it's the deepest yet. */
  observe(lab: Lab, frame: string): string {
    const into = deepestInto(lab, frame);
    if (!into || into.depth < INTO_FROM) return '';
    this.frames++;
    this.listed.push(`  ${this.scenario} frame ${frame}: the weapon ${describeInto(into)}`);
    if (this.deepest && into.depth <= this.deepest.depth) return '';
    this.deepest = into;
    return describeInto(into);
  }

  /** The frames in the body as words, or none if it never was. */
  describe(): string {
    if (!this.deepest) return '';
    return `the weapon through the body on ${this.frames} frames, the deepest ${describeInto(this.deepest)}`;
  }

  /** how many frames it was in the body */
  get count(): number {
    return this.frames;
  }
}

/** The canary: the weapon's grip moved to the middle of the left thigh for one measure, and back. Returns how deep
 *  it read (m; none held, 0). */
export function bodyCanary(lab: Lab): number {
  const grip = lab.model.tip?.parent;
  if (!grip?.parent) return 0;
  const j = lab.joints;
  j.thighL.getWorldPosition(_from);
  j.kneeL.getWorldPosition(_to);
  const was = grip.position.clone();
  grip.position.copy(grip.parent.worldToLocal(_from.lerp(_to, 0.5)));
  const depth = deepestInto(lab, 'canary')?.depth ?? 0;
  grip.position.copy(was);
  grip.updateWorldMatrix(true, true);
  return depth;
}

/** A point in the body as words: how deep, in which part, where along the weapon, and in which frame. */
function describeInto(into: Into): string {
  const along = into.along < 0 ? `${cm(-into.along)} behind the grip` : `${cm(into.along)} along it from the grip`;
  return `${cm(into.depth)} into the ${into.part} (frame ${into.at}, ${along})`;
}

const cm = (metres: number) => `${(metres * 100).toFixed(1)} cm`;

/** The legs (capsules round their bones, at their drawn radii) and the trunk (the anatomy's solids), in the world. */
function partsOf(lab: Lab): Part[] {
  const j = lab.joints;
  j.root.updateMatrixWorld(true);
  const scale = j.root.scale.x;
  const parts: Part[] = [];
  for (const side of ['L', 'R'] as const) {
    const left = side === 'L' ? 'left' : 'right';
    const hip = j[`thigh${side}`].getWorldPosition(new THREE.Vector3());
    const knee = j[`knee${side}`].getWorldPosition(new THREE.Vector3());
    const ankle = j[`ankle${side}`].getWorldPosition(new THREE.Vector3());
    parts.push({ name: `${left} thigh`, depthAt: (point) => capsuleDepth(point, hip, knee, j.P.thighR * scale) });
    parts.push({ name: `${left} shin`, depthAt: (point) => capsuleDepth(point, knee, ankle, j.P.shinR * scale) });
  }
  for (const solid of bodyShape(j).solids.filter((each) => each.name === 'belly' || each.name === 'chest')) {
    const toSolid = solid.at.matrixWorld.clone().invert();
    const depthAt = (point: THREE.Vector3) => {
      _local.copy(point).applyMatrix4(toSolid).sub(solid.c);
      return ellipsoidDepth(_local, solid.r) * scale;
    };
    parts.push({ name: solid.name, depthAt });
  }
  return parts;
}

/** The weapon's point deepest in the body this frame (none if he holds none): every corner of the surface of the
 *  parts shown in the main hand's grip, against each part of the body. */
function deepestInto(lab: Lab, at: string): Into | null {
  const grip = lab.model.tip?.parent;
  if (!grip) return null;
  grip.updateWorldMatrix(true, true);
  grip.getWorldPosition(_gripAt);
  _gripWay.set(0, 1, 0).transformDirection(grip.matrixWorld);
  const parts = partsOf(lab);
  let deepest: Into | null = null;
  grip.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const corners = mesh.geometry.attributes.position;
    for (let i = 0; i < corners.count; i++) {
      _corner.fromBufferAttribute(corners, i).applyMatrix4(mesh.matrixWorld);
      for (const part of parts) {
        const depth = part.depthAt(_corner);
        if (deepest && depth <= deepest.depth) continue;
        deepest = { depth, part: part.name, at, along: _local.copy(_corner).sub(_gripAt).dot(_gripWay) };
      }
    }
  });
  return deepest;
}
