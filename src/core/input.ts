// Keyboard + mouse state. `pressed` holds keys that went down this frame. Touch controls
// (ui/touch.ts) feed the same state: a move stick, held skill keys and an aim point.
import * as THREE from 'three';
import { G } from '../state';
import { CAMERA } from '../data/balance';
import { GROUND_LEVELS, groundHeight } from '../world/ground';

export const input = {
  down: new Set<string>(),
  pressed: new Set<string>(),
  mouse: { x: 0, y: 0, left: false, right: false, middle: false, overUI: false },
  wheel: 0,
  orbit: 0,                      // horizontal middle-drag this frame, px (rotates the camera)
  look: { x: 0, y: 0 },          // mouse movement this frame while the pointer is locked, px
  /** the close views aim at the screen centre (the crosshair), not the cursor */
  centerAim: false,
  ground: new THREE.Vector3(),   // cursor projected onto the arena floor (y 0, under the dais's top)
  /** touch is the active input: the browser's emulated mouse events are ignored */
  touchMode: false,
  /** touch move stick: screen space, x right / y down, length 0..1 */
  stick: { x: 0, y: 0 },
  /** skill keys held down on the touch buttons */
  touch: new Set<string>(),
  /** touch aim point on the floor, replacing the cursor while set */
  aim: null as THREE.Vector3 | null,
};

/**
 * Let go of everything held: keys, mouse buttons, the touch stick and buttons. On leaving a run,
 * a release the page never saw (the hero died mid-stride, the touch controls hid under the finger)
 * mustn't keep the hero walking in the lobby.
 */
export function releaseInput(): void {
  input.down.clear(); input.pressed.clear(); input.touch.clear();
  input.mouse.left = input.mouse.right = input.mouse.middle = false;
  input.stick.x = input.stick.y = 0;
  input.aim = null;
}

let canvasEl: HTMLCanvasElement;
/** the close views lock the pointer for mouse look while a wave is on */
let lockWanted = false, lockTried = 0;
/** when the pointer lock was lost without being asked to (Esc): that same Esc mustn't also unpause */
export let lockLostAt = -1;
let onLockLost: () => void = () => {};
export const pointerLocked = (): boolean => !!canvasEl && document.pointerLockElement === canvasEl;
function requestLock(): void {
  lockTried = performance.now();
  try { Promise.resolve(canvasEl.requestPointerLock()).catch(() => {}); } catch { /* not allowed right now */ }
}
/**
 * Called every frame: whether mouse look should hold the pointer. It's taken while the browser
 * still counts a recent key press or click as the player's (else the player clicks for it).
 */
export function wantPointerLock(on: boolean): void {
  lockWanted = on;
  if (!on) { if (pointerLocked()) document.exitPointerLock(); return; }
  if (!pointerLocked() && navigator.userActivation?.isActive && performance.now() - lockTried > 600) requestLock();
}
export function onPointerLockLost(fn: () => void): void { onLockLost = fn; }

const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ndc = new THREE.Vector2();
const hit = new THREE.Vector3();

/**
 * Where a ray meets the floor as it's seen: the first of its levels, from the top, standing at least that high where the
 * ray crosses it (the dais and its step stand above the floor). Met on the plane under them, the cursor over the dais
 * pointed 35 cm past what it showed: near the feet the hero turned away from it, and zoomed in, round the other way.
 */
function floorHit(r: THREE.Ray, out: THREE.Vector3): boolean {
  for (const y of GROUND_LEVELS) {
    plane.constant = -y;
    if (r.intersectPlane(plane, hit) && groundHeight(hit.x, hit.z) >= y) { out.set(hit.x, 0, hit.z); return true; }
  }
  return false;
}

/**
 * Where a ray first meets a prop (a log, a stump, a boulder: each an upright cylinder on the floor, its circle up to its
 * height, side or top), as the distance along the ray, its point into `out`; Infinity if none. Aimed at over the floor,
 * a log lower than a man's chest was shot over.
 */
function propHit(r: THREE.Ray, out: THREE.Vector3): number {
  const o = r.origin, d = r.direction, a = d.x * d.x + d.z * d.z;
  let best = Infinity;
  for (const p of G.arena.obstacles) {
    const base = groundHeight(p.x, p.z), top = base + p.h, fx = o.x - p.x, fz = o.z - p.z;
    // (its side)
    if (a > 1e-9) {
      const b = 2 * (fx * d.x + fz * d.z), c = fx * fx + fz * fz - p.r * p.r, disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const t = (-b - Math.sqrt(disc)) / (2 * a), y = o.y + d.y * t;
        // (a little under its top: aimed at its edge, an arrow grazed a round log's top)
        if (t > 0 && t < best && y >= base && y <= top) { best = t; out.set(o.x + d.x * t, Math.min(y, base + p.h * TOP_K), o.z + d.z * t); }
      }
    }
    // (its top, from above)
    if (d.y < -1e-6) {
      const t = (top - o.y) / d.y, x = o.x + d.x * t - p.x, z = o.z + d.z * t - p.z;
      // (seen from above, its middle: its top's circle is only its outline from above, the log under it round)
      if (t > 0 && t < best && x * x + z * z <= p.r * p.r) { best = t; out.set(o.x + d.x * t, base + p.h * MID_K, o.z + d.z * t); }
    }
  }
  return best;
}
const _prop = new THREE.Vector3();
/** a prop met from above is aimed at this far up it, from the side no higher than TOP_K of it */
const MID_K = 0.55, TOP_K = 0.8;
/** The aim at a prop the ray meets before `t` along it: its point, with how high on it (above the floor) as `y`. */
function aimProp(r: THREE.Ray, t: number): boolean {
  const tp = propHit(r, _prop);
  if (tp >= t) return false;
  input.ground.set(_prop.x, _prop.y - groundHeight(_prop.x, _prop.z), _prop.z);
  return true;
}

