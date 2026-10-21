// tools/lab neck's slices: a hero's meshes round his neck, posed as they're drawn (a skinned mesh's vertices and
// normals carried by its bones as the shader carries them), in the neck joint's frame, cut by level planes up the neck
// and met by rays from all round it, each in towards the neck's axis. A ray's first hit is what the eye sees from
// that side: a hair card where its texture is drawn (alpha tested), a face only from its front unless it's drawn from
// both. Cut into segments a level, the rays meet only those of their own angle, so the whole neck is read in a fraction
// of a second (three's own raycast posed and tested every triangle of the hero for each ray).
import * as THREE from 'three';
import type { Model } from '../../../src/types';
import { HEAD_MM } from '../../../src/entities/models/head';
import { fallOf, type Fall, type Gap } from './neckGaps';
import { freeNecks, girthOf, type Kind, type Line, type Rgb, type Sample } from './neckMeasure';

/** the rays round the neck, each `360 / ANGLES` degrees from the next */
export const ANGLES = 72;
/** the rows up the neck (face mm apart), from below the neck's joint (m) up past the head's joint (face mm) */
export const ROW_MM = 2;
const FROM_BELOW = 0.05;
const ABOVE_HEAD = 70;
/** the rows the head's girth is read from (face mm above the head's joint: from the eyes up) */
const HEAD_ROWS = [100, 110, 120, 130, 140, 150, 160, 170, 180];
/** how far from the neck's axis what's cut may be (m): the neck, the head, the collar, not the arms */
const REACH = 0.16;
/** where the rays start, out from the axis (m) */
const RAY_FROM = 0.3;
/** how far below the slices a ray dropped down a gap round the neck may fall and still meet something (m: inside the
 *  clothes, to the belt) */
const FALL = 0.35;
/** how far above the head's joint the lines of sight into a gap round the neck may be stood in front of (m: over
 *  his crown and his hat; a camera behind him sees the gaps in front of his neck only over his head) */
const CROWN = 0.32;
/** the narrowest gap between the neck and its collar a ray is dropped down, and the widest (mm: a collar lying on
 *  the neck has none; past a collar's reach off it, what the free neck came out of was a strap, the quiver or a
 *  shoulder, and the ray fell past the hero to the ground behind him) */
const GAP_LEAST = 1;
const GAP_MOST = 25;

/** A mesh cut into the slices: what it is, whether a hit on it at a point of its texture is drawn, and its paint
 *  there (linear light), the vertex colour already multiplied in. */
export interface Part {
  kind: Kind;
  drawnAt(u: number, v: number): boolean;
  paintAt(u: number, v: number, vertex: Rgb): Rgb;
  bothSides: boolean;
}

/** One triangle of the hero round his neck, in the neck's frame (m): its corners' places, shading normals, texture
 *  coordinates and vertex colours, the part it's of, its heights, and its bounds seen from above. */
export interface Triangle {
  places: THREE.Vector3[];
  normals: THREE.Vector3[];
  uvs: THREE.Vector2[];
  colours: Rgb[];
  facing: THREE.Vector3;
  part: number;
  low: number;
  high: number;
  plan: THREE.Box2;
}

/** A point of a cut: where (the neck's frame, m) and what's there, as a triangle's corners blend into it. */
interface Cut {
  place: THREE.Vector3;
  normal: THREE.Vector3;
  uv: THREE.Vector2;
  colour: Rgb;
}

/** A level plane's cut through one triangle. */
interface Segment {
  ends: [Cut, Cut];
  triangle: Triangle;
}

/** A ray's hit: how far out from the axis (m) and what it met, blended along the segment. */
interface Hit {
  r: number;
  cut: Cut;
  triangle: Triangle;
}

/** What the slices read: a line up the neck for each ray (`Line`), the girth of the skin round each row (face mm,
 *  the clothes and hair left out) and the head's (its widest from the eyes up), and the share of the rays round the
 *  collar where skin came out through the clothes, and where they are. */
