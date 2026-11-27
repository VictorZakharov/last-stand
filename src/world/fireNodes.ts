// A fire's WGSL and what it reads, for the engine's looks of the flames and the embers (engine/looks/fire.ts):
// fire.ts's ray march, its noise read at its first level (`textureSampleLevel`: WGSL samples with gradients only where
// every pixel takes the same path, and the march stops early), and the bed's and the logs' char and embers
// (`emberMat`).
import type { Vec2, Vec3, Vec4, VolumeTexture } from '../engine/api/index.ts';
import type { FLAME_LOOK, KEPT, KEPT_SIZE } from './fireBake';

/** The flames' uniforms as fire.ts keeps them (each `{ value }`, read as each frame draws; a type, so it is a look
 *  material's uniforms as it is). */
export type FlameUniforms = {
  uFlames: { value: VolumeTexture };
  uCentre: { value: Vec3 };
  uBox: { value: Vec3 };
  uRadius: { value: number };
  uHeight: { value: number };
  uPuff: { value: number };
  uGlow: { value: number };
  uFrame: { value: number };
  uTurn: { value: Vec2 };
  uBowl: { value: Vec2[] };
  uLogs: { value: Vec4[] };
  uStepShare: { value: number };
  uLite: { value: number };
};

/** fire.ts's numbers the GLSL had written into it: the march's steps, how thick and bright the gas is, its glow against
 *  its life, its blackbody's colours, and the loop's tiles. */
export interface FlameShape {
  steps: number;
  /** the fewest steps a ray takes, and the least share of a whole crossing its length counts for */
  stepsLeast: number;
  spanLeast: number;
  /** what the strands' read gives on average, taken in its place on the lite path */
  liteStrands: number;
  look: typeof FLAME_LOOK;
  tiles: { across: number; down: number };
  /** the slot the frame held for a fire that stands still is kept in (fireBake.ts's `STILL`) */
  stillSlot: number;
  cells: { nx: number; ny: number; nz: number };
  kept: typeof KEPT;
  keptSize: typeof KEPT_SIZE;
  frames: number;
}

/** An ember material's values as fire.ts keeps them (each `{ value }`): the embers' clock, the bed's middle, how far
 *  out it glows and how hot. */
export interface EmberLooks {
  time: { value: number };
  centre: { value: Vec3 };
  radius: { value: number };
  heat: { value: number };
}

/** the embers' functions' WGSL, in the order they're made: each before what calls it */
const emberSources: string[] = [];
const keptEmber = (source: string): string => {
  emberSources.push(source);
  return source;
};

/** The embers' WGSL whole (`emberChar`, `emberGlow` and what they call), for a renderer that takes it as source: the
 *  Rust engine's look of a fire's bed (`engine/looks/fire.ts`). */
export function emberWgsl(): string {
  emberFns();
  return emberSources.join('\n');
}

