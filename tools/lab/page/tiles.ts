// `lab tiles`: how big each repeated map's tile comes out on each surface of a biome (tools/lab). A surface's UVs
// decide it, with its instances' scale and the map's repeat: one tile of the forest's bark ran round a whole trunk and
// up one of its sections (ez-tree's UVs), 2.2 to 2.7 m round and 1.3 m up, where the oak photo the bark was drawn from
// covers 0.36 m square. For each surface (a mesh, or up to `INSTANCES_READ` of an instanced mesh's instances: the
// drawn copy or the shadows' one, whichever holds more, as culling packs only the cells in view), the metres one tile
// covers along u and along v on each triangle, weighed by its area in the world: the middle and the spread (a tenth
// to nine tenths of the area) of each, how stretched it is (the longer of the two over the shorter) and the map's
// pixels a metre. It reports, as `maps` reports means: a map drawn for a stretch (the carved bark's 12 plates round a
// tile and 2 up) is right on its surfaces, a photo on none. It fails where a biome shows no repeated map.
// `--pictures` pictures each surface as the player meets it (page/tilePictures.ts), and `--ab` beside another commit's.
// `--canary` lays a board 2 m by 0.5 m in each biome, its map repeated twice along u, which must read 1 m by 0.5 m.
import * as THREE from 'three';
import type { Lab, Pictured, Report } from './lab';
import { BIOME_IDS, type BiomeId } from '../../../src/data/biomes';
import { G } from '../../../src/state';
import * as textures from '../../../src/core/textures';
import { spreadOf, stretchOf, triangleTile, type Spread } from './tileSpans';
import { placesOf, surfacePicture } from './tilePictures';

export interface TilesOptions {
  /** the biomes read (every one by default) */
  biomes?: BiomeId[];
  /** the maps reported, by their recipe's name (`bark`; every repeated map by default) */
  maps?: string[];
  /** picture each surface as the player meets it */
  pictures: boolean;
  canary: boolean;
}

/** the instances of an instanced mesh read (its first ones): enough for its spread, few enough for a forest's trees */
const INSTANCES_READ = 16;
/** the triangles read of a surface at most (every so many of its own, taken evenly) */
const TRIANGLES_READ = 400_000;
/** the canary's board (m) and its map's repeat, and how near its reading must come */
const CANARY_BOARD = [2, 0.5] as const;
const CANARY_REPEAT = [2, 1] as const;
const CANARY_TILE = { u: 1, v: 0.5 };
const CANARY_NEAR = 0.01;
const CANARY_NAME = 'tiles canary';

/** One surface's readings so far: each triangle's tile and its area. */
interface Readings {
  map: string;
  surface: string;
  meshes: THREE.Mesh[];
  pixels: number;
  u: number[];
  v: number[];
  stretch: number[];
  area: number[];
}

/** One surface's tile: its map, its name, its meshes, its area (m²) and the spreads of its readings. */
interface Tile {
  map: string;
  surface: string;
  meshes: THREE.Mesh[];
  area: number;
  u: Spread;
  v: Spread;
  stretch: Spread;
  pixelsAMetre: number;
}

/** The repeated map a material draws with: its colours', else its normals' or its roughness'. */
function repeatedMapOf(material: THREE.Material): THREE.Texture | undefined {
  const m = material as THREE.MeshStandardMaterial;
  const map = m.map ?? m.normalMap ?? m.roughnessMap ?? undefined;
  if (!map) return undefined;
  return map.wrapS === THREE.RepeatWrapping || map.wrapT === THREE.RepeatWrapping ? map : undefined;
}

/** A map's name: its recipe's key where it's one of the game's (`bark()`), else its own name or its size. (An A/B's
 *  other side may have no `mapKeyOf`.) */
function mapNameOf(texture: THREE.Texture): string {
  const keyOf = (textures as Partial<typeof textures>).mapKeyOf;
  const image = texture.image as { width?: number; height?: number } | undefined;
  return keyOf?.(texture) ?? (texture.name || `a ${image?.width}x${image?.height} map`);
}

/** A surface's name: its mesh's (its shadows' copy's as the drawn one's), else its nearest named parent's. */
function surfaceNameOf(mesh: THREE.Object3D): string {
  const own = mesh.name.replace(/: shadows$/, '');
  if (own) return own;
  for (let o = mesh.parent; o; o = o.parent) if (o.name) return `a part of ${o.name}`;
  return 'a surface with no name';
}

/** Whether every one of `mesh`'s parents up to `group` is shown (the mesh itself may be hidden by culling, or drawn in
 *  the shadows alone). */
function shownIn(mesh: THREE.Object3D, group: THREE.Object3D): boolean {
  for (let o = mesh.parent; o && o !== group; o = o.parent) if (!o.visible) return false;
  return true;
}

