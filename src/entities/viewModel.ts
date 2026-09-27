// First person: the hero's own arms and weapon in view. The body animates as in every other view, so each
// attack moves the same; through the eyes everything but the arms goes on a layer the camera doesn't
// draw, and the model is placed so the camera sits just above its neck, turned and tilted with the view
// and tipped back a little so the hands and weapon sit in the frame. The placement holds until the next
// frame's pose, so skills cast in between leave from the weapon in view (`Player.castPoint`).
import * as THREE from 'three';
import type { Model } from '../types';

/** Where the camera sits against the neck, in the hero's space (x left, y up, z forward): just above
 *  it, so the shoulders stay below the view and the hands and weapon come into its lower part. */
const NECK_CAM = new THREE.Vector3(0, 0.25, 0.1);
/** tipped back about the camera, so what the hands hold low and ahead rises into the frame */
const TILT = -0.4;
const HIDDEN = 1;

const body = new WeakMap<Model, THREE.Object3D[]>();
const shown = new WeakSet<Model>();
/** The pose's own placement of the root, and ours over it: a frame with no new pose (paused) starts again
 *  from the pose's, or the neck would be measured where we put the hero last time */
const placed = new WeakMap<Model, { pos: THREE.Vector3; quat: THREE.Quaternion; ourPos: THREE.Vector3; ourQuat: THREE.Quaternion }>();
const _eye = new THREE.Vector3(), _m = new THREE.Matrix4(), _t = new THREE.Matrix4(), _t2 = new THREE.Matrix4(), _s = new THREE.Vector3(), _flip = new THREE.Matrix4().makeRotationY(Math.PI).multiply(new THREE.Matrix4().makeRotationX(TILT));

/** The meshes that aren't the arms (with the hands and what they hold). Of what hangs on a shoulder, only
 *  its own meshes (the upper arm) and the elbow's show: a pauldron, on a joint of its own, would fill the
 *  view's edge. */
function bodyOf(m: Model): THREE.Object3D[] {
  let list = body.get(m);
  if (list) return list;
  const j = m.joints, shoulders: THREE.Object3D[] = j ? [j.shoulderL, j.shoulderR] : [], elbows: THREE.Object3D[] = j ? [j.elbowL, j.elbowR] : [];
  list = [];
  const walk = (o: THREE.Object3D, onArm: boolean): void => {
    if (elbows.includes(o)) return;
    if ((o as THREE.Mesh).isMesh) { if (!onArm) list!.push(o); }
    else if (onArm) { hideAll(o); return; }
    for (const c of o.children) walk(c, shoulders.includes(o));
  };
  const hideAll = (o: THREE.Object3D): void => o.traverse((c) => { if ((c as THREE.Mesh).isMesh) list!.push(c); });
  walk(m.root, false);
  body.set(m, list);
  return list;
}

/** Show `m` through the camera's eyes (`on`), or as a whole body. Call after the camera has moved. */
export function viewArms(m: Model, on: boolean, cam: THREE.Camera): void {
  if (on !== shown.has(m)) {
    for (const o of bodyOf(m)) { if (on) o.layers.set(HIDDEN); else o.layers.set(0); }
    if (on) shown.add(m); else shown.delete(m);
    m.firstPerson?.(on);
  }
  const root = m.root, parent = root.parent;
  let p = placed.get(m);
  if (p && p.ourPos.equals(root.position) && p.ourQuat.equals(root.quaternion)) { root.position.copy(p.pos); root.quaternion.copy(p.quat); }
  if (!on || !parent) return;
  if (!p) placed.set(m, p = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), ourPos: new THREE.Vector3(), ourQuat: new THREE.Quaternion() });
  p.pos.copy(root.position); p.quat.copy(root.quaternion);
  root.updateWorldMatrix(true, false);
  cam.updateMatrixWorld();
  // the camera sits just above the neck, wherever the pose has taken it: the head rides the spine, so a
  // lean or a crouch doesn't bring the shoulders up under the camera
  const neck = m.joints?.neck;
  if (neck) root.worldToLocal(neck.getWorldPosition(_eye)).add(NECK_CAM);
  else root.worldToLocal(_eye.setFromMatrixPosition(cam.matrixWorld));
  _m.copy(cam.matrixWorld).multiply(_flip);
  // (the model's own scale kept: the heroes are built a little over life size, and reach reads it)
  _m.multiply(_t.makeScale(root.scale.x, root.scale.y, root.scale.z)).multiply(_t2.makeTranslation(-_eye.x, -_eye.y, -_eye.z));
  _m.premultiply(_t.copy(parent.matrixWorld).invert());
  _m.decompose(root.position, root.quaternion, _s);
  p.ourPos.copy(root.position); p.ourQuat.copy(root.quaternion);
}
