// tools/lab heads: how much of a held weapon's head the frame shows (lab eyes, at rest). Its head is its meshes from
// `HEAD_FROM` of its length on, butt to far end (a maul's head, an axe's bit, a blade's point), as `match` takes it;
// the share shown is of the box its points make on the screen, so the part out of the frame counts too, where a
// cover of the frame (page/inFrame.ts `headCover`) sees only what's in it. A weapon has a head (`Head.headed`) if
// that part is at least `HEADED_WIDER` times as wide as its middle: a maul's, an axe's, a mace's, where a blade's
// point is narrower than its middle. (The owner, of the maul at rest through the eyes: "two handed maul should be
// lowered to see more of its head"; the frame showed its head's lower edge, 14% of it. Vermintide 2's shots show a
// hammer's and an axe's heads in the frame, a sword's point out of its top.)
import * as THREE from 'three';
import { HEAD_FROM } from './inFrame';

/** a mesh's every how many points read for its head (the sculpts' faces have thousands) */
const POINT_STEP = 4;
/** the most of a head moved out of the frame its canary may read shown */
const CANARY_MOST = 0.05;
/** how many times as wide as its middle (`MIDDLE`: shares of its length) a weapon's head is if it has one */
const HEADED_WIDER = 2;
const MIDDLE = [0.4, 0.6] as const;

/** A weapon's head: its points, the world's, and whether it has one, wider than its middle (`HEADED_WIDER`). */
export interface Head {
  points: THREE.Vector3[];
  headed: boolean;
}

/** Each shown mesh's points under `weapon`, in its own frame (y along its length, as its grip holds it). */
function ownPoints(weapon: THREE.Object3D): THREE.Vector3[] {
  weapon.updateWorldMatrix(true, true);
  const toOwn = weapon.matrixWorld.clone().invert();
  const points: THREE.Vector3[] = [];
  weapon.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const toWeapon = toOwn.clone().multiply(mesh.matrixWorld);
    const position = mesh.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i += POINT_STEP) {
      points.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(toWeapon));
    }
  });
  return points;
}

/** How far the furthest of `points` (its own frame) is from the weapon's length through its grip (m). */
const widest = (points: THREE.Vector3[]) => Math.max(0, ...points.map((point) => Math.hypot(point.x, point.z)));

/** A weapon's head (`Head`): its points `HEAD_FROM` of its length on, from its butt to its far end. */
export function headOf(weapon: THREE.Object3D): Head {
  const points = ownPoints(weapon);
  if (!points.length) return { points: [], headed: false };
  const ys = points.map((point) => point.y);
  const butt = Math.min(...ys);
  const length = Math.max(...ys) - butt;
  const share = (point: THREE.Vector3) => (point.y - butt) / length;
  const head = points.filter((point) => share(point) >= HEAD_FROM);
  const middle = points.filter((point) => share(point) >= MIDDLE[0] && share(point) <= MIDDLE[1]);
  const headed = widest(head) >= HEADED_WIDER * widest(middle);
  return { points: head.map((point) => weapon.localToWorld(point)), headed };
}

/** A box on the screen (-1..1 each way, as the lens projects). */
interface ScreenBox {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

/** The part of `box` inside the frame (0..1 of its area). */
function boxInFrame(box: ScreenBox): number {
  const area = (box.right - box.left) * (box.top - box.bottom);
  const across = Math.max(0, Math.min(box.right, 1) - Math.max(box.left, -1));
  const up = Math.max(0, Math.min(box.top, 1) - Math.max(box.bottom, -1));
  return area > 0 ? (across * up) / area : 0;
}

/** How much of what `points` (the world's) make on the screen through `lens` is in its frame: of their box on the
 *  screen, the share in the frame, by the share of them ahead of the eyes. 0 with none ahead. */
export function shareShown(points: THREE.Vector3[], lens: THREE.Camera): number {
  lens.updateMatrixWorld();
  const ahead = points.filter((point) => lens.worldToLocal(point.clone()).z < 0);
  if (!ahead.length) return 0;
  const box: ScreenBox = { left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity };
  for (const point of ahead) {
    const ndc = point.clone().project(lens);
    box.left = Math.min(box.left, ndc.x);
    box.right = Math.max(box.right, ndc.x);
    box.bottom = Math.min(box.bottom, ndc.y);
    box.top = Math.max(box.top, ndc.y);
  }
  return boxInFrame(box) * (ahead.length / points.length);
}

/** `points` (the world's) moved up the view by `frames` heights of the frame where they are, through `lens`. */
function movedUp(points: THREE.Vector3[], lens: THREE.PerspectiveCamera, frames: number): THREE.Vector3[] {
  const up = new THREE.Vector3(0, 1, 0).transformDirection(lens.matrixWorld);
  const halfHeight = Math.tan(THREE.MathUtils.degToRad(lens.fov / 2));
  return points.map((point) => {
    const depth = -lens.worldToLocal(point.clone()).z;
    return point.clone().addScaledVector(up, frames * 2 * halfHeight * depth);
  });
}

/** The measure's canary: a head moved up out of the frame by a frame's height must read none of it shown (less than
 *  `CANARY_MOST`); as words, caught or missed. */
export function headCanary(points: THREE.Vector3[], lens: THREE.PerspectiveCamera): string {
  const moved = shareShown(movedUp(points, lens, 1), lens);
  const percent = (value: number) => `${(value * 100).toFixed(0)}%`;
  return moved < CANARY_MOST
    ? `caught: moved up out of the frame, ${percent(moved)} of it shown`
    : `missed: moved up out of the frame, ${percent(moved)} of it read shown`;
}
