// Strawman: a scarecrow raised out of the ground at the aim. For `duration` s every foe within `radius` of it but the
// elites and bosses leaves the players for it (a lure, combat/lures.ts) and gathers round it striking at it: a clump
// for a rain of arrows. It takes their blows without harm, rocking under them, and sinks back into the ground when its
// time is up (it doesn't burst). Every game shows it; only the one simulating the fight has foes it can lure.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../../state';
import { addEffect, shockwave } from '../../fx/effects';
import { debris } from '../../fx/particles';
import { sfx } from '../../core/audio';
import { groundHeight } from '../../world/arena';
import { additive } from '../../core/materials';
import { floorPatch, lay } from '../../fx/floorPatch';
import { resolveWorld } from '../../world/collision';
import { lures, lurable, LURE_SLOT, type Lure } from '../lures';
import { mulberry } from '../../util';
import type { InstantSkill, Needs } from './types';

type Def = Needs<'duration' | 'radius' | 'range'>;

const STRAW = 0xd8c072;
/** its post's radius on the floor (m): the foes' blows land from just outside it */
const BODY_R = 0.32;
/** rising out of the ground and sinking back (s), and how deep it starts (m) */
const RISE = 0.3, SINK = 0.45, DEPTH = 2;
let serial = 0;

/** The scarecrow, built once: a post and crossbar in an old coat, a stuffed sack for a head under a felt hat, straw
 *  sticking out of the sleeves, the hem and the neck. */
let geo: THREE.BufferGeometry | null = null;
function scarecrow(): THREE.BufferGeometry {
  if (geo) return geo;
  const rng = mulberry(7), parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, color: number, vary = 0.08) => {
    const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3), v = new THREE.Color();
    for (let i = 0; i < n; i++) v.copy(c).multiplyScalar(1 - vary + rng() * vary * 2).toArray(a, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    parts.push(g);
  };
  const WOOD = 0x5b4129, COAT = 0x5d6b3c, SACK = 0xb59c6c, ROPE = 0x8a6f48, FELT = 0x4d4a33, DARK = 0x2a2015;
  add(new THREE.CylinderGeometry(0.05, 0.06, 1.95, 7).translate(0, 0.775, 0), WOOD);
  add(new THREE.CylinderGeometry(0.035, 0.035, 1.25, 6).rotateZ(Math.PI / 2).translate(0, 1.36, 0), WOOD);
  // the coat: ragged at its hem, the shoulders rounded over the crossbar, sleeves drooping a little at their ends
  const coat = new THREE.CylinderGeometry(0.17, 0.27, 0.72, 12, 2);
  const p = coat.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < -0.35) p.setY(i, p.getY(i) + (rng() - 0.6) * 0.12);
  add(coat.translate(0, 1.05, 0), COAT, 0.14);
  add(new THREE.SphereGeometry(0.19, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.3, 0.45, 0.8).translate(0, 1.4, 0), COAT, 0.1);
  for (const s of [1, -1]) {
    add(new THREE.CylinderGeometry(0.075, 0.095, 0.44, 8).rotateZ(Math.PI / 2 - s * 0.12).translate(s * 0.37, 1.34, 0), COAT, 0.14);
  }
  add(new THREE.SphereGeometry(0.16, 12, 9).scale(1, 1.12, 0.92).translate(0, 1.68, 0), SACK, 0.1);
  add(new THREE.TorusGeometry(0.075, 0.018, 5, 12).rotateX(Math.PI / 2).translate(0, 1.52, 0), ROPE);
  // a face stitched on the sack
  for (const s of [1, -1]) add(new THREE.BoxGeometry(0.035, 0.035, 0.02).rotateZ(Math.PI / 4).translate(s * 0.055, 1.71, 0.142), DARK, 0);
  add(new THREE.BoxGeometry(0.1, 0.014, 0.02).translate(0, 1.625, 0.14), DARK, 0);
  // the hat, pushed back a little
  const hat = mergeGeometries([new THREE.CylinderGeometry(0.28, 0.28, 0.02, 14), new THREE.CylinderGeometry(0.1, 0.15, 0.2, 10).translate(0, 0.1, 0)])!;
  add(hat.rotateX(-0.15).rotateZ(0.1).translate(0, 1.83, -0.02), FELT, 0.06);
  // straw: out of each sleeve, round the hem and from the neck
  const tuft = (x: number, y: number, z: number, dx: number, dy: number, dz: number, len: number) => {
    const d = new THREE.Vector3(dx, dy, dz).normalize(), g = new THREE.ConeGeometry(0.022, len, 4).translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d)).translate(x, y, z);
    add(g, STRAW, 0.18);
  };
  for (const s of [1, -1]) for (let i = 0; i < 6; i++) tuft(s * 0.58, 1.33 + (rng() - 0.5) * 0.08, (rng() - 0.5) * 0.08, s, (rng() - 0.6) * 1.2, (rng() - 0.5) * 1.2, 0.14 + rng() * 0.1);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + rng() * 0.3; tuft(Math.sin(a) * 0.25, 0.74, Math.cos(a) * 0.25, Math.sin(a) * 0.5, -1, Math.cos(a) * 0.5, 0.12 + rng() * 0.1); }
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + rng(); tuft(Math.sin(a) * 0.07, 1.53, Math.cos(a) * 0.07, Math.sin(a), 0.6 + rng(), Math.cos(a), 0.1 + rng() * 0.06); }
  geo = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
  return geo;
}
const strawMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });

/** Where it stands for an aim at `target`: at the aim, within reach, out of the props and inside the arena. */
function standAt(player: { pos: THREE.Vector3 }, def: Def, target: THREE.Vector3): THREE.Vector3 {
  const pos = target.clone().sub(player.pos); pos.y = 0;
  if (pos.length() > def.range) pos.setLength(def.range);
  pos.add(player.pos); pos.y = 0;
  const R = G.arena.radius - 1.5, r = Math.hypot(pos.x, pos.z);
  if (r > R) { pos.x *= R / r; pos.z *= R / r; }
  resolveWorld(pos, BODY_R + 0.1);
  return pos;
}

/** (it faces the one who raised it) */
const facingFrom = (player: { pos: THREE.Vector3 }, pos: THREE.Vector3): number => Math.atan2(player.pos.x - pos.x, player.pos.z - pos.z);

/** the preview's glow: the scarecrow's outline where it would stand, and the ring it calls foes from */
const ghostMat = () => additive(STRAW, 0.7, 0.32);
const reachGeo = () => floorPatch(0.975, 1, 1, 96);
/** the ring at its foot (m: from above, the scarecrow's outline alone was a small blur of light) */
const SPOT_R = BODY_R + 0.35;
const spotGeo = () => floorPatch(0.8, 1, 1, 40);

/**
 * While the key is held: a glowing outline of the scarecrow where it would stand, a ring at its foot, and how far it
 * would call foes from.
 */
interface Preview { body: THREE.Mesh; spot: THREE.Mesh; spotG: THREE.BufferGeometry; reach: THREE.Mesh; reachG: THREE.BufferGeometry }
let preview: Preview | null = null;

function previewFor(): Preview {
  if (preview) return preview;
  const reachG = reachGeo(), spotG = spotGeo();
  const body = new THREE.Mesh(scarecrow(), ghostMat()), reach = new THREE.Mesh(reachG, additive(STRAW, 1, 0.45));
  const spot = new THREE.Mesh(spotG, additive(STRAW, 1.6, 0.8));
  body.frustumCulled = spot.frustumCulled = reach.frustumCulled = false;
  body.name = 'strawman-preview'; spot.name = 'strawman-preview-spot'; reach.name = 'strawman-preview-reach';
  G.scene.add(body, spot, reach);
  preview = { body, spot, spotG, reach, reachG };
  return preview;
}

