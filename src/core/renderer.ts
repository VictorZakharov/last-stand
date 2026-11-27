// The frame: the page's canvas (the engine's, core/screen.ts: three's renderer is gone, #973), the frame's grade
// values handed to the engine (`src/engine`), and the camera rig: top-down, over the shoulder or first person.
import {
  Color, floats, Geometry, Light, Mat3, Maths, Node, OrthoCamera, PerspectiveCamera, Quat,
  Texture, Vec2, Vec3, World,
} from '../engine/api/index.ts';
import { aimSight } from './sight';
import { setWholeView, wholeView } from './wholeView';
import { GameScreen } from './screen';
import { G } from '../state';
import { bootRust, drawRust, rustFrame, rustPlain, rustSamples, RUST } from '../engine';
import { perfClock } from './perfClock';
import { sunShadowStill } from '../world/props';
import { moonShadowKept } from '../world/moonShadow';
import { groundHeight } from '../world/ground';
import { keepOffPosts, postsReach } from './nearPosts';
import { CAMERA } from '../data/balance';
import { clamp, damp } from '../util';
import { sortBlendedFrom, updateSeeThrough } from './seeThrough';
import { builtOpening, fenceOpened, holeOpening, propsHideHim, propsOpening } from './heroHidden';
import type { QualityPreset } from '../data/quality';
import { hdrLevels } from './hdr';
import { bloodMask, fitBloodMask } from './bloodEdges';
import { ARMS_LAYER, WARM_LAYER, GHOST_COUNT_LAYER } from './layers';
import { gpuFence, setFrameFence } from './frameLoop';
import { engineWorkDone } from '../engine/pipelinesAside';

/** Final colour: above HI_KNEE the brightest channel eases towards HI_CAP (hue kept); in HDR towards as much more
 *  as the peak has room over the paper white (`uCap`), so the highlights it grows aren't all held at SDR's. */
const HI_KNEE = 1, HI_CAP = 2;
/** HDR (core/hdr.ts): the share of white (as shown) under which the frame shows as on an SDR screen; above it the
 *  highlights grow towards the peak */
export const HDR_KNEE = 0.5;
/**
 * The eye adapts to how bright an area is, at two scales: where the average light over a small area (a 16x9
 * grid of the frame) or a large one (4x3) is over its target, the light above a base is compressed on a
 * power curve that brings that average down to the target. The dim part of every pixel is kept, so the ground
 * round a bright effect never darkens into a shadow, and a curve (not a scale) keeps a glow's falloff instead
 * of flattening it into a disc. Measured after bloom, which then still sees the full light (the eye sees the
 * halos too). The targets [small, large] sit just above each view's ordinary scenes (the close views see the
 * ground the staff light lights up close; the top view's is for its full distance and eases towards `lobby`
 * as it zooms in), which they leave untouched.
 */
const ADAPT = { top: [0.35, 0.11], lobby: [0.45, 0.13], third: [1.2, 0.26], first: [0.5, 0.13] } as const;
/**
 * The top view's large target (the lobby's too, which it zooms in to) is for the night crypt; a brighter
 * biome's ordinary scenes sit higher (the daylit forest's 4x3 areas average about 2.3 times the crypt's), so
 * the biome scales it (`BiomeLook.adapt`).
 * At the crypt's target the forest sat right at it doing nothing, and any effect tipped the area round it
 * over: all its ground compressed into a flat grey veil. (The small target is local enough, and the close
 * views look at the sky, which needs their targets as they are.)
 */
let adaptScale = 1;
export function setAdaptScale(k: number): void { adaptScale = k; }
/** `?adapt=0` holds the adaptation off (a studio render measured against a picture: its colours mustn't follow how
 *  much of the frame is dark hair) */
const NO_ADAPT = typeof location !== 'undefined' && /[?&]adapt=0/.test(location.search);
/** the adaptation held off from now on, or no longer, as `?adapt=0` holds it (the lab's haze draws a frame both ways) */
let adaptHeld = NO_ADAPT;
export function holdAdaptation(off: boolean): void { adaptHeld = off || NO_ADAPT; }
/** bloom left out from now on, or no longer (the lab's trail draws where an effect is, not its glow round it) */
let bloomHeld = false;
export function holdBloom(off: boolean): void {
  bloomHeld = off;
}
/** the share of the scene's pixels each way bloom draws at (`setBloomShare`) */
let bloomShare = 1;
/**
 * Bloom drawn at `share` of the scene's pixels each way (Low's half; from play, an S25 Edge's Profile at full res:
 * bloom 6 ms of an 80 ms frame): its targets sized again, so nothing compiles. Each of its levels is then as wide on
 * the screen as the next one up was.
 */
export function setBloomShare(share: number): void {
  bloomShare = share;
}
/** bloom's strength as last set (the Rust engine is told it against the game's own) */
let bloomStrengthNow = 0.85;
/** Bloom's strength (photo mode's, `core/photoLook.ts`; `BLOOM_STRENGTH` the game's own): a uniform, so nothing
 *  compiles. */
export function setBloomStrength(strength: number): void {
  bloomStrengthNow = strength;
}
/** Whether bloom is drawn now: Very low draws none, and a harness may hold it off. */
export const bloomDrawn = (): boolean => !bloomHeld && bloomShare > 0;

/** The pixels bloom's passes draw into targets of this module's a frame (the lab's): none, as it has no passes. */
export function bloomPixels(): number {
  return 0;
}
/** bloom's strength as the game draws it */
export const BLOOM_STRENGTH = 0.85;
/**
 * The grade's values, each `{ value }`: set here each frame and by photo mode (core/photoLook.ts), handed to the
 * engine as it draws a frame (`render`).
 */
const grade = {
  uniforms: {
    uTime: { value: 0 },
    uHurt: { value: 0 },
    uVignette: { value: 1.05 },
    uLow: { value: 0 }, uBeat: { value: 0 }, tBlood: { value: null as Texture | null },
    uSmall: { value: ADAPT.top[0] as number }, uLarge: { value: ADAPT.top[1] as number },
    uCap: { value: HI_CAP - HI_KNEE },
    uHdr: { value: 0 }, uPaper: { value: 1 }, uPeak: { value: 1 },
    // photo mode's look (core/photoLook.ts), read only while it's on (`uPhoto`): neutral and left out otherwise
    uPhoto: { value: 0 }, uExposure: { value: 1 }, uContrast: { value: 1 }, uSaturation: { value: 1 },
    uFilterLo: { value: new Mat3() }, uFilterHi: { value: new Mat3() }, uFilterMix: { value: 0 },
    uBlur: { value: 0 }, uFocusY: { value: 0.5 }, uFocusBand: { value: 0.1 },
  },
};
/** The grade's values (`grade`): photo mode's look sets them. */
export const gradeUniforms = (): typeof grade.uniforms => grade.uniforms;

/** The scene's size and samples, as three's render target for it held them: nothing is drawn into it (the scene is
 *  the engine's); what a warm-up is handed and what sizes points by. */
export interface SceneTarget { width: number; height: number; samples: number }

let gl: GameScreen;
const sceneRT: SceneTarget = { width: 1, height: 1, samples: 4 };

/** A pass's full-screen triangle as three's full-screen quad has it, to compile a pass's material on: positions and
 *  uvs alone, as normals would make another program. Seen through `passCamera`. */
