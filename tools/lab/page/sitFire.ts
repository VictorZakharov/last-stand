// What a hero does with his weapon by a fire (tools/lab `sit`): the owner's "he briefly puts his two handed sword in fire",
// and of what he's laid down, "floating parallel to ground, also moving as he moves".
// `FireClear` reads his weapon against the fire every frame. `LaidStill` reads a weapon the game says he's let go of
// (`userData.laid`) against where it first lay.

import * as THREE from 'three';
import type { Seat } from '../../../src/world/seats';
import type { Lab } from './lab';

/** the flames' reach as a share of the fire's circle, which takes in its ring of stones */
const FLAMES_OF_CIRCLE = 0.7;
/** the points read along the weapon, from the grip to the far end */
const WEAPON_POINTS = 8;
/** how far a weapon lying on the floor may be off where it first lay (m): a float's rounding */
const LAID_MOST = 0.002;
/** how far the canaries put a weapon wrong (m) */
const CANARY_BY = 0.2;

const _grip = new THREE.Vector3();
const _tip = new THREE.Vector3();
const _point = new THREE.Vector3();

/** How far `point` is inside a circle round (`x`, `z`) on the floor (m, up to its radius), or 0. */
export function insideCircle(point: THREE.Vector3, x: number, z: number, radius: number): number {
  return Math.max(0, radius - Math.hypot(point.x - x, point.z - z));
}

/** A weapon's points against a fire: its deepest into the flames, frame by frame. */
export class FireClear {
  private frames = 0;
  private deepest = 0;
  private at = '';

  constructor(private readonly seat: Seat) {}

  /** Notes this frame's weapon, whatever part of the sit it's in. */
  observe(lab: Lab, frame: string): void {
    const depth = this.seat.ground ? this.depthOf(lab) : 0;
    if (depth <= 0) return;
    this.frames++;
    if (depth <= this.deepest) return;
    this.deepest = depth;
    this.at = frame;
  }

  /** The canary: the weapon's far end put at the fire's middle must read as in it. */
  caught(): boolean {
    const radius = this.flames();
    if (radius <= 0) return true;
    _point.set(this.seat.ax + CANARY_BY, 0, this.seat.az);
    return insideCircle(_point, this.seat.ax, this.seat.az, radius) > 0;
  }

  /** The frames in the flames as words, or none if it never was. */
  describe(name: string): string {
    if (this.frames === 0) return '';
    const deepest = (this.deepest * 100).toFixed(0);
    return `sit: by the ${name}, his weapon in the flames on ${this.frames} frames, ${deepest} cm into them (${this.at})`;
  }

  private flames(): number {
    const circle = this.seat.circles[0];
    return circle ? circle.r * FLAMES_OF_CIRCLE : 0;
  }

  private depthOf(lab: Lab): number {
    const tip = lab.model.tip;
    const grip = tip?.parent;
    if (!tip || !grip) return 0;
    grip.getWorldPosition(_grip);
    tip.getWorldPosition(_tip);
    let deepest = 0;
    for (let i = 0; i <= WEAPON_POINTS; i++) {
      _point.lerpVectors(_grip, _tip, i / WEAPON_POINTS);
      deepest = Math.max(deepest, insideCircle(_point, this.seat.ax, this.seat.az, this.flames()));
    }
    return deepest;
  }
}

/** A weapon let go of on the floor: how far it has stirred from where it first lay, and that it was ever let go of. */
export class LaidStill {
  private first: THREE.Vector3 | null = null;
  private frames = 0;
  private most = 0;
  private at = '';

  /** Notes this frame's weapon, if it's lying let go of. */
  observe(lab: Lab, frame: string): void {
    const tip = lab.model.tip;
    if (!tip || !isLaid(tip)) {
      this.first = null;
      return;
    }
    tip.getWorldPosition(_tip);
    this.frames++;
    if (!this.first) {
      this.first = _tip.clone();
      return;
    }
    this.note(_tip.distanceTo(this.first), frame);
  }

  /** Notes how far it has stirred. */
  private note(moved: number, frame: string): void {
    if (moved <= this.most) return;
    this.most = moved;
    this.at = frame;
  }

  /** The canary: moved by a hand's stir, it must read as stirred. */
  caught(): boolean {
    const was = new LaidStill();
    was.note(CANARY_BY, 'canary');
    return was.describe('canary', true).length > 0;
  }

  /** Stirred as words, or that it was never let go of where it should have been, or none. */
  describe(name: string, shouldLie: boolean): string {
    if (shouldLie && this.frames === 0 && this.most === 0) {
      return `sit: by the ${name}, his two-hander never let go of on the floor`;
    }
    if (this.most <= LAID_MOST) return '';
    const stirred = (this.most * 100).toFixed(1);
    return `sit: by the ${name}, what he laid down stirred ${stirred} cm with no hand on it (${this.at})`;
  }
}

/** Whether what `tip` belongs to says it's lying let go of: said on the weapon's group, which shares the tip's grip. */
function isLaid(tip: THREE.Object3D): boolean {
  let laid = false;
  tip.parent?.traverse((object) => {
    laid ||= !!object.userData.laid;
  });
  return laid;
}
