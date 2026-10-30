// The hero's own way to a spot he walks to of himself (a place picked on the village's map, an object clicked): the
// shortest way over a grid of where his body can stand, straightened into as few legs as it can be. The foes' fields
// (`navigation.ts`) know only round obstacles and the arena's ring; the village's walls, ledges and cottages are the
// wall's outlines, which the grid takes from the wall's own test of a body (`Wall.keepIn`). Walked straight at a spot
// over the map, he ran into whatever was in the way ("map waypoints dont work, when path is long and curved... it
// just runs into obstacles").
import { G } from '../state';
import type { Obstacle } from '../types';
import { state as propState } from './destructible';
import { MARGIN } from './navigation';

/** a cell of the grid (m) */
const CELL = 0.5;
/** how far a body may be moved off a cell's middle by the wall's test and still stand there (m) */
const STANDS = 0.01;

/** A grid of where a body of `radius` can stand, for the place's wall and obstacles as they were when it was made. */
interface StandGrid {
  obstacles: Obstacle[];
  rev: number;
  radius: number;
  n: number;
  half: number;
  open: Uint8Array;
}

let grid: StandGrid | null = null;

/** Whether a walk finds its way (off: straight at the spot, as before it did; the lab's canary). */
export const routing = { on: true };

/** Whether a body of `radius` stands at (x, z): clear of every obstacle by its margin, and where the wall leaves it. */
function stands(x: number, z: number, radius: number): boolean {
  for (const o of G.arena.obstacles) {
    if (o.h < 0.3) continue;
    if (Math.hypot(x - o.x, z - o.z) < o.r + radius + MARGIN) return false;
  }
  const at = { x, z };
  G.arena.wall.keepIn(at, radius + MARGIN);
  return Math.hypot(at.x - x, at.z - z) < STANDS;
}

/** The grid for the place shown now and a body of `radius`, made again when its obstacles or props change. */
function gridFor(radius: number): StandGrid {
  const obstacles = G.arena.obstacles;
  if (grid && grid.obstacles === obstacles && grid.rev === propState.rev && grid.radius === radius) return grid;
  const n = Math.ceil((2 * G.arena.wall.most) / CELL) + 2;
  const half = (n * CELL) / 2;
  const open = new Uint8Array(n * n);
  for (let j = 1; j < n - 1; j++) {
    for (let i = 1; i < n - 1; i++) {
      open[j * n + i] = stands((i + 0.5) * CELL - half, (j + 0.5) * CELL - half, radius) ? 1 : 0;
    }
  }
  grid = { obstacles, rev: propState.rev, radius, n, half, open };
  return grid;
}

const cellAt = (g: StandGrid, v: number): number => Math.min(g.n - 2, Math.max(1, Math.floor((v + g.half) / CELL)));
const middleOf = (g: StandGrid, i: number): number => (i + 0.5) * CELL - g.half;

/** The open cell nearest (i, j) within a few cells, or -1. */
function nearestOpen(g: StandGrid, i: number, j: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let dj = -4; dj <= 4; dj++) {
    for (let di = -4; di <= 4; di++) {
      const c = (j + dj) * g.n + (i + di);
      if (c < 0 || c >= g.open.length || !g.open[c]) continue;
      const d = di * di + dj * dj;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
  }
  return best;
}

/** Whether every cell along the line from cell a to cell b is open (a body walks it straight). */
function seesAlong(g: StandGrid, a: number, b: number): boolean {
  const ax = a % g.n, az = Math.floor(a / g.n), bx = b % g.n, bz = Math.floor(b / g.n);
  const steps = Math.ceil(Math.hypot(bx - ax, bz - az) * 2);
  for (let k = 1; k < steps; k++) {
    const t = k / steps;
    const c = Math.round(az + (bz - az) * t) * g.n + Math.round(ax + (bx - ax) * t);
    if (!g.open[c]) return false;
  }
  return true;
}

/** The cells of the shortest way from cell `from` to cell `to` over the open cells (8 ways, no corner cut), or none. */
function shortest(g: StandGrid, from: number, to: number): number[] | null {
  const cost = new Float32Array(g.open.length).fill(Infinity);
  const came = new Int32Array(g.open.length).fill(-1);
  const queue: number[] = [from];
  cost[from] = 0;
  // (each step's cells across and along: a diagonal steps by both, and both must be open)
  const across = [1, -1, 0, 0, 1, -1, 1, -1];
  const along = [0, 0, 1, -1, 1, 1, -1, -1];
  const tx = to % g.n, tz = Math.floor(to / g.n);
  const guess = (c: number): number => Math.hypot((c % g.n) - tx, Math.floor(c / g.n) - tz);
  while (queue.length) {
    // (the queue's best by cost and guess: a few thousand cells at most, a linear pick is quick enough)
    let at = 0;
    for (let k = 1; k < queue.length; k++) {
      if (cost[queue[k]] + guess(queue[k]) < cost[queue[at]] + guess(queue[at])) at = k;
    }
    const c = queue[at];
    queue[at] = queue[queue.length - 1];
    queue.pop();
    if (c === to) break;
    for (let k = 0; k < 8; k++) {
      const next = c + across[k] + along[k] * g.n;
      if (!g.open[next]) continue;
      if (k >= 4 && (!g.open[c + across[k]] || !g.open[c + along[k] * g.n])) continue;
      const v = cost[c] + (k < 4 ? 1 : Math.SQRT2);
      if (v >= cost[next]) continue;
      if (cost[next] === Infinity) queue.push(next);
      cost[next] = v;
      came[next] = c;
    }
  }
  if (cost[to] === Infinity) return null;
  const cells = [to];
  while (cells[cells.length - 1] !== from) cells.push(came[cells[cells.length - 1]]);
  return cells.reverse();
}

/** The grid of the place shown made ahead for a body of `radius`, as the boot builds the world: made at a walk's
 *  first call, it held the first map click up 240 ms. */
export function prepareWalks(radius: number): void {
  gridFor(radius);
}

/**
 * The way a body of `radius` at (x, z) walks to (tx, tz): the points it heads for in turn, the last the spot itself,
 * each leg one it walks straight; the spot alone where the way is clear or none is found.
 */
export function walkPath(x: number, z: number, tx: number, tz: number, radius: number): [number, number][] {
  if (!routing.on) return [[tx, tz]];
  const g = gridFor(radius);
  const from = nearestOpen(g, cellAt(g, x), cellAt(g, z));
  const to = nearestOpen(g, cellAt(g, tx), cellAt(g, tz));
  if (from < 0 || to < 0 || seesAlong(g, from, to)) return [[tx, tz]];
  const cells = shortest(g, from, to);
  if (!cells) return [[tx, tz]];
  // (straightened: from each corner on to the furthest cell still seen along open cells)
  const corners: [number, number][] = [];
  let at = 0;
  while (at < cells.length - 1) {
    let next = cells.length - 1;
    while (next > at + 1 && !seesAlong(g, cells[at], cells[next])) next--;
    if (next < cells.length - 1) corners.push([middleOf(g, cells[next] % g.n), middleOf(g, Math.floor(cells[next] / g.n))]);
    at = next;
  }
  corners.push([tx, tz]);
  return corners;
}