/** The char's and the embers' functions, written into `emberSources` once. */
let embersWritten = false;
function emberFns(): void {
  if (embersWritten) return;
  embersWritten = true;
  keptEmber(`fn emberHash(p: vec2f) -> f32 {
    return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
  }`);
  keptEmber(`fn emberNoise(p: vec2f) -> f32 {
    let i = floor(p);
    var f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(emberHash(i), emberHash(i + vec2f(1.0, 0.0)), f.x),
      mix(emberHash(i + vec2f(0.0, 1.0)), emberHash(i + vec2f(1.0, 1.0)), f.x), f.y);
  }`);
  keptEmber(`fn emberFbm(start: vec2f) -> f32 {
    var p = start;
    var v = 0.0;
    var a = 0.5;
    for (var i = 0; i < 4; i++) {
      v += a * emberNoise(p);
      p = p * 2.03 + 17.1;
      a *= 0.5;
    }
    return v;
  }`);
  keptEmber(`fn emberHash3(q: vec3f) -> vec3f {
    let p = vec3f(dot(q, vec3f(127.1, 311.7, 74.7)), dot(q, vec3f(269.5, 183.3, 246.1)),
      dot(q, vec3f(113.5, 271.9, 124.6)));
    return fract(sin(p) * 43758.5453);
  }`);
  // how far a point is from the edge between the nearest two cells (0 on it)
  keptEmber(`fn emberCellEdge(p: vec3f) -> f32 {
    let i = floor(p);
    let f = fract(p);
    var nearest = 8.0;
    var next = 8.0;
    for (var z = -1; z <= 1; z++) {
      for (var y = -1; y <= 1; y++) {
        for (var x = -1; x <= 1; x++) {
          let cell = vec3f(f32(x), f32(y), f32(z));
          let d = length(cell + emberHash3(i + cell) - f);
          if (d < nearest) {
            next = nearest;
            nearest = d;
          } else if (d < next) {
            next = d;
          }
        }
      }
    }
    return next - nearest;
  }`);
  keptEmber(`fn emberHot(p: vec3f, centre: vec3f, radius: f32, heat: f32) -> f32 {
    return clamp((1.0 - smoothstep(0.2, 1.05, length(p - centre) / radius)) * heat, 0.0, 1.0);
  }`);
  keptEmber(`fn emberChar(p: vec3f, centre: vec3f, radius: f32, heat: f32) -> vec3f {
    let ash = smoothstep(0.7, 0.84, emberFbm(p.xz * 9.0 + p.y * 7.0 + 3.0))
      * (0.25 + 0.75 * (1.0 - emberHot(p, centre, radius, heat)));
    return mix(vec3f(0.01, 0.009, 0.008), vec3f(0.1, 0.097, 0.094), ash);
  }`);
  keptEmber(`fn emberGlow(p: vec3f, up: f32, time: f32, centre: vec3f, radius: f32, heat: f32) -> vec3f {
    let hotHere = emberHot(p, centre, radius, heat);
    let crack = (1.0 - smoothstep(0.0, 0.06, emberCellEdge(p * 22.0)))
      * smoothstep(0.4, 0.62, emberFbm(p.xz * 4.0 + p.y * 3.0));
    let hotPatch = smoothstep(0.62, 0.8, emberFbm(p.xz * 7.0 + p.y * 5.0));
    let breathe = 0.45 + 0.55 * emberNoise(p.xz * 3.0 + vec2f(time * 0.35, time * 0.21));
    let sides = 1.0 - smoothstep(0.3, 0.8, up);
    let faces = max(heat - 1.0, 0.0) * hotHere * sides * (0.3 + 0.7 * emberNoise(p.xz * 14.0 + p.y * 9.0));
    let g = clamp((crack * (0.03 + hotHere * hotHere) + hotPatch * hotHere * hotHere + faces) * breathe, 0.0, 1.0);
    return mix(vec3f(0.8, 0.08, 0.01), vec3f(1.0, 0.42, 0.07), g) * (0.6 + g * 2.4) * g;
  }`);
}

/** `value` written into WGSL as a float */
const f = (value: number): string => value.toFixed(4);

/** the march's functions' WGSL, in the order they're made: each before what calls it */
const sources: string[] = [];
const kept = (source: string): string => {
  sources.push(source);
  return source;
};

/** The march's WGSL whole (`fireLog`, `fireLight` and what they call), for a renderer that takes it as source: the
 *  Rust engine's look of the flames (`engine/looks/fire.ts`). */
export function flameWgsl(shape: FlameShape): string {
  logFn();
  marchFor(shape);
  return sources.join('\n');
}

/** Where a ray first meets a log (as fire.ts's `logAt`), written once. */
let logWritten = false;
function logFn(): void {
  if (logWritten) return;
  logWritten = true;
  kept(`fn fireLog(eye: vec3f, dir: vec3f, a: vec4f, b: vec4f) -> f32 {
    let ba = b.xyz - a.xyz;
    let baba = dot(ba, ba);
    if (a.w <= 0.0 || baba < 1e-8) {
      return 1e9;
    }
    let oa = eye - a.xyz;
    let bard = dot(ba, dir);
    let baoa = dot(ba, oa);
    let qa = baba - bard * bard;
    let qb = baba * dot(dir, oa) - baoa * bard;
    let qc = baba * dot(oa, oa) - baoa * baoa - a.w * a.w * baba;
    let h = qb * qb - qa * qc;
    if (h < 0.0) {
      return 1e9;
    }
    let root = sqrt(h);
    var t = -1.0;
    if (qa > 1e-8) {
      t = (-qb - root) / qa;
    }
    let y = baoa + t * bard;
    if (t > 0.0 && y > 0.0 && y < baba) {
      return t;
    }
    if (abs(bard) < 1e-8) {
      return 1e9;
    }
    var end = baba;
    if (y <= 0.0) {
      end = 0.0;
    }
    let tc = (end - baoa) / bard;
    if (tc > 0.0 && abs(qb + qa * tc) < root) {
      return tc;
    }
    return 1e9;
  }`);
}

