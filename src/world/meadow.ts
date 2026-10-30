// A meadow's dense grass (after threejs-nanites' grass, its WebGL path): blades drawn round where the camera looks, in
// three rings over grids of world cells that follow it (snapped to whole cells, so a blade stays where it is as the
// view moves). A ring's cells are twice the size of the one inside it and its blades wider, and they hand over across
// the last fifth of the inner ring by chance, so the ground stays as covered. Each cell's blade comes from a hash of the
// cell: where it roots, how tall, which way it leans and bends; the keep test runs in the vertex shader (a dropped
// blade is drawn as nothing at its root), against the ring's band and the meadow's mask (`MeadowMask`: where grass
// grows, painted at build: none on a lane, round a house or under a tree). Each ring's grid is split into tiles, and
// only the tiles in view and in its band are drawn (on the CPU, as the mesh is about to be drawn by a camera). Blades
// gather in tufts and patches, bend along an arc, turn a little to the camera seen edge on and sway in the wind.
// Nothing here changes a program as the camera moves: the tiles, the grids' origins and the count are uniforms.
import * as THREE from 'three';
import { canvasOf, ctx2d, readCtx2d } from '../core/textures';
import type { Updater } from './props';

/** The rings: each cell's size (m), how far out it's drawn (m) and the segments along each blade. */
const RINGS = [
  { cell: 0.075, radius: 9, segs: 4 },
  { cell: 0.15, radius: 22, segs: 3 },
  { cell: 0.3, radius: 45, segs: 2 },
  { cell: 0.6, radius: 80, segs: 1 },
];
/** tiles a side over each ring's grid (the most drawn: the uniforms' array) */
const TILES = 8;
/** how wide a blade is at its root, in its ring's cells, in the first ring; each ring out its blades wider again by its
 *  cells' size against the first's, so every ring covers as much of the ground: a ring of cells twice as wide has a
 *  quarter of the blades, and with blades only twice as wide it covered half the ground, the first ring a denser disc
 *  following the view (from play, "there is like a circle of different grass that moves when I move") */
const WIDTH_IN_CELLS = 0.7;
/** how far before it the camera's sight is followed onto the ground for the rings' middle (m, at most), and the least
 *  steepness of the sight it's followed by (the sine of its pitch down): followed onto the ground as far as it went,
 *  a sight near level moved it from 2 m to 24 m and back as the head bobbed through the eyes, the dense ring with it,
 *  from play "grass a near circle that keeps updating in front of me" */
const FOCUS_MOST = 24;
const FOCUS_STEEP = 0.35;
/** the mask's alpha (0 to 255) under which no blade shows (`meadowAt` under 0.08: `chance` is none) */
const GRASS_SEEN = 16;
/** the grid of where any grass grows, read from the mask once: its cells (m), and how far round each it reaches (m) */
const GRASS_GRID = { cell: 0.5, margin: 1.6 };

/** Where grass grows over a square of the world (1 grass, 0 none, worn between), painted at build. */
export class MeadowMask {
  readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly perMetre: number;

  /** a mask over (-half..half) on x and z, `size` px a side, grass everywhere until painted out */
  constructor(readonly half: number, readonly size = 512) {
    this.canvas = canvasOf(size);
    // (read back once, on the CPU, for where grass grows at all: `grassCells`)
    this.g = readCtx2d(this.canvas);
    this.perMetre = size / (half * 2);
    this.g.fillStyle = '#fff';
    this.g.fillRect(0, 0, size, size);
  }

  private px(v: number): number { return (v + this.half) * this.perMetre; }

  /** no grass (or worn to `left` of it) over the rectangle (x0, z0)..(x1, z1), turned `turn` about its middle */
  clearRect(x0: number, z0: number, x1: number, z1: number, left = 0, turn = 0): void {
    const g = this.g;
    g.save();
    g.translate(this.px((x0 + x1) / 2), this.px((z0 + z1) / 2));
    g.rotate(-turn);
    this.wear(left);
    const w = (x1 - x0) * this.perMetre, d = (z1 - z0) * this.perMetre;
    g.fillRect(-w / 2, -d / 2, w, d);
    g.restore();
  }

