// Keyboard + mouse state. `pressed` holds keys that went down this frame.
import * as THREE from 'three';
import { G } from '../state';

export const input = {
  down: new Set<string>(),
  pressed: new Set<string>(),
  mouse: { x: 0, y: 0, left: false, right: false, overUI: false },
  wheel: 0,
  ground: new THREE.Vector3(),   // cursor projected onto the arena floor
};

const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ndc = new THREE.Vector2();

function keyName(e: KeyboardEvent): string {
  if (e.code.startsWith('Key')) return e.code.slice(3).toLowerCase();
  if (e.code.startsWith('Digit')) return e.code.slice(5);
  return e.code.toLowerCase(); // space, escape, shiftleft, ...
}

export function initInput(canvas: HTMLCanvasElement): void {
  window.addEventListener('keydown', (e) => {
    const k = keyName(e);
    if (!input.down.has(k)) input.pressed.add(k);
    input.down.add(k);
    if (k === 'space' || k === 'tab') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => input.down.delete(keyName(e)));
  window.addEventListener('blur', () => { input.down.clear(); input.mouse.left = input.mouse.right = false; });
  window.addEventListener('mousemove', (e) => {
    input.mouse.x = e.clientX; input.mouse.y = e.clientY;
    input.mouse.overUI = e.target !== canvas;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { input.mouse.left = true; input.pressed.add('mouse0'); }
    if (e.button === 2) { input.mouse.right = true; input.pressed.add('mouse2'); }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.mouse.left = false;
    if (e.button === 2) input.mouse.right = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { input.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
}

export function updateInputRay(): void {
  ndc.set((input.mouse.x / window.innerWidth) * 2 - 1, -(input.mouse.y / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, G.camera);
  ray.ray.intersectPlane(plane, input.ground);
}

export function endInputFrame(): void {
  input.pressed.clear();
  input.wheel = 0;
}

export const isDown = (k: string): boolean =>
  input.down.has(k) || (k === 'mouse0' && input.mouse.left) || (k === 'mouse2' && input.mouse.right);
export const wasPressed = (k: string): boolean => input.pressed.has(k);
