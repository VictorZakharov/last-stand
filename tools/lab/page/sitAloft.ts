// A two-hander held up in one hand as a hero stands to sit or stands up again (tools/lab `sit`). From play: "when one
// end is touching ground yes, but as soon as sword lifts off ground, he needs both hands to manipulate it", of a
// greatsword held out level in one fist by a fire, "physically impossible, he'd break his arm doing it".
// `HeldAloft` reads each frame he stands in a sit's hands stage: his weapon off the floor and off his shoulder must
// have his left fist closed on it too.

import * as THREE from 'three';
import { groundHeight } from '../../../src/world/ground';
import type { Fist, LowerGrip } from '../../../src/types';
import type { Lab } from './lab';
import { FIST_OPEN, whyLetGo } from './range';

/** how near the floor an end counts as on it, its weight taken there (m) */
const ON_FLOOR = 0.04;
/** how near the weapon's line passes his right shoulder's joint for it to rest on his shoulder (m) */
const ON_SHOULDER = 0.2;
/** how far a closed left fist may be off the handle for it to hold it (m) */
const LEFT_OFF_MOST = 0.03;
/** how far into his way down he still stands (the sit's share) */
const STANDS_TILL = 0.05;
/** how far off the floor it's plainly lifted, for why his left hand wasn't on it then (m) */
const LIFTED = 0.1;
/** how far under his fist its far end may hang as he takes it up getting up (m): it rises head first, from review,
 *  "the axe is lifted head-down, through his legs" (its head by the floor under his fists, which reading it only once
 *  off the floor missed) */
const HEAD_UNDER_MOST = 0.1;

const _grip = new THREE.Vector3();
const _way = new THREE.Vector3();
const _end = new THREE.Vector3();
const _shoulder = new THREE.Vector3();
const _point = new THREE.Vector3();
const _box = new THREE.Box3();
const _inverse = new THREE.Matrix4();

/** Where a weapon reaches along its grip's own up, each way from the grip (m, in the grip's space). */
interface Reach {
  down: number;
  up: number;
}

/** What holds a weapon this frame: the floor, his shoulder, his left hand. */
export interface Holds {
  /** its lowest point over the floor (m) */
  over: number;
  /** its line's nearest to his right shoulder's joint (m) */
  shoulder: number;
  /** his left fist closed on its handle */
  left: boolean;
  /** how far its far end is under his fist (m) */
  headUnder?: number;
  /** his left arm on the lower grip as the model solved it, or none without one */
  grasp?: LowerGrip;
}

/** Whether a weapon so held is up in his right hand alone. */
export function aloftInOne(holds: Holds): boolean {
  return holds.over > ON_FLOOR && holds.shoulder > ON_SHOULDER && !holds.left;
}

/** The canary: held up level, nothing under it and no left hand, it reads as in one hand; on the floor or the
 *  shoulder, or in both hands, it doesn't. */
export function aloftCanary(): boolean {
  const up: Holds = { over: 0.6, shoulder: 0.5, left: false };
  const caught = aloftInOne(up);
  const passed = [{ ...up, over: 0 }, { ...up, shoulder: 0.1 }, { ...up, left: true }].every((each) => !aloftInOne(each));
  return caught && passed;
}

/** Whether a weapon so held, as he gets up, is lifted head down. */
export function liftedHeadDown(holds: Holds): boolean {
  return holds.shoulder > ON_SHOULDER && (holds.headUnder ?? 0) > HEAD_UNDER_MOST;
}

/** The canary: its far end 30 cm under his fist, by the floor or off it, it reads as head down; level or on his
 *  shoulder, it doesn't. */
export function headDownCanary(): boolean {
  const down: Holds = { over: 0.4, shoulder: 0.5, left: true, headUnder: 0.3 };
  const caught = liftedHeadDown(down) && liftedHeadDown({ ...down, over: 0 });
  const others = [{ ...down, headUnder: 0 }, { ...down, shoulder: 0.1 }];
  return caught && others.every((each) => !liftedHeadDown(each));
}

/** A two-hander's frames up in one hand while he stands, the highest and where; and lifted head down getting up. */
export class HeldAloft {
  private reach: Reach | null = null;
  private frames = 0;
  private highest = 0;
  private at = '';
  /** his left arm on the lower grip as it was first plainly lifted in one hand, and when, as why it didn't hold it */
  private lifted: { grasp: LowerGrip; at: string } | null = null;
  /** his hands' stage last frame, to tell getting up (it runs back) */
  private beforeWas = 0;
  /** the frames lifted head down getting up, the furthest its far end hung under his fist and where */
  private headDown = { frames: 0, most: 0, at: '' };