export function passTriangle(): Geometry {
  const quad = new Geometry();
  quad.setAttribute('position', floats([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
  quad.setAttribute('uv', floats([0, 2, 0, 0, 2, 0], 2));
  return quad;
}
/** what a pass's triangle is seen through, as three's full-screen quad's */
export const passCamera = new OrthoCamera(-1, 1, 1, -1, 0, 1);

const rig = {
  /** the floor the view from above looks at, eased as he climbs */
  floor: 0,
  zoom: 1,
  targetZoom: 1,
  shake: 0,
  /** the field of view's widening for speed (kickFov), and what it eases to this frame */
  kick: 0, kickTo: 0,
  /** the view's roll through the eyes (rollView, rad), and what it eases to this frame */
  roll: 0, rollTo: 0,
  /** the eyes' lift (liftView, m) and the view's tip down (tipView, rad), and what each eases to this frame */
  lift: 0, liftTo: 0, tip: 0, tipTo: 0,
  focus: new Vec3(),
  hurt: 0,
  yaw: 0,          // rotation around the focus; 0 looks toward -Z
  targetYaw: 0,
  /** the top-down view's yaw (its middle-drag orbit), kept while a close view turns the camera */
  topYaw: 0,
  view: 'top' as ViewMode,
  fromView: 'top' as ViewMode,
  look: 0,         // close views: pitch below the horizon
  boom: CAMERA.third.boom,
  targetBoom: CAMERA.third.boom,
  /** a view switch glides from the pose the camera had (blend 0) to the new view's (1) */
  blend: 1,
  fromPos: new Vec3(),
  fromQuat: new Quat(),
  fromFov: CAMERA.fov,
};

/** the arms camera's near and far planes (m): they're within reach */
const ARMS_NEAR = 0.03, ARMS_FAR = 6;
/**
 * Through the eyes, a hero's arms and what they hold can be drawn on a layer of their own (`ARMS_LAYER`) by a camera
 * of their own (`drawArms`), placed as the world's but with a narrower view, over the frame the world drew, as games
 * draw a first-person weapon: drawn through the world's 66 degrees (98 across on a wide screen), a weapon at the
 * frame's edge leaned in towards the middle, and a fist near the camera looked huge. The world's lights light them
 * too: every light is on their layer as well (`lightThePasses`).
 */
const armsCam = new PerspectiveCamera();
armsCam.layers.set(ARMS_LAYER);
/** the arms camera's field of view (vertical, degrees) while it draws them, none while the world's camera does */
let armsFov: number | null = null;

/**
 * Every light of `scene` on the arms' layer and the warm-ups' as well, from the moment it's added: a light missing
 * from a pass changes its lights' count, and every material it draws compiles again. (Put on it once, as the arms
 * were first drawn, a hero built afresh by a class switch brought his own light in after, and his arms compiled
 * mid-run: #268.)
 */
function lightThePasses(scene: World): void {
  const onPasses = (o: Node) => {
    if (!(o as Light).isLight) return;
    o.layers.enable(ARMS_LAYER);
    o.layers.enable(WARM_LAYER);
    // (the count of ghosts too: three keys even an unlit program by the lights in view, and one counted with none
    // was a program of its own, made at its first draw)
    o.layers.enable(GHOST_COUNT_LAYER);
  };
  scene.traverse(onPasses);
  // (the event's child is a node: the world's own events are typed loosely)
  scene.addEventListener('childadded', ({ child }) => (child as Node).traverse(onPasses));
}

/** The arms layer drawn by its own camera at `fov` (vertical, degrees) from this frame on, or no longer (null). */
export function drawArms(fov: number | null): void {
  armsFov = fov;
}

/** The camera the arms are seen through this frame: their own while it draws them, else the world's. */
export function armsCamera(): PerspectiveCamera {
  if (armsFov === null) return G.camera as PerspectiveCamera;
  placeArmsCamera();
  return armsCam;
}

/** Where a point of what the arms hold (world, as posed) is seen in the world's view, into `out`: through their own
 *  camera it shows where the world's shows a point as far ahead and as far across the view by the views' widths, so
 *  what leaves from it (a skill cast from the weapon's tip) leaves where the weapon is seen. The point itself while the
 *  world's camera draws the arms. */
export function seenFromArms(p: Vec3, out: Vec3): Vec3 {
  if (armsFov === null) return out.copy(p);
  placeArmsCamera();
  const cam = G.camera as PerspectiveCamera;
  const k = Math.tan((cam.fov * Math.PI) / 360) / Math.tan((armsCam.fov * Math.PI) / 360);
  const local = armsCam.worldToLocal(out.copy(p));
  local.x *= k;
  local.y *= k;
  return armsCam.localToWorld(local);
}

/** How many times larger what the arms' own camera draws is seen than the world's camera would show it at the same
 *  depth (1 while the world's camera draws the arms): what is sized against the hand in view takes it. */
export function armsScale(): number {
  if (armsFov === null) return 1;
  const cam = G.camera as PerspectiveCamera;
  return Math.tan((cam.fov * Math.PI) / 360) / Math.tan((armsFov * Math.PI) / 360);
}

/** The arms camera where the world's is, looking as it looks, its own view. */
function placeArmsCamera(): void {
  const cam = G.camera as PerspectiveCamera;
  cam.updateMatrixWorld();
  armsCam.position.copy(cam.position);
  armsCam.quaternion.copy(cam.quaternion);
  armsCam.aspect = cam.aspect;
  armsCam.fov = armsFov ?? cam.fov;
  armsCam.near = ARMS_NEAR;
  armsCam.far = ARMS_FAR;
  armsCam.updateProjectionMatrix();
  armsCam.updateMatrixWorld();
}

/** the frames over which the sun's shadow is drawn every other one on WebGPU: from about 90 a second (ms a frame) */
const SHADOW_IN_TURNS_MS = 1000 / 65;
/** how much of the frames' mean a new frame moves (about the last 10 frames') */
const FRAME_MEAN_SHARE = 0.1;
const SHADOW_EVERY_FRAME = typeof location !== 'undefined' && /[?&]shadowEvery=1/.test(location.search);
let lastFrameAt = 0;
let frameMean = SHADOW_IN_TURNS_MS;
let shadowDrawnLast = false;
/** whether the quality level draws the sun's shadow every other frame whatever the frame rate (Very low) */
let shadowInTurns = false;
/** The sun's shadow drawn every other frame (`on`, a quality level's), or as the frame rate has it. */
export function setShadowInTurns(on: boolean): void { shadowInTurns = on; }
/** For a harness: whether the level draws the sun's shadow in turns, and the bloom's share of the pixels. */
export const shadowInTurnsNow = (): boolean => shadowInTurns;
export const bloomShareNow = (): number => bloomShare;

/**
 * The sun's shadow drawn every other frame while the frames come fast: its pass was a sixth of the frame's JS on WebGPU,
 * and at 144 a second its 72 show no lag. Told by the frames' mean: by each frame's own time, a frame that missed the
 * screen's refresh (13.9 ms at 144 Hz) had the next draw the shadow too, which missed it again, and the game stayed at
 * half the screen's rate with the shadow in every frame. A 60 Hz screen's stay whole. (`?shadowEvery=1` draws it every
 * frame, to compare.) A level may ask for it in turns at any frame rate (Very low, `setShadowInTurns`).
 */
function sunShadowInTurns(): void {
  const now = performance.now();
  frameMean += (Math.min(now - lastFrameAt, 2 * SHADOW_IN_TURNS_MS) - frameMean) * FRAME_MEAN_SHARE;
  const fast = frameMean < SHADOW_IN_TURNS_MS;
  lastFrameAt = now;
  const turns = shadowInTurns || fast;
  const skip = turns && shadowDrawnLast && !SHADOW_EVERY_FRAME;
  shadowDrawnLast = !skip;
  // (where the sun's shadow is the still world's alone, it's drawn with the still shadows, by no frame of its own)
  // (nor where its map is kept, the village's: set to draw here every frame, the whole map was drawn again, every
  // tree, the palisade and the hero, 430k triangles of a frame's 1.3M on High, and the kept copy then laid over it)
  G.arena.moon.shadow.autoUpdate = !skip && !sunShadowStill() && !moonShadowKept();
}

/** top-down (the default), over the shoulder, or through the character's eyes */
export type ViewMode = 'top' | 'third' | 'first';
export const VIEWS: ViewMode[] = ['top', 'third', 'first'];

/** the side of the largest texture the overlays' atlas is sized within (WebGPU's least limit is 8192) */
const MOST_TEXTURE_SIDE = 8192;

/** The engine made on the page's canvas in `container`, and the scene and camera the game is drawn from. (Its
 *  `_hdrAllowed` is unread: the engine's frame is SDR, core/AGENTS.md's HDR output.) */
export async function initRenderer(container: HTMLElement, _hdrAllowed: boolean) {
  const canvas = await bootRust(container);
  const renderer = gl = new GameScreen(canvas, MOST_TEXTURE_SIDE);
  const cr = canvasRatio();
  const cw = window.innerWidth, ch = window.innerHeight;
  renderer.setPixelRatio(cr);
  renderer.setSize(cw, ch);
  canvasFitted.w = cw; canvasFitted.h = ch; canvasFitted.pr = cr;
  // (each uncapped frame waits for the GPU to be done with all but the last frame: the engine's queue, which draws
  // it. Fenced on three's own device, the fence waited for the overlays' canvas alone, never the engine's frame.)
  setFrameFence(gpuFence({ onSubmittedWorkDone: engineWorkDone }));

  const scene = new World();
  scene.background = new Color(0x030307);
  lightThePasses(scene);
  const camera = new PerspectiveCamera(CAMERA.fov, window.innerWidth / window.innerHeight, 0.5, 300);

  const size = sceneSize(new Vec2());
  // (never drawn into: it holds the scene's size and samples for what reads them, `pointScale`, `sceneSamples`)
  sceneRT.width = size.x;
  sceneRT.height = size.y;
  grade.uniforms.tBlood.value = bloodMask;
  G.scene = scene; G.camera = camera; G.renderer = renderer;
  window.addEventListener('resize', fitViewport);
  fitViewport();
  return { scene, camera, renderer };
}

/** The frame's box within the canvas (physical pixels): the whole of it, the window's, so `left`, `top` and `bottom`
 *  are 0. */
export interface FrameRect { left: number; top: number; bottom: number; width: number; height: number }

/** the window size, device pixel ratio, and target canvas CSS size last fitted */
const fitted = { w: 0, h: 0, dpr: 0, cw: 0, ch: 0 };
/** the CSS size and pixel ratio the backing canvas was last allocated at */
const canvasFitted = { w: 0, h: 0, pr: 0 };

/** The frame's box on the screen, in physical pixels: the window's whole. */
export function frameRect(): FrameRect {
  const pr = gl.getPixelRatio();
  const width = Math.floor((fitted.w || window.innerWidth) * pr);
  const height = Math.floor((fitted.h || window.innerHeight) * pr);
  return { left: 0, top: 0, bottom: 0, width, height };
}

/** For `lab resize`: the canvas and the viewport fitted again now. (The canvas is the window's own on this renderer,
 *  whatever is asked: a screen-sized one was the WebGL renderer's, on touch.) */
export function holdScreenCanvas(_on: boolean | null): void {
  fitViewport();
}
/** the most pixels the scene renders: the quality's, and Auto's budget (core/quality.ts) */
let pixelCap = Infinity;
/** the MSAA samples the quality level asks for, at one pixel per css px (`samplesOn` divides them by the screen's) */
let askedSamples = 0;
/**
 * The MSAA samples on a screen of `ratio` pixels per css px: the level's divided by it, to 4, 2 or none. A dense
 * screen's pixels are already as fine as its samples would make an edge, and its samples cost the most: High's 4
 * at a ratio of 3 is 2 at 1.5 and none at 3 (a laptop's 4K panel at 300% drew 6.1 Mpx with 4 samples a pixel, its
 * integrated GPU's frame 119 ms, trace 11CW-PY3R). The share of an edge smoothed per css px stays about the same.
 */
function samplesOn(asked: number, ratio: number): number {
  const share = asked / ratio;
  if (share >= 4) return 4;
  return share >= 2 ? 2 : 0;
}
/** Sets the scene's MSAA to the level's samples on this screen: the engine's. */
function fitSamples(): void {
  const samples = samplesOn(askedSamples, canvasRatio());
  sceneRT.samples = samples;
  rustSamples(samples);
}
/** The MSAA samples the scene renders with now. */
export const sceneSamples = (): number => sceneRT.samples;
let pixelBudget = Infinity;
/** a scene of fewer pixels than the screen's renders a share of its pixels each way rounded down to a multiple of
 *  this (a power of two: the share times the screen's pixels comes out the same whatever the OS's scaling) */
const SHARE_STEP = 1 / 256;
/**
 * The canvas's pixels per css px: the screen's own. What is rendered is counted in the screen's pixels, never by the
 * OS's scaling (a 4K screen at 300% is a window of 1280x720 css px, at 100% of 3840x2160: both render the same).
 */
const screenRatio = (): number => window.devicePixelRatio || 1;
const canvasRatio = screenRatio;
/** The screen's pixels under the window. */
export function screenPixels(): number {
  const ratio = screenRatio();
  return Math.floor(window.innerWidth * ratio) * Math.floor(window.innerHeight * ratio);
}
/** The most pixels the scene renders now: the screen's, within the quality's and Auto's budget. */
export const scenePixels = (): number =>
  Math.min(screenPixels() * resolutionShare * resolutionShare, pixelCap, pixelBudget);
/**
 * The player's Resolution (the pause menu's, `setResolution` in core/quality.ts): the share of the screen's pixels each
 * way the scene renders, 1 by default. A choice the player makes alone: no quality level and never Auto lowers it
 * (from play, "I want to run the game at full phone res"; and, for a device that still lagged at Very low, "resolution
 * reducing ... 100%, 75, 50 and so on").
 */
let resolutionShare = 1;
/** The share of the screen's pixels each way the scene renders: all of them, or as many as `scenePixels` gives. */
function sceneShare(): number {
  const most = Math.min(pixelCap, pixelBudget);
  const screen = screenPixels() * resolutionShare * resolutionShare;
  const budgeted = most >= screen ? 1 : Math.sqrt(most / screen);
  const share = budgeted * resolutionShare;
  if (share >= 1) return 1;
  return Math.max(SHARE_STEP, Math.floor(share / SHARE_STEP) * SHARE_STEP);
}
/** The scene drawn at `share` of the screen's pixels each way (the player's Resolution), live: the scene's targets sized
 *  again, no shader changed. */
export function setResolutionShare(share: number): void {
  resolutionShare = Math.min(1, Math.max(SHARE_STEP, share));
  if (applySceneRatio()) fitSceneTarget();
}
/** The scene's pixels per css px (the last pass scales it up to the canvas). */
export const sceneRatio = (): number => screenRatio() * sceneShare();
/** The scene's render size in pixels (the canvas's at the scene's own ratio). */
export function sceneSize(out: Vec2): Vec2 {
  const r = sceneRatio();
  return out.set(Math.floor(window.innerWidth * r), Math.floor(window.innerHeight * r));
}
/**
 * Fit the canvas, render targets and camera to the window. Runs on resize and every frame, as
 * moving the window to another monitor can change the pixel ratio without a resize event, and can
 * report a zero size on the way: that would leave zero-sized render targets (a black screen) until
 * the next resize, so the last real size stays. Returns whether anything changed.
 */
function fitViewport(): boolean {
  const w = window.innerWidth, h = window.innerHeight, dpr = window.devicePixelRatio || 1;
  if (w < 1 || h < 1) return false;
  const cr = canvasRatio();
  const cw = w, ch = h;
  if (w === fitted.w && h === fitted.h && dpr === fitted.dpr && cw === fitted.cw && ch === fitted.ch) return false;
  fitted.w = w; fitted.h = h; fitted.dpr = dpr; fitted.cw = cw; fitted.ch = ch;
  G.camera.aspect = w / h;
  G.camera.updateProjectionMatrix();
  if (cw !== canvasFitted.w || ch !== canvasFitted.h || cr !== canvasFitted.pr) {
    if (cr !== gl.getPixelRatio()) gl.setPixelRatio(cr);
    gl.setSize(cw, ch);
    canvasFitted.w = cw; canvasFitted.h = ch; canvasFitted.pr = cr;
  }
  applySceneRatio();
  fitSceneTarget();
  return true;
}

/** The target that holds the scene's size and samples (what a warm-up is handed): nothing is drawn into it, the
 *  scene being the engine's. */
export const sceneTarget = (): SceneTarget => sceneRT;

/** What a point's size (m) over its distance is multiplied by for its size in the scene's pixels: the scene's
 *  target's height over the view's height 1 m out. (Sized by the canvas's height, a point was as many times too
 *  wide as the canvas has more pixels than the scene, wherever the quality caps the scene's: 3 times as wide on
 *  #243's phone, 9 times the pixels to fill.) */
export const pointScale = (): number => sceneRT.height / (2 * Math.tan(Maths.degToRad(G.camera.fov) / 2));

/** the scene's ratio its target was last sized at */
let appliedSceneRatio = 0;
/** Takes the scene's ratio as it is now; whether it changed. */
function applySceneRatio(): boolean {
  const r = sceneRatio();
  if (r === appliedSceneRatio) return false;
  appliedSceneRatio = r;
  return true;
}

const _size = new Vec2();
function fitSceneTarget(): void {
  sceneSize(_size);
  sceneRT.width = _size.x;
  sceneRT.height = _size.y;
}

/** whether the level in use has the plain lit shading (Low and Very low: `plainLit`), for the Rust engine's */
let liteLevel = false;
/** the level's least caster of the sun's shadow (m, its `minCasterRadius`), for the Rust engine's */
let casterLeast = 0;
/** Apply the render-cost settings of a quality preset, live, the scene rendering `budget` pixels at most (Auto's).
 *  None of them change shader variants. */
export function setRenderQuality(p: QualityPreset, budget = Infinity): void {
  liteLevel = p.plainLit;
  rustPlain(liteLevel);
  casterLeast = p.minCasterRadius;
  pixelCap = p.pixels;
  pixelBudget = budget;
  // (the canvas keeps the screen's pixels: the scene alone renders fewer)
  if (applySceneRatio()) fitSceneTarget();
  // a render target re-initialises with the new sample count on its next use
  askedSamples = p.msaa;
  fitSamples();
}

export function addShake(amount: number): void { rig.shake = Math.min(1.2, rig.shake + amount); }
/** Widen the close views' field of view by `deg` while called each frame (a rush's speed): it eases in
 *  and back out. */
export function kickFov(deg: number): void { rig.kickTo = Math.max(rig.kickTo, deg); }
/** Roll the view through the eyes by `rad` (+ his head tipped to his left) while called each frame (a punch's turn
 *  of the shoulders behind it): it eases in and back out. About the line of sight, so the aim stays where it is. */
export function rollView(rad: number): void { rig.rollTo = rad; }
/** Lift the eyes by `m` (down for less than 0) while called each frame, the view through them alone: a leap's rise
 *  and fall, a landing's give in the knees. Eased in quickly and back out. */
export function liftView(m: number): void { rig.liftTo = m; }
/** Tip the view through the eyes down by `rad` while called each frame (a leap coming down onto what's under it): it
 *  eases in and back out, the aim going with it and back. */
export function tipView(rad: number): void { rig.tipTo = rad; }
export function flashHurt(amount: number): void { rig.hurt = Math.min(1, rig.hurt + amount); }
/** How near to nothing the local hero's Health is shown (0 not at all, 1 nothing left) and the heart's beat (core/lowLife.ts). */
export function setLowLife(low: number, beat: number): void { grade.uniforms.uLow.value = low; grade.uniforms.uBeat.value = beat; }
export function setZoom(z: number): void { rig.targetZoom = clamp(z, zoomLeast(), zoomMost()); }

/** the top view's zoom held to a narrower range (a house's room: game/rooms.ts), and the player's own zoom as it was
 *  when it was held, given back as it's let go */
let zoomHeld: { least: number; most: number; own: number } | null = null;
const zoomLeast = (): number => zoomHeld?.least ?? CAMERA.minZoom;
const zoomMost = (): number => zoomHeld?.most ?? CAMERA.maxZoom;
/**
 * The top view's zoom held between `least` and `most` (the wheel and a pinch kept to it, the zoom brought into it at
 * once), or let go (null): the zoom the player had before given back exactly, unless `giveBack` is false (a run's
 * start sets its own). From play, in a room: "zoom when inside a room should be locked, shouldn't be able to zoom out
 * that much": zoomed out, the room stood small in the middle of the screen, black all round its cut away walls.
 */
export function holdZoom(range: { least: number; most: number } | null, giveBack = true): void {
  if (range) {
    const own = zoomHeld?.own ?? rig.targetZoom;
    zoomHeld = { ...range, own };
    rig.targetZoom = clamp(rig.targetZoom, range.least, range.most);
    rig.zoom = clamp(rig.zoom, range.least, range.most);
    return;
  }
  if (!zoomHeld) return;
  const own = zoomHeld.own;
  zoomHeld = null;
  if (giveBack) rig.targetZoom = rig.zoom = own;
}
/** The range the top view's zoom is held to now, or null (tools/lab `houses`). */
export const zoomHeldTo = (): { least: number; most: number } | null => (zoomHeld ? { least: zoomHeld.least, most: zoomHeld.most } : null);
/** The top view's zoom it's coming to (tools/lab `houses`). */
export const cameraTargetZoom = (): number => rig.targetZoom;
/** 
otches = mouse-wheel steps (positive = zoom out). */
/**
 * The close views' lens zoom (#811, from the owner: "implement zoom on RMB in village when not in training grounds"):
 * the lens narrowed to `LENS.zoom` of its view while it's asked for, eased in and out at `LENS.rate`. Asked by the
 * village outside its yard, where the right mouse button casts nothing: held down by it (`setLens`), or through the
 * eyes by the wheel forward or a pinch outwards, back or inwards letting it go (`zoomBy`: there they did nothing).
 */
const LENS = { zoom: 0.55, rate: 10 };
let lensAllowed = false, lensByMouse = false, lensByStep = false, lens = 1;
/** The lens zoom allowed here (`allowed`) and asked by the mouse (`mouse`); let go wherever it isn't allowed. */
export function setLens(allowed: boolean, mouse: boolean): void {
  lensAllowed = allowed;
  lensByMouse = allowed && mouse;
  if (!allowed) lensByStep = false;
}
/** How far the lens is narrowed now (1: not at all; a harness reads it). */
export const lensNow = (): number => lens;

export function zoomBy(notches: number): void {
  // (through the eyes where the lens may zoom, the wheel forward or a pinch outwards zooms it in, back or inwards out)
  if (rig.view === 'first' && lensAllowed && notches !== 0) { lensByStep = notches < 0; return; }
  // over the shoulder the wheel pulls the camera in or out; through the eyes it does nothing
  if (rig.view === 'third') { rig.targetBoom = clamp(rig.targetBoom * CAMERA.zoomStep ** notches, CAMERA.third.minBoom, CAMERA.third.maxBoom); return; }
  if (rig.view !== 'top') return;
  rig.targetZoom = clamp(rig.targetZoom * CAMERA.zoomStep ** notches, zoomLeast(), zoomMost()); }

/** Middle-drag orbit: dragging right turns the world right (the camera swings left). */
export function orbitBy(px: number): void { if (rig.view === 'top') rig.targetYaw -= px * CAMERA.orbitSpeed; }
/** Turns the camera round what it follows by `rad` in any view (watching a co-op run: `game/spectate.ts`). */
export function turnBy(rad: number): void {
  rig.targetYaw += rad;
  if (rig.view !== 'top') rig.yaw = rig.targetYaw;
}
/** Mouse look in the close views: right turns right, down looks down. */
export function lookBy(dx: number, dy: number): void {
  if (rig.view === 'top') return;
  rig.yaw = rig.targetYaw = rig.yaw - dx * CAMERA.lookSpeed;
  const v = CAMERA[rig.view];
  rig.look = clamp(rig.look + dy * CAMERA.lookSpeed, v.minPitch, v.maxPitch);
}
export const viewMode = (): ViewMode => rig.view;
/** First person: the way the character faces is where the camera looks. */
export const lookFacing = (): number | null => (rig.view === 'first' ? rig.yaw + Math.PI : null);
/** Switch view, gliding there from wherever the camera is now. */
export function setView(v: ViewMode): void {
  if (v === rig.view) return;
  const cam = G.camera;
  rig.fromPos.copy(cam.position); rig.fromQuat.copy(cam.quaternion); rig.fromFov = cam.fov;
  rig.blend = 0;
  if (v !== 'top') rig.look = CAMERA[v].pitch;
  // leaving top-down keeps its yaw; coming back swings to it the short way round, not the way mouse look left it
  if (rig.view === 'top') rig.topYaw = rig.targetYaw;
  else if (v === 'top') {
    const turn = Math.PI * 2;
    rig.targetYaw = rig.topYaw + Math.round((rig.yaw - rig.topYaw) / turn) * turn;
  }
  rig.fromView = rig.view; rig.view = v;
}
/** The first-person view is still gliding in (the body stays visible until the camera reaches the eyes). */
export const viewSettled = (): boolean => rig.blend >= 1;
/** The camera is gliding into the eyes or out of them: the only time it comes to his head on its way (over the
 *  shoulder it comes within a hand's breadth of it, over his head, and stays there, #601). */
export const eyesInGlide = (): boolean => rig.blend < 1 && (rig.view === 'first' || rig.fromView === 'first');
/** Camera yaw in radians: screen-up is world (-sin, -cos) on XZ. */
export const cameraYaw = (): number => rig.yaw;
/** the top-down view's zoom as drawn (1 the game's own, under it nearer) */
export const cameraZoom = (): number => rig.zoom;
/** The camera turned at once to look the way `facing` goes (a hero's heading), in every view: back from a run, out of
 *  its portal, the view kept the yaw it had and the hero looked back into the portal ("should be facing away from portal
 *  and overlooking the village"). */
export function faceCamera(facing: number): void { rig.yaw = rig.targetYaw = rig.topYaw = facing + Math.PI; }

/** The camera rig as it is, and a function that puts it back: tools/lab pictures the game from its other views and
 *  leaves the game's own as it found it (the aim follows the camera). */
export function saveCamera(): () => void {
  const saved = { ...rig }, focus = rig.focus.clone(), fromPos = rig.fromPos.clone(), fromQuat = rig.fromQuat.clone();
  return () => { Object.assign(rig, saved); rig.focus.copy(focus); rig.fromPos.copy(fromPos); rig.fromQuat.copy(fromQuat); };
}

/** Screen px to move the view by, so the character stays in sight beside (x) or below (y) a lobby panel. */
const shift = { x: 0, y: 0, tx: 0, ty: 0 };
export function setViewShift(x: number, y: number): void { shift.tx = x; shift.ty = y; }

/** The camera's follow, zoom, turn and shake brought to rest at once, on `focus`: tools/lab sets a run up again with
 *  the camera where it would have come to rest, whatever ran before it (the aim follows the camera: gliding back
 *  from where the last run ended, it left a run's arms a frame or two elsewhere past a range). */
export function settleCamera(focus: Vec3): void {
  rig.focus.set(focus.x, 0, focus.z);
  rig.zoom = rig.targetZoom; rig.yaw = rig.targetYaw; rig.boom = rig.targetBoom;
  rig.shake = rig.kick = rig.kickTo = rig.roll = rig.rollTo = rig.hurt = 0;
  rig.lift = rig.liftTo = rig.tip = rig.tipTo = 0;
  shift.x = shift.tx; shift.y = shift.ty;
}

/** A staged shot (the hero selection screen, game/hall.ts): where the camera stands and what it looks at, and how
 *  fast it glides there (`damp`'s rate: `STAGE_GLIDE` if left out; a drag's, faster, to keep up with the finger). */
export interface Shot { pos: Vec3; look: Vec3; fov: number; glide?: number }
/** the shot asked for (null: the views have the camera), and the camera's glide to it */
const stage = { shot: null as Shot | null, pos: new Vec3(), look: new Vec3(), fov: CAMERA.fov };
/** how fast the camera glides to a new shot (`damp`'s rate: most of the way in about a second) */
const STAGE_GLIDE = 2.6;

/**
 * The camera on a staged shot, gliding to it from where it is (`cut`: there at once), or given back to the views
 * (null), which glide in from it as a view switch does.
 */
export function stageCamera(shot: Shot | null, cut = false): void {
  const cam = G.camera;
  if (shot && (!stage.shot || cut)) {
    stage.pos.copy(cut ? shot.pos : cam.position);
    stage.look.copy(cut ? shot.look : _look.set(0, 0, -1).applyQuaternion(cam.quaternion).multiplyScalar(6).add(cam.position));
    stage.fov = cut ? shot.fov : cam.fov;
  }
  if (!shot && stage.shot && !cut) {
    rig.fromPos.copy(cam.position); rig.fromQuat.copy(cam.quaternion); rig.fromFov = cam.fov;
    rig.blend = 0;
    rig.fromView = rig.view;
  }
  stage.shot = shot;
}

/** The camera on its staged shot, gliding there. */
function onStage(cam: PerspectiveCamera, shot: Shot, dt: number): void {
  const k = 1 - Math.exp(-(shot.glide ?? STAGE_GLIDE) * dt);
  stage.pos.lerp(shot.pos, k);
  stage.look.lerp(shot.look, k);
  stage.fov += (shot.fov - stage.fov) * k;
  cam.position.copy(stage.pos);
  cam.lookAt(stage.look);
  if (cam.fov !== stage.fov || cam.near !== 0.3) { cam.fov = stage.fov; cam.near = 0.3; cam.updateProjectionMatrix(); }
  // (nothing between the camera and the heroes to see through)
  updateSeeThrough(stage.look.x, stage.look.y, stage.look.z, 0, 0);
  cam.updateMatrixWorld();
}

const _boomAt = new Vec3();
const _boomFrom = new Vec3();
const _boomHit = { point: new Vec3(), normal: new Vec3(), t: 0, stone: false, name: '' };
/** how far the camera's boom is, clear of what's built (m), that far when it comes off a wall, how far it stands off a wall
 *  (m), how close it comes to the shoulder (m), and how fast it goes out again */
let boomNow = 0;
const BOOM_OFF = 0.2;
const BOOM_LEAST = 0.45;
const BOOM_OUT = 3;
let boomThrough = false;
/** the boom under which the camera goes over his head as it comes in (m), how far over at its closest (m), and the
 *  near plane there: at the shoulder's side a hand's breadth off him, what it left in the frame was a slice of his back,
 *  cut by the near plane (from play, "if you stopped moving cam through walls, make sure it looks good at all angles") */
const BOOM_OVER_HEAD = 1.4;
const BOOM_RISE = 0.34;
/** how far short of a wall the camera stops at the last (m): past the near plane at its closest */
const CAMERA_OFF_WALL = 0.16;
/** how much wider the view is at its closest (degrees): at the third view's own, his head filled the frame's foot, a
 *  mass of hair on a backdrop with slivers of shoulder, and hid the way ahead (a review of each spot's picture) */
const BOOM_WIDER = 18;
const BOOM_NEAR = 0.12;
let boomOverHead = true;
/** For a harness (tools/lab): the camera left at his shoulder however close it comes, as it was. */
export function boomKeepsShoulder(on: boolean): void { boomOverHead = !on; }
/** How far over his head the camera is for the boom it has now, 0 to 1. */
function overHead(): number {
  if (!boomOverHead || boomNow <= 0) return 0;
  const share = clamp((BOOM_OVER_HEAD - boomNow) / (BOOM_OVER_HEAD - BOOM_LEAST), 0, 1);
  return share * share * (3 - 2 * share);
}

/** For a harness (tools/lab): the boom let stand behind what's built, as it did. */
export function boomStandsBehind(on: boolean): void { boomThrough = on; }

/** minimum clearance kept between the 3rd-person camera and any floor underneath or along the boom (m) */
const CAMERA_FLOOR_CLEAR = 0.4;
const FLOOR_STEP = 0.15;
const FLOOR_RADIUS = 0.2;
const FLOOR_RING: readonly (readonly [number, number])[] = [
  [FLOOR_RADIUS, 0], [-FLOOR_RADIUS, 0], [0, FLOOR_RADIUS], [0, -FLOOR_RADIUS],
];
let floorHeroOnly = false;
/** For a harness (tools/lab): ignore elevated floors along the 3rd-person boom and at the camera, as it was. */
export function holdCameraFloorHeroOnly(on: boolean): void { floorHeroOnly = on; }

/** Highest walkable floor round (x, z) (m): includes the terrace edge, stair steps, and hall dais. */
function cameraFloorAt(x: number, z: number): number {
  let highest = groundHeight(x, z);
  for (const [dx, dz] of FLOOR_RING) highest = Math.max(highest, groundHeight(x + dx, z + dz));
  return highest;
}

/** Share of `from -> to` before crossing within `clear` m of any elevated floor below; 1 if clear all the way. */
function floorReach(from: Vec3, to: Vec3, clear = CAMERA_FLOOR_CLEAR): number {
  const steps = Math.max(1, Math.ceil(from.distanceTo(to) / FLOOR_STEP));
  let prev = 0;
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const px = from.x + (to.x - from.x) * t;
    const py = from.y + (to.y - from.y) * t;
    const pz = from.z + (to.z - from.z) * t;
    if (py < cameraFloorAt(px, pz) + clear) {
      let lo = prev;
      let hi = t;
      for (let i = 0; i < 5; i++) {
        const mid = (lo + hi) * 0.5;
        const mx = from.x + (to.x - from.x) * mid;
        const my = from.y + (to.y - from.y) * mid;
        const mz = from.z + (to.z - from.z) * mid;
        if (my < cameraFloorAt(mx, mz) + clear) hi = mid;
        else lo = mid;
      }
      return lo;
    }
    prev = t;
  }
  return 1;
}

/** `pivot` brought back toward (x, z) short of a wall or elevated floor between: beside a wall or stair edge the
 *  shoulder stood through it, and the boom, read from there, never met it. */
function shoulderClear(pivot: Vec3, x: number, z: number): void {
  const wall = !boomThrough && G.arena?.place === 'village' ? G.arena.wall : null;
  if (wall && wall.cast(_boomAt.set(x, pivot.y, z), pivot, _boomHit)) {
    const reach = Math.max(0, _boomHit.point.distanceTo(_boomAt) - BOOM_OFF);
    pivot.sub(_boomAt).setLength(reach).add(_boomAt);
  }
  if (!boomThrough && !floorHeroOnly) {
    const clear = floorReach(_boomAt.set(x, pivot.y, z), pivot);
    if (clear < 1) pivot.lerpVectors(_boomAt, pivot, clear);
  }
}

/** The boom back from `pivot` along the view, short of the first wall or elevated floor the line to the camera meets. */
function boomClear(pivot: Vec3, x: number, chest: number, z: number, dt: number): number {
  const wall = !boomThrough && G.arena?.place === 'village' ? G.arena.wall : null;
  let most = rig.boom;
  if (wall && wall.cast(pivot, _boomAt.copy(pivot).addScaledVector(_fwd, -rig.boom), _boomHit)) {
    most = Math.max(BOOM_LEAST, _boomHit.point.distanceTo(pivot) - BOOM_OFF);
  }
  // (and short of what stands between the camera and him: read from the shoulder alone, a wall's corner passed beside it
  // and hid him, the camera at its full length)
  if (wall && wall.cast(_boomFrom.set(x, chest, z), _boomAt.copy(pivot).addScaledVector(_fwd, -most), _boomHit)) {
    most = Math.max(BOOM_LEAST, most * _boomHit.t - BOOM_OFF);
  }
  // (short of an elevated floor — terrace, portico, stairs, dais — so pitching up lower on the stairs pulls in cleanly
  // rather than sinking under the portico floor or scraping behind the terrace lip)
  if (!boomThrough && !floorHeroOnly) {
    const pivotFloor = floorReach(pivot, _boomAt.copy(pivot).addScaledVector(_fwd, -most));
    if (pivotFloor < 1) most = Math.max(BOOM_LEAST, most * pivotFloor);
    const chestFloor = floorReach(_boomFrom.set(x, chest, z), _boomAt.copy(pivot).addScaledVector(_fwd, -most));
    if (chestFloor < 1) most = Math.max(BOOM_LEAST, most * chestFloor);
  }
  // (in at once, out by a spring: a post passed behind him sent it in and out)
  boomNow = Math.min(most, damp(Math.max(boomNow, BOOM_LEAST), most, BOOM_OUT, dt));
  return boomNow;
}

/** The camera brought back on his side of a wall or elevated floor it stands past: the boom's least, pressed against
 *  a wall or ledge, put it inside the obstacle, whose far side then showed through. */
function cameraClear(camera: Vec3, x: number, chest: number, z: number): void {
  const wall = !boomThrough && G.arena?.place === 'village' ? G.arena.wall : null;
  if (wall && wall.cast(_boomFrom.set(x, chest, z), camera, _boomHit)) {
    const reach = Math.max(0, _boomHit.point.distanceTo(_boomFrom) - CAMERA_OFF_WALL);
    camera.sub(_boomFrom).setLength(reach).add(_boomFrom);
  }
  if (!boomThrough && !floorHeroOnly) {
    const clear = floorReach(_boomFrom.set(x, chest, z), camera);
    if (clear < 1) camera.lerpVectors(_boomFrom, camera, clear);
  }
}

/** how far across from his head's middle the camera stands over it (m), how far over at the middle (m), and where that
 *  middle is, a share of his height: brought back toward his chest by a wall behind him, the camera stood in his hair,
 *  0.3 m off his head's middle, and lifted only out of a ball round it, his head stood in the middle of the frame seen
 *  from behind, his eyes showing through his hair (#601, in the hall's door) */
const HEAD_CLEAR = 0.7;
const HEAD_RISE = 0.5;
const HEAD_AT = 0.88;
let headKept = true;
/** For a harness (tools/lab): the camera let come into his head, as it did. */
export function cameraClearsHead(on: boolean): void { headKept = on; }

/** The camera lifted over his head, short of what's over it: whatever brought it in, it looks over him there, out of
 *  a dome round his head's middle (so it lifts smoothly as it comes in). */
function headClear(camera: Vec3, x: number, head: number, z: number): void {
  const across = Math.hypot(camera.x - x, camera.z - z);
  if (!headKept || across >= HEAD_CLEAR) return;
  let up = head + HEAD_RISE * Math.sqrt(1 - (across / HEAD_CLEAR) ** 2);
  if (camera.y >= up) return;
  const wall = !boomThrough && G.arena?.place === 'village' ? G.arena.wall : null;
  if (wall && wall.cast(camera, _boomAt.set(camera.x, up + CAMERA_OFF_WALL, camera.z), _boomHit)) {
    up = Math.min(up, _boomHit.point.y - CAMERA_OFF_WALL);
  }
  camera.y = Math.max(camera.y, up);
}

/** how close to a wall beside it the camera may stand (m), how far it looks for one, and the near plane as far as it
 *  goes (m) */
const SIDE_ROOM = 0.2;
const SIDE_REACH = 0.4;
const FAR_NEAR = 0.5;
/** how close to the box round a column the camera may stand (m): with the near plane brought in to it, as close as
 *  the plane may come, a column no nearer than this is never cut (`keepOffPosts`, #948) */
const POST_ROOM = 0.2;
/** the share of the way to the far near plane a wall is kept off at, along a line through its corners */
const NEAR_HELD = BOOM_NEAR / (FAR_NEAR * 0.85) + 0.02;
/** the plane's corners and middle, in the frame's own -1 to 1 */
const NEAR_POINTS: readonly (readonly [number, number])[] = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]];
const _nearRight = new Vec3(), _nearUp = new Vec3(), _nearWay = new Vec3();
let farNearKept = false;
/** For a harness (tools/lab): the near plane left as far as it was, by a wall or a column beside the camera, and the
 *  camera let stand by a column (`keepOffPosts`). */
