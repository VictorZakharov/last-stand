// Circle-vs-world collision: static obstacles and the arena's wall as it's drawn (`world/wall.ts`).
import * as THREE from 'three';
import { G } from '../state';
import { groundHeight } from './ground';
import { state as props, type Prop } from './destructible';
import { placeBefore, stackBefore } from '../entities/carry';
import type { Enemy } from '../entities/enemy';

export function resolveWorld(pos: { x: number; z: number }, radius: number): void {
  resolveProps(pos, radius);
  G.arena.wall.keepIn(pos, radius);
}

/** A body of `radius` at `pos` pushed off the static obstacles (not the wall). */
export function resolveProps(pos: { x: number; z: number }, radius: number): void {
  for (const o of G.arena.obstacles) {
    const dx = pos.x - o.x, dz = pos.z - o.z;
    const min = o.r + radius;
    const d2 = dx * dx + dz * dz;
    if (d2 < min * min && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      pos.x = o.x + (dx / d) * min;
      pos.z = o.z + (dz / d) * min;
    }
  }
}

/** How high the top of what a prop draws is over (x, z), as its top grid has it (`buildTops`: a breakable
 *  prop: the crypt's and the forest's four pillars, the columns, the stones), or its circle's height where it draws
 *  nothing that can be met (`Obstacle.h`); none (-Infinity) where no standing prop is. A blow brought down onto a
 *  prop stops on it as it does on a foe (from play: "if warrior hits a prop, weapon should not disappear inside of
 *  it, it should collide like enemy", "props collision should keep into the account the shape of prop, including 4
 *  pillars in the center area"). */
export function propTopAt(x: number, z: number): number {
  let top = -Infinity;
  // (the hall of heroes' stage stands where the biome's dais is, with none of its props)
  if (!G.arena || G.arena.hallShown) return top;
  for (const o of G.arena.obstacles) {
    if (o.prop?.broken) continue;
    const dx = x - o.x, dz = z - o.z;
    if (dx * dx + dz * dz >= o.r * o.r) continue;
    if (!o.prop) {
      top = Math.max(top, groundHeight(o.x, o.z) + o.h);
      continue;
    }
    top = Math.max(top, topOf(gridOf(o.prop), x, z));
  }
  return top;
}

/** A prop's top on a grid over its circles: the highest of what it draws over each cell's middle (m), made once from
 *  its triangles. (Read by three's raycaster, every triangle of the prop for each point, a two-hander's blow brought
 *  down onto a pillar or a log held the game at 4 fps: its stop reads hundreds of points a frame.) */
interface TopGrid { x0: number; z0: number; nx: number; nz: number; tops: Float32Array }
/** a top grid's cell (m) */
const TOP_CELL = 0.04;
/** each prop's top grid, made as it's first read, all made again once the props change (`state.rev`: rolled, broken,
 *  back) */
const grids = new Map<Prop, TopGrid>();
let gridsRev = -1;

function gridOf(p: Prop): TopGrid {
  if (gridsRev !== props.rev) {
    grids.clear();
    gridsRev = props.rev;
  }
  let grid = grids.get(p);
  if (!grid) {
    grid = buildTops(p);
    grids.set(p, grid);
  }
  return grid;
}

/** what `grid` holds at (x, z), -Infinity outside it or where the prop draws nothing */
function topOf(grid: TopGrid, x: number, z: number): number {
  const i = Math.floor((x - grid.x0) / TOP_CELL), k = Math.floor((z - grid.z0) / TOP_CELL);
  if (i < 0 || k < 0 || i >= grid.nx || k >= grid.nz) return -Infinity;
  return grid.tops[k * grid.nx + i];
}

/** `p`'s top grid over the box round its circles: each triangle it draws laid over the cells whose middles it covers
 *  seen from above, the highest kept, and each corner in its own cell (a face standing upright covers none). */
function buildTops(p: Prop): TopGrid {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const o of p.parts) {
    minX = Math.min(minX, o.x - o.r); maxX = Math.max(maxX, o.x + o.r);
    minZ = Math.min(minZ, o.z - o.r); maxZ = Math.max(maxZ, o.z + o.r);
  }
  const nx = Math.max(1, Math.ceil((maxX - minX) / TOP_CELL)), nz = Math.max(1, Math.ceil((maxZ - minZ) / TOP_CELL));
  const grid: TopGrid = { x0: minX, z0: minZ, nx, nz, tops: new Float32Array(nx * nz).fill(-Infinity) };
  p.surfaces((mesh) => {
    const position = mesh.geometry.getAttribute('position');
    if (!position) return;
    const index = mesh.geometry.getIndex();
    const count = index ? index.count : position.count;
    for (let t = 0; t + 2 < count; t += 3) {
      for (let c = 0; c < 3; c++) {
        _corners[c].fromBufferAttribute(position, index ? index.getX(t + c) : t + c).applyMatrix4(mesh.matrixWorld);
      }
      layTriangle(grid, _corners[0], _corners[1], _corners[2]);
    }
  });
  return grid;
}
const _corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

