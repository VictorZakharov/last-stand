// The crypt's hostile bolts, each a look of its own rather than a glowing ball:
// - void bolt (Rift Witch): a dark orb with a burning, churning rim, a streaming comet tail, motes
//   spiralling round it and dark wisps shed behind; it implodes and snaps back out on impact.
// - magma bolt (Hollow Colossus): a spinning chunk of rock split by glowing lava, trailing fire,
//   smoke and falling embers; it bursts into flame, debris and a scorch mark.
// The orbs are blended over the scene (they read as things, not glare); the tail and halo are added
// light and dim near the camera like every effect glow.
import { AdditiveBlending, Color, DoubleSide, LookMaterial, Material, Mesh, Vec3 } from '../engine/api/index.ts';
import * as shapes from '../engine/api/shapes/index.ts';
import { G } from '../state';
import { nearGlow } from '../core/materials';
import { effectLook, effectShader, num, rgb, FX_PLAIN_VERTEX } from '../engine/effects';
import { particles, col, burst, smokePuff, debris } from './particles';
import { shockwave, decal } from './effects';
import { flashFree } from './lights';

const time = { value: 0 };

const sphere = shapes.sphere(1, 24, 16);
// the tail: a cone from the orb (its wide end, at the origin) back along -Z
const tailGeo = shapes.cone(1, 1, 16, 6, true).translate(0, 0.5, 0).rotateX(-Math.PI / 2);
const rock = shapes.icosahedron(1, 1);

type Look = 'void' | 'magma';
const mats = new Map<string, Material>();
function mat(kind: 'orb' | 'halo' | 'tail', look: Look, color: number): Material {
  const key = `${kind}:${look}:${color}`;
  let m = mats.get(key);
  if (m) return m;
  const uniforms = { uColor: { value: new Color(color) }, uTime: time };
  // the void orb: energy churning over the surface, drawn in towards the rim
  if (kind === 'orb' && look === 'void') m = new LookMaterial({ uniforms, transparent: true, depthWrite: false });
  // the magma orb: dark rock, split by cracks of lava (the valleys of a noise), hotter where they meet
  else if (kind === 'orb') m = new LookMaterial({ uniforms, transparent: true, depthWrite: true });
  // a glow round the orb's edge: nothing over the orb itself, fading outwards
  else if (kind === 'halo') m = nearGlow(new LookMaterial({
    uniforms, transparent: true, blending: AdditiveBlending, depthWrite: false,
  }));
  // the tail: streaks flowing back along it, fading out behind
  else m = nearGlow(new LookMaterial({
    uniforms, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide,
  }));
  const name = kind === 'orb' ? `rift-${look}` : `rift-${kind}`;
  effectLook(m as LookMaterial, name, RIFT_HOOKS[name], {
    numbers(u, out) {
      rgb(u, 'uColor', out, 0);
      out[3] = num(u, 'uTime');
    },
  });
  mats.set(key, m);
  return m;
}

/** the vertex's own place handed on */
const RIFT_VERTEX = /* wgsl */ `
fn vertex_hook(v: ptr<function, Vertex>, instance: u32) {
  (*v).c0 = vec4f((*v).position, 0.0);
}
`;
/** each bolt's material for the Rust engine (src/engine/effects.ts), the view taken in the
 *  world; the halo and the tail are the ones `nearGlow` wraps */