export interface Slices {
  lines: Line[];
  girths: { y: number; girth: number }[];
  head: number;
  through: number;
  /** each row with skin come out through the clothes: its height (face mm), the angles of the rays (degrees) and
   *  how far out of the clothes the skin came at most (mm) */
  throughAt: { y: number; angles: number[]; deepest: number }[];
  /** the neck's joint's height (face mm above the head's) */
  base: number;
  /** each line where the neck stands loose in its collar, and what a ray dropped down between them met */
  falls: Fall[];
}

/** What a mesh of the hero is, by its name (head.ts names the face, the ears, the hair, its crop under a hat and the
 *  beard; buildNeck the neck). */
function kindOf(mesh: THREE.Mesh): Kind {
  if (mesh.name === 'face' || mesh.name === 'neck' || mesh.name === 'ear') return mesh.name;
  if (mesh.name === 'hair' || mesh.name === 'crop' || mesh.name === 'beard') return 'hair';
  return 'cloth';
}

/** A texture's pixels (RGBA, 0-255), read once, or null where its image can't be read. */
const pixelsRead = new Map<THREE.Texture, ImageData | null>();
function pixelsOf(texture: THREE.Texture): ImageData | null {
  if (pixelsRead.has(texture)) return pixelsRead.get(texture)!;
  const image = texture.image as CanvasImageSource & { width: number; height: number };
  let pixels: ImageData | null = null;
  if (image && image.width && image.height) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    pixels = context.getImageData(0, 0, image.width, image.height);
  }
  pixelsRead.set(texture, pixels);
  return pixels;
}

/** The pixel of `texture` at (u, v), wrapped as it repeats, 0-1 a channel; null where it can't be read. */
function texel(texture: THREE.Texture, u: number, v: number): [number, number, number, number] | null {
  const pixels = pixelsOf(texture);
  if (!pixels) return null;
  const wrap = (t: number) => t - Math.floor(t);
  const x = Math.min(pixels.width - 1, Math.floor(wrap(u) * pixels.width));
  const row = texture.flipY ? 1 - wrap(v) : wrap(v);
  const y = Math.min(pixels.height - 1, Math.floor(row * pixels.height));
  const at = (y * pixels.width + x) * 4;
  const data = pixels.data;
  return [data[at] / 255, data[at + 1] / 255, data[at + 2] / 255, data[at + 3] / 255];
}

/** An sRGB channel's value in linear light. */
const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** the texels across a paint is averaged over, either way, and a texel up and down (the face's map is about 0.6 mm
 *  a texel: a tone over 5 mm round, as the eye sees it a few metres off, not a single hair of the stubble painted on
 *  it; averaged as far up and down, it smeared the paint of the rows above and below into the row) */
const PAINT_REACH = 4;

/** `texture`'s colour round (u, v) in linear light, averaged over `PAINT_REACH` texels across either way and one up
 *  and down; null where it can't be read. */
function paintRound(texture: THREE.Texture, u: number, v: number): Rgb | null {
  const pixels = pixelsOf(texture);
  if (!pixels) return null;
  const sum: Rgb = [0, 0, 0];
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -PAINT_REACH; dx <= PAINT_REACH; dx++) {
      const pixel = texel(texture, u + dx / pixels.width, v + dy / pixels.height)!;
      for (let channel = 0; channel < 3; channel++) sum[channel] += linear(pixel[channel]);
      count++;
    }
  }
  return [sum[0] / count, sum[1] / count, sum[2] / count];
}

/** `mesh` as a part of the slices: its kind, where its texture is drawn, and its paint. */
function partOf(mesh: THREE.Mesh): Part {
  const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
  const map = material.map;
  const cut = material.alphaTest > 0 && map ? material.alphaTest : 0;
  const tint = material.color ?? new THREE.Color(1, 1, 1);
  return {
    kind: kindOf(mesh),
    bothSides: material.side === THREE.DoubleSide,
    drawnAt(u, v) {
      if (!cut) return true;
      const pixel = texel(map!, u, v);
      return !pixel || pixel[3] >= cut;
    },
    paintAt(u, v, vertex) {
      const base = (map && paintRound(map, u, v)) ?? [1, 1, 1];
      return [base[0] * tint.r * vertex[0], base[1] * tint.g * vertex[1], base[2] * tint.b * vertex[2]];
    },
  };
}