export function farNearAtWalls(on: boolean): void { farNearKept = on; }

/**
 * The camera moved off a wall beside it, and the near plane the frame may have there: at 0.5 m, a wall running along
 * the view beside the camera was cut away by the plane, and what's behind it showed on the wall's far side (from play,
 * "I should not able to see through walls like this").
 */
/** the way the camera looks, for the order of what blends */
const _sortToward = new Vec3();

function nearClear(camera: Vec3, sy: number, cy: number, fov: number): number {
  const wall = !boomThrough && G.arena?.place === 'village' ? G.arena.wall : null;
  const checkFloor = !boomThrough && !floorHeroOnly;
  if ((!wall && !checkFloor) || farNearKept) return FAR_NEAR;
  keepOffPosts(G.arena?.place, camera, POST_ROOM);
  _nearRight.set(cy, 0, -sy);
  if (wall) {
    // (either side, and an eave over it)
    for (const way of [1, -1, 0]) {
      _nearWay.copy(_nearRight).multiplyScalar(way);
      if (way === 0) _nearWay.set(0, 1, 0);
      if (!wall.cast(camera, _boomAt.copy(camera).addScaledVector(_nearWay, SIDE_REACH), _boomHit)) continue;
      camera.addScaledVector(_nearWay, Math.min(0, _boomHit.t * SIDE_REACH - SIDE_ROOM));
    }
  }
  _nearUp.crossVectors(_nearRight, _fwd);
  const high = Math.tan(Maths.degToRad(fov / 2));
  const wide = high * G.camera.aspect;
  let share = 1;
  for (const [x, y] of NEAR_POINTS) {
    _nearWay.copy(_fwd).addScaledVector(_nearRight, x * wide).addScaledVector(_nearUp, y * high).multiplyScalar(FAR_NEAR);
    if (wall && wall.cast(camera, _boomAt.copy(camera).add(_nearWay), _boomHit)) {
      // (off what slopes over it, an eave, as the plane comes no nearer than BOOM_NEAR)
      camera.addScaledVector(_boomHit.normal, Math.max(0, NEAR_HELD - _boomHit.t) * _nearWay.length());
      share = Math.min(share, Math.max(_boomHit.t, NEAR_HELD));
    }
    // (and short of a column it would cut, which the wall's casts never meet: at 0.5 m a column a hand before the
    // camera was cut away but its edges, a thin sliver down the screen, #948)
    const post = postsReach(G.arena?.place, camera, _boomAt.copy(camera).add(_nearWay));
    if (post < 1) share = Math.min(share, Math.max(post, NEAR_HELD));
    if (checkFloor) {
      _boomAt.copy(camera).add(_nearWay);
      const floorAt = groundHeight(_boomAt.x, _boomAt.z) + 0.05;
      if (_boomAt.y < floorAt && _nearWay.y < -1e-4) {
        const t = (floorAt - camera.y) / _nearWay.y;
        share = Math.min(share, Math.max(t, NEAR_HELD));
      }
    }
  }
  return share < 1 ? Math.max(BOOM_NEAR, FAR_NEAR * share * 0.85) : FAR_NEAR;
}

