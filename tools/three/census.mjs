// `npm run three:census`: what of three.js the game still uses, by kind, file by file (VictorZakharov/last-stand#973:
// three.js leaves the game completely). Each stage of the move says this census before and after it: the files that
// import three, the uses of each kind (maths, the scene graph, geometry built, materials and textures, renderers),
// the names used most, and with `--files` the files that use a kind (`--kind scene`).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** what each three name is used for: the stages of #973 take them kind by kind */
const KINDS = {
  maths: /^(Vector[234]|Matrix[34]|Quaternion|Euler|Color|ColorRepresentation|Box[23]|Sphere|Ray|Plane|Frustum|Line3|Triangle|Spherical|Cylindrical|MathUtils|Curve|CurvePath|CatmullRomCurve3|CubicBezierCurve3|QuadraticBezierCurve3|LineCurve3|Shape|Path|ShapeUtils)$/,
  scene: /^(Object3D|Group|Mesh|SkinnedMesh|Bone|Skeleton|InstancedMesh|Scene|Points|Line|LineSegments|LineLoop|Sprite|LOD|Layers|Raycaster|Intersection|Camera|PerspectiveCamera|OrthographicCamera|Light|PointLight|DirectionalLight|SpotLight|AmbientLight|HemisphereLight|Fog|FogExp2)$/,
  geometry: /(Geometry|Attribute)$|^(BufferGeometryUtils|InterleavedBuffer)$/,
  materials: /(Material|Texture)$|^(ShaderChunk|ShaderLib|UniformsLib|UniformsUtils|Source)$/,
  renderers: /(Renderer|RenderTarget|Pass)$|^(WebGLRenderer|PMREMGenerator)$/,
};

/** the kind of a three name, or `constants` (a blending, a side, a colour space...) */
function kindOf(name) {
  for (const [kind, pattern] of Object.entries(KINDS)) {
    if (pattern.test(name)) return kind;
  }
  return 'constants';
}

/** every .ts file under `dir` */
function sources(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (path.endsWith('.ts') && !path.endsWith('.d.ts')) out.push(path);
  }
  return out;
}

/** what one file takes of three: its imports and each name's uses */
function fileUse(path) {
  const text = readFileSync(path, 'utf8');
  const imports = [...text.matchAll(/from '(three[^']*)'/g)].map((match) => match[1]);
  const names = new Map();
  for (const match of text.matchAll(/\bTHREE\.([A-Z][A-Za-z0-9]*)/g)) {
    names.set(match[1], (names.get(match[1]) ?? 0) + 1);
  }
  // (a named import's uses: `import { Vector3 } from 'three'`)
  for (const match of text.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'three'/g)) {
    for (const name of match[1].split(',').map((part) => part.trim().split(/\s+as\s+/).pop()).filter(Boolean)) {
      const uses = text.match(new RegExp(`\\b${name}\\b`, 'g'))?.length ?? 1;
      names.set(name, (names.get(name) ?? 0) + uses - 1);
    }
  }
  return { imports, names };
}

/** The census of `root`'s files, kind by kind. */
function census(root) {
  const files = sources(root);
  const byKind = new Map();
  const byName = new Map();
  let importing = 0;
  for (const path of files) {
    const use = fileUse(path);
    if (!use.imports.length) continue;
    importing++;
    for (const [name, uses] of use.names) {
      const kind = kindOf(name);
      const entry = byKind.get(kind) ?? { uses: 0, files: new Set() };
      entry.uses += uses;
      entry.files.add(relative(process.cwd(), path));
      byKind.set(kind, entry);
      byName.set(name, (byName.get(name) ?? 0) + uses);
    }
  }
  return { files: files.length, importing, byKind, byName };
}

/** the census as lines */
function lines(result, options) {
  const out = [`${result.importing} of ${result.files} files in src import three`];
  const kinds = [...result.byKind].sort((a, b) => b[1].uses - a[1].uses);
  for (const [kind, entry] of kinds) out.push(`  ${kind}: ${entry.uses} uses in ${entry.files.size} files`);
  const top = [...result.byName].sort((a, b) => b[1] - a[1]).slice(0, options.top);
  out.push(`the names used most: ${top.map(([name, uses]) => `${name} ${uses}`).join(', ')}`);
  if (options.files) {
    for (const [kind, entry] of kinds) {
      if (options.kind && options.kind !== kind) continue;
      out.push(`${kind}:`, ...[...entry.files].sort().map((path) => `  ${path}`));
    }
  }
  return out;
}

/** the command line's options */
function optionsOf(argv) {
  const kindAt = argv.indexOf('--kind');
  return { files: argv.includes('--files') || kindAt >= 0, kind: kindAt >= 0 ? argv[kindAt + 1] : '', top: 20 };
}

console.log(lines(census('src'), optionsOf(process.argv.slice(2))).join('\n'));
