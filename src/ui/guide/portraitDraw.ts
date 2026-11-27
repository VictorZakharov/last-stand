// The guide's portraits staged and drawn by the engine (`portraits.ts` makes them, a piece a frame): a model at rest
// in a scene of its own, lit as a portrait, framed head to feet, drawn in the frame's own task before the frame
// (`sceneApart` in core/renderer.ts) at the frame's size, its middle square kept. The engine's canvas is opaque, so
// each is drawn against black and against white and matted, the backdrop's share of a pixel read from the two.
import {
  Box3, Color, DirectionalLight, HemisphereLight, Maths, Mesh, Node, PerspectiveCamera, Vec3, World,
} from '../../engine/api/index.ts';
import { drawRust, engineCanvas } from '../../engine';
import { PIPELINES } from '../../engine/pipelinesAside';
import { PLAIN_GRADE, type Grade } from '../../engine/globals';
import { particles } from '../../fx/particles';
import { G } from '../../state';
import type { Model } from '../../types';

/** the pictures' size (px): shown at up to half of it, crisp on a screen of 2 pixels a css px */
export const SIZE = 320;
/** where the camera stands: how far round from the foe's front (rad) and how far above level it looks down (rad) */
const VIEW = { round: 0.55, down: 0.12, fov: 28 };

/** A picture's scene and camera, and the camera's field of view for a square picture (deg). */
export interface Framed {
  scene: World;
  camera: PerspectiveCamera;
  fov: number;
}

/** The lights a portrait is drawn by: a warm key from the front right, a cool rim from behind, a dim fill. */
function lights(scene: World): void {
  scene.add(new HemisphereLight(0xcfd8ff, 0x2a1e14, 1.1));
  const key = new DirectionalLight(0xfff0dc, 2.6);
  key.position.set(3, 5, 6);
  scene.add(key);
  const rim = new DirectionalLight(0x9fc4ff, 2.2);
  rim.position.set(-4, 3, -5);
  scene.add(rim);
}

/** The box round what's shown of `root` (a hero's model holds every piece of gear he could wear, hidden). */
function shownBox(root: Node): Box3 {
  const box = new Box3(), part = new Box3();
  root.traverseVisible((o) => {
    const geo = (o as Mesh).geometry;
    if (!(o as Mesh).isMesh || !geo) return;
    if (!geo.boundingBox) geo.computeBoundingBox();
    box.union(part.copy(geo.boundingBox!).applyMatrix4(o.matrixWorld));
  });
  return box;
}

/** The model at rest, a moment into its idle, in a scene of its own, and a camera framing it head to feet from a
 *  little round its front. */
export function staged(model: Model): { scene: World; camera: PerspectiveCamera } {
  for (let i = 0; i < 3; i++) model.animate({ t: 0.4 + i * 0.1, dt: 0.1, phase: 0, move: 0, action: null, hit: 0, dead: -1 });
  const scene = new World();
  lights(scene);
  scene.add(model.root);
  model.root.updateMatrixWorld(true);
  const box = shownBox(model.root);
  const size = box.getSize(new Vec3()), mid = box.getCenter(new Vec3());
  const camera = new PerspectiveCamera(VIEW.fov, 1, 0.05, 200);
  // (far enough that the taller of its height and its width fills the frame, with a margin)
  const fit = Math.max(size.y, Math.hypot(size.x, size.z) * 0.85) * 0.56;
  const dist = fit / Math.tan(Maths.degToRad(VIEW.fov / 2));
  camera.position.set(
    mid.x + Math.sin(VIEW.round) * Math.cos(VIEW.down) * dist,
    mid.y + Math.sin(VIEW.down) * dist,
    mid.z + Math.cos(VIEW.round) * Math.cos(VIEW.down) * dist,
  );
  camera.lookAt(mid);
  return { scene, camera };
}

/** The grade a picture is drawn with: the frame's own (its samples, its bloom's share, its level: any of them
 *  changed makes the engine's pipelines or targets again, and the frame after it changes them back), with the eye
 *  held, no vignette, nothing laid over the view (his arms, a blow's red, low health's grey and blood, photo mode's
 *  look). */
function portraitGrade(graded: Grade): Grade {
  return {
    ...graded, small: PLAIN_GRADE.small, large: PLAIN_GRADE.large, vignette: 0, hurt: 0, low: 0, arms: null,
    look: graded.look && { ...graded.look, on: false },
    edges: graded.edges && { ...graded.edges, reach: 0 },
  };
}
/** the backdrops a picture is drawn against, its alpha read from the two (the engine's canvas is opaque) */
const BLACK = new Color(0x000000);
const WHITE = new Color(0xffffff);

