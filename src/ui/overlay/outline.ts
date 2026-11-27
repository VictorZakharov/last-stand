// An outline round one thing on screen (the foe a held Quarry Mark would mark, the seat E would sit him on): its solid
// meshes (or one instance of an instanced mesh: a stone among the biome's boulders) drawn by the engine into a mask of
// their own, and the mask's edge drawn over the finished frame, in front of everything (it shows through a pillar or
// a crowd), under the world's labels (engine/outlined.ts, Bulwark's gpu/outline.rs). Each frame the page names the
// meshes and the box on the screen it's drawn within; the engine's pipelines for it are made as it starts, so nothing
// is compiled for it at load or in play. (Drawn by three on a canvas of its own laid over the engine's, it needed
// that canvas and three's renderer; three's mask kept a cut-out's alpha test, the engine's draws it whole.)
import {
  Box3, Color, InstancedMesh, LinearSRGBColorSpace, Mat4, Material, Mesh, Node, NormalBlending, Vec3,
} from '../../engine/api/index.ts';
import { G } from '../../state';
import { uiScales } from '../scale';
import { placeUnplaced } from '../../entities/models/bodyAsOne';
import { frameRect } from '../../core/renderer';
import { outlineForEngine, type OutlinedMesh } from '../../engine/outlined';

/** the outline's width, and its soft glow's past it (px of the UI's reference layout, at the HUD's scale) */
const WIDTH = 2.5;
const GLOW = 3.5;
/** how far round the outlined thing's box on screen the edge is drawn (px of the canvas, past the glow) */
const BOX_MARGIN = 4;

/** What an outline goes round: an object and every mesh under it, or one instance of an instanced mesh. */
export interface OutlineTarget {
  root: Node;
  instance?: number;
}

/** An object outlined whole, or a target. */
type Outlinable = Node | OutlineTarget;

/** What's outlined: its targets, what they were given as (kept as they are while it's given again), the colour (as
 *  the screen shows it), and how strongly (0 to 1). */
interface Outlined {
  targets: OutlineTarget[];
  given: Outlinable | readonly Outlinable[];
  color: Color;
  strength: number;
}
let current: Outlined | null = null;

const targetOf = (what: Outlinable): OutlineTarget =>
  ((what as Node).isNode ? { root: what as Node } : what as OutlineTarget);

/** `what`'s solid meshes outlined in `color` at `strength` (0 to 1), from now until it's changed; null: nothing.
 *  Given the same object or list each frame, nothing is made again. */
export function outline(what: Outlinable | readonly Outlinable[] | null, color = 0xff3030, strength = 1): void {
  const many = Array.isArray(what);
  if (!what || strength <= 0 || (many && !what.length)) {
    current = null;
    return;
  }
  if (current?.given !== what) {
    const targets = many ? (what as readonly Outlinable[]).map(targetOf) : [targetOf(what as Outlinable)];
    current = { targets, given: what, color: new Color(), strength };
  }
  current.color.setHex(color, LinearSRGBColorSpace);
  current.strength = Math.min(1, strength);
}

/** What's outlined now, its colour (as a hex) and how strongly, if anything (tools/lab measures it). */
export function outlinedLook(): { root: Node; color: number; strength: number } | null {
  if (!current) return null;
  const root = current.targets[0].root;
  return { root, color: current.color.getHex(LinearSRGBColorSpace), strength: current.strength };
}

/** Whether `material` draws a solid surface (not a glow, a shadow under it or anything else blended over it). */
function solid(material: Material): boolean {
  return material.visible && !material.transparent && material.blending === NormalBlending;
}

/** Whether every one of `object`'s parents up to the scene is shown. */
function shownUp(object: Node): boolean {
  for (let at: Node | null = object; at; at = at.parent) if (!at.visible) return false;
  return true;
}

/** The meshes `targets` are drawn by, each a solid one shown (a foe's pieces drawn as one are on the crowd's layer,
 *  which the outline draws as the page's did: no camera's layers are asked). */