  /** no grass (or worn to `left` of it) within `r` of (x, z) */
  clearCircle(x: number, z: number, r: number, left = 0): void {
    const g = this.g;
    g.save();
    this.wear(left);
    g.beginPath();
    g.arc(this.px(x), this.px(z), r * this.perMetre, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  /** a ring (between `r0` and `r1` of the middle) worn to `left` */
  clearRing(r0: number, r1: number, left = 0): void {
    const g = this.g;
    g.save();
    this.wear(left);
    g.beginPath();
    g.arc(this.px(0), this.px(0), r1 * this.perMetre, 0, Math.PI * 2);
    g.arc(this.px(0), this.px(0), r0 * this.perMetre, 0, Math.PI * 2, true);
    g.fill();
    g.restore();
  }

  /** no grass (or worn to `left` of it) along a line through `points` (x, z), `width` m wide, its ends round */
  clearPath(points: readonly (readonly [number, number])[], width: number, left = 0): void {
    const g = this.g;
    g.save();
    this.wear(left);
    g.strokeStyle = g.fillStyle;
    g.lineWidth = width * this.perMetre;
    g.lineCap = g.lineJoin = 'round';
    g.beginPath();
    points.forEach(([x, z], i) => (i ? g.lineTo(this.px(x), this.px(z)) : g.moveTo(this.px(x), this.px(z))));
    g.stroke();
    g.restore();
  }

  /** no grass (or worn to `left` of it) inside the polygon through `points` (x, z) */
  clearPolygon(points: readonly (readonly [number, number])[], left = 0): void {
    const g = this.g;
    g.save();
    this.wear(left);
    g.beginPath();
    points.forEach(([x, z], i) => (i ? g.lineTo(this.px(x), this.px(z)) : g.moveTo(this.px(x), this.px(z))));
    g.closePath();
    g.fill();
    g.restore();
  }

  /** what's painted next takes away grass, leaving `left` of it */
  private wear(left: number): void {
    this.g.globalCompositeOperation = 'destination-out';
    this.g.fillStyle = `rgba(0,0,0,${1 - left})`;
  }

  /** Where any grass grows, in cells of `cell` m over the mask's square (row by row from its -x, -z corner), each
   *  cell grown by `margin` m round it: the grass reads the mask a metre or so aside (`meadowAt`), and its blades lean
   *  half a metre off their cells. */
  grassCells(cell: number, margin: number): { has: Uint8Array; n: number; cell: number } {
    const n = Math.ceil((this.half * 2) / cell);
    const pixels = this.g.getImageData(0, 0, this.size, this.size).data;
    const bare = new Uint8Array(n * n);
    for (let py = 0; py < this.size; py++) {
      for (let px = 0; px < this.size; px++) {
        // (grass is the mask's alpha: what clears it paints it out)
        if (pixels[(py * this.size + px) * 4 + 3] < GRASS_SEEN) continue;
        const cx = Math.min(n - 1, Math.floor(px / this.perMetre / cell));
        const cz = Math.min(n - 1, Math.floor(py / this.perMetre / cell));
        bare[cz * n + cx] = 1;
      }
    }
    const reach = Math.ceil(margin / cell), has = new Uint8Array(n * n);
    for (let cz = 0; cz < n; cz++) {
      for (let cx = 0; cx < n; cx++) {
        if (!bare[cz * n + cx]) continue;
        for (let dz = -reach; dz <= reach; dz++) {
          for (let dx = -reach; dx <= reach; dx++) {
            const x = cx + dx, z = cz + dz;
            if (x >= 0 && z >= 0 && x < n && z < n) has[z * n + x] = 1;
          }
        }
      }
    }
    return { has, n, cell };
  }

  /** The mask as a texture, its edges softened (`blur` m): read by the grass and by the ground under it. */
  texture(blur = 0.25): THREE.CanvasTexture {
    const soft = canvasOf(this.size), g = ctx2d(soft);
    g.fillStyle = '#000';
    g.fillRect(0, 0, this.size, this.size);
    g.filter = `blur(${(blur * this.perMetre).toFixed(2)}px)`;
    g.drawImage(this.canvas, 0, 0);
    const t = new THREE.CanvasTexture(soft);
    t.colorSpace = THREE.NoColorSpace;
    // (its rows top to bottom as z goes: flipped, as three flips a canvas, the yard read the terrace's clearing)
    t.flipY = false;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    return t;
  }
}

/** The mask's uniforms in a shader that reads it (the grass, the ground under it). */
export interface MaskUniforms {
  uMeadow: { value: THREE.Texture };
  uMeadowHalf: { value: number };
}

/**
 * GLSL: `meadowAt(xz)`, the mask's grass there (0 to 1), its edges made ragged: read a little aside by a noise, and its
 * worn shades cut by another, so a clearing's edge wanders as grass's does (read as painted, every road and path was
 * edged by a ruler). Needs `MaskUniforms`.
 */
export const MEADOW_AT_GLSL = /* glsl */ `
  uniform sampler2D uMeadow;
  uniform float uMeadowHalf;
  float meadowHash(vec2 p) { return fract(sin(dot(p, vec2(269.5, 183.3))) * 43758.5453); }
  float meadowNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(meadowHash(i), meadowHash(i + vec2(1, 0)), f.x),
      mix(meadowHash(i + vec2(0, 1)), meadowHash(i + vec2(1, 1)), f.x), f.y);
  }
  float meadowAt(vec2 xz) {
    vec2 aside = vec2(meadowNoise(xz * 0.45), meadowNoise(xz * 0.45 + 17.3)) - 0.5;
    aside += (vec2(meadowNoise(xz * 1.7 + 5.1), meadowNoise(xz * 1.7 + 41.7)) - 0.5) * 0.4;
    float m = texture2D(uMeadow, (xz + aside * 1.4) / (2.0 * uMeadowHalf) + 0.5).r;
    float cut = meadowNoise(xz * 2.3 + 3.7) * 0.6 + meadowNoise(xz * 6.1) * 0.4;
    return clamp(m + (cut - 0.5) * 0.5 * (1.0 - abs(m * 2.0 - 1.0)) * 2.0, 0.0, 1.0);
  }`;

/** One blade: (t along it 0..1, side -1..1) at each point, a strip as indexed triangles. */
function bladeGeometry(segs: number): THREE.InstancedBufferGeometry {
  const geo = new THREE.InstancedBufferGeometry();
  const bv: number[] = [], index: number[] = [];
  for (let s = 0; s < segs; s++) bv.push(s / segs, -1, s / segs, 1);
  bv.push(1, 0);
  for (let s = 0; s < segs; s++) {
    const a = s * 2;
    index.push(a, a + 1, a + 2);
    if (s < segs - 1) index.push(a + 1, a + 3, a + 2);
  }
  geo.setAttribute('bv', new THREE.Float32BufferAttribute(bv, 2));
  // (three draws as many points as `position` has)
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((bv.length / 2) * 3), 3));
  geo.setIndex(index);
  // (set as each ring is drawn: none until then)
  geo.instanceCount = 0;
  return geo;
}

