// Items lying on the arena floor: arc out of the source, show a rarity beam and
// a label, and are collected into the run bag when the player walks over them.
import * as THREE from 'three';
import { G } from '../state';
import { PICKUP_RADIUS } from '../data/balance';
import { rarityOf, rarityIndex } from './items';
import { groundHeight } from '../world/arena';
import { addAnchored, removeAnchored } from '../ui/floaters';
import { burst, particles, col } from '../fx/particles';
import { sfx } from '../core/audio';
import { emit } from '../events';
import { rand } from '../util';
import type { Item, Slot } from '../types';

/** An item lying on the floor. */
export interface Drop {
  item: Item;
  obj: THREE.Group;
  mesh: THREE.Mesh;
  beam: THREE.Mesh | null;
  beamMat: THREE.MeshBasicMaterial | null;
  mat: THREE.MeshStandardMaterial;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  landed: boolean;
  label: HTMLDivElement;
  ri: number;
}

const SHAPES: Record<Slot, () => THREE.BufferGeometry> = {
  weapon: () => new THREE.CylinderGeometry(0.03, 0.04, 0.9, 6).rotateZ(Math.PI / 2),
  offhand: () => new THREE.SphereGeometry(0.16, 16, 12),
  head: () => new THREE.SphereGeometry(0.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  chest: () => new THREE.BoxGeometry(0.4, 0.12, 0.34),
  hands: () => new THREE.BoxGeometry(0.2, 0.1, 0.26),
  amulet: () => new THREE.TorusGeometry(0.14, 0.025, 6, 20).rotateX(Math.PI / 2),
  ring: () => new THREE.TorusGeometry(0.1, 0.03, 6, 16).rotateX(Math.PI / 2),
};
const shapeCache: Partial<Record<Slot, THREE.BufferGeometry>> = {};
const beamGeo = new THREE.CylinderGeometry(0.06, 0.28, 6, 12, 1, true).translate(0, 3, 0);
let beamAlpha: THREE.CanvasTexture | null = null;

function beamAlphaMap(): THREE.CanvasTexture {
  if (beamAlpha) return beamAlpha;
  const c = document.createElement('canvas');
  c.width = 4; c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(0.7, 'rgba(90,90,90,1)');
  grad.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 128);
  beamAlpha = new THREE.CanvasTexture(c);
  return beamAlpha;
}

export function dropItem(item: Item, from: THREE.Vector3): Drop {
  const r = rarityOf(item.rarity);
  const ri = rarityIndex(item.rarity);
  const color = new THREE.Color(r.color);
  const obj = new THREE.Group();
  obj.name = 'drop';
  const geo = shapeCache[item.slot] ??= SHAPES[item.slot]();
  const mat = new THREE.MeshStandardMaterial({ color: 0x9a9aa4, metalness: 0.9, roughness: 0.3, emissive: color, emissiveIntensity: 0.6 + ri * 0.4 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  obj.add(mesh);
  let beam: THREE.Mesh | null = null, beamMat: THREE.MeshBasicMaterial | null = null;
  if (ri >= 1) {
    beamMat = new THREE.MeshBasicMaterial({
      color: color.clone().multiplyScalar(1.2 + ri * 0.4), transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, alphaMap: beamAlphaMap(), opacity: 0.8,
    });
    beam = new THREE.Mesh(beamGeo, beamMat);
    beam.scale.set(1, 0.4 + ri * 0.25, 1);
    obj.add(beam);
  }
  G.scene.add(obj);

  // land in a random spot around the source
  const a = Math.random() * Math.PI * 2, d = rand(0.8, 2.6);
  const R = G.arena.radius - 1.5;
  const to = new THREE.Vector3(from.x + Math.cos(a) * d, 0, from.z + Math.sin(a) * d);
  const len = Math.hypot(to.x, to.z);
  if (len > R) to.multiplyScalar(R / len);
  to.y = groundHeight(to.x, to.z);

  const label = document.createElement('div');
  label.className = 'loot-label';
  label.style.color = r.color;
  label.textContent = item.name;
  const drop: Drop = { item, obj, mesh, beam, beamMat, mat, from: from.clone(), to, t: 0, landed: false, label, ri };
  addAnchored(label, () => (drop.landed ? { x: drop.to.x, y: drop.to.y + 0.6, z: drop.to.z } : null));
  G.drops.push(drop);
  sfx.loot(ri);
  return drop;
}

function collect(drop: Drop, i: number): void {
  G.drops.splice(i, 1);
  removeAnchored(drop.label);
  G.scene.remove(drop.obj);
  drop.mat.dispose(); drop.beamMat?.dispose();
  burst(drop.obj.position, { count: 14, color: rarityOf(drop.item.rarity).color, speed: 2.5, up: 3, life: 0.5, size: 0.2, gravity: 0 });
  sfx.pickup();
  G.run?.bag.push(drop.item);
  emit('itemPicked', drop.item);
}

export function updateDrops(dt: number): void {
  const p = G.player;
  for (let i = G.drops.length - 1; i >= 0; i--) {
    const d = G.drops[i];
    d.t += dt;
    if (!d.landed) {
      const k = Math.min(1, d.t / 0.6);
      d.obj.position.lerpVectors(d.from, d.to, k);
      d.obj.position.y = THREE.MathUtils.lerp(d.from.y, d.to.y, k) + Math.sin(k * Math.PI) * 2.2;
      d.mesh.rotation.x += dt * 12;
      if (d.beam) d.beam.visible = false;
      if (k >= 1) {
        d.landed = true;
        d.mesh.rotation.set(0, 0, 0);
        if (d.beam) d.beam.visible = true;
        burst(d.to, { count: 8 + d.ri * 4, color: rarityOf(d.item.rarity).color, speed: 2, up: 2, life: 0.4, size: 0.2 });
      }
      continue;
    }
    d.obj.position.y = d.to.y + 0.2 + Math.sin(d.t * 2.5) * 0.05;
    d.mesh.rotation.y += dt * 1.5;
    if (d.beamMat) d.beamMat.opacity = 0.6 + Math.sin(d.t * 3) * 0.2;
    if (d.ri >= 3 && Math.random() < dt * 8) particles.glow.spawn({
      x: d.to.x + rand(-0.2, 0.2), y: d.to.y + 0.1, z: d.to.z + rand(-0.2, 0.2), vy: rand(0.8, 2),
      life: 0.8, size: 0.12, sizeEnd: 0, color: col(rarityOf(d.item.rarity).color, 2),
    });
    if (p && p.alive && Math.hypot(p.pos.x - d.to.x, p.pos.z - d.to.z) < PICKUP_RADIUS) collect(d, i);
  }
}

/** Collect everything left on the floor (used when banking / continuing). */
export function vacuumDrops(): void {
  for (let i = G.drops.length - 1; i >= 0; i--) collect(G.drops[i], i);
}

export function clearDrops(): void {
  for (const d of G.drops) { removeAnchored(d.label); G.scene.remove(d.obj); d.mat.dispose(); d.beamMat?.dispose(); }
  G.drops.length = 0;
}
