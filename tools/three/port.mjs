// Ports a file of the game from three.js to Bulwark's scene API (src/engine/api, VictorZakharov/last-stand#973): the
// renames of the API's table (`src/engine/api/AGENTS.md`), the generators made functions, the addons' imports, and
// the import of three made the API's. What it can't port by rote (a GLSL hook, three's renderer) it leaves for the
// typecheck to find. Kept, not thrown away after the port: a file main gains while the branch is open is ported
// by it on the next rebase.
//
//   node tools/three/port.mjs <file or folder>...   ports them in place, and says how many of each it changed
//   node tools/three/port.mjs --check <...>          says what it would change, and changes nothing
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** three's classes and types by the API's names for them */
const RENAMED = {
  Vector2: 'Vec2',
  Vector3: 'Vec3',
  Vector4: 'Vec4',
  Quaternion: 'Quat',
  Matrix3: 'Mat3',
  Matrix4: 'Mat4',
  MathUtils: 'Maths',
  Object3D: 'Node',
  Group: 'Node',
  Scene: 'World',
  OrthographicCamera: 'OrthoCamera',
  Intersection: 'Hit',
  BufferGeometry: 'Geometry',
  BufferAttribute: 'Attribute',
  Float32BufferAttribute: 'Attribute',
  InstancedBufferAttribute: 'InstancedAttribute',
  InstancedBufferGeometry: 'InstancedGeometry',
  MeshStandardMaterial: 'LitMaterial',
  MeshPhysicalMaterial: 'LitMaterial',
  MeshPhongMaterial: 'LitMaterial',
  MeshLambertMaterial: 'LitMaterial',
  MeshStandardMaterialParameters: 'LitParameters',
  MeshPhysicalMaterialParameters: 'LitParameters',
  MeshBasicMaterial: 'UnlitMaterial',
  ShaderMaterial: 'LookMaterial',
  RawShaderMaterial: 'LookMaterial',
  LineBasicMaterial: 'LineMaterial',
  Data3DTexture: 'VolumeTexture',
  CatmullRomCurve3: 'CatmullRom3',
  LineCurve3: 'Line3Curve',
  QuadraticBezierCurve3: 'Bezier2Curve3',
  CubicBezierCurve3: 'Bezier3Curve3',
  EllipseCurve: 'Ellipse',
  Shape: 'Outline',
  Vector3Tuple: 'Vec3Tuple',
  IUniform: 'Uniform',
};

/** three's generators by the API's functions: `new THREE.SphereGeometry(` is `B.sphere(` */
const GENERATED = {
  SphereGeometry: 'sphere',
  BoxGeometry: 'box',
  CylinderGeometry: 'cylinder',
  ConeGeometry: 'cone',
  TorusGeometry: 'torus',
  TorusKnotGeometry: 'torusKnot',
  LatheGeometry: 'lathe',
  PlaneGeometry: 'plane',
  CircleGeometry: 'circle',
  RingGeometry: 'ring',
  CapsuleGeometry: 'capsule',
  IcosahedronGeometry: 'icosahedron',
  OctahedronGeometry: 'octahedron',
  DodecahedronGeometry: 'dodecahedron',
  TetrahedronGeometry: 'tetrahedron',
  TubeGeometry: 'tube',
  ExtrudeGeometry: 'extrude',
  ShapeGeometry: 'flat',
  EdgesGeometry: 'edges',
};

/** the flags the game tests, by the API's */
const FLAGS = {
  isScene: 'isWorld',
  isObject3D: 'isNode',
  isGroup: 'isNode',
  isInstancedBufferGeometry: 'isInstancedGeometry',
  isBufferGeometry: 'isGeometry',
  isMeshStandardMaterial: 'isLitMaterial',
  isMeshPhysicalMaterial: 'isLitMaterial',
  isMeshPhongMaterial: 'isLitMaterial',
  isMeshBasicMaterial: 'isUnlitMaterial',
  isShaderMaterial: 'isLookMaterial',
};