const VERTEX_HEAD = /* glsl */ `
  attribute vec2 bv;
  uniform vec2 uOrigin;
  uniform float uCell;
  uniform float uWider;
  uniform int uS;
  uniform vec2 uTiles[${TILES * TILES}];
  uniform vec2 uFocus;
  uniform vec4 uBand;
  uniform float uTime;
  ${MEADOW_AT_GLSL}
  varying vec3 vBladeColour;
  varying vec2 vBlade;
  uvec2 pcg2d(uvec2 v) {
    v = v * 1664525u + 1013904223u;
    v.x += v.y * 1664525u; v.y += v.x * 1664525u;
    v = v ^ (v >> 16u);
    v.x += v.y * 1664525u; v.y += v.x * 1664525u;
    v = v ^ (v >> 16u);
    return v;
  }
  float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise2(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
  }`;

/** The blade this instance draws: its place and shape from its cell, its normal and colour; `bladePos` for
 *  begin_vertex. */
const VERTEX_BLADE = /* glsl */ `
  int perTile = uS * uS;
  int tile = gl_InstanceID / perTile;
  int within = gl_InstanceID - tile * perTile;
  vec2 cellI = uOrigin + uTiles[tile] + vec2(float(within % uS), float(within / uS));
  uvec2 hA = pcg2d(uvec2(ivec2(cellI) + 65536));
  uvec2 hB = pcg2d(hA ^ uvec2(0x9e3779b9u, 0x85ebca6bu));
  vec4 h = vec4(hA, hB) / 4294967295.0;
  vec2 root = (cellI + h.xy) * uCell;
  // tufts: the blades pulled towards a centre on a coarse grid, sharing its height and how dry it is. The grid is
  // looked up through a warp of slow noise, its centres anywhere in their cells and each pulling its own share: with
  // centres in the middle half of a straight grid, all pulling alike, the tufts stood in rows ("too tiled")
  vec2 warped = root + (vec2(noise2(root * 0.31), noise2(root * 0.31 + 17.9)) - 0.5) * 1.6;
  vec2 tuftCell = floor(warped / 0.7);
  vec2 tuftAt = (tuftCell + vec2(hash21(tuftCell), hash21(tuftCell + 31.7))) * 0.7;
  tuftAt -= warped - root;
  float tuft = hash21(tuftCell + 7.3);
  root = mix(root, tuftAt, mix(0.1, 0.45, hash21(tuftCell + 3.1)));
  float d = length(root - uFocus);
  float band = smoothstep(uBand.x, uBand.y, d) * (1.0 - smoothstep(uBand.z, uBand.w, d));
  float grass = meadowAt(root);
  // (the mask itself, unwarped: the warp wanders the meadow's edges, but never out past where it grows, or the grass
  // crept up to 1.4 m onto the paving, "no grass on paved road pls")
  vec2 maskUv = root / (2.0 * uMeadowHalf) + 0.5;
  float grows = texture2D(uMeadow, maskUv).r;
  float patchy = noise2(root * 0.15) * 0.65 + noise2(root * 0.55 + 9.1) * 0.35;
  float chance = band * smoothstep(0.08, 0.6, grass) * smoothstep(0.3, 0.7, grows)
    * mix(0.75, 1.0, smoothstep(0.25, 0.7, patchy));
  // (each blade grows in as its chance rises past its own share, and shrinks away as it falls: switched on and off,
  // the blades in a ring's band, which moves with the hero, came and went in a line ahead of him as he walked, "grass
  // keeps redrawing itself in front of me"); none where its chance is none: faded in below its share, the lowest
  // shares grew on the paved roads, "we dont need grass on paved roads")
  float on = smoothstep(h.z * 0.85, h.z * 0.85 + 0.15, chance);
  float height = on * mix(0.2, 0.46, h.w) * mix(0.55, 1.0, grass) * mix(0.75, 1.25, tuft) * mix(0.8, 1.15, patchy);
  float width = on * uCell * uWider * ${WIDTH_IN_CELLS.toFixed(2)} * mix(0.8, 1.25, fract(h.z * 7.13));
  float turn = h.w * 6.2832 + h.x * 3.0;
  vec2 lean2 = vec2(cos(turn), sin(turn));
  // (at the meadow's edge a blade leans away from it, into the grass: leaning out, they lay over the curbs' tops)
  float step = 0.35 / (2.0 * uMeadowHalf);
  vec2 inward = vec2(texture2D(uMeadow, maskUv + vec2(step, 0.0)).r - texture2D(uMeadow, maskUv - vec2(step, 0.0)).r,
    texture2D(uMeadow, maskUv + vec2(0.0, step)).r - texture2D(uMeadow, maskUv - vec2(0.0, step)).r);
  float edge = clamp(length(inward) * 3.0, 0.0, 1.0);
  lean2 = normalize(mix(lean2, normalize(inward + 1e-5), edge * 0.85));
  vec3 lean = vec3(lean2.x, 0.0, lean2.y);
  // seen edge on, a blade turns up to a third of the way to the camera (edge on it's a thin line)
  vec2 toCam = normalize(cameraPosition.xz - root + 1e-4);
  vec2 across0 = vec2(lean2.y, -lean2.x);
  vec2 facing = vec2(-toCam.y, toCam.x);
  vec2 turned = normalize(mix(across0, facing * sign(dot(facing, across0) + 1e-4), (1.0 - abs(dot(toCam, lean2))) * 0.35));
  vec3 across = vec3(turned.x, 0.0, turned.y);
  float t = bv.x, side = bv.y;
  float tilt = 0.12 + fract(h.x * 13.1) * 0.35, bendK = 0.35 + fract(h.y * 7.7) * 0.7;
  float mid = tilt + bendK * t * 0.5, ang = tilt + bendK * t;
  float w = width * (1.0 - pow(t, 2.5));
  vec3 local = across * (side * w * 0.5) + lean * (t * height * sin(mid)) + vec3(0.0, t * height * cos(mid), 0.0);
  // the wind: gusts rolling across the meadow and a flutter a blade, bending by the square of t
  float roll = sin(uTime * 1.5 - root.x * 0.21 - root.y * 0.14) * 0.5 + 0.5;
  float flutter = sin(uTime * 5.1 + h.y * 6.2832) * 0.25;
  vec3 wind = vec3(0.83, 0.0, 0.55) * (t * t * height * (roll * 0.5 + flutter * 0.3 + 0.1));
  vec3 bladePos = vec3(root.x, 0.0, root.y) + local + wind;
  // its upper face along the arc, rounded across: lit as a surface, from both sides
  vec3 face = vec3(0.0, 1.0, 0.0) * sin(ang) - lean * cos(ang);
  vec3 objectNormal = normalize(mix(face, vec3(0.0, 1.0, 0.0), 0.55) + across * side * 0.45);
  vBlade = vec2(t, side);
  // spring greens, a tuft's own, some dry and gold
  vec3 green = mix(vec3(0.075, 0.2, 0.03), vec3(0.17, 0.32, 0.045), fract(h.y * 3.7));
  vec3 dry = vec3(0.36, 0.33, 0.1);
  vBladeColour = mix(green, dry, smoothstep(0.72, 1.0, tuft) * 0.7 + smoothstep(0.75, 0.95, patchy) * 0.25);`;