/** Whether `object` and every one of its parents is shown. */
function shown(object: THREE.Object3D): boolean {
  for (let at: THREE.Object3D | null = object; at; at = at.parent) if (!at.visible) return false;
  return true;
}

/** A corner of `mesh`, posed as drawn, in the frame `toNeck` takes the world to: its place and its shading normal
 *  (a skinned mesh's normal carried by its bones as the shader carries it: a point a little along it, posed). */
function cornerOf(mesh: THREE.Mesh, index: number, toNeck: THREE.Matrix4): [THREE.Vector3, THREE.Vector3] {
  const geometry = mesh.geometry;
  const place = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, index);
  const normal = new THREE.Vector3().fromBufferAttribute(geometry.attributes.normal, index);
  const toWorld = new THREE.Matrix4().multiplyMatrices(toNeck, mesh.matrixWorld);
  if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
    const skinned = mesh as THREE.SkinnedMesh;
    const along = place.clone().addScaledVector(normal, 1e-3);
    skinned.applyBoneTransform(index, place);
    skinned.applyBoneTransform(index, along);
    along.applyMatrix4(toWorld);
    place.applyMatrix4(toWorld);
    return [place, along.sub(place).normalize()];
  }
  place.applyMatrix4(toWorld);
  normal.applyMatrix3(new THREE.Matrix3().getNormalMatrix(toWorld)).normalize();
  return [place, normal];
}

/** The triangles of the hero's shown meshes round his neck (within `REACH` of its axis, between `low` and `high`, or
 *  the face's up to `top`), in the neck's frame, and the parts they're of. */
function trianglesOf(model: Model, low: number, high: number, top: number): { triangles: Triangle[]; parts: Part[] } {
  const neck = model.joints!.neck;
  model.root.updateMatrixWorld(true);
  const toNeck = neck.matrixWorld.clone().invert();
  const triangles: Triangle[] = [];
  const parts: Part[] = [];
  model.root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !shown(mesh) || !mesh.geometry.attributes.normal) return;
    const part = partOf(mesh);
    const ceiling = part.kind === 'face' ? top : high;
    const geometry = mesh.geometry;
    const corners = new Map<number, [THREE.Vector3, THREE.Vector3]>();
    const corner = (index: number) => {
      if (!corners.has(index)) corners.set(index, cornerOf(mesh, index, toNeck));
      return corners.get(index)!;
    };
    const count = geometry.index ? geometry.index.count : geometry.attributes.position.count;
    const indexAt = (at: number) => (geometry.index ? geometry.index.getX(at) : at);
    const uv = geometry.attributes.uv;
    const colour = (mesh.material as THREE.MeshStandardMaterial).vertexColors ? geometry.attributes.color : undefined;
    let partIndex = -1;
    for (let at = 0; at + 2 < count; at += 3) {
      const indices = [indexAt(at), indexAt(at + 1), indexAt(at + 2)];
      const posed = indices.map(corner);
      const places = posed.map(([place]) => place);
      const heights = places.map((place) => place.y);
      const lowest = Math.min(...heights);
      const highest = Math.max(...heights);
      if (highest < low || lowest > ceiling) continue;
      if (places.every((place) => Math.hypot(place.x, place.z) > REACH)) continue;
      if (partIndex < 0) partIndex = parts.push(part) - 1;
      const facing = new THREE.Vector3().subVectors(places[1], places[0])
        .cross(new THREE.Vector3().subVectors(places[2], places[0])).normalize();
      triangles.push({
        places,
        normals: posed.map(([, normal]) => normal),
        uvs: indices.map((index) => (uv ? new THREE.Vector2(uv.getX(index), uv.getY(index)) : new THREE.Vector2())),
        colours: indices.map((index) => (colour
          ? [colour.getX(index), colour.getY(index), colour.getZ(index)] as Rgb
          : [1, 1, 1] as Rgb)),
        facing,
        part: partIndex,
        low: lowest,
        high: highest,
        plan: new THREE.Box2().setFromPoints(places.map((place) => new THREE.Vector2(place.x, place.z))),
      });
    }
  });
  return { triangles, parts };
}

