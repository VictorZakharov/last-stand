// Building blocks shared by the biome arenas: the biome contract, UV-scaled boxes, instancing
// and geometry helpers, the spawn-portal membrane, the environment map and the static shadow bake.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rand, TAU } from '../util';
import { particles } from '../fx/particles';
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
 * brightens when enemies come through: a twisting vortex with a dark heart and a bright core
 * inside a crackling rim, light spilling onto the floor in front, and motes drawn into it.
 * Square-cornered by default (a gate with a lintel), round-topped with `arch`.
 * Returns the portal for the gate at `angle`.
 */
export function portalMembrane(parent: THREE.Object3D, angle: number, colors: { a: RGB; b: RGB; core: RGB }, updaters: Updater[], arch = false): { mesh: THREE.Mesh; portal: Portal } {
  const uniforms = {
    uTime: { value: 0 }, uPower: { value: 0.4 }, uArch: { value: arch ? 1 : 0 },
    uA: { value: new THREE.Color(...colors.a) }, uB: { value: new THREE.Color(...colors.b) }, uCore: { value: new THREE.Color(...colors.core) },
  };
  const noise = `
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int k = 0; k < 4; k++) { v += n(p) * a; p = p * 2.03 + 17.1; a *= 0.5; } return v; }`;
  // alpha-blended, not additive: the vortex hides what's behind the gate
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float uTime; uniform float uPower; uniform float uArch; uniform vec3 uA; uniform vec3 uB; uniform vec3 uCore;
      ${noise}
      void main(){
        vec2 p = vUv*2.0-1.0;
        // rounded rectangle filling the opening: sd < 0 inside
        vec2 q = abs(p) - vec2(0.72, 0.8);
        float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.14;
        // or straight sides under a round top
        float archSd = p.y > 0.08 ? length(vec2(p.x, p.y - 0.08)) - 0.8 : max(abs(p.x) - 0.8, -0.92 - p.y);
        sd = mix(sd, archSd, uArch);
        float r = length(p * vec2(1.0, 0.95));
        // twist the plane round the centre, tighter towards it (no atan: no seam)
        float tw = 3.2 * (1.0 - smoothstep(0.0, 1.1, r)) + uTime * 0.9;
        vec2 w = mat2(cos(tw), -sin(tw), sin(tw), cos(tw)) * p;
        float arms = fbm(w * 2.2 + vec2(0.0, uTime * 0.25));
        float fine = fbm(w * 5.5 - uTime * 0.4);
        vec3 c = mix(uA * 0.3, uB, smoothstep(0.35, 0.75, arms)) * (0.35 + fine * 1.3);
        // a dark heart round a bright pinpoint core
        c *= mix(0.25, 1.0, smoothstep(0.08, 0.6, r));
        c += uCore * (exp(-r * r * 60.0) * 1.6 + exp(-r * r * 8.0) * 0.25);
        // sparks swept round with the swirl
        vec2 sg = w * 9.0 + vec2(uTime * 0.7, 0.0);
        c += uCore * step(0.965, h(floor(sg))) * (1.0 - smoothstep(0.1, 0.5, length(fract(sg) - 0.5))) * 1.2;
        float inside = 1.0 - smoothstep(-0.03, 0.02, sd);
        // crackling rim along the edge
        float crackle = 0.6 + 0.8 * n(p * 7.0 + vec2(uTime * 3.0, -uTime * 2.0));
        vec2 e = min(vUv, 1.0 - vUv);
        float rim = (exp(-abs(sd) * 30.0) * crackle + exp(-abs(sd) * 8.0) * 0.25) * smoothstep(0.0, 0.06, min(e.x, e.y));
        c = c * inside + mix(uB, uCore, 0.55) * rim;
        gl_FragColor = vec4(c * uPower * 2.3, clamp(inside * 0.94 + rim, 0.0, 1.0));
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(GATE_W, 4.4), mat);
  mesh.position.set(0, 2.2, 0.1);
  parent.add(mesh);
  // light spilling across the floor in front of the gate
  const spillMat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float uTime; uniform float uPower; uniform vec3 uB; uniform vec3 uCore;
      ${noise}
      void main(){
        vec2 p = vec2((vUv.x - 0.5) * 1.6, vUv.y);
        float g = exp(-dot(p, p) * 3.5) * (0.75 + 0.5 * n(vec2(vUv.x * 5.0, vUv.y * 3.0 - uTime * 0.8)));
        gl_FragColor = vec4(mix(uB, uCore, 0.3) * g * uPower * 0.55, 1.0);
      }`,
  });
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(GATE_W + 2.5, 4).rotateX(-Math.PI / 2).rotateY(Math.PI), spillMat);
  spill.position.set(0, 0.04, 2.0);
  parent.add(spill);

  const pos = new THREE.Vector3(Math.cos(angle) * (WALL_R - 2.5), 0, Math.sin(angle) * (WALL_R - 2.5));
  const dir = new THREE.Vector3(-Math.cos(angle), 0, -Math.sin(angle));
  // the membrane's centre in the world, and the direction along it
  const cx = Math.cos(angle) * (WALL_R + 0.7), cz = Math.sin(angle) * (WALL_R + 0.7), sx = -Math.sin(angle), sz = Math.cos(angle);
  const coreCol = new THREE.Color(...colors.core), edgeCol = new THREE.Color(...colors.b), mistCol = new THREE.Color(...colors.a);
  let pulse = 0, acc = 0;
  updaters.push((dt, t) => {
    pulse = Math.max(0, pulse - dt * 0.8);
    uniforms.uTime.value = t;
    uniforms.uPower.value = 0.35 + pulse * 1.3;
    acc += dt * (1 + pulse * 4);
    while (acc > 0.07) {
      acc -= 0.07;
      // motes drawn in from the rim towards the core
      const a = Math.random() * TAU, ex = Math.cos(a) * GATE_W * 0.48, ey = 2.2 + Math.sin(a) * 2.1;
      particles.glow.spawn({
        x: cx + sx * ex, y: ey, z: cz + sz * ex, vx: -sx * ex * 1.1, vy: (2.2 - ey) * 1.1, vz: -sz * ex * 1.1,
        life: rand(0.6, 0.9), size: rand(0.05, 0.1), color: edgeCol.clone().multiplyScalar(1.6), colorEnd: coreCol.clone().multiplyScalar(0.6), drag: 0.5,
      });
      // and a low mist spilling out onto the floor
      if (Math.random() < 0.15) {
        const u = rand(-1.6, 1.6);
        particles.smoke.spawn({
          x: cx + sx * u + dir.x * 0.6, y: 0.25, z: cz + sz * u + dir.z * 0.6, vx: dir.x * rand(0.4, 0.8), vy: 0.02, vz: dir.z * rand(0.4, 0.8),
          life: rand(2.5, 4), size: rand(1.5, 2.5), sizeEnd: 4, color: mistCol.clone().multiplyScalar(0.8), alpha: 0.12,
        });
      }
    }
  });
  return { mesh, portal: { pos, dir, pulse() { pulse = 1; } } };
}

/** Night sky dome: fog colour at the horizon (where the ground fades into it), a faint glow
 * just above, `zenith` overhead, a moon towards `moonDir` and a sprinkle of stars. Unfogged, behind everything. */
export function buildSky(fogColor: number, moonDir: THREE.Vector3, zenith: RGB = [0.004, 0.005, 0.012]): THREE.Mesh {
  const fog = new THREE.Color(fogColor);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uFog: { value: new THREE.Vector3(fog.r, fog.g, fog.b) }, uMoon: { value: moonDir }, uZenith: { value: new THREE.Vector3(...zenith) } },
    side: THREE.BackSide, depthWrite: false, fog: false,
    // on the far plane, drawn after everything opaque: the depth test skips every covered pixel
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `
      varying vec3 vDir; uniform vec3 uFog; uniform vec3 uMoon; uniform vec3 uZenith;
      float h(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      void main(){
        vec3 d = normalize(vDir);
        float y = max(d.y, 0.0);
        vec3 c = mix(uFog, uFog * vec3(1.5, 1.45, 1.35), 1.0 - smoothstep(0.0, 0.18, abs(y - 0.05)));
        c = mix(c, uZenith, smoothstep(0.08, 0.7, y));
        float m = max(dot(d, uMoon), 0.0);
        c += vec3(0.06, 0.07, 0.12) * pow(m, 300.0) + vec3(0.02, 0.025, 0.04) * pow(m, 8.0);
        c = mix(c, vec3(0.5, 0.54, 0.64) * (0.85 + 0.15 * h(floor(d * 900.0))), smoothstep(0.99988, 0.99993, m));
        vec3 g = floor(d * 700.0);
        c += vec3(0.5, 0.55, 0.7) * step(0.9975, h(g)) * smoothstep(0.12, 0.4, y) * (0.4 + 0.6 * h(g + 1.0));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), mat);
  sky.renderOrder = 100;
  sky.frustumCulled = false;
  return sky;
}