const FRAGMENT_COLOUR = /* glsl */ `
  float along = vBlade.x, acrossB = abs(vBlade.y);
  vec3 bladeColour = vBladeColour * mix(0.3, 1.0, smoothstep(0.0, 0.55, along));
  bladeColour *= 1.0 - acrossB * acrossB * 0.3;
  bladeColour += vec3(0.02, 0.03, 0.0) * (1.0 - smoothstep(0.04, 0.16, acrossB)) * smoothstep(0.1, 0.4, along);
  bladeColour = mix(bladeColour, vec3(0.4, 0.36, 0.16), smoothstep(0.85, 1.0, along) * 0.35);
  vec4 diffuseColor = vec4(bladeColour, opacity);`;

/** A ring's uniforms, set as it's drawn. */
interface RingUniforms extends MaskUniforms {
  uOrigin: { value: THREE.Vector2 };
  uCell: { value: number };
  uWider: { value: number };
  uS: { value: number };
  uTiles: { value: THREE.Vector2[] };
  uFocus: { value: THREE.Vector2 };
  uBand: { value: THREE.Vector4 };
  uTime: { value: number };
}

/** A ring's material: the standard one, its points placed as its blades (`VERTEX_BLADE`), coloured as grass. */
function bladeMaterial(u: RingUniforms): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
      .replace('#include <beginnormal_vertex>', VERTEX_BLADE)
      .replace('#include <begin_vertex>', 'vec3 transformed = bladePos;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBladeColour;\nvarying vec2 vBlade;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', FRAGMENT_COLOUR)
      // (the face bent up is the lit one from either side: flipped on the back, every blade's back was dark)
      .replace('#include <normal_fragment_begin>',
        THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'));
  };
  m.customProgramCacheKey = () => 'meadow-blades';
  return m;
}