/** The point a share `t` of the way from corner `a` to corner `b` of `triangle`. */
function cutAlong(triangle: Triangle, a: number, b: number, t: number): Cut {
  const mix = (x: number, y: number) => x + (y - x) * t;
  const [ca, cb] = [triangle.colours[a], triangle.colours[b]];
  return {
    place: triangle.places[a].clone().lerp(triangle.places[b], t),
    normal: triangle.normals[a].clone().lerp(triangle.normals[b], t),
    uv: triangle.uvs[a].clone().lerp(triangle.uvs[b], t),
    colour: [mix(ca[0], cb[0]), mix(ca[1], cb[1]), mix(ca[2], cb[2])],
  };
}

/** The level plane at height `y`'s cut through `triangle`, or null where it misses it. */
function segmentOf(triangle: Triangle, y: number): Segment | null {
  const cuts: Cut[] = [];
  for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
    const [ya, yb] = [triangle.places[a].y, triangle.places[b].y];
    if (ya === yb || (y - ya) * (y - yb) > 0) continue;
    cuts.push(cutAlong(triangle, a, b, (y - ya) / (yb - ya)));
  }
  if (cuts.length < 2) return null;
  return { ends: [cuts[0], cuts[1]], triangle };
}

/** The angle round the neck of a place (radians from his front, + to his left), 0 to 2π. */
function angleOf(place: THREE.Vector3): number {
  const angle = Math.atan2(place.x, place.z);
  return angle < 0 ? angle + Math.PI * 2 : angle;
}

/** The rays (`ANGLES` of them) each segment of the level `y` may meet: those whose angle it spans round the axis. */
function binned(triangles: Triangle[], y: number): Segment[][] {
  const bins: Segment[][] = Array.from({ length: ANGLES }, () => []);
  const step = (Math.PI * 2) / ANGLES;
  for (const triangle of triangles) {
    if (triangle.high < y || triangle.low > y) continue;
    const segment = segmentOf(triangle, y);
    if (!segment) continue;
    let [from, to] = segment.ends.map((end) => angleOf(end.place)).sort((a, b) => a - b);
    // (the shorter way round: a segment across his front spans the angles either side of 0)
    if (to - from > Math.PI) [from, to] = [to, from + Math.PI * 2];
    for (let ray = Math.ceil(from / step); ray * step <= to; ray++) bins[ray % ANGLES].push(segment);
  }
  return bins;
}

/** 2D cross product of (ax, az) and (bx, bz). */
const cross = (ax: number, az: number, bx: number, bz: number) => ax * bz - az * bx;

/** Where the ray at `angle` (in from `RAY_FROM` towards the axis) meets `segment`, or null. */
function meet(segment: Segment, angle: number): Hit | null {
  const [p, q] = segment.ends.map((end) => end.place);
  const [ux, uz] = [Math.sin(angle), Math.cos(angle)];
  const [dx, dz] = [q.x - p.x, q.z - p.z];
  const across = cross(ux, uz, dx, dz);
  if (Math.abs(across) < 1e-12) return null;
  const r = cross(p.x, p.z, dx, dz) / across;
  const s = cross(p.x, p.z, ux, uz) / across;
  if (s < 0 || s > 1 || r < 0 || r > RAY_FROM) return null;
  const [a, b] = segment.ends;
  const mix = (x: number, y: number) => x + (y - x) * s;
  const cut: Cut = {
    place: a.place.clone().lerp(b.place, s),
    normal: a.normal.clone().lerp(b.normal, s).normalize(),
    uv: a.uv.clone().lerp(b.uv, s),
    colour: [mix(a.colour[0], b.colour[0]), mix(a.colour[1], b.colour[1]), mix(a.colour[2], b.colour[2])],
  };
  return { r, cut, triangle: segment.triangle };
}

/** Whether `hit` is drawn as the ray sees it: its face towards the ray (or drawn from both sides), its texture drawn
 *  there. */
function seen(hit: Hit, parts: Part[], angle: number): boolean {
  const part = parts[hit.triangle.part];
  const outward = hit.triangle.facing.x * Math.sin(angle) + hit.triangle.facing.z * Math.cos(angle);
  if (outward <= 0 && !part.bothSides) return false;
  return part.drawnAt(hit.cut.uv.x, hit.cut.uv.y);
}