const RIFT_HOOKS: Record<string, string> = {
  'rift-void': RIFT_VERTEX + /* wgsl */ `
fn surface_hook(s: ptr<function, Surface>, in: VertexOut) -> bool {
  let color = m.c[0].rgb;
  let time = m.c[0].w;
  let pos = in.c0.xyz;
  let f = max(dot(normalize(in.normal), normalize(g.cam_pos.xyz - in.world)), 0.0);
  let rim = 1.0 - f;
  let p = pos * 2.6;
  let n = fx_fbm3(p + vec3f(fx_fbm3(p + time * 1.3), fx_fbm3(p - time * 1.1), 0.0) * 2.0 - time * 0.6);
  let band = pow(max(0.0, 1.0 - abs(n - 0.5) * 5.0), 2.0);
  let c = color * 0.05 + color * (1.6 * rim * rim + 1.3 * band * rim) + vec3f(1.0, 0.85, 1.0) * pow(rim, 5.0) * 1.2;
  (*s).base = vec4f(c, 0.92);
  (*s).fog = 0.0;
  return true;
}
`,
  'rift-magma': RIFT_VERTEX + /* wgsl */ `
fn surface_hook(s: ptr<function, Surface>, in: VertexOut) -> bool {
  let color = m.c[0].rgb;
  let time = m.c[0].w;
  let pos = in.c0.xyz;
  let n = fx_fbm3(pos * 2.3 + 1.7);
  let crack = pow(max(0.0, 1.0 - abs(n - 0.5) * 9.0), 1.5);
  let pulse = 0.8 + 0.2 * sin(time * 9.0 + pos.x * 6.0);
  let f = max(dot(normalize(in.normal), normalize(g.cam_pos.xyz - in.world)), 0.0);
  let rock = vec3f(0.07, 0.05, 0.045) * (0.4 + 0.8 * f) + vec3f(0.12, 0.06, 0.03) * fx_noise3(pos * 8.0);
  let lava = mix(color, vec3f(1.0, 0.85, 0.45), crack) * 2.6 * pulse;
  (*s).base = vec4f(mix(rock, lava, crack) + color * pow(1.0 - f, 3.0) * 0.8, 1.0);
  (*s).fog = 0.0;
  return true;
}
`,
  'rift-halo': FX_PLAIN_VERTEX + /* wgsl */ `
fn surface_hook(s: ptr<function, Surface>, in: VertexOut) -> bool {
  let color = m.c[0].rgb;
  let f = max(dot(normalize(in.normal), normalize(g.cam_pos.xyz - in.world)), 0.0);
  (*s).base = vec4f(color * f * f * (1.0 - smoothstep(0.7, 0.86, f)) * 1.2 * fx_near(in.depth), 1.0);
  (*s).fog = 0.0;
  return true;
}
`,
  'rift-tail': RIFT_VERTEX + /* wgsl */ `
fn surface_hook(s: ptr<function, Surface>, in: VertexOut) -> bool {
  let color = m.c[0].rgb;
  let time = m.c[0].w;
  let pos = in.c0.xyz;
  let along = -pos.z;
  var a = 0.0;
  if (length(pos.xy) > 1e-5) { a = atan2(pos.y, pos.x); }
  let streaks = fx_fbm3(vec3f(cos(a) * 1.6, sin(a) * 1.6, along * 3.0 + time * 7.0));
  let fade = pow(max(1.0 - along, 0.0), 1.6) * smoothstep(0.0, 0.08, along);
  let edge = max(dot(normalize(in.normal), normalize(g.cam_pos.xyz - in.world)), 0.0);
  let c = color * (0.35 + 2.2 * smoothstep(0.45, 0.8, streaks)) * fade * sqrt(edge) * 2.0;
  (*s).base = vec4f(c * fx_near(in.depth), 1.0);
  (*s).fog = 0.0;
  return true;
}
`,
};

/** The bolt's mesh, radius `size`: the orb, a soft halo round it and (void) a tail behind. */
export function riftBolt(look: Look, color: number, size: number): Mesh {
  const mesh = new Mesh(look === 'magma' ? rock : sphere, mat('orb', look, color));
  mesh.scale.setScalar(size);
  const halo = new Mesh(sphere, mat('halo', look, color));
  halo.scale.setScalar(look === 'magma' ? 1.9 : 1.7);
  mesh.add(halo);
  if (look === 'void') {
    const tail = new Mesh(tailGeo, mat('tail', look, color));
    tail.scale.set(0.95, 0.95, 7);
    mesh.add(tail);
  }
  return mesh;
}

const _a = new Vec3(), _b = new Vec3(), _up = new Vec3(0, 1, 0);

/** Each frame of the flight: point along the path, spin, and shed the trail. */
export function riftBoltTick(look: Look, mesh: Mesh, pos: Vec3, vel: Vec3, color: number, trail: number, dt: number, acc: { t: number; a: number }): void {
  time.value = G.time;
  const r = mesh.scale.x;
  if (r <= 0) return;
  _a.copy(pos).add(vel);
  if (look === 'void') mesh.lookAt(_a);
  else { mesh.rotation.x += dt * 7; mesh.rotation.y += dt * 4; }
  const dir = _b.copy(vel).normalize(), side = _a.crossVectors(dir, _up).normalize();
  const gc = col(color, 1.6), dark = col(trail);
  acc.t += dt * (look === 'void' ? 70 : 55);
  while (acc.t >= 1) {
    acc.t -= 1;
    acc.a += 0.9;
    if (look === 'void') {
      // two motes spiralling round the path
      for (const s of [1, -1]) {
        const c = Math.cos(acc.a) * s * r * 1.3, h = Math.sin(acc.a) * s * r * 1.3;
        particles.glow.spawn({
          x: pos.x + side.x * c, y: pos.y + h, z: pos.z + side.z * c, vx: -dir.x * 1.5, vy: 0, vz: -dir.z * 1.5,
          life: 0.35, size: r * 0.55, sizeEnd: 0.01, color: gc, colorEnd: col(0x2a0050, 0.5), drag: 2,
        });
      }
      if (Math.random() < 0.35) particles.smoke.spawn({
        x: pos.x - dir.x * r, y: pos.y, z: pos.z - dir.z * r,
        vx: (Math.random() - 0.5) * 0.6, vy: 0.15 + Math.random() * 0.3, vz: (Math.random() - 0.5) * 0.6,
        life: 0.6, size: r * 1.3, sizeEnd: r * 3.5, color: dark, alpha: 0.45, drag: 2,
      });
    } else {
      const ox = (Math.random() - 0.5) * r, oy = (Math.random() - 0.5) * r, oz = (Math.random() - 0.5) * r;
      particles.glow.spawn({
        x: pos.x + ox, y: pos.y + oy, z: pos.z + oz, vx: -dir.x * 2 + ox * 2, vy: 0.8 + Math.random(), vz: -dir.z * 2 + oz * 2,
        life: 0.3 + Math.random() * 0.2, size: r * 1.1, sizeEnd: r * 0.25, color: col(0xffb040, 1.4), colorEnd: col(color, 0.5), drag: 2.5,
      });
      if (Math.random() < 0.25) particles.glow.spawn({
        x: pos.x, y: pos.y, z: pos.z, vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 2, vz: (Math.random() - 0.5) * 3,
        life: 0.7, size: 0.06, sizeEnd: 0.02, color: col(0xffd080, 2), colorEnd: col(color, 0.6), gravity: 9, drag: 0.5,
      });
      if (Math.random() < 0.4) particles.smoke.spawn({
        x: pos.x - dir.x * r, y: pos.y + r * 0.3, z: pos.z - dir.z * r,
        vx: (Math.random() - 0.5) * 0.4, vy: 0.5 + Math.random() * 0.5, vz: (Math.random() - 0.5) * 0.4,
        life: 0.9, size: r * 1.2, sizeEnd: r * 4, color: dark, alpha: 0.4, drag: 2,
      });
    }
  }
}