const _forward = new THREE.Vector3(), _frustum = new THREE.Frustum(), _viewProj = new THREE.Matrix4();
const _box = new THREE.Box3();

/** Where the camera looks on the ground: along its sight onto the floor, at most `FOCUS_MOST` m before it, and from
 *  a sight near level as far as one `FOCUS_STEEP` down would meet it (the camera's height over that). */
export function focusOf(camera: THREE.Camera, out: THREE.Vector2): THREE.Vector2 {
  camera.getWorldDirection(_forward);
  const p = camera.position;
  const along = Math.min(FOCUS_MOST, Math.max(p.y, 0) / Math.max(-_forward.y, FOCUS_STEEP));
  return out.set(p.x + _forward.x * along, p.z + _forward.z * along);
}

/** The meadow's grass over `mask`'s square, swaying on the game's clock (an updater keeps the time). */
export function buildMeadow(mask: MeadowMask, maskTexture: THREE.Texture, updaters: Updater[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'meadow';
  // (where it grows, for the lab and the village's map)
  group.userData.mask = mask;
  group.userData.maskTexture = maskTexture;
  const time = { value: 0 };
  updaters.push((_dt, t) => { time.value = t; });
  // (a tile with no grass in it is never drawn: over the square, the roads and what's built, every blade of it was
  // drawn as nothing, its vertices shaded all the same)
  const grown = mask.grassCells(GRASS_GRID.cell, GRASS_GRID.margin);
  const anyGrass = (x0: number, z0: number, x1: number, z1: number): boolean => {
    const at = (v: number): number => Math.max(0, Math.min(grown.n - 1, Math.floor((v + mask.half) / grown.cell)));
    for (let cz = at(z0); cz <= at(z1); cz++) {
      for (let cx = at(x0); cx <= at(x1); cx++) if (grown.has[cz * grown.n + cx]) return true;
    }
    return false;
  };
  RINGS.forEach((ring, k) => {
    const inner = k === 0 ? 0 : RINGS[k - 1].radius;
    // (cells a side a tile: the ring's square across, in whole tiles)
    const S = Math.ceil((Math.ceil((ring.radius * 2) / ring.cell) + 1) / TILES);
    const N = S * TILES;
    const u: RingUniforms = {
      uOrigin: { value: new THREE.Vector2() },
      uCell: { value: ring.cell },
      uWider: { value: ring.cell / RINGS[0].cell },
      uS: { value: S },
      uTiles: { value: Array.from({ length: TILES * TILES }, () => new THREE.Vector2()) },
      uFocus: { value: new THREE.Vector2() },
      // (handed over from the ring inside across its last fifth; the first's inner edge never reached)
      uBand: { value: new THREE.Vector4(k === 0 ? -2 : inner * 0.8, k === 0 ? -1 : inner, ring.radius * 0.8, ring.radius) },
      uTime: time,
      uMeadow: { value: maskTexture },
      uMeadowHalf: { value: mask.half },
    };
    const geo = bladeGeometry(ring.segs);
    const mesh = new THREE.Mesh(geo, bladeMaterial(u));
    mesh.name = `meadow grass ${k + 1}`;
    // (the tiles are its culling: three's sphere would be round no points)
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.onBeforeRender = (_renderer, _scene, camera) => {
      const focus = focusOf(camera, u.uFocus.value);
      const ox = Math.floor(focus.x / ring.cell) - (N >> 1), oz = Math.floor(focus.y / ring.cell) - (N >> 1);
      u.uOrigin.value.set(ox, oz);
      _frustum.setFromProjectionMatrix(_viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const w = S * ring.cell;
      let listed = 0;
      for (let ty = 0; ty < TILES; ty++) {
        for (let tx = 0; tx < TILES; tx++) {
          const x0 = (ox + tx * S) * ring.cell, z0 = (oz + ty * S) * ring.cell;
          const near = Math.hypot(Math.max(x0 - focus.x, 0, focus.x - x0 - w), Math.max(z0 - focus.y, 0, focus.y - z0 - w));
          if (near >= ring.radius) continue;
          const far = Math.hypot(Math.max(focus.x - x0, x0 + w - focus.x), Math.max(focus.y - z0, z0 + w - focus.y));
          if (far <= inner * 0.8) continue;
          // (a blade leans and bends up to half a metre off its cell)
          _box.min.set(x0 - 0.5, -0.1, z0 - 0.5);
          _box.max.set(x0 + w + 0.5, 0.8, z0 + w + 0.5);
          if (!_frustum.intersectsBox(_box)) continue;
          if (anyGrass(x0, z0, x0 + w, z0 + w)) u.uTiles.value[listed++].set(tx * S, ty * S);
        }
      }
      geo.instanceCount = listed * S * S;
    };
    group.add(mesh);
  });
  return group;
}

/** The ground under a meadow: its own colour (bare earth) where the mask has none, a sward's dark green where it has
 *  grass (seen between the blades), in broad patches. */
export function meadowGround<M extends THREE.MeshStandardMaterial>(m: M, mask: MaskUniforms): M {
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, mask);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vMeadowXZ;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvMeadowXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vMeadowXZ;
        ${MEADOW_AT_GLSL}
        float swardH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float swardN(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(swardH(i), swardH(i + vec2(1, 0)), f.x), mix(swardH(i + vec2(0, 1)), swardH(i + vec2(1, 1)), f.x), f.y);
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float swardV = swardN(vMeadowXZ * 0.15) * 0.6 + swardN(vMeadowXZ * 0.9 + 4.0) * 0.4;
        vec3 sward = mix(vec3(0.05, 0.11, 0.025), vec3(0.11, 0.17, 0.04), swardV) * (0.8 + diffuseColor.g * 0.6);
        diffuseColor.rgb = mix(diffuseColor.rgb, sward, smoothstep(0.1, 0.7, meadowAt(vMeadowXZ)));`);
  };
  m.customProgramCacheKey = () => 'meadow-ground';
  return m;
}
