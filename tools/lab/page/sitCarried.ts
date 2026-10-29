// What a hero carries, followed as he sits down and gets up (tools/lab `sit`): every rigid mesh of his model (a
// weapon's, a shield's, the staff's, the bow's, the book's), read frame by frame as drawn. A mesh moved by the pose
// (not carried along by the bone it hangs from) must be in a hand while it moves, or lie still: from play, "staff
// dropping in a weird way" (the mage let go of it at a fifth of the way down and it went on to the floor on its own),
// "he just summons the bow into his hand using jedi force", "when warrior sits on a log, weapons are being pulled
// around with jedi force too, on sit down, and on stand up". A mesh turned or thrown further in a frame than a hand
// moves it is a jump. And what he holds is held as before once he's up again: "staff rotated when he stands up".
import * as THREE from 'three';
import type { Lab } from './lab';

/** a palm this near a piece holds it (m): the fingers round a handle, a strap's width */
const HELD_WITHIN = 0.06;
/** where a palm's middle is in its hand's frame (rig units): down the hand from the wrist, onto its palm */
export const PALM_AT = new THREE.Vector3(0, -0.06, -0.02);
/** a mesh moving less than this a frame is still (m) */
const STILL = 0.002;
/** a piece judged that went this far in all with no hand on it moved on its own (m) */
export const LOOSE_MOST = 0.03;
/** a mesh that went this far from where it hangs over the frames is moved by the pose, and judged (m): a quiver
 *  tipped as he sits moves a few centimetres on its strap; a staff or a book laid on the floor goes half a metre */
const MOVED_FROM = 0.15;
/** in a frame, a mesh turned more than this (degrees) or thrown further than this (m) jumped */
const TURN_MOST = 25;
const THROW_MOST = 0.12;
/** once he's up, what he held is held this near as before he sat (m at any corner, degrees) */
const REHELD_MOST = 0.03;
const RETURNED_MOST = 10;
/** cloth, followed as cloth elsewhere (`coat.ts`), never a rigid piece */
const CLOTHS = ['skirt', 'hood'];
const DEG = 180 / Math.PI;

/** A rigid mesh followed: the piece it belongs to (the object over it hung from a joint: a staff's shaft, rings and
 *  crystal are one), its name, that joint, whether a hand can hold it (it hangs from a hand), and its box's corners. */
interface Part {
  mesh: THREE.Mesh;
  group: THREE.Object3D;
  name: string;
  joint: THREE.Object3D;
  inHand: boolean;
  corners: THREE.Vector3[];
}

/** A jump: what it did, by how much of its limit, on which frame. */
interface Jump {
  by: string;
  size: number;
  at: string;
}

/** One mesh's frames: where its corners were (the world's and its joint's), and what it did. */
interface Followed {
  part: Part;
  world: THREE.Vector3[] | null;
  onJoint: THREE.Vector3[] | null;
  start: THREE.Vector3[] | null;
  quaternion: THREE.Quaternion | null;
  heldEver: boolean;
  movedFrom: number;
  loose: number;
  looseFrames: number;
  looseAt: string;
  jump: Jump | null;
}

/** What a piece did, as `Carried.findings` says it: how far it went with no hand on it (m), on how many frames,
 *  from which, and its worst jump. */
export interface CarriedFinding {
  name: string;
  loose: number;
  looseFrames: number;
  looseAt: string;
  jump: Jump | null;
}

/** Every rigid piece of the hero, followed frame by frame. */
export class Carried {
  private readonly followed: Followed[];
  /** the piece `trace` names, frame by frame: how far its meshes went and turned at most, held or not */
  readonly traced: string[] = [];
  /** each hand and elbow where it was the frame before, for the trace: whether a piece jumped with its hand or in it */
  private readonly handsWere = new Map<THREE.Object3D, HandAt>();

  /** `trace`: a piece to list frame by frame (`lab sit --trace`), by its name */
  constructor(private readonly lab: Lab, private readonly trace?: string) {
    this.followed = partsOf(lab).map((part) => ({
      part, world: null, onJoint: null, start: null, quaternion: null, heldEver: false, movedFrom: 0,
      loose: 0, looseFrames: 0, looseAt: '', jump: null,
    }));
  }

