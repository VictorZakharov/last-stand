// The blood round the screen's edges as the hero's Health runs low (core/lowLife.ts), drawn as vector shapes: a seep in
// along every edge with a wavy front, deepest in the corners, drips running down from the top, droplets flung round the
// edges and clots in the corners, all from one seed, so the same screen always bleeds the same way. They're painted once
// for the screen's shape (again when it changes) into a mask the final grade reads (core/renderer.ts): red how much a
// pixel is covered, green how near to nothing the Health must be for it to show (the seep's front comes in level by
// level, a drip runs down as it falls), blue its shade (dark and clotted at the edge, brighter where it runs). The grade
// shows what the Health reaches, so the blood spreads with no shader change and nothing on the page repainting.
import * as THREE from 'three';
import { mulberry } from '../util';

/** the seep's depth in from an edge at its fullest, and how much deeper it runs into a corner (screen heights) */
const DEPTH = 0.17, CORNER = 0.09;
/** the levels the seep's front comes in by, and how far apart its outline's points are (px) */
const LEVELS = 40, STEP = 4;
/** the drips from the top, the droplets and the corners' clots */
const DRIPS = 15, DROPS = 150, CLOTS = 4;
/** nothing reaches further in from the top or bottom than this (screen heights): the middle third of the view stays clear */
const MOST_IN = 0.29;
/** the mask's longest side at most (px): painted at the canvas's size up to it */
const LONGEST = 2560;
/** how long the canvas's size must have stood still before the mask is painted again for it (ms) */
const SETTLE_MS = 250;
const SEED = 9137;

/** A wave along an edge: long lobes, shorter ones on them and a rough edge, each with its own phase, summed into 0..1
 *  (lengths in screen heights; a strong short wave made it a torn paper's edge). */
function edgeWave(rng: () => number): (s: number) => number {
  const parts = [[0.61, 0.42], [0.27, 0.33], [0.11, 0.17], [0.037, 0.05], [0.013, 0.03]].map(([length, weight]) => ({ length, weight, phase: rng() * Math.PI * 2 }));
  const total = parts.reduce((sum, part) => sum + part.weight, 0);
  return (s) => parts.reduce((sum, part) => sum + part.weight * (0.5 + 0.5 * Math.sin(s / part.length * Math.PI * 2 + part.phase)), 0) / total;
}

/** One edge of the screen: where it runs from, along it and in from it (px, unit vectors), and its length. */
interface Edge { x: number; y: number; ax: number; ay: number; nx: number; ny: number; length: number; depth: (s: number) => number }

/** The four edges, each with its seep's full depth along it (px), deepest into the corners. */
function edgesOf(width: number, height: number, rng: () => number): Edge[] {
  const sides: Omit<Edge, 'depth'>[] = [
    { x: 0, y: 0, ax: 1, ay: 0, nx: 0, ny: 1, length: width },
    { x: width, y: height, ax: -1, ay: 0, nx: 0, ny: -1, length: width },
    { x: 0, y: height, ax: 0, ay: -1, nx: 1, ny: 0, length: height },
    { x: width, y: 0, ax: 0, ay: 1, nx: -1, ny: 0, length: height },
  ];
  return sides.map((side) => {
    const wave = edgeWave(rng);
    const depth = (s: number) => {
      const corner = Math.min(s, side.length - s) / height;
      const deep = DEPTH * (0.2 + 0.8 * wave(s / height) ** 1.4) + CORNER * Math.exp(-((corner / 0.13) ** 2));
      return Math.min(MOST_IN, deep) * height;
    };
    return { ...side, depth };
  });
}

/** A pixel's colour in the mask: covered, showing from `from` of the way to nothing, of `shade`. */
const maskColour = (from: number, shade: number): string =>
  `rgb(255, ${Math.round(Math.min(1, Math.max(0, from)) * 255)}, ${Math.round(Math.min(1, Math.max(0, shade)) * 255)})`;

/** The seep in from every edge, level by level: each level's front a share of the full depth, the deepest first. */
function paintSeep(g: CanvasRenderingContext2D, edges: Edge[]): void {
  for (let level = LEVELS; level >= 1; level--) {
    const share = level / LEVELS;
    // (the edge itself shows first, darkest; the front further in shows later, brighter)
    g.fillStyle = maskColour(0.02 + 0.98 * share, 0.18 + 0.6 * share);
    for (const edge of edges) {
      g.beginPath();
      g.moveTo(edge.x - edge.nx, edge.y - edge.ny);
      for (let s = 0; s <= edge.length + STEP; s += STEP) {
        const along = Math.min(s, edge.length), depth = edge.depth(along) * share;
        g.lineTo(edge.x + edge.ax * along + edge.nx * depth, edge.y + edge.ay * along + edge.ny * depth);
      }
      g.lineTo(edge.x + edge.ax * edge.length - edge.nx, edge.y + edge.ay * edge.length - edge.ny);
      g.closePath();
      g.fill();
    }
  }
}

/** A drip from the top edge's seep: thick where it leaves the seep, narrowing, a bead at its end; it runs down from
 *  `from` of the way to nothing (where the seep's front reaches its root) to `to`. */
