// Arm IK within a body's ranges. The wrist goes to a point and the hand takes a turn, as far as a body can: of every place
// the elbow could be (a circle round the line from the shoulder to the wrist), the one where the shoulder, the forearm's
// turn and the wrist stay within their ranges and the arm keeps out of the head and trunk, nearest where the pose wanted
// the elbow and where it was last frame. What a body can't do, it doesn't: the forearm's turn and the wrist's bend stop at
// their ends, and the hand (and what it holds) turns only as far as they let it. A hand round a handle may also turn
// about it (`roll`), its wrist going round with it. A two-bone solve whose pole alone chose the elbow put it wherever
// the pole said: behind the back, up past the head, the wrist bent double round a handle.
import * as THREE from 'three';
import type { Joints } from './rig';
import { GIRDLE, ROM_ON, capsuleDepth, clampWrist, girdlePlace, shoulderExcess, type BodyShape } from './anatomy';

const N = 24, REFINE = 7, ROLLS = 5;

export interface ArmGoal {
  /** where the wrist goes (world) */
  wrist: THREE.Vector3;
  /** the hand's turn wanted (world): the turned hand's if `vis` is given, else the hand joint's; none keeps the hand's turn on the forearm */
  hand?: THREE.Quaternion;
  /** the turned hand's turn on the hand joint (`Hand.vis`): the wrist's range is the visible hand's */
  vis?: THREE.Quaternion;
  /** where the elbow would rather point (world, a direction from the shoulder): a preference within the ranges */
  pole?: THREE.Vector3;
  /** degrees of the ranges' excess the pole is worth, from where it points to the far side of the circle (default 8) */
  keep?: number;
  /** the body, so the arm keeps out of the head and the trunk */
  body?: BodyShape;
  /** a hand round a handle along `axis` (world, through `at`) may turn about it up to `range` (rad) either way: the wrist and the hand turn round it together */
  roll?: { axis: THREE.Vector3; range: number; at: THREE.Vector3 };
  /** the shoulder girdle may move the shoulder (anatomy.ts `GIRDLE`) when no elbow keeps the arm within its ranges with it at rest */
  girdle?: boolean;
  /** a hand round a handle may turn about its palm on it up to this (rad), the handle diagonal across the palm (`hold`'s slant): the hand joint, and so what it holds, keeps its turn, only the visible hand turns */
  slant?: number;
}
export interface ArmResult {
  /** degrees outside the ranges that no elbow could avoid (the hand then turned less than asked) */
  excess: number;
  /** how deep the arm is in the body (the rig's units), at best */
  depth: number;
  /** how far the hand turned about the handle (rad), with `roll` */
  roll: number;
  /** the girdle's raise and its forward turn (degrees), with `girdle` */
  girdle: [number, number];
  /** the hand's slant on its handle (rad), with `slant`: hold and seat it with this */
  slant: number;
}

const _S = new THREE.Vector3(), _W = new THREE.Vector3(), _n = new THREE.Vector3(), _u1 = new THREE.Vector3(), _u2 = new THREE.Vector3(), _E = new THREE.Vector3();
const _b = new THREE.Vector3(), _f = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _rad = new THREE.Vector3();
const _pq = new THREE.Quaternion(), _pqi = new THREE.Quaternion(), _H = new THREE.Quaternion(), _Qu = new THREE.Quaternion(), _Qf = new THREE.Quaternion(), _rel = new THREE.Quaternion(), _cl = new THREE.Quaternion(), _hx = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _wa = new THREE.Vector3(), _wb = new THREE.Vector3(), _pl = new THREE.Vector3(), _ww = new THREE.Vector3(), _hw = new THREE.Quaternion(), _rq = new THREE.Quaternion(), _off = new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0);
/** where each arm's elbow was last solved (its shoulder's parent's frame), and its girdle */
const last = new WeakMap<THREE.Object3D, THREE.Vector3>(), lastG = new WeakMap<THREE.Object3D, [number, number]>(), lastS = new WeakMap<THREE.Object3D, number>();
const Z = new THREE.Vector3(0, 0, 1), _sz = new THREE.Quaternion(), _seg = new THREE.Vector3(), _cp = new THREE.Vector3();
/** the girdle's raises and forward turns tried (degrees) */
const G_ELEV = [GIRDLE.elevation[0], 0, 12, 24, GIRDLE.elevation[1]], G_PRO = [GIRDLE.protraction[0], -12, 0, 12, GIRDLE.protraction[1]];