function meshesOf(targets: readonly OutlineTarget[]): OutlinedMesh[] {
  const meshes: OutlinedMesh[] = [];
  for (const target of targets) {
    if (target.instance !== undefined) {
      meshes.push({ mesh: target.root as Mesh, instance: target.instance });
      continue;
    }
    if (!shownUp(target.root)) continue;
    target.root.traverseVisible((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (materials.some(solid)) meshes.push({ mesh });
    });
  }
  return meshes;
}

const box = new Box3();
const each = new Box3();
const corner = new Vec3();
const instanceMatrix = new Mat4();

/** `targets`' box in the world, into `box`. */
function boxOf(targets: readonly OutlineTarget[]): Box3 {
  box.makeEmpty();
  for (const target of targets) {
    if (target.instance === undefined) {
      box.union(each.setFromObject(target.root));
      continue;
    }
    const mesh = target.root as InstancedMesh;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    mesh.getMatrixAt(target.instance, instanceMatrix);
    box.union(each.copy(mesh.geometry.boundingBox!).applyMatrix4(instanceMatrix).applyMatrix4(mesh.matrixWorld));
  }
  return box;
}

/** The outlined thing's box on a frame `width` by `height` (pixels from its top left, within the frame), with `room`
 *  round it; the whole frame when it reaches behind the camera, none when it has no size. */
function boxOnScreen(targets: readonly OutlineTarget[], room: number, width: number, height: number) {
  const whole = { x: 0, y: 0, w: width, h: height };
  boxOf(targets);
  if (box.isEmpty()) return null;
  const camera = G.camera;
  let left = Infinity;
  let right = -Infinity;
  let bottom = Infinity;
  let top = -Infinity;
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    corner.applyMatrix4(camera.matrixWorldInverse);
    if (corner.z > -camera.near) return whole;
    corner.applyMatrix4(camera.projectionMatrix);
    left = Math.min(left, corner.x);
    right = Math.max(right, corner.x);
    bottom = Math.min(bottom, corner.y);
    top = Math.max(top, corner.y);
  }
  const x0 = Math.max(0, Math.floor((left * 0.5 + 0.5) * width - room));
  const x1 = Math.min(width, Math.ceil((right * 0.5 + 0.5) * width + room));
  const y0 = Math.max(0, Math.floor((0.5 - top * 0.5) * height - room));
  const y1 = Math.min(height, Math.ceil((0.5 - bottom * 0.5) * height + room));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Whether anything is outlined now. */
export function outlineShown(): boolean {
  return !!current && !current.targets.some((target) => !target.root.parent);
}

/** What's outlined handed to the engine for its next frame (none where `shown` is false: photo mode, the free
 *  camera's World labels off), its foes' unseen pieces placed first. */
export function sendOutline(shown: boolean): void {
  const look = current;
  if (!shown || !look || look.targets.some((target) => !target.root.parent)) {
    outlineForEngine(null);
    return;
  }
  // (a foe drawn as one leaves its pieces unplaced: placed for its mask)
  for (const target of look.targets) placeUnplaced(target.root);
  const f = frameRect();
  const px = uiScales.hud * G.renderer.getPixelRatio();
  const line = WIDTH * px;
  const glow = (WIDTH + GLOW) * px;
  const within = boxOnScreen(look.targets, glow + BOX_MARGIN, f.width, f.height);
  if (!within) {
    outlineForEngine(null);
    return;
  }
  outlineForEngine({
    meshes: meshesOf(look.targets),
    color: look.color,
    strength: look.strength,
    line,
    glow,
    box: within,
    frame: { width: f.width, height: f.height },
  });
}

/** The outline's warm-up at load: none (the engine makes its pipelines as it starts). Kept for the warm-ups that
 *  ask it, `roots` one of every foe and every biome's seats. */
export async function warmOutline(_roots: readonly Outlinable[],
  _options: { edge?: boolean; pause?: () => Promise<void>; sliceMs?: number } = {}): Promise<void> {}

/** The outline's compiles for `roots`: none, as `warmOutline` says; no materials to wait for. */
export function compileOutline(_roots: readonly Outlinable[], _options: { edge?: boolean } = {}): Set<Material> {
  return new Set();
}