/** One triangle laid over `grid`: its height at each cell's middle it covers seen from above, and its corners'. */
function layTriangle(grid: TopGrid, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void {
  for (const v of [a, b, c]) raise(grid, Math.floor((v.x - grid.x0) / TOP_CELL), Math.floor((v.z - grid.z0) / TOP_CELL), v.y);
  const area = (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z);
  if (Math.abs(area) < 1e-9) return;
  const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - grid.x0) / TOP_CELL));
  const i1 = Math.min(grid.nx - 1, Math.floor((Math.max(a.x, b.x, c.x) - grid.x0) / TOP_CELL));
  const k0 = Math.max(0, Math.floor((Math.min(a.z, b.z, c.z) - grid.z0) / TOP_CELL));
  const k1 = Math.min(grid.nz - 1, Math.floor((Math.max(a.z, b.z, c.z) - grid.z0) / TOP_CELL));
  for (let k = k0; k <= k1; k++) {
    const z = grid.z0 + (k + 0.5) * TOP_CELL;
    for (let i = i0; i <= i1; i++) {
      const x = grid.x0 + (i + 0.5) * TOP_CELL;
      // (the cell's middle in the triangle's own terms, seen from above)
      const wb = ((x - a.x) * (c.z - a.z) - (c.x - a.x) * (z - a.z)) / area;
      const wc = ((b.x - a.x) * (z - a.z) - (x - a.x) * (b.z - a.z)) / area;
      if (wb < 0 || wc < 0 || wb + wc > 1) continue;
      raise(grid, i, k, a.y + wb * (b.y - a.y) + wc * (c.y - a.y));
    }
  }
}

function raise(grid: TopGrid, i: number, k: number, y: number): void {
  if (i < 0 || k < 0 || i >= grid.nx || k >= grid.nz) return;
  const cell = k * grid.nx + i;
  if (y > grid.tops[cell]) grid.tops[cell] = y;
}

/** Does a body of `radius` at `pos` overlap a static obstacle? */
export function inObstacle(pos: { x: number; z: number }, radius: number): boolean {
  return G.arena.obstacles.some((o) => Math.hypot(pos.x - o.x, pos.z - o.z) < o.r + radius);
}

/** A co-op guest's copy its own game places (its own hero's charge swept it up), not the host's reports. */
const placedHere = (e: Enemy): boolean => e.carried !== null || e.ownFor >= 0;

/** Push overlapping enemies apart (and away from the players): on a co-op guest, which simulates no foe (`ownOnly`),
 *  only the copies its own hero's charge carries, as the host pushes the foes they are, off every other copy as off
 *  a wall (left on top of each other, they were thrown on fanned out as they rode, and one came down 2.5 m across
 *  from where the host threw it; kept off each other alone, one ran into a copy not yet met and was shoved out of
 *  it 73 cm in a frame as it was met). */
export function separateEnemies(ownOnly = false): void {
  const list = G.enemies;
  if (ownOnly && !list.some(placedHere)) return;
  const moves = (e: Enemy): boolean => !ownOnly || placedHere(e);
  // (the foes each charge carries stacked before its hero first, as they ride)
  if (list.some((e) => e.carried)) {
    for (const p of G.players) stackBefore(p, list.filter((e) => e.carried?.by === p && moves(e)));
  }
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    // (a foe thrown through the air flies over the others and the players)
    if (!a.alive || a.spawning || a.tossed) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (!b.alive || b.spawning || b.tossed || (!moves(a) && !moves(b))) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const min = a.radius + b.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (min - d) * 0.5;
        const shared = b.mass / (a.mass + b.mass);
        const wa = !moves(b) ? 1 : !moves(a) ? 0 : shared, wb = 1 - wa;
        a.pos.x -= (dx / d) * push * wa * 2; a.pos.z -= (dz / d) * push * wa * 2;
        b.pos.x += (dx / d) * push * wb * 2; b.pos.z += (dz / d) * push * wb * 2;
      }
    }
    if (!moves(a)) continue;
    for (const p of G.players) {
      if (!p.active) continue;
      const dx = a.pos.x - p.pos.x, dz = a.pos.z - p.pos.z;
      const min = a.radius + p.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        if (a.carried) {
          // (carried before a charge: kept clear before its hero, where the foes it rides with pushed it)
          placeBefore(a.pos, a.radius, a.carried);
        } else if (a.def.dummy) {
          // training dummies are planted: the player slides around them (a partner is moved by its own game)
          if (!p.local) continue;
          p.pos.x = a.pos.x - (dx / d) * min;
          p.pos.z = a.pos.z - (dz / d) * min;

        } else {
          // enemies yield the overlap so the player isn't shoved around
          a.pos.x = p.pos.x + (dx / d) * min;
          a.pos.z = p.pos.z + (dz / d) * min;
        }
      }
    }
  }
}