/** the addons' functions by the API's */
const ADDONS = {
  mergeGeometries: 'merge',
  mergeVertices: 'weld',
};

/** A file's source ported, and what was changed in it, counted by kind. */
function port(source) {
  const counts = {};
  const count = (kind, n) => {
    if (n) counts[kind] = (counts[kind] ?? 0) + n;
  };
  let text = source;
  const replace = (kind, pattern, by) => {
    let n = 0;
    text = text.replace(pattern, (...match) => {
      n++;
      return typeof by === 'function' ? by(...match) : by;
    });
    count(kind, n);
  };
  // (the import of three, the API's from the same folder: `../engine/three.ts` is `../engine/api/index.ts`)
  replace('import', /import (type )?\* as THREE from (['"])((?:\.\.?\/)+(?:[\w/]+\/)?)three(?:\.ts)?\2;/g,
    (_, type, quote, path) => `import ${type ?? ''}* as B from ${quote}${path}api/index.ts${quote};`);
  // (the addons, from the API too: they're named `B.merge(` below)
  replace('addon', /import \{[^}]*\} from ['"]three\/(?:addons|examples\/jsm)\/utils\/BufferGeometryUtils\.js['"];\n/g, '');
  for (const [from, to] of Object.entries(ADDONS)) {
    replace('addon', new RegExp(`(?<![\\w.])(?:BufferGeometryUtils\\.)?${from}\\(`, 'g'), `B.${to}(`);
  }
  replace('addon', /new ConvexGeometry\(/g, 'B.hull(');
  replace('addon', /new RoundedBoxGeometry\(/g, 'B.roundedBox(');
  replace('addon', /import \{ (?:ConvexGeometry|RoundedBoxGeometry) \} from ['"]three\/[^'"]+['"];\n/g, '');
  // (the generators: called, and as types)
  for (const [from, to] of Object.entries(GENERATED)) {
    replace('generator', new RegExp(`new THREE\\.${from}\\(`, 'g'), `B.${to}(`);
    replace('generator', new RegExp(`new THREE\\.${from}\\b`, 'g'), `B.${to}()`);
    replace('type', new RegExp(`THREE\\.${from}\\b`, 'g'), 'B.Geometry');
  }
  replace('attribute', /new THREE\.Float32BufferAttribute\(/g, 'B.floats(');
  for (const [from, to] of Object.entries(RENAMED)) {
    replace('renamed', new RegExp(`THREE\\.${from}\\b`, 'g'), `B.${to}`);
  }
  for (const [from, to] of Object.entries(FLAGS)) {
    replace('flag', new RegExp(`\\.${from}\\b`, 'g'), `.${to}`);
  }
  replace('name', /\bTHREE\./g, 'B.');
  return { text, counts };
}

/** Every TypeScript file at `path`, a folder's walked. */
function filesAt(path) {
  if (statSync(path).isFile()) return [path];
  const files = [];
  for (const name of readdirSync(path)) {
    if (name === 'node_modules' || name === 'out' || name === 'api') continue;
    files.push(...filesAt(join(path, name)));
  }
  return files.filter((file) => /\.ts$/.test(file));
}

const args = process.argv.slice(2);
const check = args.includes('--check');
const totals = {};
let changed = 0;
for (const file of args.filter((arg) => arg !== '--check').flatMap(filesAt)) {
  const source = readFileSync(file, 'utf8');
  if (!/\bTHREE\b|three\//.test(source)) continue;
  const { text, counts } = port(source);
  if (text === source) continue;
  changed++;
  for (const [kind, n] of Object.entries(counts)) totals[kind] = (totals[kind] ?? 0) + n;
  if (!check) writeFileSync(file, text);
}
console.log(`${check ? 'would change' : 'changed'} ${changed} files`);
for (const [kind, n] of Object.entries(totals)) console.log(`  ${kind}: ${n}`);