/** How many places `mesh` is drawn at: an instanced mesh's instances, else one. */
function instancesOf(mesh: THREE.Mesh): number {
  const instanced = mesh as THREE.InstancedMesh;
  return instanced.isInstancedMesh ? instanced.count : 1;
}

/** The meshes of `group` drawn with a repeated map, one of each geometry and material (the one with more instances:
 *  a culled mesh holds those in view, its shadows' copy every one). */
function surfacesIn(group: THREE.Object3D): THREE.Mesh[] {
  const byPair = new Map<string, THREE.Mesh>();
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry.attributes.uv || !shownIn(mesh, group)) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!materials.some((m) => repeatedMapOf(m))) return;
    const pair = `${mesh.geometry.uuid} ${materials.map((m) => m.uuid).join(',')}`;
    const kept = byPair.get(pair);
    if (!kept || instancesOf(mesh) > instancesOf(kept)) byPair.set(pair, mesh);
  });
  return [...byPair.values()];
}

/** The triangles of `geometry` drawn with material `index` of a mesh of several (every one where it has one). */
function trianglesOf(geometry: THREE.BufferGeometry, index: number | undefined): Array<[number, number]> {
  const count = geometry.index ? geometry.index.count : geometry.attributes.position.count;
  if (index === undefined || !geometry.groups.length) return [[0, count]];
  const drawn = geometry.groups.filter((g) => g.materialIndex === index);
  return drawn.map((g) => [g.start, Math.min(g.start + g.count, count)]);
}

/** `mesh`'s triangles drawn with `material` (its `index`th) read into `readings`: each one's tile, at every place. */
function read(mesh: THREE.Mesh, material: THREE.Material, index: number | undefined, readings: Readings): void {
  const map = repeatedMapOf(material)!;
  const geometry = mesh.geometry, position = geometry.attributes.position, uv = geometry.attributes.uv;
  const places = placesOf(mesh, INSTANCES_READ);
  const ranges = trianglesOf(geometry, index);
  readings.meshes.push(mesh);
  const triangles = ranges.reduce((n, [from, to]) => n + (to - from) / 3, 0);
  const every = Math.max(1, Math.ceil((triangles * places.length) / TRIANGLES_READ));
  const corner = new THREE.Vector3(), world = new Float64Array(9), inMap = new Float64Array(6);
  const vertexOf = (k: number): number => (geometry.index ? geometry.index.getX(k) : k);
  for (const place of places) {
    for (const [from, to] of ranges) {
      for (let k = from; k + 2 < to; k += 3 * every) {
        for (let c = 0; c < 3; c++) {
          const vertex = vertexOf(k + c);
          corner.fromBufferAttribute(position, vertex).applyMatrix4(place);
          world[c * 3] = corner.x;
          world[c * 3 + 1] = corner.y;
          world[c * 3 + 2] = corner.z;
          inMap[c * 2] = uv.getX(vertex) * map.repeat.x;
          inMap[c * 2 + 1] = uv.getY(vertex) * map.repeat.y;
        }
        const tile = triangleTile(world, inMap);
        if (!tile || tile.area <= 0) continue;
        readings.u.push(tile.u);
        readings.v.push(tile.v);
        readings.stretch.push(stretchOf(tile));
        readings.area.push(tile.area * every);
      }
    }
  }
}

/** Whether a map is one of those `wanted` (by its recipe's name; every one where none is named, and the canary's). */
const isWanted = (name: string, wanted: string[] | undefined): boolean =>
  !wanted || name === CANARY_NAME || wanted.some((w) => name.startsWith(`${w}(`));

/** Readings for a surface: none yet. */
const noReadings = (map: string, surface: string, pixels: number): Readings =>
  ({ map, surface, meshes: [], pixels, u: [], v: [], stretch: [], area: [] });

/** Every surface's tile in `group`, by map and surface. */
function tilesIn(group: THREE.Object3D, wanted: string[] | undefined): Tile[] {
  const byName = new Map<string, Readings>();
  group.updateMatrixWorld(true);
  for (const mesh of surfacesIn(group)) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material, i) => {
      const map = repeatedMapOf(material);
      if (!map) return;
      const name = mapNameOf(map);
      if (!isWanted(name, wanted)) return;
      const surface = surfaceNameOf(mesh), key = `${name} ${surface}`;
      const image = map.image as { width?: number } | undefined;
      if (!byName.has(key)) byName.set(key, noReadings(name, surface, image?.width ?? 0));
      read(mesh, material, Array.isArray(mesh.material) ? i : undefined, byName.get(key)!);
    });
  }
  return [...byName.values()].filter((r) => r.area.length).map((r) => {
    const u = spreadOf(r.u, r.area);
    return {
      map: r.map,
      surface: r.surface,
      meshes: r.meshes,
      area: r.area.reduce((a, b) => a + b, 0),
      u,
      v: spreadOf(r.v, r.area),
      stretch: spreadOf(r.stretch, r.area),
      pixelsAMetre: r.pixels / u.mid,
    };
  });
}

