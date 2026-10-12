// The atlas the world's overlays are drawn from (ui/overlay): one texture, every label painted into a slot of its
// own, and a slot uploaded alone when its label changes (its region, straight from the canvas it was painted on).
import * as THREE from 'three';
import { G } from '../../state';

/** the atlas's side, px */
export const ATLAS_SIZE = 2048;
/** a slot's height rounds up to one of these (px): each shelf of the atlas holds slots of one height */
const HEIGHTS = [16, 24, 32, 48, 64, 96, 128, 192, 256, 384];
/** a slot's width rounds up to a multiple of this (px) */
const WIDTH_STEP = 16;

/** A slot: its region of the atlas, px from the top left. */
export interface Slot { x: number; y: number; w: number; h: number }

interface Shelf { y: number; h: number; used: number }

/** the texture the labels are drawn from: a render target's, so its storage needs no copy in memory */
let target: THREE.WebGLRenderTarget | null = null;
const shelves: Shelf[] = [];
/** slots given back, by their size (`w x h`), for the next label of that size */
const spare = new Map<string, Slot[]>();
let nextY = 0;
/** what the labels are painted on before their slot is uploaded */
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
/** the canvas as a texture three uploads from (never drawn itself: `copyTextureToTexture` reads its image) */
let source: THREE.Texture | null = null;
let warned = false;

/** The atlas's texture (made and cleared on first use). */
export function atlasTexture(): THREE.Texture {
  if (target) return target.texture;
  target = new THREE.WebGLRenderTarget(ATLAS_SIZE, ATLAS_SIZE, { depthBuffer: false, generateMipmaps: false });
  const t = target.texture;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  // (canvas pixels in, as the page's colours: drawn as they are, premultiplied by their alpha on the way)
  t.colorSpace = THREE.NoColorSpace;
  t.flipY = false;
  t.premultiplyAlpha = true;
  const gl = G.renderer, was = gl.getRenderTarget(), clear = gl.getClearAlpha(), col = gl.getClearColor(new THREE.Color());
  gl.setRenderTarget(target);
  gl.setClearColor(0x000000, 0);
  gl.clear(true, false, false);
  gl.setClearColor(col, clear);
  gl.setRenderTarget(was);
  return t;
}

/** The size class a label of `w` by `h` px takes: its slot's width and height. */
function sizeClass(w: number, h: number): { w: number; h: number } | null {
  const height = HEIGHTS.find((x) => x >= h);
  if (height === undefined || w > ATLAS_SIZE) return null;
  return { w: Math.ceil(w / WIDTH_STEP) * WIDTH_STEP, h: height };
}

/** A slot for a label of `w` by `h` px, or null when none fits (the atlas is full: the label isn't drawn). */
export function takeSlot(w: number, h: number): Slot | null {
  const size = sizeClass(Math.max(1, w), Math.max(1, h));
  if (!size) return null;
  const reuse = spare.get(`${size.w}x${size.h}`)?.pop();
  if (reuse) return reuse;
  let shelf = shelves.find((s) => s.h === size.h && s.used + size.w <= ATLAS_SIZE);
  if (!shelf) {
    if (nextY + size.h > ATLAS_SIZE) {
      if (!warned && import.meta.env.DEV) console.error('overlay: the label atlas is full');
      warned = true;
      return null;
    }
    shelf = { y: nextY, h: size.h, used: 0 };
    shelves.push(shelf);
    nextY += size.h;
  }
  const slot = { x: shelf.used, y: shelf.y, w: size.w, h: size.h };
  shelf.used += size.w;
  return slot;
}

/** Gives a slot back for the next label of its size. */
export function freeSlot(slot: Slot): void {
  const key = `${slot.w}x${slot.h}`;
  let list = spare.get(key);
  if (!list) spare.set(key, (list = []));
  list.push(slot);
}

/** The canvas a label is painted on, cleared over a slot's size, and its context (unscaled, px). */
export function paintCanvas(slot: Slot): CanvasRenderingContext2D {
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = ATLAS_SIZE;
    canvas.height = HEIGHTS[HEIGHTS.length - 1];
    ctx = canvas.getContext('2d', { willReadFrequently: false })!;
    source = new THREE.Texture(canvas);
    source.flipY = false;
  }
  const c = ctx!;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, slot.w, slot.h);
  return c;
}

const region = new THREE.Box2(), at = new THREE.Vector2();
/** Uploads what was painted (the paint canvas's top left, a slot's size) into the slot. */
export function uploadSlot(slot: Slot): void {
  atlasTexture();
  region.min.set(0, 0);
  region.max.set(slot.w, slot.h);
  at.set(slot.x, slot.y);
  G.renderer.copyTextureToTexture(source!, target!.texture, region, at);
}
