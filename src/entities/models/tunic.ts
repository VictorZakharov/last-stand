// A man's plain tunic over the rig's chest (the mage's under his robe, the ranger's coat): its shape round the chest and
// over the shoulders, the neckline round the neck and its rolled hem there, and the waist below it. Shared by the heroes
// built on the same frame, so each meets the neck as a man's does.
import * as THREE from 'three';
import { belt } from './armor';
import { curve, type Keys } from './motion';
import { clamp } from '../../util';

/** chest joint space (m): at each height its half-width and half-depth, and how square its section is. Over the shoulders
 *  it is as broad as the arms' tops and thin front to back, the trapezius sloping down from the neck and a deltoid
 *  rounding over each shoulder joint down into the armpit (a round barrel of a body, with the arms' tubes stood beside it
 *  under their own round tops, read as a coat hanger) */
const TUNIC_W: Keys = [[-0.12, 0.143], [-0.02, 0.152], [0.1, 0.162], [0.15, 0.18], [0.19, 0.232], [0.215, 0.248], [0.238, 0.24], [0.256, 0.2], [0.274, 0.14], [0.289, 0.098], [0.3, 0.0765]];
const TUNIC_D: Keys = [[-0.12, 0.125], [-0.02, 0.133], [0.1, 0.142], [0.16, 0.138], [0.21, 0.118], [0.25, 0.094], [0.275, 0.08], [0.3, 0.0715]];
const TUNIC_P: Keys = [[-0.12, 2], [0.12, 2], [0.2, 2.6], [0.26, 2.6], [0.3, 2]];
/** how far back the neckline sits (m): round the neck, which rises from the back of the chest (its middle a centimetre
 *  behind the chest's: centred on the chest, the collar was tight at the back and a man's neck came through it; a few mm
 *  loose all round, as the neck leans back in it at a run and turns in it) */
const NECKLINE_BACK = 0.0125;
const neckBack = (y: number) => { const t = clamp((y - 0.26) / 0.04, 0, 1); return -NECKLINE_BACK * t * t * (3 - 2 * t); };
/** the tunic's height range on the chest joint (m): from below the chest's joint up to the neckline */
export const TUNIC_Y: [number, number] = [-0.12, 0.3];
/** below it, round the spine joint (m): half-width at each height, the depth 0.86 of it */
export const WAIST: [number, number][] = [[0.148, -0.05], [0.15, 0.08], [0.152, 0.2], [0.155, 0.26]];

/** a point on the tunic towards `a` round it (0 the front, +x his left) at height y, `lift` above it */
export function onTunic(a: number, y: number, lift: number, out = new THREE.Vector3()): THREE.Vector3 {
  const X = curve(TUNIC_W, y) + lift, Z = curve(TUNIC_D, y) + lift, e = 2 / curve(TUNIC_P, y), s = Math.sin(a), c = Math.cos(a);
  return out.set(Math.sign(s) * Math.abs(s) ** e * X, y, Math.sign(c) * Math.abs(c) ** e * Z + neckBack(y));
}
/** the point on the tunic's front `x` across */
export const tunicFront = (x: number, y: number, lift: number) => onTunic(Math.asin(clamp(Math.sign(x) * Math.abs(x / curve(TUNIC_W, y)) ** (curve(TUNIC_P, y) / 2), -1, 1)), y, lift);
/** the point on the tunic's back `x` across (+x his left) */
export const tunicBack = (x: number, y: number, lift: number) => onTunic(Math.PI - Math.asin(clamp(Math.sign(x) * Math.abs(x / curve(TUNIC_W, y)) ** (curve(TUNIC_P, y) / 2), -1, 1)), y, lift);
/** the rolled hem round the neckline */
export const neckHem = () => belt(0.0765, 0.0715, 0.297, 0.012, 0.006, 0, 28).translate(0, 0, neckBack(0.297));