function keyName(e: KeyboardEvent): string {
  if (e.code.startsWith('Key')) return e.code.slice(3).toLowerCase();
  if (e.code.startsWith('Digit')) return e.code.slice(5);
  return e.code.toLowerCase(); // space, escape, shiftleft, ...
}

/** Typing in a text field (a room code, a confirmation) isn't playing: WASD mustn't walk the hero. */
const typing = (e: KeyboardEvent): boolean => e.target instanceof HTMLElement
  && (e.target.matches('textarea, input:not([type=checkbox], [type=radio], [type=range])') || e.target.isContentEditable);

export function initInput(canvas: HTMLCanvasElement): void {
  canvasEl = canvas;
  document.addEventListener('pointerlockchange', () => {
    if (pointerLocked() || !lockWanted) return;
    lockLostAt = performance.now();
    onLockLost();
  });
  window.addEventListener('keydown', (e) => {
    if (typing(e)) return;
    const k = keyName(e);
    if (!input.down.has(k)) input.pressed.add(k);
    input.down.add(k);
    if (k === 'space' || k === 'tab') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => input.down.delete(keyName(e)));
  window.addEventListener('blur', releaseInput);
  window.addEventListener('mousemove', (e) => {
    if (input.touchMode) return;
    if (pointerLocked()) { input.look.x += e.movementX; input.look.y += e.movementY; input.mouse.overUI = false; return; }
    input.mouse.x = e.clientX; input.mouse.y = e.clientY;
    input.mouse.overUI = e.target !== canvas;
    // the drag keeps rotating over the UI; `buttons` catches a release outside the window
    if (input.mouse.middle) { if (e.buttons & 4) input.orbit += e.movementX; else input.mouse.middle = false; }
  });
  canvas.addEventListener('mousedown', (e) => {
    if (input.touchMode) return;
    // the click that takes the pointer for mouse look doesn't also attack
    if (lockWanted && !pointerLocked()) { requestLock(); return; }
    if (e.button === 0) { input.mouse.left = true; input.pressed.add('mouse0'); }
    if (e.button === 2) { input.mouse.right = true; input.pressed.add('mouse2'); }
    if (e.button === 1) { input.mouse.middle = true; e.preventDefault(); } // no autoscroll
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.mouse.left = false;
    if (e.button === 2) input.mouse.right = false;
    if (e.button === 1) input.mouse.middle = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { input.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
}

export function updateInputRay(): void {
  if (input.aim) { input.ground.copy(input.aim); return; }
  if (input.touchMode) return;
  if (input.centerAim) { aimAtCenter(); return; }
  ndc.set((input.mouse.x / window.innerWidth) * 2 - 1, -(input.mouse.y / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, G.camera);
  const met = floorHit(ray.ray, input.ground);
  aimProp(ray.ray, met ? ray.ray.origin.distanceTo(_floor.set(input.ground.x, groundHeight(input.ground.x, input.ground.z), input.ground.z)) : Infinity);
}
const _floor = new THREE.Vector3();

/**
 * The crosshair's aim: the foe or the prop under it, whichever is nearer (a foe at its feet, where ground-targeted
 * skills land; a prop where it's met, `y` how high on it), else the floor it points at, else a point ahead at aim range
 * when it points above the floor.
 */
function aimAtCenter(): void {
  ndc.set(0, 0);
  ray.setFromCamera(ndc, G.camera);
  const o = ray.ray.origin, d = ray.ray.direction, h = Math.hypot(d.x, d.z);
  let best = Infinity;
  for (const e of G.enemies) {
    if (!e.alive || h < 1e-4) continue;
    // the foe as an upright cylinder: where the ray passes closest to its axis, seen from above
    const ex = e.pos.x - o.x, ez = e.pos.z - o.z;
    const t = (ex * d.x + ez * d.z) / (h * h);
    if (t <= 0 || t >= best) continue;
    const px = d.x * t - ex, pz = d.z * t - ez, y = o.y + d.y * t;
    if (px * px + pz * pz > e.radius * e.radius || y < 0 || y > e.height) continue;
    best = t;
    input.ground.set(e.pos.x, 0, e.pos.z);
  }
  // (a prop in front of the foe or the floor is what the crosshair is on; `best` is along the ray's flat length)
  const len = Math.hypot(d.x, d.y, d.z);
  if (aimProp(ray.ray, best < Infinity ? best * len : floorHit(ray.ray, hit) ? o.distanceTo(_floor.set(hit.x, groundHeight(hit.x, hit.z), hit.z)) : Infinity)) return;
  if (best < Infinity) return;
  const range = CAMERA.aimRange;
  if (d.y < -1e-4 && floorHit(ray.ray, hit) && Math.hypot(hit.x - o.x, hit.z - o.z) <= range) { input.ground.copy(hit); return; }
  if (h > 1e-4) input.ground.set(o.x + (d.x / h) * range, 0, o.z + (d.z / h) * range);
}

export function endInputFrame(): void {
  input.pressed.clear();
  input.wheel = 0;
  input.orbit = 0;
  input.look.x = input.look.y = 0;
}

export const isDown = (k: string): boolean =>
  input.down.has(k) || input.touch.has(k) || (k === 'mouse0' && input.mouse.left) || (k === 'mouse2' && input.mouse.right);
export const wasPressed = (k: string): boolean => input.pressed.has(k);
