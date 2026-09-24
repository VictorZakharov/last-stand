// Building blocks shared by the biome arenas: the biome contract, UV-scaled boxes, instancing
// and geometry helpers, the spawn-portal membrane, the environment map and the static shadow bake.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TAU } from '../util';
import type { Obstacle } from '../types';

export type Updater = (dt: number, t: number) => void;
/** Linear RGB, used as-is in shaders. */
export type RGB = [number, number, number];

/** A spawn gate: where enemies enter and the direction into the arena. */
export interface Portal { pos: THREE.Vector3; dir: THREE.Vector3; pulse(): void }

/** Scene-wide lighting a biome sets when it becomes active (the lights themselves are shared). */
export interface BiomeLook {
  background: number;
  fog: { color: number; near: number; far: number };
  hemi: { sky: number; ground: number; intensity: number };
  moon: { color: number; intensity: number; pos: [number, number, number] };
  env: THREE.Texture;
  envIntensity: number;
}

/**
 * What a biome builder returns. Everything it creates goes into its own group, which is
 * hidden while another biome is active. Every biome must add the same number of point
 * lights (6): the light count is part of every lit shader, so a different count would
 * recompile them all when switching.
 */
export interface Biome {
  look: BiomeLook;
  obstacles: Obstacle[];
  portals: Portal[];
  setCalm(v: number): void;
  update(dt: number, t: number): void;
}

export type BiomeBuilder = (group: THREE.Group, renderer: THREE.WebGLRenderer) => Biome;

export const WALL_R = 28.5;   // radius of the arena's boundary (inner face)
export const GATE_W = 4.2;    // spawn gate width

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
export function setInstance(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, rx: number, ry: number, rz: number, sx: number, sy = sx, sz = sx): void {
  _e.set(rx, ry, rz); _q.setFromEuler(_e);
  mesh.setMatrixAt(i, _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)));
}

/** Nudge every vertex along its direction from the origin by a hash of its position, so
 * duplicated (non-indexed) corners move together and the surface stays closed. */
export function lumpy(g: THREE.BufferGeometry, amount: number, seed: number): THREE.BufferGeometry {
  const pos = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719 + seed) * 43758.5453;
    const n = (k - Math.floor(k)) * 2 - 1;
    v.multiplyScalar(1 + n * amount);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** A tuft of thin curved blades with vertex colors (`base` at the root, `tip` at the tips, linear
 * RGB); normals point up so the tufts light like the ground they grow from. */
export function buildGrassGeo(rng: () => number, base: RGB, tip: RGB): THREE.BufferGeometry {
  const pos: number[] = [], colr: number[] = [];
  for (let i = 0; i < 7; i++) {
    const a = rng() * TAU, d = rng() * 0.12, w = 0.03 + rng() * 0.02, ht = 0.25 + rng() * 0.3, bend = 0.08 + rng() * 0.12;
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d, px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    pos.push(cx - px, 0, cz - pz, cx + px, 0, cz + pz, cx + Math.cos(a) * bend, ht, cz + Math.sin(a) * bend);
    colr.push(...base, ...base, ...tip);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return g;
}

// Box whose UVs are scaled by world size so textures don't stretch.
export function boxWithUV(w: number, h: number, d: number, texel = 0.5): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const sw = ax > 0.5 ? d : w, sh = ay > 0.5 ? d : h;
    uv.setXY(i, uv.getX(i) * sw * texel, uv.getY(i) * sh * texel);
  }
  return g;
}

/**
 * Swirling portal membrane (a GATE_W x 4.4 plane standing at local z = 0.1) that
 * brightens when enemies come through. Returns the portal for the gate at `angle`.
 */
export function portalMembrane(parent: THREE.Object3D, angle: number, colors: { a: RGB; b: RGB; core: RGB }, updaters: Updater[]): { mesh: THREE.Mesh; portal: Portal } {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uPower: { value: 0.4 },
      uA: { value: new THREE.Color(...colors.a) }, uB: { value: new THREE.Color(...colors.b) }, uCore: { value: new THREE.Color(...colors.core) },
    },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float uTime; uniform float uPower; uniform vec3 uA; uniform vec3 uB; uniform vec3 uCore;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec2 p = vUv*2.0-1.0; p.y *= 0.75;
        float r = length(p); float a = atan(p.y, p.x + 1e-5);
        float sw = n(vec2(a*2.0 + r*6.0 - uTime*2.0, r*4.0 - uTime)) * n(vec2(a*3.0 - uTime, r*8.0));
        float mask = 1.0 - smoothstep(0.55, 1.0, r);
        vec3 c = mix(uA, uB, sw) * (sw*2.0 + 0.3);
        c += uCore * (1.0 - smoothstep(0.0, 0.25, r)) * 0.6;
        gl_FragColor = vec4(c * mask * uPower * 2.5, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(GATE_W, 4.4), mat);
  mesh.position.set(0, 2.2, 0.1);
  parent.add(mesh);
  let pulse = 0;
  updaters.push((dt, t) => {
    pulse = Math.max(0, pulse - dt * 0.8);
    mat.uniforms.uTime.value = t;
    mat.uniforms.uPower.value = 0.35 + pulse * 1.3;
  });
  const pos = new THREE.Vector3(Math.cos(angle) * (WALL_R - 2.5), 0, Math.sin(angle) * (WALL_R - 2.5));
  const dir = new THREE.Vector3(-Math.cos(angle), 0, -Math.sin(angle));
  return { mesh, portal: { pos, dir, pulse() { pulse = 1; } } };
}

/** Place a gate group on the boundary at `angle`, its local +Z facing the arena center. */
export function placeGate(g: THREE.Object3D, angle: number): void {
  const r = WALL_R + 0.8;
  g.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
  g.lookAt(0, 0, 0);
}

// Dim environment for subtle reflections on metal / wet surfaces: a sky gradient and one soft panel.
export function buildEnvMap(renderer: THREE.WebGLRenderer, sky: RGB, panel: RGB): THREE.Texture {
  const envScene = new THREE.Scene();
  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uSky: { value: new THREE.Vector3(...sky) } },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vP; uniform vec3 uSky; void main(){ float y = normalize(vP).y;
      vec3 c = mix(vec3(0.02,0.02,0.03), uSky, smoothstep(-0.2, 1.0, y));
      gl_FragColor = vec4(c, 1.0); }`,
  }));
  envScene.add(skyMesh);
  const panelMesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(...panel).multiplyScalar(2), side: THREE.DoubleSide }));
  panelMesh.position.set(-5, 7, 3); panelMesh.lookAt(0, 0, 0);
  envScene.add(panelMesh);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(envScene, 0.04);
  pm.dispose();
  return rt.texture;
}

/**
 * A biome's shadow casters never move, but each one cost a draw call in the shadow pass
 * every frame. Merge them (positions only) into one caster that draws nothing in the
 * main pass, and stop the originals casting. Instanced props are already one call.
 */
export function bakeStaticShadows(group: THREE.Group): void {
  group.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.castShadow || (m as THREE.InstancedMesh).isInstancedMesh) return;
    const g = new THREE.BufferGeometry().setAttribute('position', m.geometry.getAttribute('position'));
    g.setIndex(m.geometry.getIndex());
    parts.push((g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m.matrixWorld));
    m.castShadow = false;
  });
  if (!parts.length) return;
  const caster = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  caster.castShadow = true;
  caster.name = `${group.name} static shadow caster`;
  group.add(caster);
}