/** The ray at `angle`'s hits on `segments`, the outermost first. */
function hitsOn(segments: Segment[], angle: number): Hit[] {
  const hits: Hit[] = [];
  for (const segment of segments) {
    const hit = meet(segment, angle);
    if (hit) hits.push(hit);
  }
  return hits.sort((a, b) => b.r - a.r);
}

const isSkin = (kind: Kind) => kind === 'face' || kind === 'neck';
const mmOf = (metres: number) => metres / HEAD_MM;
/** the depth under a ray's skin hit clothes may be found at and the skin still count as come out through them (mm) */
const THROUGH_DEPTH = 25;
/** the least the skin must be out of the clothes to count as come out through them (mm: a hem lying on the neck
 *  touches its skin, 0.2 mm out of it along the warrior's neckline's rim as he looked aside, unseen) */
const THROUGH_LEAST = 1;

/** What a ray's first seen hit is, as a line's sample at height `y` (face mm above the head's joint). */
function sampleOf(hits: Hit[], parts: Part[], angle: number, y: number): Sample {
  const first = hits.find((hit) => seen(hit, parts, angle));
  if (!first) return { y, r: 0, tilt: 0, kind: null, colour: null };
  const part = parts[first.triangle.part];
  const { normal, uv, colour } = first.cut;
  return {
    y,
    r: mmOf(first.r),
    tilt: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(normal.y, -1, 1))),
    kind: part.kind,
    colour: isSkin(part.kind) ? part.paintAt(uv.x, uv.y, colour) : null,
  };
}

/** The girth (face mm) of the outermost skin round a level's rays, the face's alone with `faceOnly`; null where a
 *  ray met none. */
function girthAt(bins: Segment[][], parts: Part[], faceOnly: boolean): number | null {
  const points: [number, number][] = [];
  for (let ray = 0; ray < ANGLES; ray++) {
    const angle = (ray / ANGLES) * Math.PI * 2;
    const skin = hitsOn(bins[ray], angle).find((hit) => {
      const kind = parts[hit.triangle.part].kind;
      return faceOnly ? kind === 'face' : isSkin(kind);
    });
    if (!skin) return null;
    points.push([mmOf(skin.r) * Math.sin(angle), mmOf(skin.r) * Math.cos(angle)]);
  }
  return girthOf(points);
}

/** How far the ray's seen skin is out of clothes just under it (mm): the skin come out through them; null where it
 *  isn't. */
function throughClothes(hits: Hit[], parts: Part[], angle: number): number | null {
  const first = hits.find((hit) => seen(hit, parts, angle));
  if (!first || !isSkin(parts[first.triangle.part].kind)) return null;
  const under = hits.find((hit) => parts[hit.triangle.part].kind === 'cloth' && hit.r < first.r);
  const depth = under ? mmOf(first.r - under.r) : Infinity;
  return depth > THROUGH_LEAST && depth < THROUGH_DEPTH ? depth : null;
}