  /** The frame read: each mesh shown, held or not, and how it moved since the last. `frame` names it. */
  observe(frame: string): void {
    const lab = this.lab;
    lab.model.root.updateMatrixWorld(true);
    const held = heldPieces(lab, this.followed.map((each) => each.part));
    const k = lab.joints.root.scale.x;
    const frameOf: TraceFrame = { went: 0, turned: 0, held: false, seen: false };
    for (const each of this.followed) {
      const { part } = each;
      if (!shown(part.mesh)) {
        each.world = null;
        continue;
      }
      const world = part.corners.map((corner) => part.mesh.localToWorld(corner.clone()));
      const onJoint = world.map((point) => part.joint.worldToLocal(point.clone()).multiplyScalar(k));
      const quaternion = part.mesh.getWorldQuaternion(new THREE.Quaternion());
      const inHand = held.has(part.group);
      each.heldEver ||= inHand;
      each.start ??= onJoint;
      each.movedFrom = Math.max(each.movedFrom, farthest(onJoint, each.start));
      if (each.world && each.onJoint && each.quaternion) {
        const moved = farthest(world, each.world);
        if (!inHand && moved > STILL && farthest(onJoint, each.onJoint) > STILL) {
          each.loose += moved;
          each.looseFrames++;
          each.looseAt ||= `${meshName(part.mesh)}, from ${frame}`;
        }
        const turned = each.quaternion.angleTo(quaternion) * DEG;
        const mesh = meshName(part.mesh);
        if (part.name === this.trace) traceInto(frameOf, moved, turned, inHand);
        if (turned > TURN_MOST) {
          each.jump = worse(each.jump, `${mesh} turned ${turned.toFixed(0)}°`, turned / TURN_MOST, frame);
        }
        if (moved > THROW_MOST) {
          each.jump = worse(each.jump, `${mesh} went ${(moved * 100).toFixed(0)} cm`, moved / THROW_MOST, frame);
        }
      }
      each.world = world;
      each.onJoint = onJoint;
      each.quaternion = quaternion;
    }
    if (frameOf.seen) this.traced.push(`${traceLine(frame, frameOf)}; ${this.handsMoved()}`);
  }

  /** How far each hand and elbow went and turned since the frame before, as a line's end. */
  private handsMoved(): string {
    const joints = this.lab.joints;
    const arms: [string, THREE.Object3D][] = [
      ['right hand', joints.handR], ['elbow', joints.elbowR], ['left hand', joints.handL], ['elbow', joints.elbowL],
    ];
    return arms.map(([name, joint]) => `${name} ${handMoved(joint, this.handsWere)}`).join(', ');
  }

  /** Each piece the pose moved (held at some frame, or taken from where it hangs), and what it did: its mesh that
   *  went furthest on its own, and its worst jump. A piece worn on a strap (`userData.worn` on it or over it: the
   *  ranger's quiver, tipped back off the floor as he sits) swings there with no hand on it, and is judged by its
   *  jumps alone. */
  findings(): CarriedFinding[] {
    const judged = this.followed.filter((each) => each.heldEver || each.movedFrom > MOVED_FROM);
    for (const each of judged) if (worn(each.part.mesh)) each.loose = 0;
    const byName = new Map<string, CarriedFinding>();
    for (const each of judged) {
      const was = byName.get(each.part.name);
      const jump = worse(was?.jump ?? null, each.jump?.by ?? '', each.jump?.size ?? 0, each.jump?.at ?? '');
      const { name } = each.part;
      if (!was || each.loose > was.loose) {
        byName.set(name, { name, loose: each.loose, looseFrames: each.looseFrames, looseAt: each.looseAt, jump });
      } else was.jump = jump;
    }
    return [...byName.values()];
  }
}

/** A traced piece's frame: the most any of its meshes went (m) and turned (degrees), and whether a hand held it. */
interface TraceFrame {
  went: number;
  turned: number;
  held: boolean;
  seen: boolean;
}

/** One of the traced piece's meshes read into its frame. */
function traceInto(frame: TraceFrame, went: number, turned: number, held: boolean): void {
  frame.went = Math.max(frame.went, went);
  frame.turned = Math.max(frame.turned, turned);
  frame.held ||= held;
  frame.seen = true;
}