/** `draw` run with the game's particles' pools held empty: the engine draws them with whatever scene it's handed
 *  (`engine/sprites.ts`), and the lobby's motes would be dots on the picture. */
function withoutParticles(draw: () => void): void {
  const pools = [particles.glow, particles.smoke];
  const counts = pools.map((pool) => pool.count);
  for (const pool of pools) pool.count = 0;
  try { draw(); } finally {
    pools.forEach((pool, k) => (pool.count = counts[k]));
  }
}

/** The square in the middle of the engine's frame, `width` by `height`, copied into a canvas of the pictures' size. */
function middleSquare(engine: HTMLCanvasElement, width: number, height: number): HTMLCanvasElement {
  const side = Math.min(width, height);
  const pic = document.createElement('canvas');
  pic.width = pic.height = SIZE;
  pic.getContext('2d')?.drawImage(engine, (width - side) / 2, (height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  return pic;
}

/** under this share of the backdrop showing through a pixel is solid; over `1 - SOLID`, the backdrop alone */
const SOLID = 0.03;

/**
 * The picture drawn against black and against white, made one with an alpha of its own: where the two differ the
 * backdrop shows through, by as much as they differ against how far apart the backdrops were drawn (read at a
 * corner, as the grade drew them). A pixel's colour is what's left of it on black with the backdrop taken out.
 */
function matted(onBlack: HTMLCanvasElement, onWhite: HTMLCanvasElement): HTMLCanvasElement {
  const black = onBlack.getContext('2d')!.getImageData(0, 0, SIZE, SIZE);
  const white = onWhite.getContext('2d')!.getImageData(0, 0, SIZE, SIZE).data;
  const dark = black.data;
  const apart = [0, 1, 2].map((channel) => Math.max(1, white[channel] - dark[channel]));
  for (let at = 0; at < dark.length; at += 4) {
    let through = 0;
    for (let channel = 0; channel < 3; channel++) through += (white[at + channel] - dark[at + channel]) / apart[channel];
    through = Math.min(1, Math.max(0, through / 3));
    if (through < SOLID) through = 0;
    if (through > 1 - SOLID) through = 1;
    const alpha = 1 - through;
    for (let channel = 0; channel < 3; channel++) {
      const left = dark[at + channel] - through * dark[channel];
      dark[at + channel] = alpha > 0 ? Math.min(255, Math.max(0, left / alpha)) : 0;
    }
    dark[at + 3] = Math.round(alpha * 255);
  }
  const pic = document.createElement('canvas');
  pic.width = pic.height = SIZE;
  pic.getContext('2d')!.putImageData(black, 0, 0);
  return pic;
}

/** `m` drawn by the engine against `backdrop` at the frame's `width` by `height`, its middle square copied. */
function drawnAgainst(m: Framed, backdrop: Color, width: number, height: number,
  grade: Grade): HTMLCanvasElement | null {
  const engine = engineCanvas();
  if (!engine) return null;
  m.scene.background = backdrop;
  withoutParticles(() => drawRust(m.scene, m.camera, G.time, width, height, G.renderer, grade));
  return middleSquare(engine, width, height);
}

/** `m`'s camera made for a frame `width` by `height` whose middle square is the picture. */
function framedFor(m: Framed, width: number, height: number): void {
  const half = Maths.degToRad(m.fov / 2);
  m.camera.aspect = width / height;
  // (a frame taller than it's wide: the square's height is its width, so the view is widened to keep it)
  m.camera.fov = height > width ? Maths.radToDeg(2 * Math.atan(Math.tan(half) * height / width)) : m.fov;
  m.camera.updateProjectionMatrix();
}

/**
 * `m`'s picture drawn by the engine, in the frame's own task before the frame itself (`sceneApart`): against black
 * and white at the frame's size, and matted. Null while a draw was left out for a pipeline still compiling (the
 * engine makes a material's pipelines aside on the browser's time: drawn again next frame), or where it can't be.
 */
export function drawnNow(m: Framed, width: number, height: number, graded: Grade): HTMLCanvasElement | null {
  framedFor(m, width, height);
  const grade = portraitGrade(graded);
  const unready = PIPELINES.unready;
  const onBlack = drawnAgainst(m, BLACK, width, height, grade);
  const onWhite = drawnAgainst(m, WHITE, width, height, grade);
  if (!onBlack || !onWhite || PIPELINES.unready > unready) return null;
  return matted(onBlack, onWhite);
}