/** Pose the arm (`left` or right) for `g`. The arm's joints are set, not their world matrices. */
export function solveArm(j: Joints, left: boolean, g: ArmGoal): ArmResult {
  const sh = left ? j.shoulderL : j.shoulderR, el = left ? j.elbowL : j.elbowR, hd = left ? j.handL : j.handR;
  const par = sh.parent!;
  par.updateWorldMatrix(true, false);
  par.getWorldQuaternion(_pq); _pqi.copy(_pq).invert();
  const L1 = j.P.upperL, L2 = j.P.foreL;
  const rest = (sh.userData.rest as THREE.Vector3 | undefined) ?? sh.position;
  _S.copy(rest);
  const keep = g.keep ?? 8, prev = last.get(sh);
  const solids = g.body?.solids.filter((s) => s.name === 'head' || s.name === 'chest' || s.name === 'belly' || s.name === 'neck');
  // (each solid's frame, once for the whole search)
  const invs = solids?.map((s) => { s.at.updateWorldMatrix(true, false); return new THREE.Matrix4().copy(s.at.matrixWorld).invert(); }), head = solids ? solids.findIndex((s) => s.name === 'head') : -1;
  // (and a sphere round each, world: a limb clear of it needs no closer look)
  const balls = solids?.map((s) => { const k = s.at.matrixWorld.getMaxScaleOnAxis(); return { c: s.c.clone().applyMatrix4(s.at.matrixWorld), r: Math.max(s.r.x, s.r.y, s.r.z) * k, k }; });
  // the pole, in the shoulder's parent's frame (or the elbow as posed)
  if (g.pole) _pl.copy(g.pole).applyQuaternion(_pqi);
  else { el.getWorldPosition(_pl); par.worldToLocal(_pl).sub(_S); }
  // the turn about a handle: the wrist's offset from the handle's axis at no turn
  if (g.roll) _off.copy(g.wrist).sub(g.roll.at);
  // (`gNow`: the girdle's forward turn being tried: drawn back, the arm reaches further behind)
  let a = 0, r = 0, want: THREE.Quaternion | null = null, depthAt = 0, bad = 0, gNow = 0;

  /** the circle the elbow is on, for the hand turned `roll` about the handle and slanted `slant` on it */
  const setup = (roll: number, slant = 0) => {
    _ww.copy(g.wrist);
    if (g.hand) _hw.copy(g.hand);
    if (g.roll && roll) {
      _rq.setFromAxisAngle(g.roll.axis, roll);
      _ww.copy(_off).applyQuaternion(_rq).add(g.roll.at);
      if (g.hand) _hw.premultiply(_rq);
    }
    // everything in the shoulder's parent's frame (the rig's units)
    _W.copy(_ww); par.worldToLocal(_W);
    _n.copy(_W).sub(_S);
    const d = THREE.MathUtils.clamp(_n.length(), Math.abs(L1 - L2) + 1e-4, L1 + L2 - 1e-4);
    _n.normalize();
    a = (L1 * L1 - L2 * L2 + d * d) / (2 * d); r = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    _W.copy(_S).addScaledVector(_n, d);
    // the circle's frame: 0 towards the pole
    _u1.copy(_pl).addScaledVector(_n, -_pl.dot(_n));
    if (_u1.lengthSq() < 1e-8) _u1.set(0, -1, 0).addScaledVector(_n, -_n.y);
    _u1.normalize(); _u2.crossVectors(_n, _u1);
    want = g.hand ? _H.copy(_pqi).multiply(_hw) : null;
    if (want && slant) want.multiply(_sz.setFromAxisAngle(Z, slant));
  };

  /** whether a limb from `p` to `q` (world) of radius `rl` comes within solid `i`'s sphere */
  const near = (p: THREE.Vector3, q: THREE.Vector3, rl: number, i: number): boolean => {
    const b = balls![i];
    _seg.copy(q).sub(p);
    const t = THREE.MathUtils.clamp(_cp.copy(b.c).sub(p).dot(_seg) / Math.max(1e-9, _seg.lengthSq()), 0, 1);
    return _cp.copy(p).addScaledVector(_seg, t).distanceTo(b.c) < b.r + rl * b.k;
  };
  /** the arm with its elbow at `phi` round the circle: its upper arm's turn into _Qu, the forearm's into _Qf, the elbow at _E; its cost */
  const at = (phi: number, final = false): number => {
    _rad.copy(_u1).multiplyScalar(Math.cos(phi)).addScaledVector(_u2, Math.sin(phi));
    _E.copy(_S).addScaledVector(_n, a).addScaledVector(_rad, r);
    _b.copy(_E).sub(_S).divideScalar(L1); _f.copy(_W).sub(_E).divideScalar(L2);
    // the upper arm: its bone along -y, its hinge across (x), the forearm bending towards +z
    _y.copy(_b).negate();
    _z.copy(_f).addScaledVector(_b, -_f.dot(_b));
    if (_z.lengthSq() < 1e-8) _z.copy(_rad).negate();
    _z.normalize(); _x.crossVectors(_y, _z);
    _Qu.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
    const flex = Math.acos(THREE.MathUtils.clamp(_b.dot(_f), -1, 1));
    _Qf.copy(_Qu).multiply(_hx.setFromAxisAngle(X, -flex));
    let cost = ROM_ON ? 3 * shoulderExcess(_Qu, left, gNow) : 0;
    bad = 0;
    if (want && ROM_ON) {
      _rel.copy(_Qf).invert().multiply(want);
      cost += 2 * clampWrist(_rel, left, _cl);
    }
    if (solids && ROM_ON) {
      // (the upper arm against the head only: at the shoulder it joins the trunk)
      _wa.copy(_S).applyMatrix4(par.matrixWorld); _wb.copy(_E).applyMatrix4(par.matrixWorld);
      let deep = near(_wa, _wb, j.P.upperR, head) ? Math.max(0, capsuleDepth(_wa, _wb, j.P.upperR, solids[head], invs![head])) : 0;
      _wa.copy(_W).applyMatrix4(par.matrixWorld);
      for (let i = 0; i < solids.length; i++) if (near(_wb, _wa, j.P.foreR, i)) deep = Math.max(deep, capsuleDepth(_wb, _wa, j.P.foreR, solids[i], invs![i]));
      if (final) depthAt = deep;
      cost += 400 * Math.max(0, deep - 0.005);
    }
    bad = cost;
    // the pole, and last frame's elbow (1 cm counts as a degree)
    cost += keep * Math.abs(phi) / Math.PI;
    if (prev) cost += 100 * _E.distanceTo(prev);
    return cost;
  };

  /** the best elbow for the circle set up: over it, `n` samples, then closer round the best */
  const search = (n: number, refine: number): [number, number] => {
    let best = 0, bestC = Infinity, step = Math.PI / n;
    // (warm: round last frame's elbow first, the whole circle only if nothing there is within the ranges)
    if (prev) {
      _rad.copy(prev).sub(_S).addScaledVector(_n, -a);
      const phi0 = Math.atan2(_rad.dot(_u2), _rad.dot(_u1)), w = Math.PI / 12;
      let worst = 0;
      for (let k = -2; k <= 2; k++) { const phi = phi0 + k * w, c = at(phi); if (c < bestC) { bestC = c; best = phi; worst = bad; } }
      if (worst > 0.5) bestC = Infinity; else step = w / 2;
    }
    if (bestC === Infinity) for (let i = 0; i < n; i++) { const phi = -Math.PI + (i + 0.5) * 2 * Math.PI / n, c = at(phi); if (c < bestC) { bestC = c; best = phi; } }
    for (let i = 0; i < refine; i++) {
      for (const phi of [best - step, best + step]) { const c = at(phi); if (c < bestC) { bestC = c; best = phi; } }
      step *= 0.5;
    }
    return [best, bestC];
  };

  const ps = lastS.get(sh);
  /** the hand's turn about its handle and its slant on it for the shoulder where it is (the slant only if `slants`): a few, roughly; and their cost */
  const turnsFor = (slants: boolean): [number, number, number] => {
    const rolls = g.roll && ROM_ON ? Array.from({ length: ROLLS }, (_, i) => g.roll!.range * (2 * i / (ROLLS - 1) - 1)) : [0];
    // (warm: round last frame's slant; all of them when that's nowhere near)
    const sls = !(slants && g.slant && ROM_ON) ? [0] : ps ? [ps - 0.12, ps, ps + 0.12].map((x) => Math.max(-g.slant!, Math.min(g.slant!, x))) : [0, -0.5, 0.5, -1, 1].map((k) => k * g.slant!);
    let roll = 0, slant = 0, bestC = Infinity;
    for (const sl of sls) for (const ro of rolls) {
      setup(ro, sl);
      // (a turn or a slant costs a little of itself, none when nothing asks for it; a slant also its change)
      const c = search(N / 2, 2)[1] + 4 * Math.abs(ro) + 4 * Math.abs(sl) + (ps !== undefined ? 8 * Math.abs(sl - ps) : 0);
      if (c < bestC) { bestC = c; roll = ro; slant = sl; }
    }
    return [roll, slant, bestC];
  };
  /** what the ranges leave over for the elbow found (degrees), the arm as `at` last left it */
  const over = (): number => ROM_ON ? shoulderExcess(_Qu, left, gNow) + (want ? clampWrist(_rel.copy(_Qf).invert().multiply(want), left, _cl) : 0) : 0;

  let [roll, slant] = turnsFor(false);
  setup(roll);
  let [best] = search(N, REFINE);
  at(best, true);
  // the slant on the handle, if the wrist needs it (or was slanted last frame, to come back)
  if (g.slant && ROM_ON && (over() > 0.5 || ps)) {
    [roll, slant] = turnsFor(true);
    setup(roll, slant);
    [best] = search(N, REFINE);
    at(best, true);
  }
  // the girdle, if the arm needs it: the shoulder raised or lowered, brought forward or drawn back, the least that does
  // (and near last frame's)
  let gE = 0, gP = 0;
  const pg = lastG.get(sh);
  if (g.girdle && ROM_ON && (over() > 0.5 || depthAt > 0.01 || (pg && (pg[0] || pg[1])))) {
    let bestC = Infinity;
    for (const e of G_ELEV) for (const pr of G_PRO) {
      girdlePlace(rest, left, e, pr, _S); gNow = pr;
      const c = turnsFor(!!slant)[2] + 0.3 * (Math.abs(e) + Math.abs(pr)) + (pg ? 0.3 * (Math.abs(e - pg[0]) + Math.abs(pr - pg[1])) : 0);
      if (c < bestC) { bestC = c; gE = e; gP = pr; }
    }
    // (eased towards it: the girdle is slow next to the arm)
    if (pg) { gE = pg[0] + (gE - pg[0]) * 0.35; gP = pg[1] + (gP - pg[1]) * 0.35; }
    girdlePlace(rest, left, gE, gP, _S); gNow = gP;
    [roll, slant] = turnsFor(!!g.slant);
    setup(roll, slant);
    [best] = search(N, REFINE);
    at(best, true);
  }
  if (g.girdle) (pg ?? lastG.set(sh, [0, 0]).get(sh)!).splice(0, 2, gE, gP);
  if (g.slant) lastS.set(sh, slant);
  sh.position.copy(_S);
  (prev ?? last.set(sh, new THREE.Vector3()).get(sh)!).copy(_E);
  // the joints: the upper arm on its parent, the elbow a hinge, the hand within the forearm's turn and the wrist's bend
  sh.quaternion.copy(_Qu);
  const flex = Math.acos(THREE.MathUtils.clamp(_b.dot(_f), -1, 1));
  el.quaternion.setFromAxisAngle(X, -flex);
  let excess = ROM_ON ? shoulderExcess(_Qu, left, gP) : 0;
  const vis = g.vis;
  // (the visible hand's turn on the forearm: as wanted, or as it was)
  if (want) _rel.copy(_Qf).invert().multiply(want);
  else { _rel.copy(hd.quaternion); if (vis) _rel.multiply(vis); }
  if (ROM_ON) excess += clampWrist(_rel, left, _rel);
  hd.quaternion.copy(_rel);
  // (the hand joint under the visible hand: its turn on the joint, and the slant)
  if (vis || slant) hd.quaternion.multiply(_hx.copy(vis ?? _sz.identity()).multiply(_sz.setFromAxisAngle(Z, slant)).invert());
  return { excess, depth: depthAt, roll, girdle: [gE, gP], slant };
}

/**
 * An arm the pose has placed, brought within the body's ranges: its wrist stays where the pose put it and its hand
 * keeps its turn in the world as far as the ranges let it; the elbow moves round as little as they allow. `vis`: the
 * turn the hand will be given on its joint this frame (`gripTurn` for a held weapon), none for a hand that isn't
 * turned. (It reads the joints' world matrices through their parents, so needs no update of the whole model first.)
 */
export function fitArm(j: Joints, left: boolean, vis?: THREE.Quaternion, body?: BodyShape, slant?: number): ArmResult {
  const sh = left ? j.shoulderL : j.shoulderR, el = left ? j.elbowL : j.elbowR, hd = left ? j.handL : j.handR;
  const wrist = hd.getWorldPosition(new THREE.Vector3());
  const hand = hd.getWorldQuaternion(new THREE.Quaternion());
  if (vis) hand.multiply(vis);
  const pole = el.getWorldPosition(new THREE.Vector3()).sub(sh.getWorldPosition(new THREE.Vector3()));
  return solveArm(j, left, { wrist, hand, vis, pole, body, slant });
}