/** Shows where it would stand for `target` (null: nothing shown). */
function showStand(player: { pos: THREE.Vector3 }, def: Def, target: THREE.Vector3 | null): void {
  if (!target) {
    if (preview) preview.body.visible = preview.spot.visible = preview.reach.visible = false;
    return;
  }
  const p = previewFor(), pos = standAt(player, def, target);
  p.body.visible = p.spot.visible = p.reach.visible = true;
  p.spot.position.set(pos.x, 0, pos.z);
  p.spot.scale.set(SPOT_R, 1, SPOT_R);
  lay(p.spotG, pos.x, pos.z, 0.05, SPOT_R);
  p.body.position.set(pos.x, groundHeight(pos.x, pos.z), pos.z);
  p.body.rotation.set(0, facingFrom(player, pos), 0);
  p.reach.position.set(pos.x, 0, pos.z);
  p.reach.scale.set(def.radius, 1, def.radius);
  lay(p.reachG, pos.x, pos.z, 0.05, def.radius);
}

const skill: InstantSkill = {
  anim: 'cast', warm: () => [new THREE.Mesh(scarecrow(), strawMat), new THREE.Mesh(scarecrow(), ghostMat()), new THREE.Mesh(reachGeo(), additive(STRAW, 1, 0.45))],
  aim: (player, def, target) => showStand(player, def as Def, target),
  cast(player, rawDef, target) {
    const def = rawDef as Def;
    const pos = standAt(player, def, target);
    const mesh = new THREE.Mesh(scarecrow(), strawMat);
    mesh.castShadow = true; mesh.name = 'strawman';
    const yaw = facingFrom(player, pos);
    G.scene.add(mesh);
    // rocking under the blows: a spring each way it can tip
    const tip = { x: 0, z: 0, vx: 0, vz: 0 };
    const lure: Lure = { pos, radius: BODY_R, until: G.time + def.duration, slot: LURE_SLOT + (serial++ % 8),
      struck() { tip.vx += (Math.random() - 0.5) * 3; tip.vz += (Math.random() - 0.5) * 3; debris({ x: pos.x, y: groundHeight(pos.x, pos.z) + 1.1, z: pos.z }, { count: 4, color: STRAW, speed: 2, size: 0.07, life: 0.7 }); } };
    lures.push(lure);
    const unlure = () => { const i = lures.indexOf(lure); if (i >= 0) lures.splice(i, 1); };
    const floor = groundHeight(pos.x, pos.z);
    debris({ x: pos.x, y: floor, z: pos.z }, { count: 14, color: 0x4a3a28, speed: 3.5, size: 0.12, life: 0.9 });
    debris({ x: pos.x, y: floor + 0.8, z: pos.z }, { count: 10, color: STRAW, speed: 2.5, size: 0.07, life: 0.9 });
    // (how far it calls them from)
    shockwave(pos, { color: STRAW, intensity: 0.55, from: 0.6, to: def.radius, life: 0.6 });
    sfx.straw();
    let t = 0, sunk = false;
    addEffect({
      update(dt) {
        t += dt;
        // every foe near it it can lure goes for it while it stands (one raised later takes them from an older one)
        if (t < def.duration) {
          for (const e of G.enemies) {
            if (e.lure === lure || !lurable(e) || (e.lure && e.lure.until > lure.until)) continue;
            if (Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < def.radius) e.lure = lure;
          }
        } else if (!sunk) {
          sunk = true; unlure();
          debris({ x: pos.x, y: floor + 0.6, z: pos.z }, { count: 12, color: STRAW, speed: 2, size: 0.07, life: 0.8 });
          debris({ x: pos.x, y: floor, z: pos.z }, { count: 8, color: 0x4a3a28, speed: 2.5, size: 0.1, life: 0.7 });
        }
        tip.vx += (-70 * tip.x - 7 * tip.vx) * dt; tip.vz += (-70 * tip.z - 7 * tip.vz) * dt;
        tip.x += tip.vx * dt; tip.z += tip.vz * dt;
        const up = Math.min(1, t / RISE), down = Math.max(0, (t - def.duration) / SINK);
        // (up quickly, overshooting a little and settling; down slowly)
        const y = -DEPTH * (1 - up) ** 3 + Math.sin(up * Math.PI) * 0.06 - DEPTH * down * down;
        mesh.position.set(pos.x, floor + y, pos.z);
        mesh.rotation.set(tip.x + Math.sin(t * 2.1) * 0.015, yaw, tip.z + Math.sin(t * 1.7 + 1) * 0.02);
        return down < 1;
      },
      dispose() { unlure(); G.scene.remove(mesh); },
    });
  },
};

export default skill;
