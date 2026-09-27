// First person: the hero's own arms and weapon in view. The body animates as in every other view, so each
// attack moves the same; through the eyes everything but the forearms goes on a layer the camera doesn't
// draw, and the model is placed so its eyes are the camera's and it tilts with the view's pitch, the arms
// brought a little up and forward so the hands and weapon sit in the frame. The placement holds until
// the next frame's pose, so skills cast in between leave from the weapon in view (`Player.castPoint`).
import * as THREE from 'three';
import type { Model } from '../types';

/** Where the eyes sit against the arms, in the hero's space (x left, y up, z forward): moved back and
 *  down from the head, so the hands and weapon come into the lower part of the view. */
const OFFSET = new THREE.Vector3(0, 0.2, 0.3);
const HIDDEN = 1;

const body = new WeakMap<Model, THREE.Object3D[]>();
const shown = new WeakSet<Model>();
/** The pose's own placement of the root, and ours over it: a frame with no new pose (paused) starts again
 *  from the pose's, or the eyes would be measured from where we put the hero last time */
const placed = new WeakMap<Model, { pos: THREE.Vector3; quat: THREE.Quaternion; ourPos: THREE.Vector3; ourQuat: THREE.Quaternion }>();
const _eye = new THREE.Vector3(), _m = new THREE.Matrix4(), _t = new THREE.Matrix4(), _flip = new THREE.Matrix4().makeRotationY(Math.PI);

/** The meshes that aren't the forearms (with the hands and what they hold): seen from the eyes, the
 *  upper arms and shoulders would fill the view's edges. */
function bodyOf(m: Model): THREE.Object3D[] {
  let list = body.get(m);
  if (list) return list;
  const j = m.joints, arms = j ? [j.elbowL, j.elbowR] : [];
  list = [];
  const walk = (o: THREE.Object3D): void => {
    if (arms.includes(o as THREE.Group)) return;
    if ((o as THREE.Mesh).isMesh) list!.push(o);
    for (const c of o.children) walk(c);
  };
  walk(m.root);
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
  // the eyes in the hero's space as it stands, then the hero placed so they are the camera's
  root.updateWorldMatrix(true, false);
  cam.updateMatrixWorld();
  root.worldToLocal(_eye.setFromMatrixPosition(cam.matrixWorld)).sub(OFFSET);
  _m.copy(cam.matrixWorld).multiply(_flip).multiply(_t.makeTranslation(-_eye.x, -_eye.y, -_eye.z));
  _m.premultiply(_t.copy(parent.matrixWorld).invert());
  _m.decompose(root.position, root.quaternion, root.scale);
  p.ourPos.copy(root.position); p.ourQuat.copy(root.quaternion);
}
