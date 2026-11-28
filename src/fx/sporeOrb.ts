// A spore orb (the Thornheart's and the Sporecallers' volleys): a ball of swirling toxic spores, drawn as animated noise with sap
// veins crawling over it and soft, see-through edges. It is blended over the scene, not added as light, so
// it reads as a thing thrown at you without glare, near or far. It trails spores and smoke.
import { Color, LookMaterial, Mesh, Node, Vec3 } from '../engine/api/index.ts';
import * as shapes from '../engine/api/shapes/index.ts';
import { G } from '../state';
import { particles, col } from './particles';
import { effectLook, num, rgb, effectShader } from '../engine/effects';

const geo = shapes.sphere(1, 20, 14);
/** one per colour (same program); their time moves together */
const mats = new Map<number, LookMaterial>();
const time = { value: 0 };

function material(color: number): LookMaterial {
  let m = mats.get(color);
  if (!m) mats.set(color, m = new LookMaterial({
    uniforms: { uColor: { value: new Color(color) }, uTime: time },
    transparent: true, depthWrite: false,
  }));
  effectLook(m, 'spore-orb', SPORE_HOOKS, {
    numbers(u, out) {
      rgb(u, 'uColor', out, 0);
      out[3] = num(u, 'uTime');
    },
  });
  return m;
}

/** the orb for the Rust engine (src/engine/effects.ts): swirling spores, the vertex's own place handed on */
const SPORE_HOOKS = /* wgsl */ `
fn vertex_hook(v: ptr<function, Vertex>, instance: u32) {
  (*v).c0 = vec4f((*v).position, 0.0);
}

fn surface_hook(s: ptr<function, Surface>, in: VertexOut) -> bool {
  let color = m.c[0].rgb;
  let time = m.c[0].w;
  let pos = in.c0.xyz;
  let p = pos * 2.2;
  let w = vec3f(fx_fbm3(p + vec3f(0.0, time * 0.9, 0.0)), fx_fbm3(p + vec3f(5.2, 0.0, time * 0.7)),
    fx_fbm3(p - vec3f(time * 0.8, 1.3, 0.0)));
  let n = fx_fbm3(p + w * 2.5 + time * 0.4);
  let vein = pow(max(0.0, 1.0 - abs(n - 0.5) * 7.0), 3.0);
  let dense = smoothstep(0.3, 0.75, n);
  let c = mix(color * 0.1, color * 0.75, dense) + color * 1.4 * vein;
  let f = max(dot(normalize(in.normal), normalize(g.cam_pos.xyz - in.world)), 0.0);
  (*s).base = vec4f(c, smoothstep(0.0, 0.6, f) * min(1.0, 0.2 + 0.75 * dense + vein));
  (*s).fog = 0.0;
  return true;
}
`;

/** An orb of radius `size` in the thrower's spore colour. */
export function sporeOrb(color: number, size: number): Mesh {
  const mesh = new Mesh(geo, material(color));
  mesh.scale.setScalar(size);
  return mesh;
}

/** Each frame of an orb's flight: the swirl moves on, and it trails spores and smoke. */
export function sporeOrbTick(mesh: Node, pos: Vec3, color: number, smoke: number, dt: number, acc: { t: number }): void {
  time.value = G.time;
  mesh.rotation.y += dt * 2;
  const r = mesh.scale.x, sc = col(smoke), gc = col(color, 1.2);
  acc.t += dt * 45;
  while (acc.t >= 1) {
    acc.t -= 1;
    const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u);
    const ox = Math.cos(a) * s * r, oy = u * r, oz = Math.sin(a) * s * r;
    // spores shed from its surface, drifting off
    particles.glow.spawn({
      x: pos.x + ox, y: pos.y + oy, z: pos.z + oz, vx: ox * 2, vy: oy * 2 + 0.3, vz: oz * 2,
      life: 0.5, size: 0.09, sizeEnd: 0.02, color: gc, drag: 2,
    });
    if (Math.random() < 0.5) particles.smoke.spawn({
      x: pos.x + ox * 0.5, y: pos.y + oy * 0.5, z: pos.z + oz * 0.5,
      vx: (Math.random() - 0.5) * 0.5, vy: 0.3 + Math.random() * 0.4, vz: (Math.random() - 0.5) * 0.5,
      life: 0.6 + Math.random() * 0.4, size: r * 1.2, sizeEnd: r * 3.5, color: sc, alpha: 0.3, drag: 2.5,
    });
  }
}

/** Sample for the load-time warm-up. */
export const sporeOrbSample = (): Mesh => sporeOrb(0x6fd82a, 0.3);

// (its effect's shader listed for the engine as this module loads: joined with the other effects')
effectShader('spore-orb', SPORE_HOOKS);