/** whether a harness holds the view from above on the village's ground, as it was */
let topOnGround = false;

/** For a harness (tools/lab): the view from above looking at the ground whatever floor he stands on. */
export function holdTopOnGround(held: boolean): void {
  topOnGround = held;
}

/** `height`: the character's, for the close views' shoulder and eye level, over `floor`: the ground he stands on (his
 *  body's height, `obj.position.y`: the player's `pos.y` is always 0, and over it, through the eyes up the village's
 *  stair, the eyes stayed at the square's level, "in 1st person cannot walk up the stairs"). */
export function updateCamera(dt: number, focus: Vec3, height: number, floor = 0): void {
  const cam = G.camera;
  shift.x = damp(shift.x, shift.tx, 6, dt);
  shift.y = damp(shift.y, shift.ty, 6, dt);
  if (Math.abs(shift.x) + Math.abs(shift.y) > 0.5) {
    const w = fitted.w, h = fitted.h;
    cam.setViewOffset(w, h, -shift.x, -shift.y, w, h);
  } else if (cam.view) cam.clearViewOffset();
  if (stage.shot) { onStage(cam, stage.shot, dt); return; }
  rig.zoom = damp(rig.zoom, rig.targetZoom, 8, dt);
  rig.focus.x = damp(rig.focus.x, focus.x, CAMERA.follow, dt);
  rig.focus.z = damp(rig.focus.z, focus.z, CAMERA.follow, dt);
  rig.focus.y = 0;
  rig.floor = damp(rig.floor, topOnGround ? 0 : floor, CAMERA.follow, dt);
  rig.yaw = damp(rig.yaw, rig.targetYaw, 18, dt);
  let fov: number = CAMERA.fov, near = 0.5;
  if (rig.view === 'top') {
    const d = CAMERA.distance * rig.zoom;
    // tilt towards the horizon as we zoom in
    const k = clamp((rig.zoom - CAMERA.minZoom) / (1 - CAMERA.minZoom), 0, 1);
    const pitch = CAMERA.closePitch + (CAMERA.pitch - CAMERA.closePitch) * k;
    const lookY = 0.6 + (1 - k) * 0.7;
    const r = Math.cos(pitch) * d;
    // (from the floor he stands on: from the ground whatever it was, zoomed in he rose up the frame as he climbed to the
    // terrace, "this one is not (head cut off), and I didn't do anything, just climbed up")
    cam.position.set(rig.focus.x + Math.sin(rig.yaw) * r, rig.floor + Math.sin(pitch) * d, rig.focus.z + Math.cos(rig.yaw) * r);
    _look.set(rig.focus.x, rig.floor + lookY, rig.focus.z);
    cam.lookAt(_look);
  } else {
    // close views sit right on the character: no follow lag, or the aim would swim
    const sy = Math.sin(rig.yaw), cy = Math.cos(rig.yaw), cp = Math.cos(rig.look), sp = Math.sin(rig.look);
    _fwd.set(-sy * cp, -sp, -cy * cp);
    if (rig.view === 'third') {
      fov = CAMERA.third.fov;
      rig.boom = damp(rig.boom, rig.targetBoom, 6, dt);
      // the shoulder the camera looks over, then back along the view. Props in the way dissolve (core/seeThrough.ts);
      // in the village it stands on his side of what's built behind him: dissolved, a palisade left him in a small window
      // of black, "being behind obstacle - this is not useful... I should see more"
      // (the boom read from his shoulder as it stands with the camera out: read from where the camera's nearness had
      // moved it, the boom changed where it stands, which changed the boom, and in the doorway it jerked 0.65 m a frame,
      // "camera starts to jerk back and forth, never settling")
      _pivot.set(focus.x + cy * CAMERA.third.side, floor + height * 0.82, focus.z - sy * CAMERA.third.side);
      shoulderClear(_pivot, focus.x, focus.z);
      const boom = boomClear(_pivot, focus.x, floor + height * 0.7, focus.z, dt);
      const over = overHead();
      _pivot.x += (focus.x - _pivot.x) * over;
      _pivot.z += (focus.z - _pivot.z) * over;
      _pivot.y += BOOM_RISE * over;
      cam.position.copy(_pivot).addScaledVector(_fwd, -boom);
      cameraClear(cam.position, focus.x, floor + height * 0.7, focus.z);
      const floorLimit = (cx: number, cz: number): number =>
        (floorHeroOnly ? floor : Math.max(floor, cameraFloorAt(cx, cz))) + CAMERA_FLOOR_CLEAR;
      cam.position.y = Math.max(floorLimit(cam.position.x, cam.position.z), cam.position.y);
      headClear(cam.position, focus.x, floor + height * HEAD_AT, focus.z);
      near = Math.min(0.5 + (BOOM_NEAR - 0.5) * over, nearClear(cam.position, sy, cy, fov + BOOM_WIDER * over));
      fov += BOOM_WIDER * over;
      cam.position.y = Math.max(floorLimit(cam.position.x, cam.position.z), cam.position.y);
    } else {
      fov = CAMERA.first.fov; near = 0.08;
      cam.position.set(focus.x - sy * 0.12, floor + height * 0.9, focus.z - cy * 0.12);
    }
    cam.lookAt(_look.copy(cam.position).add(_fwd));
  }
  if (rig.blend < 1) {
    rig.blend = Math.min(1, rig.blend + dt / CAMERA.switchTime);
    const e = ease(rig.blend);
    cam.position.lerpVectors(rig.fromPos, cam.position, e);
    // aim at the character all the way (turning to it early), and settle into the new view's own
    // framing (over the shoulder, through the eyes) only over the last stretch
    _quat.copy(cam.quaternion);
    cam.lookAt(focus.x, floor + height * 0.55, focus.z);
    _quat2.copy(cam.quaternion);   // (slerpQuaternions copies its first argument in before reading the second)
    // (into the eyes the character's direction swings wildly as the camera closes on it, so the settling
    // follows the distance closed, not the clock)
    cam.quaternion.slerpQuaternions(rig.fromQuat, _quat2, ease(Math.min(1, rig.blend / 0.4)));
    cam.quaternion.slerp(_quat, rig.view === 'first' ? ease(clamp((e - 0.3) / 0.65, 0, 1)) : ease(clamp((rig.blend - 0.6) / 0.4, 0, 1)));
    fov = rig.fromFov + (fov - rig.fromFov) * e;
    near = 0.5 + (near - 0.5) * e;
  }
  // props dissolve where they hide the character, from above and over the shoulder (through the eyes nothing is
  // between), fading in and out with the glide to and from the eyes. Over his head nothing stands between either, and the
  // short cone from the eye down to him widens into the wall beside the camera: pressed into a corner, it opened a patch
  // of it onto the outside
  const e = ease(rig.blend);
  const share = (view: ViewMode) => (rig.view === view ? e : 0) + (rig.fromView === view ? 1 - e : 0);
  const props = (1 - share('first')) * (1 - share('third') * overHead());
  holeOpening(cam.position, focus.x, floor, focus.z, height, props, dt);
  updateSeeThrough(focus.x, floor + height * 0.6, focus.z, props, share('top'), floor, propsOpening(),
    builtOpening(), fenceOpened(), propsHideHim());
  sortBlendedFrom(cam.position, cam.getWorldDirection(_sortToward));
  rig.kick = damp(rig.kick, rig.kickTo, rig.kickTo > rig.kick ? 14 : 6, dt); rig.kickTo = 0;
  // (the lens zoom: narrowed while asked for in the close views, eased back elsewhere)
  lens = damp(lens, rig.view !== 'top' && (lensByMouse || lensByStep) ? LENS.zoom : 1, LENS.rate, dt);
  if (rig.view !== 'top') fov *= lens;
  if (rig.view !== 'top') fov += rig.kick * e;
  if (cam.fov !== fov || cam.near !== near) { cam.fov = fov; cam.near = near; cam.updateProjectionMatrix(); }
  if (rig.shake > 0.001) {
    const s = rig.shake * rig.shake * (rig.view === 'top' ? 0.6 : 0.12);
    const t = G.time * 60;
    cam.position.x += Math.sin(t * 1.3) * s;
    cam.position.y += Math.sin(t * 1.7 + 1) * s * 0.6;
    cam.position.z += Math.sin(t * 1.1 + 2) * s;
  }
  rig.shake = Math.max(0, rig.shake - dt * 2.2);
  rig.roll = damp(rig.roll, rig.rollTo, Math.abs(rig.rollTo) > Math.abs(rig.roll) ? 30 : 12, dt); rig.rollTo = 0;
  rig.lift = damp(rig.lift, rig.liftTo, rig.liftTo !== 0 ? 40 : 10, dt); rig.liftTo = 0;
  rig.tip = damp(rig.tip, rig.tipTo, rig.tipTo !== 0 ? 22 : 7, dt); rig.tipTo = 0;
  if (rig.view === 'first' && rig.blend >= 1) {
    if (Math.abs(rig.lift) > 1e-4) cam.position.y += rig.lift;
    if (Math.abs(rig.tip) > 1e-4) cam.rotateX(-rig.tip);
    if (Math.abs(rig.roll) > 1e-4) cam.rotateZ(rig.roll);
  }
  rig.hurt = Math.max(0, rig.hurt - dt * 1.6);
  // (its matrices as the frame will draw it: the world's labels are placed by them before the frame is drawn, and
  // with the last frame's turn they slid off what they label as a view switch glided round)
  cam.updateMatrixWorld();
}