/** The shot leaving the caster: a flash and a ring of sparks at the orb or hand. */
export function riftBoltLaunch(look: Look, pos: Vec3, color: number, size: number): void {
  burst(pos, { count: 14, color: look === 'void' ? color : 0xffa040, colorEnd: color, speed: 3.5, up: 0.5, life: 0.3, size: size * 0.8, gravity: 0 });
  flashFree({ color, intensity: 8, distance: 5, life: 0.2, pos: { x: pos.x, y: pos.y, z: pos.z } });
}

/** A bolt that ran into a wall or out of range: it just breaks up. */
export function riftBoltFizzle(look: Look, pos: Vec3, color: number, trail: number, size: number): void {
  burst(pos, { count: 10, color: look === 'void' ? color : 0xffa040, colorEnd: color, speed: 3, up: 1, life: 0.35, size: size * 0.7, gravity: 4 });
  smokePuff(pos, { count: 3, color: trail, alpha: 0.4, size: 0.4, sizeEnd: 1.2, life: 0.7, rise: 0.4 });
}

/** The impact: the void bolt collapses in on itself and snaps out; the magma bolt bursts in fire. */
export function riftBoltImpact(look: Look, pos: Vec3, color: number, trail: number, size: number): void {
  const ground = { x: pos.x, z: pos.z };
  if (look === 'void') {
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u), d = 0.9 + Math.random() * 0.4;
      const ox = Math.cos(a) * s * d, oy = u * d, oz = Math.sin(a) * s * d;
      // spawned on a shell, rushing into the centre
      particles.glow.spawn({ x: pos.x + ox, y: pos.y + oy, z: pos.z + oz, vx: -ox * 4, vy: -oy * 4, vz: -oz * 4, life: 0.22, size: 0.14, sizeEnd: 0.03, color: col(color, 1.8), drag: 1 });
    }
    burst(pos, { count: 20, color, colorEnd: 0x200040, speed: 5, up: 1, life: 0.45, size: size * 0.8, gravity: 2 });
    shockwave(ground, { color, intensity: 1.6, from: 0.2, to: 1.8, life: 0.35 });
    smokePuff(pos, { count: 5, color: trail, alpha: 0.5, size: 0.5, sizeEnd: 1.6, life: 0.8, rise: 0.3 });
  } else {
    burst(pos, { count: 26, color: 0xffb040, colorEnd: color, speed: 6, up: 3, life: 0.5, size: size * 0.9, gravity: 8 });
    burst(pos, { count: 12, color: 0xffe0a0, speed: 8, up: 4, life: 0.8, size: 0.07, gravity: 14, drag: 0.5 });
    debris(pos, { count: 8, color: 0x1a1412, speed: 5, size: 0.12 });
    smokePuff(pos, { count: 6, color: trail, alpha: 0.45, size: 0.7, sizeEnd: 2.2, life: 1.1, rise: 0.8 });
    shockwave(ground, { color, intensity: 1.8, from: 0.2, to: 2.2, life: 0.4 });
    decal(ground, { type: 'scorch', size: 1.4, life: 5 });
  }
  flashFree({ color, intensity: 14, distance: 6, life: 0.25, pos: { x: pos.x, y: pos.y, z: pos.z } });
}

/** Samples for the load-time warm-up (every material kind; the colour is a uniform). */
export const riftBoltSamples = (): Mesh[] => [riftBolt('void', 0xc050ff, 0.3), riftBolt('magma', 0xff6a2a, 0.3)];

// (its effects' shaders listed for the engine as this module loads: joined with the other effects')
for (const [name, hooks] of Object.entries(RIFT_HOOKS)) effectShader(name, hooks);