function paintDrip(g: CanvasRenderingContext2D, top: Edge, height: number, rng: () => number): void {
  const x = top.length * (0.04 + 0.92 * rng());
  const from = 0.12 + 0.6 * rng();
  const root = top.depth(x) * from;
  const length = Math.min((0.06 + 0.22 * rng()) * height, MOST_IN * height - root - 0.02 * height);
  if (length < 0.02 * height) return;
  const to = Math.min(1, from + 0.25 + 0.3 * rng());
  const width = (0.0018 + 0.0035 * rng()) * height, bead = width * (1.7 + 0.6 * rng());
  const sway = (rng() - 0.5) * 0.4 * width, end = root + length;
  const shade = 0.4 + 0.3 * rng();
  const fill = g.createLinearGradient(0, root, 0, end + bead);
  fill.addColorStop(0, maskColour(from, shade));
  fill.addColorStop(1, maskColour(to, shade + 0.1));
  g.fillStyle = fill;
  g.beginPath();
  // (down its left side narrowing, round the bead, back up its right)
  g.moveTo(x - width * 2.2, root - width);
  g.quadraticCurveTo(x - width * 0.8, root + length * 0.2, x - width * 0.45 + sway, end - bead * 0.95);
  // (from up on its left, round its bottom, to up on its right: angles grow clockwise with y down)
  g.arc(x + sway, end, bead, Math.PI * 1.1, -Math.PI * 0.1, true);
  g.quadraticCurveTo(x + width * 0.8, root + length * 0.2, x + width * 2.2, root - width);
  g.closePath();
  g.fill();
}

/** A blob of `radius` round `x`, `y`: a circle pushed in and out by two waves, so no two droplets are alike. */
function blob(g: CanvasRenderingContext2D, x: number, y: number, radius: number, rng: () => number): void {
  const a = rng() * Math.PI * 2, b = rng() * Math.PI * 2, wobble = 0.1 + 0.15 * rng();
  g.beginPath();
  for (let k = 0; k <= 24; k++) {
    const t = k / 24 * Math.PI * 2;
    const r = radius * (1 + wobble * Math.sin(3 * t + a) + 0.5 * wobble * Math.sin(5 * t + b));
    if (k === 0) g.moveTo(x + Math.cos(t) * r, y + Math.sin(t) * r);
    else g.lineTo(x + Math.cos(t) * r, y + Math.sin(t) * r);
  }
  g.closePath();
  g.fill();
}

/** A droplet flung near an edge, a few specks round it: the further in, the later it shows. */
function paintDrop(g: CanvasRenderingContext2D, edges: Edge[], width: number, height: number, rng: () => number): void {
  const pick = rng() * (width + height) * 2;
  let edge = edges[0], along = pick;
  for (const each of edges) {
    if (along < each.length) { edge = each; break; }
    along -= each.length;
  }
  along = Math.min(edge.length, along);
  const reach = edge.depth(along) / height;
  // (most just past the seep's front, a few further in, never into the middle)
  const inward = Math.min(MOST_IN - 0.02, reach * (0.6 + 0.7 * rng() ** 1.5) + 0.01) * height;
  const x = edge.x + edge.ax * along + edge.nx * inward, y = edge.y + edge.ay * along + edge.ny * inward;
  const radius = (0.002 + 0.011 * rng() ** 2.2) * height;
  const from = Math.min(0.97, 0.1 + 0.85 * (inward / height / MOST_IN) ** 0.8 + (rng() - 0.5) * 0.2);
  g.fillStyle = maskColour(from, 0.35 + 0.45 * rng());
  blob(g, x, y, radius, rng);
  for (let speck = Math.floor(rng() * 4); speck > 0; speck--) {
    const a = rng() * Math.PI * 2, out = radius * (1.6 + 2.2 * rng());
    blob(g, x + Math.cos(a) * out, y + Math.sin(a) * out, radius * (0.15 + 0.25 * rng()), rng);
  }
}

/** A clot in a corner: a big dark blob centred on it, a quarter of it on the screen, showing early. */
function paintClot(g: CanvasRenderingContext2D, corner: number, width: number, height: number, rng: () => number): void {
  const x = corner % 2 ? width : 0, y = corner > 1 ? height : 0;
  g.fillStyle = maskColour(0.04 + 0.2 * rng(), 0.08 + 0.12 * rng());
  blob(g, x, y, (0.08 + 0.05 * rng()) * height, rng);
}

/** Paints the whole mask on `g`, `width` x `height` px. */
function paintMask(g: CanvasRenderingContext2D, width: number, height: number): void {
  const rng = mulberry(SEED);
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = 'rgb(0, 255, 0)';
  g.fillRect(0, 0, width, height);
  const edges = edgesOf(width, height, rng);
  paintSeep(g, edges);
  for (let corner = 0; corner < CLOTS; corner++) paintClot(g, corner, width, height, rng);
  for (let drip = 0; drip < DRIPS; drip++) paintDrip(g, edges[0], height, rng);
  for (let drop = 0; drop < DROPS; drop++) paintDrop(g, edges, width, height, rng);
}

const canvas = document.createElement('canvas');
/** The mask the grade reads (`tBlood`). */
export const bloodMask = new THREE.CanvasTexture(canvas);
bloodMask.generateMipmaps = false;
bloodMask.minFilter = bloodMask.magFilter = THREE.LinearFilter;
bloodMask.colorSpace = THREE.NoColorSpace;

let painted = '', seen = '', seenAt = 0;

/** The mask's size for a canvas `width` x `height`: the same shape, its longest side at most `LONGEST`. */
function maskSize(width: number, height: number): [number, number] {
  const k = Math.min(1, LONGEST / Math.max(width, height, 1));
  return [Math.max(1, Math.round(width * k)), Math.max(1, Math.round(height * k))];
}

/** Paints the mask for a canvas `width` x `height` (px) once its size has stood still a moment; at once the first time. */
export function fitBloodMask(width: number, height: number): void {
  const [w, h] = maskSize(width, height), size = `${w}x${h}`;
  if (size === painted) return;
  const now = performance.now();
  if (size !== seen) { seen = size; seenAt = now; }
  if (painted && now - seenAt < SETTLE_MS) return;
  painted = size;
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) return;
  paintMask(g, w, h);
  bloodMask.dispose();
  bloodMask.needsUpdate = true;
}