/** A hand's place and turn in the world at a frame. */
interface HandAt {
  at: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

/** How far a hand went and turned since it was last read, `were` keeping where it was. */
function handMoved(hand: THREE.Object3D, were: Map<THREE.Object3D, HandAt>): string {
  const at = hand.getWorldPosition(new THREE.Vector3());
  const now = { at, quaternion: hand.getWorldQuaternion(new THREE.Quaternion()) };
  const was = were.get(hand);
  were.set(hand, now);
  if (!was) return 'first seen';
  const went = (now.at.distanceTo(was.at) * 100).toFixed(1);
  return `${went} cm, ${(now.quaternion.angleTo(was.quaternion) * DEG).toFixed(1)}°`;
}

/** The traced piece's frame as a line. */
function traceLine(at: string, frame: TraceFrame): string {
  const went = `${(frame.went * 100).toFixed(1)} cm`;
  return `${at}: went ${went}, turned ${frame.turned.toFixed(1)}°${frame.held ? '' : ', no hand on it'}`;
}

/** The worse of a jump and one of `size` (none of size 0). */
function worse(jump: Jump | null, by: string, size: number, at: string): Jump | null {
  if (size <= 0 || (jump && jump.size >= size)) return jump;
  return { by, size, at };
}

/** Where each mesh of what he holds now is in its joint's frame (m), and how it's turned on it: by piece. */
export type HeldNow = Map<string, { onJoint: THREE.Vector3[]; quaternion: THREE.Quaternion }[]>;

/** What he holds now, mesh by mesh in its joint's frame, to compare with what he holds later (`heldApart`). */
export function heldNow(lab: Lab): HeldNow {
  lab.model.root.updateMatrixWorld(true);
  const parts = partsOf(lab);
  const held = heldPieces(lab, parts);
  const k = lab.joints.root.scale.x;
  const now: HeldNow = new Map();
  for (const part of parts) {
    if (!held.has(part.group) || !shown(part.mesh)) continue;
    // A staff's crystal and rings turn continuously on their mount. Compare the mount and their scale, not the
    // time-dependent spin and bob; their actual movement is still followed frame by frame by Carried.observe.
    const animated = part.mesh.userData.sitAnimated && part.mesh.parent;
    const onJoint = part.corners.map((corner) => {
      const point = corner.clone();
      if (animated) animated.localToWorld(point.multiply(part.mesh.scale));
      else part.mesh.localToWorld(point);
      return part.joint.worldToLocal(point).multiplyScalar(k);
    });
    const quaternion = part.joint.getWorldQuaternion(new THREE.Quaternion()).invert()
      .multiply((animated || part.mesh).getWorldQuaternion(new THREE.Quaternion()));
    const meshes = now.get(part.name) ?? [];
    meshes.push({ onJoint, quaternion });
    now.set(part.name, meshes);
  }
  return now;
}

/** A piece no longer held as before: how far a corner is off (m), how turned (degrees), or gone from the hand. */
export interface HeldApart {
  name: string;
  off: number;
  turned: number;
  gone: boolean;
}

/** What was held before and isn't held as it was now. */
export function heldApart(before: HeldNow, after: HeldNow): HeldApart[] {
  const apart: HeldApart[] = [];
  for (const [name, was] of before) {
    const now = after.get(name);
    if (!now || now.length !== was.length) {
      apart.push({ name, off: 0, turned: 0, gone: true });
      continue;
    }
    const off = Math.max(...was.map((mesh, i) => farthest(now[i].onJoint, mesh.onJoint)));
    const turned = Math.max(...was.map((mesh, i) => now[i].quaternion.angleTo(mesh.quaternion) * DEG));
    if (off > REHELD_MOST || turned > RETURNED_MOST) apart.push({ name, off, turned, gone: false });
  }
  return apart;
}

/** The canary: the first piece a palm is on now turned by `angle` (rad) in his hand; undone by what's returned. */
export function turnHeld(lab: Lab, angle: number): (() => void) | null {
  lab.model.root.updateMatrixWorld(true);
  const parts = partsOf(lab);
  const held = heldPieces(lab, parts);
  const part = parts.find((each) => held.has(each.group) && shown(each.mesh));
  if (!part) return null;
  part.group.rotateX(angle);
  return () => part.group.rotateX(-angle);
}

/** The pieces a palm is on now: of those hung from a hand, any whose mesh a palm is within `HELD_WITHIN` of. */
function heldPieces(lab: Lab, parts: Part[]): Set<THREE.Object3D> {
  const palms = [lab.joints.handL, lab.joints.handR].map((hand) => hand.localToWorld(PALM_AT.clone()));
  const held = new Set<THREE.Object3D>();
  for (const part of parts) {
    if (!part.inHand || held.has(part.group) || !shown(part.mesh)) continue;
    if (palms.some((palm) => palmOn(part.mesh, palm) < HELD_WITHIN)) held.add(part.group);
  }
  return held;
}

/** Every rigid mesh of his model that isn't cloth, with the piece it belongs to. */
function partsOf(lab: Lab): Part[] {
  const joints = new Map<THREE.Object3D, string>(Object.entries(lab.joints)
    .filter(([, joint]) => (joint as THREE.Object3D)?.isObject3D)
    .map(([name, joint]) => [joint as THREE.Object3D, name]));
  const hands = [lab.joints.handL, lab.joints.handR];
  const parts: Part[] = [];
  lab.model.root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh || CLOTHS.includes(mesh.geometry.name)) return;
    const hung = hungFrom(mesh, joints);
    if (!hung) return;
    const { group, joint } = hung;
    const inHand = hands.some((hand) => joint === hand || isUnder(joint, hand));
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const corners = cornersOf(mesh.geometry.boundingBox!);
    parts.push({ mesh, group, name: nameOver(group, joints), joint, inHand, corners });
  });
  return parts;
}