const ease = (t: number): number => t * t * (3 - 2 * t);
const _fwd = new Vec3(), _pivot = new Vec3(), _look = new Vec3(), _quat = new Quat(), _quat2 = new Quat();
/** What is drawn over the finished frame: the world's labels and the outline (`labels`; ui/overlay) and the UI's
 *  panels (`panels`; ui/kit), handed to the engine for its frame, each frame before it's drawn, `shown` false for
 *  none (photo mode). */
export const overFrame = {
  labels: (_shown: boolean): void => {},
  panels: (_shown: boolean): void => {},
};
/** For a harness: whether a canvas of three's lies over the engine's: none, there is one canvas (the lab's checks of
 *  the overlays ask it of this tree and of main's). */
export const overCanvasLeftOut = (): boolean => true;
/** whether the world's overlays are drawn over the frame (photo mode leaves them out: `showOverlays`) */
let overlaysShown = true;
/** The world's overlays (labels, names, bars, damage numbers) drawn over the frame, or left out (photo mode). */
export function showOverlays(on: boolean): void { overlaysShown = on; }
/**
 * What takes the next frame as it's drawn (photo mode's picture, ui/photo.ts): called once with the canvas in the
 * frame's own task, right after the post chain drew it and before anything is drawn over it, so the canvas still holds
 * it (no `preserveDrawingBuffer`). That frame is graded for an SDR screen (in HDR the canvas holds extended sRGB).
 */
