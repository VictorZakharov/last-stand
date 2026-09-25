// A thrown seed pod (the Thornheart's volleys): a small dark, thorny pod lit by the scene, spinning inside
// a swirling swarm of spores (particles), with sap flowing through its veins (a scrolling texture) and a trail of spore
// smoke. It reads as a thing thrown, not a light: its glow is many dim spores, not one hot core.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../state';
import { lumpy } from '../world/props';
import { makeFbm } from '../util';
import { particles, col } from './particles';

let geo: THREE.BufferGeometry | null = null;
let mat: THREE.MeshStandardMaterial | null = null;

/** Sap veins: bright ridges of noise on black, tiling, so scrolling it makes the sap flow. */
function veins(): THREE.CanvasTexture {
  const n = 128, c = document.createElement('canvas');
  c.width = c.height = n;
  const x = c.getContext('2d')!, img = x.createImageData(n, n), fbm = makeFbm(17, 4, 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const v = 1 - Math.min(1, Math.abs(fbm(i / n * 4, j / n * 4) - 0.5) * 9);
    const k = (j * n + i) * 4, b = Math.round(255 * v * v);
    img.data[k] = img.data[k + 1] = img.data[k + 2] = b; img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function parts(color: number): [THREE.BufferGeometry, THREE.MeshStandardMaterial] {
  if (!geo) {
    const pod = lumpy(new THREE.IcosahedronGeometry(1, 1), 0.12, 3).scale(1, 1, 1.3);
    const thorns: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2, t = new THREE.ConeGeometry(0.16, 0.7, 4).translate(0, 1.1, 0);
      t.rotateX(1.2 * Math.sin(a * 2.3)).rotateZ(a);
      thorns.push(t.toNonIndexed());
    }
    geo = mergeGeometries([pod.toNonIndexed(), ...thorns]);
    // spherical uv for the veins
    const p = geo.attributes.position, uv = new Float32Array(p.count * 2), v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      uv[i * 2] = Math.atan2(v.z, v.x) / (Math.PI * 2) + 0.5; uv[i * 2 + 1] = Math.asin(v.y) / Math.PI + 0.5;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeVertexNormals();
  }
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color: 0x243018, roughness: 0.55, metalness: 0.05, flatShading: true,
      emissive: new THREE.Color(color), emissiveMap: veins(), emissiveIntensity: 1.4,
    });
  }
  return [geo, mat];
}

/** A pod of radius `size` (its cloud is 3.5 times that), in the boss's sap colour. */
export function seedPod(color: number, size: number): THREE.Mesh {
  const [g, m] = parts(color);
  const mesh = new THREE.Mesh(g, m);
  mesh.scale.setScalar(size);
  mesh.rotation.set(Math.random() * 6, Math.random() * 6, 0);
  return mesh;
}

const _off = new THREE.Vector3(), _dir = new THREE.Vector3(), _sw = new THREE.Vector3();
/** A random point in a ball of radius r round `pos`, and the swirl there round the flight line. */
function inBall(pos: THREE.Vector3, r: number, shell: boolean): void {
  do _off.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1); while (_off.lengthSq() > 1);
  if (shell) _off.normalize();
  _off.multiplyScalar(r);
  _sw.crossVectors(_dir, _off);
  _off.add(pos);
}

/**
 * Each frame of a pod's flight: it spins inside a swirling swarm of spores and smoke carried along with it, with flowing sap in its veins and a trail of spore smoke left behind.
 */
export function seedPodTick(mesh: THREE.Object3D, pos: THREE.Vector3, vel: THREE.Vector3, color: number, smoke: number, dt: number, acc: { t: number }): void {
  mesh.rotation.x += dt * 7; mesh.rotation.y += dt * 3;
  if (mat?.emissiveMap) mat.emissiveMap.offset.set(G.time * 0.15, G.time * 0.35);
  _dir.copy(vel).normalize();
  const r = mesh.scale.x * 3.5, sc = col(smoke), sw = col(color, 0.35), gc = col(color, 1.4);
  acc.t += dt * 60;
  while (acc.t >= 1) {
    acc.t -= 1;
    // the cloud: a swarm of dim spores in a ball round the pod (dense in the middle, where they add up),
    // swirling round the flight line as they go, with a haze of smoke
    for (let i = 0; i < 4; i++) {
      inBall(pos, r, false);
      particles.glow.spawn({
        x: _off.x, y: _off.y, z: _off.z, vx: vel.x + _sw.x * 5, vy: vel.y + _sw.y * 5, vz: vel.z + _sw.z * 5,
        life: 0.22, size: 0.16, sizeEnd: 0.04, color: sw, drag: 0,
      });
    }
    inBall(pos, r, true);
    particles.glow.spawn({
      x: _off.x, y: _off.y, z: _off.z, vx: vel.x + _sw.x * 7, vy: vel.y + _sw.y * 7, vz: vel.z + _sw.z * 7,
      life: 0.2, size: 0.1, sizeEnd: 0.03, color: gc, drag: 0,
    });
    inBall(pos, r * 0.7, false);
    particles.smoke.spawn({
      x: _off.x, y: _off.y, z: _off.z, vx: vel.x + _sw.x * 3, vy: vel.y + _sw.y * 3, vz: vel.z + _sw.z * 3,
      life: 0.25, size: 0.4, sizeEnd: 0.25, color: sc, alpha: 0.35, drag: 0,
    });
    // the spore smoke it leaves behind
    if (Math.random() < 0.5) particles.smoke.spawn({
      x: pos.x + (Math.random() - 0.5) * 0.3, y: pos.y + (Math.random() - 0.5) * 0.3, z: pos.z + (Math.random() - 0.5) * 0.3,
      vx: (Math.random() - 0.5) * 0.5, vy: 0.3 + Math.random() * 0.4, vz: (Math.random() - 0.5) * 0.5,
      life: 0.6 + Math.random() * 0.4, size: 0.35, sizeEnd: 1.1, color: sc, alpha: 0.3, drag: 2.5,
    });
  }
}

/** Sample for the load-time warm-up (its lit program). */
export const seedPodSample = (): THREE.Mesh => seedPod(0x6fd82a, 0.3);