/** The hero's neck read by the slices, as `model` stands now. */
export function sliceNeck(model: Model): Slices {
  const joints = model.joints!;
  const headJoint = joints.head.position.y;
  const low = -FROM_BELOW;
  const high = headJoint + ABOVE_HEAD * HEAD_MM;
  const top = headJoint + HEAD_ROWS[HEAD_ROWS.length - 1] * HEAD_MM;
  const crown = headJoint + CROWN;
  const { triangles: all, parts } = trianglesOf(model, low - FALL, crown, crown);
  // (the slices read the face up to `top`, all else up to `high`)
  const triangles = all.filter((triangle) => triangle.low <= (parts[triangle.part].kind === 'face' ? top : high));
  const rows = Math.floor((high - low) / (ROW_MM * HEAD_MM));
  const lines: Line[] = Array.from({ length: ANGLES }, (_, ray) => ({ angle: (ray / ANGLES) * 360, samples: [] }));
  const girths: { y: number; girth: number }[] = [];
  const collarRows: CollarRow[] = [];
  const gapRows: (Between | null)[][] = Array.from({ length: ANGLES }, () => []);
  for (let row = 0; row <= rows; row++) {
    const height = low + row * ROW_MM * HEAD_MM;
    const y = mmOf(height - headJoint);
    const bins = binned(triangles, height);
    const collar: CollarRow = { y, through: [], deepest: 0, skin: false, cloth: false };
    for (let ray = 0; ray < ANGLES; ray++) {
      const angle = (ray / ANGLES) * Math.PI * 2;
      const hits = hitsOn(bins[ray], angle);
      const sample = sampleOf(hits, parts, angle, y);
      lines[ray].samples.push(sample);
      gapRows[ray].push(betweenOf(hits, parts));
      const out = throughClothes(hits, parts, angle);
      if (out !== null) {
        collar.through.push(lines[ray].angle);
        collar.deepest = Math.max(collar.deepest, out);
      }
      if (sample.kind && isSkin(sample.kind)) collar.skin = true;
      if (sample.kind === 'cloth' || out !== null) collar.cloth = true;
    }
    collarRows.push(collar);
    const girth = girthAt(bins, parts, false);
    if (girth !== null) girths.push({ y, girth });
  }
  let head = 0;
  for (const above of HEAD_ROWS) {
    const girth = girthAt(binned(triangles, headJoint + above * HEAD_MM), parts, true);
    if (girth !== null) head = Math.max(head, girth);
  }
  const throughAt = collarRows.filter((row) => row.through.length)
    .map((row) => ({ y: row.y, angles: row.through, deepest: row.deepest }));
  const surfaces = { triangles: all, parts, floor: low - FALL, ceiling: crown };
  const falls = gapsOf(lines, gapRows, low).map((gap) => fallOf(gap, surfaces));
  return { lines, girths, head, through: throughShare(collarRows), throughAt, base: mmOf(-headJoint), falls };
}

/** A ray's outermost skin and the innermost clothes outside it (m out from the axis). */
interface Between {
  skin: number;
  cloth: number;
}

/** What lies between the outermost skin a ray met and the clothes outside it, or null where it met no skin or no
 *  clothes outside it. */
function betweenOf(hits: Hit[], parts: Part[]): Between | null {
  const skin = hits.find((hit) => isSkin(parts[hit.triangle.part].kind));
  if (!skin) return null;
  const outside = hits.filter((hit) => parts[hit.triangle.part].kind === 'cloth' && hit.r > skin.r);
  if (!outside.length) return null;
  return { skin: skin.r, cloth: Math.min(...outside.map((hit) => hit.r)) };
}

/** Each line's gap where its free neck first comes out of the clothes (the row below, between its skin and the
 *  clothes outside it), from `GAP_LEAST` to `GAP_MOST` wide: the ray dropped down it from that free neck's foot. */
function gapsOf(lines: Line[], between: (Between | null)[][], low: number): Gap[] {
  const gaps: Gap[] = [];
  lines.forEach((line, ray) => {
    const starts = freeNecks(line.samples).map(([first]) => first);
    const start = starts.find((first) => first > 0 && line.samples[first - 1].kind === 'cloth');
    if (start === undefined) return;
    const gap = between[ray][start - 1];
    if (!gap) return;
    const width = mmOf(gap.cloth - gap.skin);
    if (width < GAP_LEAST || width > GAP_MOST) return;
    const from = low + start * ROW_MM * HEAD_MM;
    gaps.push({ angle: line.angle, from, r: (gap.skin + gap.cloth) / 2, width });
  });
  return gaps;
}

/** A row's rays round the collar: its height (face mm), the angles of those that met skin come out through the
 *  clothes and how far out it came at most (mm), whether any saw skin, and whether any met clothes, seen or under
 *  the skin. */
interface CollarRow {
  y: number;
  through: number[];
  deepest: number;
  skin: boolean;
  cloth: boolean;
}

/** The share of the rays round the collar (the rows where skin is seen and clothes are, seen or under it) where skin
 *  came out through the clothes. (Rows within a band of the lowest skin seen missed the collar where the skin shows
 *  low in front; rows where clothes were seen left out a row the skin had come through all round.) */
function throughShare(rows: CollarRow[]): number {
  const collar = rows.filter((row) => row.skin && row.cloth);
  if (!collar.length) return 0;
  return collar.reduce((sum, row) => sum + row.through.length, 0) / (collar.length * ANGLES);
}
