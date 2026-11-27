// A drawn shot's aim preview: a thin red line along the path the arrow would fly if it were loosed now, with a dot
// where it would strike. The line keeps the same few pixels' width at any distance (widened in the vertex shader in
// screen space), so it reads from the top-down camera and stays a hairline through the eyes; it fades out near the
// camera (through the eyes it starts at the bow, under the view) and eases in and out, never flashing. It isn't
// dimmed with distance (`nearGlow`): a fixed width in pixels never grows to fill the view up close.
import {
  AdditiveBlending, Attribute, Color, DoubleSide, DynamicDrawUsage, Geometry, LookMaterial, Mesh, Node, Vec2, Vec3,
} from '../engine/api/index.ts';
import { G } from '../state';
import { addEffect } from './effects';
import { sceneRatio, sceneSize } from '../core/renderer';
import { effectLook, num, rgb, type EffectLook, effectShader } from '../engine/effects';

/** the line's and the dot's width (css px), how bright and opaque, how quickly it eases in and out (s) */
const WIDTH = 2, DOT = 7, GLOW = 1.6, ALPHA = 0.7, EASE_IN = 0.12, EASE_OUT = 0.18;
/** the line fades in over this range of distance from the camera (m) */
const NEAR0 = 0.8, NEAR1 = 3;
const COLOR = new Color(0xff2414);
/** at most this many lines (a fan's five), each of this many points */
export const LASER_LINES = 5, LASER_POINTS = 160;

const uniforms = {
  uRes: { value: new Vec2(1, 1) }, uWidth: { value: WIDTH }, uNear0: { value: NEAR0 }, uNear1: { value: NEAR1 },
  uColor: { value: COLOR.clone().multiplyScalar(GLOW) }, uAlpha: { value: 0 },
};
// (the dot shares the line's uniforms but its width)
const dotUniforms = { ...uniforms, uWidth: { value: DOT } };
const shaderOpts = { transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide } as const;

// The line and the dot for the Rust engine (src/engine/effects.ts). The engine hands a vertex
// its position, normal, uv and colour alone, so there the line's next point rides as its normal and its side and how
// far along as its uv (`lineGeometry`), and the dot's corner as its uv (`dotGeometry`). Both are widened on the
// screen by the vertex's `screen`, in the scene's pixels (uRes).
const LINE_HOOKS = /* wgsl */ `
fn vertex_hook(v: ptr<function, Vertex>, instance: u32) {
  let res = m.c[0].xy;
  let width = m.c[0].z;
  let near0 = m.c[1].x;
  let near1 = m.c[1].y;
  let pos = (*v).position;
  let ahead = (*v).normal;
  let side = (*v).uv.x;
  let along = (*v).uv.y;
  let pw = (*v).origin + (*v).axis_x * pos.x + (*v).axis_y * pos.y + (*v).axis_z * pos.z;
  let nw = (*v).origin + (*v).axis_x * ahead.x + (*v).axis_y * ahead.y + (*v).axis_z * ahead.z;
  let a = g.view_proj * vec4f(pw, 1.0);
  let b = g.view_proj * vec4f(nw, 1.0);
  let d = (b.xy / max(b.w, 1e-4) - a.xy / max(a.w, 1e-4)) * res;
  let l = length(d);
  var n = vec2f(0.0, 1.0);
  if (l > 1e-5) { n = vec2f(-d.y, d.x) / l; }
  (*v).screen = n * side * width / res;
  // (a.w is how far before the camera the point is)
  let fade = smoothstep(near0, near1, a.w) * (1.0 - smoothstep(0.8, 1.0, along));
  (*v).c0 = vec4f(fade, side, 0.0, 0.0);
  (*v).normal = vec3f(0.0, 1.0, 0.0);
}

fn surface_hook(s: ptr<function, Surface>, in: VertexOut) -> bool {
  let alpha = m.c[0].w;
  let color = m.c[2].rgb;
  let fade = in.c0.x;
  let side = in.c0.y;
  let k = 1.0 - side * side;
  (*s).base = vec4f(color * (0.35 + 0.65 * k), alpha * clamp(fade, 0.0, 1.0) * (0.4 + 0.6 * k));
  (*s).fog = 0.0;
  return true;
}
`;
const DOT_HOOKS = /* wgsl */ `
fn vertex_hook(v: ptr<function, Vertex>, instance: u32) {
  let res = m.c[0].xy;
  let width = m.c[0].z;
  let corner = (*v).uv;
  (*v).screen = corner * width / res;
  (*v).c0 = vec4f(corner, 0.0, 0.0);
}

fn surface_hook(s: ptr<function, Surface>, in: VertexOut) -> bool {
  let alpha = m.c[0].w;
  let color = m.c[2].rgb;
  let r = length(in.c0.xy);
  let core = 1.0 - smoothstep(0.25, 0.45, r);
  let halo = 1.0 - smoothstep(0.3, 1.0, r);
  (*s).base = vec4f(color * (0.5 + 1.2 * core), alpha * max(core, halo * 0.45));
  (*s).fog = 0.0;
  return true;
}
`;
/** the line's and the dot's numbers: the scene's size, the width, the alpha; where the line fades in; the colour */
const laserLook: EffectLook = {
  numbers(u, out) {
    const res = u.uRes.value as Vec2;
    out[0] = res.x; out[1] = res.y; out[2] = num(u, 'uWidth'); out[3] = num(u, 'uAlpha');
    out[4] = num(u, 'uNear0'); out[5] = num(u, 'uNear1');
    rgb(u, 'uColor', out, 8);
  },
};