/** The march's functions, written once for `shape` (the same for every fire). */
let marchWritten = false;
function marchFor(shape: FlameShape): void {
  if (marchWritten) return;
  marchWritten = true;
  const look = shape.look;
  const stops = look.blackbody.slice(1).map(([at, r, g, b, bright], i) => {
    const [before, r0, g0, b0, bright0] = look.blackbody[i];
    return `if (life <= ${f(at)}) { return mix(vec3f(${f(r0)}, ${f(g0)}, ${f(b0)}) * ${f(bright0)}, `
      + `vec3f(${f(r)}, ${f(g)}, ${f(b)}) * ${f(bright)}, (life - ${f(before)}) / ${f(at - before)}); }`;
  }).join('\n    ');
  kept(`fn fireColour(life: f32) -> vec3f {
    ${stops}
    return vec3f(1.0);
  }`);
  // the loop at one frame's tile (as fire.ts's `flameTile`)
  kept(`fn fireTile(q: vec3f, frame: f32, noise: texture_3d<f32>, noiseAt: sampler) -> f32 {
    // (a frame of the loop in the slot of its parity; under 0 the one held for a fire that stands still)
    let at = vec2f(select(frame - floor(frame / 2.0) * 2.0, ${f(shape.stillSlot)}, frame < 0.0), 0.0);
    let size = vec2f(${f(shape.keptSize.x)}, ${f(shape.keptSize.y)});
    let inBox = q.xy * vec2f(${f(shape.cells.nx)}, ${f(shape.cells.ny)}) - vec2f(${f(shape.kept.x[0])}, ${f(shape.kept.y[0])});
    let cell = (at * size + clamp(inBox, vec2f(0.5), size - 0.5)) / (size * vec2f(${f(shape.tiles.across)}, ${f(shape.tiles.down)}));
    let deep = (q.z * ${f(shape.cells.nz)} - ${f(shape.kept.z[0])}) / ${f(shape.keptSize.z)};
    return textureSampleLevel(noise, noiseAt, vec3f(cell, deep), 0.0).r;
  }`);
  // a flame's life at p (as fire.ts's `flameLife`)
  kept(`fn fireLife(p: vec3f, noise: texture_3d<f32>, noiseAt: sampler, top: f32, reach: f32, frame: f32,
    turn: vec2f, lite: f32) -> f32 {
    let across = vec2f(p.x * turn.x - p.z * turn.y, p.x * turn.y + p.z * turn.x) / reach;
    let q = vec3f(across.x * 0.5 + 0.5, p.y / top, across.y * 0.5 + 0.5);
    if (q.y <= 0.0 || q.y >= 1.0 || dot(across, across) >= 1.0) {
      return 0.0;
    }
    let first = floor(frame);
    let next = first + 1.0 - floor((first + 1.0) / ${f(shape.frames)}) * ${f(shape.frames)};
    if (lite > 0.5) {
      let nearest = floor(frame + 0.5) - floor(floor(frame + 0.5) / ${f(shape.frames)}) * ${f(shape.frames)};
      let alone = fireTile(q, select(nearest, frame, frame < 0.0), noise, noiseAt);
      if (alone <= 0.004) {
        return 0.0;
      }
      let sideFrom = mix(${f(look.sideFadeFoot)}, ${f(look.sideFade)}, smoothstep(0.0, ${f(look.footNarrows)}, q.y));
      let side = 1.0 - smoothstep(sideFrom, sideFrom + 0.3, length(across));
      return alone * (1.0 - ${f(look.strandsTake * (1 - shape.liteStrands))}) * side * smoothstep(0.0, ${f(look.footFade)}, q.y);
    }
    let life = mix(fireTile(q, first, noise, noiseAt), fireTile(q, next, noise, noiseAt), frame - first);
    if (life <= 0.004) {
      return 0.0;
    }
    let fine = vec3f(abs(fract(q.x * ${f(look.strandsAcross)}) * 2.0 - 1.0) * 0.3 + 0.35,
      0.1 + fract(q.y * ${f(look.strandsUp)}) * 0.4,
      abs(fract(q.z * ${f(look.strandsAcross)}) * 2.0 - 1.0) * 0.3 + 0.35);
    let strands = fireTile(fine, first, noise, noiseAt);
    let sideFrom = mix(${f(look.sideFadeFoot)}, ${f(look.sideFade)}, smoothstep(0.0, ${f(look.footNarrows)}, q.y));
    let side = 1.0 - smoothstep(sideFrom, sideFrom + 0.3, length(across));
    return life * (1.0 - ${f(look.strandsTake)} * (1.0 - strands)) * side * smoothstep(0.0, ${f(look.footFade)}, q.y);
  }`);
  // where a ray from eye along dir is among the flames: a cylinder `reach` round, `top` high
  kept(`fn fireSpan(eye: vec3f, dir: vec3f, top: f32, reach: f32) -> vec2f {
    var up = dir.y;
    if (abs(up) < 1e-5) {
      up = 1e-5;
    }
    let floorAt = -eye.y / up;
    let topAt = (top - eye.y) / up;
    var span = vec2f(min(floorAt, topAt), max(floorAt, topAt));
    let origin = eye.xz;
    let along = dir.xz;
    let a = dot(along, along);
    let b = dot(origin, along);
    let c = dot(origin, origin) - reach * reach;
    if (a < 1e-8) {
      if (c > 0.0) {
        return vec2f(0.0);
      }
      return vec2f(max(span.x, 0.0), span.y);
    }
    let meets = b * b - a * c;
    if (meets <= 0.0) {
      return vec2f(0.0);
    }
    let root = sqrt(meets);
    span = vec2f(max(span.x, (-b - root) / a), min(span.y, (-b + root) / a));
    return vec2f(max(span.x, 0.0), span.y);
  }`);
  // where a ray first meets the side of a cone frustum round the bed's middle (each end a height and a radius)
  kept(`fn fireSide(eye: vec3f, dir: vec3f, foot: vec2f, upper: vec2f) -> f32 {
    let k = (upper.y - foot.y) / (upper.x - foot.x);
    let q = foot.y + (eye.y - foot.x) * k;
    let along = dir.y * k;
    let a = dot(dir.xz, dir.xz) - along * along;
    let b = dot(eye.xz, dir.xz) - q * along;
    let c = dot(eye.xz, eye.xz) - q * q;
    let meets = b * b - a * c;
    var hit = 1e9;
    if (abs(a) < 1e-6 || meets < 0.0) {
      return hit;
    }
    let root = sqrt(meets);
    for (var i = 0; i < 2; i++) {
      var turn = root;
      if (i == 0) {
        turn = -root;
      }
      let t = (-b + turn) / a;
      let y = eye.y + dir.y * t;
      if (t > 0.0 && y >= foot.x && y <= upper.x) {
        hit = min(hit, t);
      }
    }
    return hit;
  }`);
  // where a ray first meets a disc round the bed's middle at height y, radius r
  kept(`fn fireDisc(eye: vec3f, dir: vec3f, y: f32, r: f32) -> f32 {
    if (abs(dir.y) < 1e-5) {
      return 1e9;
    }
    let t = (y - eye.y) / dir.y;
    let p = eye.xz + dir.xz * t;
    if (t > 0.0 && dot(p, p) <= r * r) {
      return t;
    }
    return 1e9;
  }`);
  // where a ray first meets the bowl under the flames (its foot, belly and rim), far off with none
  kept(`fn fireBowl(eye: vec3f, dir: vec3f, foot: vec2f, belly: vec2f, rim: vec2f) -> f32 {
    if (rim.x <= foot.x) {
      return 1e9;
    }
    var hit = fireDisc(eye, dir, foot.x, foot.y);
    hit = min(hit, fireSide(eye, dir, foot, belly));
    hit = min(hit, fireSide(eye, dir, belly, rim));
    var low = belly;
    var high = rim;
    if (belly.x > 0.0) {
      low = foot;
      high = belly;
    }
    let bed = mix(low.y, high.y, clamp(-low.x / (high.x - low.x), 0.0, 1.0));
    return min(hit, fireDisc(eye, dir, 0.0, bed));
  }`);
  kept(`fn fireLight(world: vec3f, eyeWorld: vec3f, centre: vec3f, pixel: vec2f, noise: texture_3d<f32>,
    noiseAt: sampler, top: f32, reach: f32, frame: f32, turn: vec2f, glow: f32, foot: vec2f,
    belly: vec2f, rim: vec2f, logs: f32, stepShare: f32, lite: f32) -> vec4f {
    let eye = eyeWorld - centre;
    let dir = normalize(world - eyeWorld);
    var span = fireSpan(eye, dir, top, reach);
    span.y = min(span.y, fireBowl(eye, dir, foot, belly, rim));
    span.y = min(span.y, logs);
    if (span.y <= span.x) {
      return vec4f(0.0);
    }
    let spanLength = max(span.y - span.x, 0.0);
    let wanted = f32(${shape.steps}) * stepShare * clamp(spanLength / (2.0 * reach), ${f(shape.spanLeast)}, 1.0);
    let steps = max(i32(ceil(wanted)), ${shape.stepsLeast});
    let stride = spanLength / f32(steps);
    let jitter = fract(sin(dot(pixel, vec2f(12.9898, 78.233))) * 43758.5453);
    var light = vec3f(0.0);
    var through = 1.0;
    for (var i = 0; i < ${shape.steps}; i++) {
      if (i >= steps) {
        break;
      }
      let here = fireLife(eye + dir * (span.x + (f32(i) + jitter) * stride), noise, noiseAt, top, reach, frame, turn,
        lite);
      if (here <= 0.004) {
        continue;
      }
      let thick = 1.0 - exp(-clamp(here / ${f(look.glowFullLife)}, 0.0, 1.0) * stride * ${f(look.thickPerMetre)});
      light += through * thick * fireColour(here);
      through *= 1.0 - thick * smoothstep(${f(look.holdsFrom)}, ${f(look.holdsFully)}, here);
      if (through < 0.02) {
        break;
      }
    }
    return vec4f(light * ${f(look.glow)} * glow, 1.0 - through);
  }`);
}
