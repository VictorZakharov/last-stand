// A held weapon's head by a hero's face as he sits or gets up (tools/lab `sit`). From review of a maul stood on its
// butt by a log: from a fifth of his way up until he lifts it to his shoulder, "the maul head is at his cheek", and no
// clip check saw it, as it never went in. `FaceClear` reads each frame the gap between the weapon's far end (a maul's
// or an axe's head, a blade's point: the last `HEAD_LONG` of it to its tip, a capsule `HEAD_R` round) and his head's
// skin (`bodyShape`'s ellipsoid), and fails a sit whose nearest is within `CLEAR_MOST`.

import * as THREE from 'three';
import { bodyShape, capsuleDepth, type Solid } from '../../../src/entities/models/anatomy';
import type { Lab } from './lab';

/** how long the weapon's far end is, back from its tip (m): a maul's head, 24 cm */
const HEAD_LONG = 0.24;
/** how far round its line the far end reaches (m): half a maul's head across */
const HEAD_R = 0.07;
/** how near his head the far end may come (m): a hand's breadth and more, clear */
const CLEAR_MOST = 0.12;

const _tip = new THREE.Vector3();
const _back = new THREE.Vector3();
const _scale = new THREE.Vector3();

/** The gap between a capsule (world, m) and a head's solid (m: negative, how far into it). */
export function gapTo(head: Solid, from: THREE.Vector3, to: THREE.Vector3, radius: number): number {
  head.at.updateWorldMatrix(true, false);
  const scale = _scale.setFromMatrixScale(head.at.matrixWorld).y;
  return -capsuleDepth(from, to, radius / scale, head) * scale;
}

/** Whether a gap is a weapon by his face. */
export function byFace(gap: number): boolean {
  return gap < CLEAR_MOST;
}

/** The canary: a weapon's head laid at his head's middle is by his face; one two metres off isn't. */
export function faceCanary(head: Solid): boolean {
  const middle = head.at.localToWorld(head.c.clone());
  const off = middle.clone().add(new THREE.Vector3(2, 0, 0));
  const up = new THREE.Vector3(0, HEAD_LONG, 0);
  const near = gapTo(head, middle, middle.clone().add(up), HEAD_R);
  const far = gapTo(head, off, off.clone().add(up), HEAD_R);
  return byFace(near) && !byFace(far);
}

/** The nearest a held weapon's far end came to his face over a sit. */
export class FaceClear {
  private head: Solid | null = null;
  private nearest = Infinity;
  private at = '';
  private frames = 0;
  private canaryCaught = true;

  /** Notes this frame's gap, while he's posed by the sit. */
  observe(lab: Lab, frame: string): void {
    const tip = lab.model.tip;
    const grip = tip?.parent;
    if (!tip || !grip || !lab.player.sitting.pose) return;
    if (!this.head) {
      this.head = bodyShape(lab.joints).solids.find((solid) => solid.name === 'head') ?? null;
      if (!this.head) return;
      this.canaryCaught = faceCanary(this.head);
    }
    lab.model.root.updateMatrixWorld(true);
    tip.getWorldPosition(_tip);
    _back.set(0, -1, 0).transformDirection(grip.matrixWorld).multiplyScalar(HEAD_LONG).add(_tip);
    const gap = gapTo(this.head, _back, _tip, HEAD_R);
    if (byFace(gap)) this.frames++;
    if (gap >= this.nearest) return;
    this.nearest = gap;
    this.at = frame;
  }

  /** The nearest as a line of the report. */
  summary(name: string): string {
    if (!Number.isFinite(this.nearest)) return '';
    return `  by the ${name}, his weapon's far end ${(this.nearest * 100).toFixed(1)} cm from his face at the nearest `
      + `(${this.at})`;
  }

  /** A weapon by his face as words, or none. */
  describe(name: string): string {
    if (!byFace(this.nearest)) return '';
    return `sit: by the ${name}, his weapon's far end by his face on ${this.frames} frames, the nearest `
      + `${(this.nearest * 100).toFixed(1)} cm (${this.at})`;
  }

  /** Whether the canary was caught (true until a head is read). */
  caught(): boolean {
    return this.canaryCaught;
  }
}