export const frameShot = { take: null as ((canvas: HTMLCanvasElement) => void) | null };
/** The frame handed to the shot waiting for it, if one is. */
function shotTaken(from: HTMLCanvasElement): void {
  const take = frameShot.take;
  if (!take) return;
  frameShot.take = null;
  take(from);
}

/**
 * A picture of the scene from another camera, drawn apart from the frame (the developer mode's invited agent,
 * dev/agentSteps.ts; nothing sets it in production): the next frame draws the scene from `camera` first, whole as the
 * free camera shows it (core/wholeView.ts), hands that picture over, and then draws the frame as ever from the game's
 * own camera, all in the frame's one task. The page shows what a task drew last, so the player's view never changes
 * (flown there by the free camera for three frames, a picture was a flicker to him: "I also saw flicker in the
 * scene... think we have a bug").
 */
export const frameApart = {
  take: null as { camera: PerspectiveCamera; taken(canvas: HTMLCanvasElement): void } | null,
};
/** The scene drawn from the camera of the picture asked for, and handed over; the game's own view set back. */
function drawApart(width: number, height: number, graded: Parameters<typeof drawRust>[6] & object): void {
  const ask = frameApart.take;
  if (!ask) return;
  frameApart.take = null;
  const whole = wholeView();
  setWholeView(true);
  aimSight(ask.camera);
  // (the scene alone: none of what the frame lays over the player's own view, his arms, a blow's red, low health's
  // grey and blood, photo mode's look)
  const plain = {
    ...graded, arms: null, hurt: 0, low: 0,
    look: graded.look && { ...graded.look, on: false },
    edges: graded.edges && { ...graded.edges, reach: 0 },
  };
  try {
    drawRust(G.scene, ask.camera, G.time, width, height, gl, plain);
    const frame = rustFrame(frameRect().width, frameRect().height);
    if (frame) ask.taken(frame);
  } finally {
    setWholeView(whole);
    aimSight(G.camera);
  }
}

