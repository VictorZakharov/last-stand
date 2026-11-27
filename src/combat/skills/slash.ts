// Blade arcs for the warrior's skills that throw or spin one (Thunder Crescent, Steel Tempest, Bull Rush's wedge): a
// flat ring segment whose glowing head sweeps across it, leaving a fading trail, or that glows all along. A cut's mark
// is the trail its blade leaves (fx/swingTrail.ts): an arc of its own, laid flat at its tip's height, drew a second
// one, level across the view while the cut through the eyes ran down it.
import {
  AdditiveBlending, Color, ColorRepresentation, DoubleSide, Geometry, LookMaterial, Mesh,
} from '../../engine/api/index.ts';
import * as shapes from '../../engine/api/shapes/index.ts';
import { nearGlow } from '../../core/materials';
import { effectLook, num, rgb, effectShader } from '../../engine/effects';

function slashMaterial(color: ColorRepresentation): LookMaterial {
  return effectLook(nearGlow(new LookMaterial({
    uniforms: {
      uColor: { value: new Color(color) }, uProg: { value: 0 }, uFade: { value: 1 }, uDir: { value: 1 },
      uStart: { value: 0 }, uLen: { value: 1 }, uInner: { value: 0.3 }, uEven: { value: 0 }, uTrail: { value: 5 },
    },
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
  })), 'slash-arc', SLASH_HOOKS, {
    numbers(u, out) {
      out[0] = num(u, 'uProg'); out[1] = num(u, 'uFade'); out[2] = num(u, 'uDir'); out[3] = num(u, 'uStart');
      out[4] = num(u, 'uLen'); out[5] = num(u, 'uInner'); out[6] = num(u, 'uEven'); out[7] = num(u, 'uTrail');
      rgb(u, 'uColor', out, 8);
    },
  });
}

/** the arc for the Rust engine (src/engine/effects.ts): the ring's own plane from the vertex */
const SLASH_HOOKS = /* wgsl */ `
fn vertex_hook(v: ptr<function, Vertex>, instance: u32) {
  (*v).c0 = vec4f((*v).rest.x, -(*v).rest.z, 0.0, 0.0);
}

fn surface_hook(s: ptr<function, Surface>, in: VertexOut) -> bool {
  let prog = m.c[0].x;
  let fade = m.c[0].y;
  let dir = m.c[0].z;
  let start = m.c[0].w;
  let len = m.c[1].x;
  let inner = m.c[1].y;
  let even = m.c[1].z;
  let trailLen = m.c[1].w;
  let color = m.c[2].rgb;
  let p = in.c0.xy;
  var a = clamp((atan2(p.y, p.x) - start) / len, 0.0, 1.0);
  if (dir < 0.0) { a = 1.0 - a; }
  let r = clamp((length(p) - inner) / (1.0 - inner), 0.0, 1.0);
  let behind = prog - a;
  if (behind < 0.0) { return false; }
  let trail = mix(exp(-behind * trailLen), 1.0, even);
  let edge = pow(r, 3.0) * 1.4 + r * 0.25;
  let tips = smoothstep(0.0, 0.08, a) * (1.0 - smoothstep(0.92, 1.0, a));
  let i = trail * edge * tips * fade;
  (*s).base = vec4f(mix(color, vec3f(1.0), trail * r * 0.3) * i * 1.3 * fx_near(in.depth), i);
  (*s).fog = 0.0;
  return true;
}
`;

/** Ring segment of `arc` radians centred on local +Z after laying it flat, outer radius 1. */
function arcGeometry(arc: number, inner: number): Geometry {
  // flat on the ground: local (x, y) maps to world (x, -z), so +Z is at angle -PI/2
  return shapes.ring(inner, 1, 40, 1, -Math.PI / 2 - arc / 2, arc).rotateX(-Math.PI / 2);
}

/** A persistent arc the caller drives (spins, moves) through the returned mesh and uniforms; its
 *  head is at the +heading end (see SlashOpts.dir), or it glows evenly when `even`. */
export function slashMesh(arc: number, inner: number, color: ColorRepresentation, even = false): { mesh: Mesh; mat: LookMaterial; dispose(): void } {
  const geo = arcGeometry(arc, inner);
  const mat = slashMaterial(color);
  const u = mat.uniforms;
  u.uStart.value = -Math.PI / 2 - arc / 2; u.uLen.value = arc; u.uInner.value = inner; u.uProg.value = 1; u.uEven.value = even ? 1 : 0;
  const mesh = new Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, mat, dispose() { geo.dispose(); mat.dispose(); } };
}

/** Shortest angle between two headings. */
export const angleBetween = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

// (its effect's shader listed for the engine as this module loads: joined with the other effects')
effectShader('slash-arc', SLASH_HOOKS);