const lineMat = effectLook(new LookMaterial({ uniforms, ...shaderOpts }), 'aim-laser-line', LINE_HOOKS, laserLook);
const dotMat = effectLook(new LookMaterial({ uniforms: dotUniforms, ...shaderOpts }), 'aim-laser-dot', DOT_HOOKS,
  laserLook);

function lineGeometry(): Geometry {
  const n = LASER_LINES * LASER_POINTS * 2, g = new Geometry();
  for (const [name, size] of [['position', 3], ['next', 3], ['side', 1], ['along', 1]] as const) {
    g.setAttribute(name, new Attribute(new Float32Array(n * size), size).setUsage(DynamicDrawUsage));
  }
  const side = g.getAttribute('side') as Attribute;
  for (let i = 0; i < n; i++) side.setX(i, i % 2 ? 1 : -1);
  // (the Rust engine's vertex has no attributes of the line's own: its next point as its normal, its side and how far
  // along as its uv, `write`)
  g.setAttribute('normal', g.getAttribute('next'));
  const uv = new Attribute(new Float32Array(n * 2), 2).setUsage(DynamicDrawUsage);
  for (let i = 0; i < n; i++) uv.setX(i, side.getX(i));
  g.setAttribute('uv', uv);
  const idx: number[] = [];
  for (let l = 0; l < LASER_LINES; l++) for (let i = 0; i < LASER_POINTS - 1; i++) {
    const v = (l * LASER_POINTS + i) * 2;
    idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
  }
  g.setIndex(new Attribute(new Uint32Array(idx), 1).setUsage(DynamicDrawUsage));
  return g;
}

function dotGeometry(): Geometry {
  const g = new Geometry(), n = LASER_LINES * 4;
  g.setAttribute('position', new Attribute(new Float32Array(n * 3), 3).setUsage(DynamicDrawUsage));
  const corner = new Float32Array(n * 2), idx: number[] = [];
  for (let i = 0; i < LASER_LINES; i++) {
    corner.set([-1, -1, 1, -1, 1, 1, -1, 1], i * 8);
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  }
  g.setAttribute('corner', new Attribute(corner, 2));
  // (the Rust engine's vertex has no attribute of the dot's own: its corner as its uv)
  g.setAttribute('uv', g.getAttribute('corner'));
  g.setIndex(idx);
  return g;
}

let line: Mesh | null = null, dots: Mesh | null = null;
/** what was asked for this frame: the paths and their ends (an end is null where the path just stops) */
let shownAt = -1;
const asked: { pts: Vec3[]; end: Vec3 | null }[] = [];
let lines = 0;

/** The aim preview's meshes, for warm-up (their programs compile at load). */
export function warmLaser(): Node[] {
  const l = new Mesh(lineGeometry(), lineMat), d = new Mesh(dotGeometry(), dotMat);
  l.frustumCulled = d.frustumCulled = false;
  return [l, d];
}

/**
 * Show the preview this frame along these paths (points from the bow on, at most LASER_POINTS each), each with its
 * end's dot (or none). Call every frame it should show; once a frame passes without a call it eases out.
 */