  /** Notes this frame, if he stands in a sit's hands stage with a two-hander. */
  observe(lab: Lab, frame: string): void {
    const pose = lab.player.sitting.pose;
    const grip = lab.model.tip?.parent;
    if (!pose || pose.w > STANDS_TILL || !grip || !lab.model.offGrip) return;
    const holds = this.holdsOf(lab, grip);
    const gettingUp = pose.before < this.beforeWas;
    this.beforeWas = pose.before;
    if (gettingUp && liftedHeadDown(holds)) this.noteHeadDown(holds.headUnder ?? 0, frame);
    if (!aloftInOne(holds)) return;
    this.frames++;
    if (!this.lifted && holds.grasp && holds.over > LIFTED) this.lifted = { grasp: { ...holds.grasp }, at: frame };
    if (holds.over <= this.highest) return;
    this.highest = holds.over;
    this.at = frame;
  }

  /** The frames up in one hand as words, or none if it never was. */
  describe(name: string): string {
    if (this.frames === 0) return '';
    const highest = (this.highest * 100).toFixed(0);
    const lifted = this.lifted;
    const left = lifted ? `; as it was first lifted (${lifted.at}), his left hand: ${whyLetGo(lifted.grasp)}` : '';
    return `sit: by the ${name}, his two-hander up in one hand on ${this.frames} frames, ${highest} cm off the floor `
      + `(${this.at})${left}`;
  }

  /** Lifted head down getting up as words, or none if it never was. */
  describeHeadDown(name: string): string {
    const down = this.headDown;
    if (down.frames === 0) return '';
    return `sit: by the ${name}, his two-hander lifted head down getting up on ${down.frames} frames, its far end `
      + `${(down.most * 100).toFixed(0)} cm under his fist (${down.at})`;
  }

  private noteHeadDown(under: number, frame: string): void {
    this.headDown.frames++;
    if (under <= this.headDown.most) return;
    this.headDown.most = under;
    this.headDown.at = frame;
  }

  private holdsOf(lab: Lab, grip: THREE.Object3D): Holds {
    lab.model.root.updateMatrixWorld(true);
    const reach = (this.reach ??= reachOf(grip));
    grip.getWorldPosition(_grip);
    _way.set(0, 1, 0).transformDirection(grip.matrixWorld);
    const scale = _point.setFromMatrixScale(grip.matrixWorld).y;
    const ends = [reach.down, reach.up].map((along) => _end.copy(_grip).addScaledVector(_way, along * scale).clone());
    const over = lowestOver(grip);
    lab.joints.shoulderR.getWorldPosition(_shoulder);
    const line = new THREE.Line3(ends[0], ends[1]);
    const shoulder = line.closestPointToPoint(_shoulder, true, _point).distanceTo(_shoulder);
    const fists = lab.model.fists ?? [];
    const headUnder = _grip.y - ends[1].y;
    return { over, shoulder, left: leftOn(fists), grasp: lab.model.lowerGrip ?? undefined, headUnder };
  }
}

/** How far the lowest point of the weapon hung from `grip` is over the floor under it, read from its vertices as drawn
 *  (its handle's ends alone, a maul lying on the floor read 10 cm up, held there by its head). */
function lowestOver(grip: THREE.Object3D): number {
  _box.setFromObject(grip, true);
  _box.getCenter(_point);
  return _box.min.y - groundHeight(_point.x, _point.z);
}

/** Whether his left fist is closed on its handle. */
function leftOn(fists: readonly Fist[]): boolean {
  const left = fists.find((fist) => fist.hand === 'left');
  return !!left && left.curl >= FIST_OPEN && left.off <= LEFT_OFF_MOST;
}

/** How far the weapon hung from `grip` reaches along its up each way, read once from its meshes. */
function reachOf(grip: THREE.Object3D): Reach {
  const reach: Reach = { down: 0, up: 0 };
  _inverse.copy(grip.matrixWorld).invert();
  grip.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    mesh.geometry.computeBoundingBox();
    _box.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld).applyMatrix4(_inverse);
    reach.down = Math.min(reach.down, _box.min.y);
    reach.up = Math.max(reach.up, _box.max.y);
  });
  return reach;
}
