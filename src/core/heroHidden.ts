// How far what stands between the camera and the hero hides him, which what stands free thins by (core/seeThrough.ts):
// a few lines from the camera to points of his body, read against what's built and the circles of what stands free.
// Thinned all the time it took apart whatever he stood beside; with a hole his own size alone he showed by himself
// behind a wall ("character and context around character needs to be visible even if the character is behind props").
import * as THREE from 'three';
import { G } from '../state';
import { wallHit } from '../world/wall';
import { clamp, damp } from '../util';

/** the shares of his height the lines run to, and how far aside of his middle (m) */
const HEIGHTS = [0.2, 0.47, 0.72, 0.95];
const SIDES = [-0.25, 0, 0.25];
const POINTS = HEIGHTS.length * SIDES.length;
/** the lines read a frame: they're all read within a few frames, as he and the camera hardly move in one */
const LINES_A_FRAME = 4;
/** the share of the lines hidden at which it's fully thinned: a post before him hides a third of them */
const FULLY_OPEN = 0.3;
/** how fast it opens and closes (a rate, `damp`), slower closing: a fence walked along would pump it */
const OPENS = 7;
const CLOSES = 3;

const hidden = new Uint8Array(POINTS);
const _point = new THREE.Vector3();
const _hit = wallHit();
let next = 0;
let opening = 0;

/** Whether the line from `camera` to `point` crosses a circle of what stands free, under its top. */
function crossesObstacle(camera: THREE.Vector3, point: THREE.Vector3): boolean {
  const dx = point.x - camera.x;
  const dz = point.z - camera.z;
  const long2 = dx * dx + dz * dz;
  if (long2 < 1e-6) return false;
  for (const obstacle of G.arena.obstacles) {
    const { x, z } = obstacle;
    const { r, h } = obstacle.sight ?? obstacle;
    // (a circle he stands in isn't before him)
    if ((point.x - x) ** 2 + (point.z - z) ** 2 <= r * r) continue;
    const along = clamp(((x - camera.x) * dx + (z - camera.z) * dz) / long2, 0, 1);
    const offX = camera.x + dx * along - x;
    const offZ = camera.z + dz * along - z;
    if (offX * offX + offZ * offZ > r * r) continue;
    if (camera.y + (point.y - camera.y) * along < h) return true;
  }
  return false;
}

/** The hole's opening this frame (0: his own size, 1: wide), the camera at `camera`, him at (x, z) over `floor`. */
export function holeOpening(camera: THREE.Vector3, x: number, floor: number, z: number, height: number, props: number,
  dt: number): number {
  if (!G.arena?.wall || props <= 0) return (opening = 0);
  const toX = x - camera.x;
  const toZ = z - camera.z;
  const long = Math.hypot(toX, toZ) || 1;
  for (let line = 0; line < LINES_A_FRAME; line++) {
    next = (next + 1) % POINTS;
    const side = SIDES[next % SIDES.length];
    const up = HEIGHTS[Math.floor(next / SIDES.length)];
    _point.set(x - (toZ / long) * side, floor + height * up, z + (toX / long) * side);
    hidden[next] = crossesObstacle(camera, _point) || G.arena.wall.cast(camera, _point, _hit) ? 1 : 0;
  }
  const share = hidden.reduce((sum, one) => sum + one, 0) / POINTS;
  const wanted = clamp(share / FULLY_OPEN, 0, 1);
  opening = damp(opening, wanted, wanted > opening ? OPENS : CLOSES, dt);
  return opening;
}