export function showLaser(paths: { pts: Vec3[]; end: Vec3 | null }[]): void {
  if (!line) start();
  shownAt = G.time;
  asked.length = 0;
  for (const p of paths.slice(0, LASER_LINES)) asked.push(p);
  write();
}

/** The paths shown this frame (none once a frame passes without a call): what `tools/lab`'s `bowprop` reads. */
export const laserPaths = (): readonly { pts: Vec3[]; end: Vec3 | null }[] => (G.time - shownAt < 0.05 ? asked : []);

function start(): void {
  [line, dots] = warmLaser() as [Mesh, Mesh];
  line.renderOrder = dots.renderOrder = 5;
  G.scene.add(line, dots);
  uniforms.uAlpha.value = 0;
  addEffect({
    standing: true,
    update(dt) {
      const on = G.time - shownAt < 0.05;
      const a = uniforms.uAlpha;
      a.value = on ? Math.min(ALPHA, a.value + dt * ALPHA / EASE_IN) : Math.max(0, a.value - dt * ALPHA / EASE_OUT);
      // (in the scene's pixels: it renders into the scene's target, at the quality's ratio)
      sceneSize(uniforms.uRes.value);
      uniforms.uWidth.value = WIDTH * sceneRatio();
      dotUniforms.uWidth.value = DOT * sceneRatio();
      return on || a.value > 0;
    },
    dispose() {
      G.scene.remove(line!, dots!);
      line!.geometry.dispose(); dots!.geometry.dispose();
      line = dots = null;
    },
  });
}

function write(): void {
  const g = line!.geometry, pos = g.getAttribute('position') as Attribute, nxt = g.getAttribute('next') as Attribute;
  const along = g.getAttribute('along') as Attribute;
  const uv = g.getAttribute('uv') as Attribute | undefined;
  const dp = dots!.geometry.getAttribute('position') as Attribute;
  lines = asked.length;
  let tris = 0, nd = 0;
  asked.forEach((p, l) => {
    const pts = p.pts, n = Math.min(pts.length, LASER_POINTS);
    // (its length along the path, for the fade at its far end: only a path that just stops fades out there)
    let total = 0;
    for (let i = 1; i < n; i++) total += pts[i].distanceTo(pts[i - 1]);
    let s = 0;
    for (let i = 0; i < n; i++) {
      if (i) s += pts[i].distanceTo(pts[i - 1]);
      const a = pts[i], b = i < n - 1 ? pts[i + 1] : null, v = (l * LASER_POINTS + i) * 2;
      // (the last point looks on along the line from the one before it)
      const bx = b ? b.x : 2 * a.x - pts[i - 1].x, by = b ? b.y : 2 * a.y - pts[i - 1].y, bz = b ? b.z : 2 * a.z - pts[i - 1].z;
      const u = p.end ? 0 : s / Math.max(total, 1e-3);
      for (let k = 0; k < 2; k++) { pos.setXYZ(v + k, a.x, a.y, a.z); nxt.setXYZ(v + k, bx, by, bz); along.setX(v + k, u); uv?.setY(v + k, u); }
    }
    // (the unused rest of this line's points sit on its last one: no triangles show there)
    const last = pts[n - 1];
    for (let i = n; i < LASER_POINTS; i++) for (let k = 0; k < 2; k++) {
      const v = (l * LASER_POINTS + i) * 2 + k;
      pos.setXYZ(v, last.x, last.y, last.z); nxt.setXYZ(v, last.x, last.y, last.z);
    }
    tris = (l * LASER_POINTS + n - 1) * 6;
    if (p.end) { for (let k = 0; k < 4; k++) dp.setXYZ(nd * 4 + k, p.end.x, p.end.y, p.end.z); nd++; }
  });
  g.setDrawRange(0, lines ? tris : 0);
  for (const a of [pos, nxt, along]) a.needsUpdate = true;
  if (uv) uv.needsUpdate = true;
  dots!.geometry.setDrawRange(0, nd * 6);
  dp.needsUpdate = true;
}

// (its effect's shaders listed for the engine as this module loads: joined with the other effects')
effectShader('aim-laser-line', LINE_HOOKS);
effectShader('aim-laser-dot', DOT_HOOKS);