/** The object over `mesh` hung straight from a joint (the mesh itself if it is), and that joint. */
function hungFrom(
  mesh: THREE.Object3D, joints: Map<THREE.Object3D, string>,
): { group: THREE.Object3D; joint: THREE.Object3D } | null {
  for (let at: THREE.Object3D = mesh; at.parent; at = at.parent) {
    if (joints.has(at.parent)) return { group: at, joint: at.parent };
  }
  return null;
}

/** Whether `object` hangs anywhere under `over`. */
function isUnder(object: THREE.Object3D, over: THREE.Object3D): boolean {
  for (let at = object.parent; at; at = at.parent) if (at === over) return true;
  return false;
}

/** A piece's name: its own, the first named object under it (a grip's weapon), or the joint it hangs from. */
function nameOver(piece: THREE.Object3D, joints: Map<THREE.Object3D, string>): string {
  if (piece.name) return piece.name;
  let under = '';
  piece.traverseVisible((object) => {
    under ||= object.name;
  });
  return under || `piece on the ${joints.get(piece.parent!) ?? 'body'}`;
}

/** A mesh's own name, its geometry's, or its kind. */
function meshName(mesh: THREE.Mesh): string {
  return mesh.name || mesh.geometry.name || mesh.geometry.type.replace('Geometry', '').toLowerCase() || 'mesh';
}

/** A box's opposite corners and one across them: enough to see it slide and turn. */
function cornersOf(box: THREE.Box3): THREE.Vector3[] {
  return [box.min.clone(), box.max.clone(), new THREE.Vector3(box.min.x, box.max.y, box.min.z)];
}

const _local = new THREE.Vector3(), _scale = new THREE.Vector3();

/** How far `palm` is from `mesh`'s box (m). */
function palmOn(mesh: THREE.Mesh, palm: THREE.Vector3): number {
  mesh.worldToLocal(_local.copy(palm));
  return mesh.geometry.boundingBox!.distanceToPoint(_local) * mesh.getWorldScale(_scale).x;
}

/** The farthest any point of `a` is from its own in `b`. */
function farthest(a: THREE.Vector3[], b: THREE.Vector3[]): number {
  return Math.max(...a.map((point, i) => point.distanceTo(b[i])));
}

/** Whether `object` is worn on a strap (`userData.worn` on it or over it). */
function worn(object: THREE.Object3D): boolean {
  for (let at: THREE.Object3D | null = object; at; at = at.parent) if (at.userData.worn) return true;
  return false;
}

/** Whether `object` is drawn: it and everything over it shown. */
function shown(object: THREE.Object3D): boolean {
  for (let at: THREE.Object3D | null = object; at; at = at.parent) if (!at.visible) return false;
  return true;
}