/** what marks each of the render's passes as a part of the frame (`markPassesWith`; none until the game sets it) */
let framePart: (name: string) => void = () => {};

/** Each of the render's passes marked by `mark` as a part of the frame callback's (`perf/frameParts.ts`, set from
 *  main.ts: imported here, its module's imports came round to this one before it was made). */
export function markPassesWith(mark: (name: string) => void): void {
  framePart = mark;
}

/**
 * The frame drawn. Its passes are each a part of the frame callback's (`perf/frameParts.ts`), so a slow frame's mark in
 * the performance trace says which one held the page: from play, a phone's walk through the village had frames whose
 * render took 170 to 190 ms (trace JQ2E-3Y1K) and another's 380 to 440 (T1MM-NGVG), the render one part, and nothing
 * said where.
 */
export function render(): void {
  const renderBegan = perfClock.now();
  // a change the resize event missed: fit, and tell the rest of the page (UI scale...) too
  if (fitViewport()) window.dispatchEvent(new Event('resize'));
  // (the grade's, handed to the engine below)
  grade.uniforms.uTime.value = G.time;
  grade.uniforms.uHurt.value = rig.hurt;
  const frame = frameRect();
  fitBloodMask(frame.width, frame.height);
  // the adaptation targets glide with the view
  const target = (v: ViewMode, i: 0 | 1): number => v !== 'top' ? ADAPT[v][i]
    : (ADAPT.lobby[i] + (ADAPT.top[i] - ADAPT.lobby[i]) * clamp((rig.zoom - CAMERA.lobbyZoom) / (1 - CAMERA.lobbyZoom), 0, 1)) * (i === 1 ? adaptScale : 1);
  const e = ease(rig.blend), u = grade.uniforms;
  u.uSmall.value = target(rig.fromView, 0) + (target(rig.view, 0) - target(rig.fromView, 0)) * e;
  u.uLarge.value = target(rig.fromView, 1) + (target(rig.view, 1) - target(rig.fromView, 1)) * e;
  if (adaptHeld) u.uSmall.value = u.uLarge.value = 1e4;
  const hdr = hdrLevels();
  u.uHdr.value = hdr.peak > 1 || hdr.paper !== 1 ? 1 : 0;
  u.uPaper.value = hdr.paper;
  u.uPeak.value = hdr.peak;
  u.uCap.value = (HI_CAP - HI_KNEE) * Math.max(1, hdr.peak / hdr.paper);
  // (a photo's frame graded for an SDR screen: the picture is saved as one)
  if (frameShot.take) u.uHdr.value = 0;
  sunShadowInTurns();
  aimSight(G.camera);
  framePart('render: its set-up');
  // (the scene's size as the quality level and Auto's budget have it now: three's own target, read here before,
  // is sized inside three's frame, which the engine's replaces, so the engine drew the screen's every pixel at
  // every level: a phone at Very low 3120 by 1440, reports H37Q-PEYK and DGAP-G8SJ)
  const pixels = { width: sceneSize(_size).x, height: _size.y };
  const graded = {
    small: u.uSmall.value, large: u.uLarge.value, cap: u.uCap.value, vignette: u.uVignette.value as number,
    hurt: u.uHurt.value as number, low: u.uLow.value as number, samples: sceneSamples(),
    arms: armsFov === null ? null : (placeArmsCamera(), armsCam),
    lite: liteLevel,
    casterLeast,
    bloomShare,
    shadowHeld: !shadowDrawnLast,
    look: {
      on: u.uPhoto.value > 0.5, exposure: u.uExposure.value, contrast: u.uContrast.value,
      saturation: u.uSaturation.value, filterLo: u.uFilterLo.value, filterHi: u.uFilterHi.value,
      filterMix: u.uFilterMix.value, blur: u.uBlur.value, focusY: u.uFocusY.value, focusBand: u.uFocusBand.value,
      bloom: bloomStrengthNow / BLOOM_STRENGTH,
    },
    edges: { mask: u.tBlood.value, reach: (u.uLow.value as number) * (1 + 0.06 * (u.uBeat.value as number)) },
  };
  // (a picture asked for from another camera: drawn first, the frame's own draw after it is what the page shows)
  if (frameApart.take) drawApart(pixels.width, pixels.height, graded);
  overFrame.labels(overlaysShown);
  overFrame.panels(!document.body.classList.contains('photo'));
  drawRust(G.scene, G.camera, G.time, pixels.width, pixels.height, gl, graded);
  // (a photo's picture: the engine's frame, the labels in it as photo mode leaves them out)
  if (frameShot.take) {
    const frame = rustFrame(frameRect().width, frameRect().height);
    if (frame) shotTaken(frame);
  }
  framePart('render: drawn (Rust)');
  RUST.renderMs = perfClock.now() - renderBegan;
}