/** A board 2 m by 0.5 m laid in `group`, its map repeated twice along u; it takes itself away. */
function plantBoard(group: THREE.Object3D): () => void {
  const texture = new THREE.Texture();
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...CANARY_REPEAT);
  texture.name = CANARY_NAME;
  const material = new THREE.MeshStandardMaterial({ map: texture });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(...CANARY_BOARD), material);
  board.name = CANARY_NAME;
  group.add(board);
  return () => {
    group.remove(board);
    board.geometry.dispose();
    material.dispose();
    texture.dispose();
  };
}

/** What's wrong with the canary's reading (it must be `CANARY_TILE`). */
function canaryProblems(biome: BiomeId, tiles: Tile[]): string[] {
  const board = tiles.find((t) => t.surface === CANARY_NAME);
  if (!board) return [`canary: the board laid in the ${biome} was never read`];
  const off = (read: number, wanted: number): boolean => Math.abs(read / wanted - 1) > CANARY_NEAR;
  if (!off(board.u.mid, CANARY_TILE.u) && !off(board.v.mid, CANARY_TILE.v)) return [];
  const read = `${metres(board.u.mid)} by ${metres(board.v.mid)}`;
  return [`canary: the board's tile in the ${biome} read ${read}, not ${CANARY_TILE.u} m by ${CANARY_TILE.v} m`];
}

const metres = (m: number): string => `${m.toFixed(2)} m`;
/** A spread as text: its middle, and its low and high in brackets. */
const spreadText = (s: Spread, digits = 2): string =>
  `${s.mid.toFixed(digits)} (${s.low.toFixed(digits)}-${s.high.toFixed(digits)})`;

/** A tile as a line: its surface, its area, its ways in metres and how stretched it is. */
function tileLine(t: Tile): string {
  const area = `${Math.round(t.area).toLocaleString('en')} m²`;
  const ways = `u ${spreadText(t.u)} m, v ${spreadText(t.v)} m`;
  const stretched = `stretched ${spreadText(t.stretch, 1)}`;
  return `    ${t.surface}: ${area}; a tile ${ways}; ${stretched}; ${Math.round(t.pixelsAMetre)} px a metre`;
}

/** `tiles` by map, each map's surfaces the largest first. */
function inOrder(tiles: Tile[]): Tile[] {
  const byArea = (a: Tile, b: Tile): number => b.area - a.area;
  const maps = [...new Set(tiles.map((t) => t.map))].sort();
  return maps.flatMap((map) => tiles.filter((t) => t.map === map).sort(byArea));
}

/** A biome's tiles as text, by map, each map's surfaces the largest first. */
function biomeText(biome: BiomeId, tiles: Tile[]): string[] {
  const lines = [`${biome}: ${tiles.length} surfaces drawn with a repeated map`];
  let map = '';
  for (const t of inOrder(tiles)) {
    if (t.map !== map) lines.push(`  ${t.map}:`);
    map = t.map;
    lines.push(tileLine(t));
  }
  return lines;
}

/** Each of a biome's surfaces pictured as the player meets it, the biome shown for it. */
function picturesIn(lab: Lab, biome: BiomeId, tiles: Tile[]): Pictured[] {
  const shown = G.arena.biome;
  const group = G.arena.groupOf(biome);
  const pictureOf = (t: Tile): Pictured | undefined =>
    surfacePicture(lab, `${biome}: ${t.map} on ${t.surface}`, t.meshes, group, [tileLine(t).trim()]);
  G.arena.setBiome(biome);
  try {
    return inOrder(tiles).map(pictureOf).filter((p): p is Pictured => p !== undefined);
  } finally {
    G.arena.setBiome(shown);
  }
}

export async function tiles(lab: Lab, options: TilesOptions): Promise<Report> {
  const lines: string[] = [], problems: string[] = [], moments: Pictured[] = [];
  for (const biome of options.biomes ?? BIOME_IDS) {
    const group = G.arena.groupOf(biome);
    const unplant = options.canary ? plantBoard(group) : () => {};
    let found: Tile[];
    try {
      found = tilesIn(group, options.maps);
    } finally {
      unplant();
    }
    if (options.canary) problems.push(...canaryProblems(biome, found));
    const shown = found.filter((t) => t.surface !== CANARY_NAME);
    const asked = options.maps ? ' of those asked for' : '';
    if (!shown.length) problems.push(`the ${biome} has no surface drawn with a repeated map${asked}`);
    lines.push(...biomeText(biome, shown));
    if (options.pictures) moments.push(...picturesIn(lab, biome, shown));
  }
  return { text: lines.join('\n'), problems, moments: moments.length ? moments : undefined };
}