/** Day sky dome: `horizon` (the fog colour, where the ground fades into it) rising into `zenith`, a sun
 * towards `sunDir` with a warm glow round it, and slow soft clouds. Unfogged, behind everything. */
export function buildDaySky(horizon: number, zenith: RGB, sunDir: THREE.Vector3): { mesh: THREE.Mesh; update: (t: number) => void } {
  const hz = new THREE.Color(horizon);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uHorizon: { value: new THREE.Vector3(hz.r, hz.g, hz.b) }, uZenith: { value: new THREE.Vector3(...zenith) }, uSun: { value: sunDir.clone().normalize() }, uTime: { value: 0 } },
    side: THREE.BackSide, depthWrite: false, fog: false,
    // on the far plane, drawn after everything opaque: the depth test skips every covered pixel
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `
      varying vec3 vDir; uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uSun; uniform float uTime;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec3 d = normalize(vDir);
        float y = max(d.y, 0.0);
        vec3 c = mix(uHorizon, uZenith, smoothstep(0.0, 0.55, y));
        float m = max(dot(d, uSun), 0.0);
        c += vec3(0.5, 0.42, 0.28) * pow(m, 12.0) * 0.35 + vec3(1.0, 0.92, 0.75) * smoothstep(0.9993, 0.9996, m) * 2.5;
        // clouds on a plane overhead, thinning towards the horizon
        vec2 p = d.xz / max(d.y, 0.08) * 1.6 + vec2(uTime * 0.01, uTime * 0.004);
        float cl = n(p) * 0.55 + n(p * 2.3 + 5.0) * 0.3 + n(p * 5.1 + 9.0) * 0.15;
        cl = smoothstep(0.5, 0.8, cl) * smoothstep(0.04, 0.3, y);
        c = mix(c, uHorizon * 1.25 + vec3(0.08, 0.07, 0.05) * pow(m, 4.0), cl * 0.7);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), mat);
  mesh.renderOrder = 100;
  mesh.frustumCulled = false;
  return { mesh, update: (t) => { mat.uniforms.uTime.value = t; } };
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
