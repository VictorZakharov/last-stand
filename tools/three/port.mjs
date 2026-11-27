// Ports a file of the game from three.js to Bulwark's scene API (src/engine/api, VictorZakharov/last-stand#973): the
// renames of the API's table (`src/engine/api/AGENTS.md`), each name imported by itself (`Vec3`, `Mesh`), the
// generators made the shapes' functions (`shapes.sphere(...)`), and the addons' imports made the API's. What it
// can't port by rote (a GLSL hook, three's renderer) is left for the typecheck to find. Kept, not thrown away after
// the port: a file main gains while the branch is open is ported by it on the next rebase.
//
//   node tools/three/port.mjs <file or folder>...   ports them in place, and says how many of each it changed
//   node tools/three/port.mjs --check <...>          says what it would change, and changes nothing
//   node tools/three/port.mjs --into <module> <...>  a file importing 'three' itself imports the API's names, `shapes`
//                                                    among them, from that one module (the lab's: its sceneApi.ts)
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

/** three's classes and types by the API's names for them; the rest keep their names */
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

/** three's generators by the shapes' functions: `new THREE.SphereGeometry(` is `shapes.sphere(` */
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

/** the name a file gives an API name it already uses for something of its own (the page's `Node`) */
const ALIASED = { Node: 'SceneNode' };
/** the import of three's geometry utilities, dropped: the API has them */
const UTILS_IMPORT = /import \{[^}]*\} from ['"]three\/(?:addons|examples\/jsm)\/utils\/BufferGeometryUtils\.js['"];\n/g;
/** the addons' functions the API keeps by their names */
const ADDON_NAMES = new Set(['mergeGeometries', 'mergeVertices']);
/** the name the shapes' functions come in by */
const SHAPES = 'shapes';
const MOST_LINE = 120;

/** One way the port rewrites a file: what it finds, and what it puts there. */
class Rewrite {
  /** A file's source, rewritten in place by the steps below, with what each step changed counted. */
  constructor(source) {
    this.text = source;
    this.counts = {};
  }

  /** Every match of `pattern` replaced by `by` (a string, or a function of the match), counted as `kind`. */
  replace(kind, pattern, by) {
    let found = 0;
    this.text = this.text.replace(pattern, (...match) => {
      found++;
      return typeof by === 'function' ? by(...match) : by;
    });
    if (found) this.counts[kind] = (this.counts[kind] ?? 0) + found;
  }
}

/** `source`'s code alone: its comments, strings and three's names and imports left out (what they name is the
 *  API's now, or no name at all). */
function codeOf(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''")
    .replace(/import [^;]*from ''[^\n]*/g, '')
    .replace(/THREE\.\w+/g, '');
}

/** Whether `source` names `name` as its own (declares it, or uses the page's `Node` bare). */
function namesItself(source, name) {
  const declared = new RegExp(`\\b(?:const|let|var|function|class|interface|type|enum)\\s+${name}\\b`);
  if (declared.test(source)) return true;
  // (a name used bare before the port is the file's own or a global's: the page's `Node`)
  return new RegExp(`(?<![\\w.])${name}\\b`).test(codeOf(source));
}

/** The import of `names` from the module `from`, wrapped to the line's length. */
function importOf(names, from, typeOnly) {
  const keyword = typeOnly ? 'import type' : 'import';
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  const line = `${keyword} { ${sorted.join(', ')} } from '${from}';`;
  if (line.length <= MOST_LINE) return line;
  const rows = [];
  let row = ' ';
  for (const name of sorted) {
    if (row.length + name.length + 2 > MOST_LINE) {
      rows.push(row.trimEnd());
      row = ' ';
    }
    row += ` ${name},`;
  }
  rows.push(row.trimEnd());
  return `${keyword} {\n${rows.join('\n')}\n} from '${from}';`;
}

/** The import specifier of `module` from `file`, as a relative path with its own `./` or `../`. */
function specifierOf(file, module) {
  const path = relative(dirname(file), module).split('\\').join('/');
  return path.startsWith('.') ? path : `./${path}`;
}

/** A file's source ported, and what was changed in it, counted by kind; `into` the module its names come from where
 *  it imported 'three' itself (the lab's), else the API's index beside the game's `three.ts` it imported. */
function port(source, into) {
  const importLine = into
    ? /import (type )?\* as THREE from (['"])()three\2;\n?/
    : /import (type )?\* as THREE from (['"])((?:\.\.?\/)+(?:[\w/]+\/)?)three(?:\.ts)?\2;\n?/;
  const found = source.match(importLine);
  const rewrite = new Rewrite(source);
  const used = new Set();
  const clashes = new Set();
  rewrite.clashes = clashes;
  const nameFor = (name) => {
    // (the addons' names are used bare already: they were imported from three's)
    const own = !ADDON_NAMES.has(name) && namesItself(source, name);
    const local = ALIASED[name] && own ? ALIASED[name] : name;
    if (own && local === name) clashes.add(name);
    used.add(local === name ? name : `${name} as ${local}`);
    return local;
  };
  // (the addons, from the API: the merges keep their names, the hull and the rounded box are the shapes')
  rewrite.replace('addon', UTILS_IMPORT, '');
  rewrite.replace('addon', /(?<![\w.])(?:BufferGeometryUtils\.)?(mergeGeometries|mergeVertices)\(/g,
    (_, name) => `${nameFor(name)}(`);
  rewrite.replace('addon', /new ConvexGeometry\(/g, () => `${nameFor('convexHull')}(`);
  rewrite.replace('addon', /new RoundedBoxGeometry\(/g, `${SHAPES}.roundedBox(`);
  rewrite.replace('addon', /import \{ (?:ConvexGeometry|RoundedBoxGeometry) \} from ['"]three\/[^'"]+['"];\n/g, '');
  let shaped = rewrite.text.includes(`${SHAPES}.roundedBox(`);
  for (const [from, to] of Object.entries(GENERATED)) {
    const before = rewrite.text;
    rewrite.replace('generator', new RegExp(`new THREE\\.${from}\\(`, 'g'), `${SHAPES}.${to}(`);
    rewrite.replace('generator', new RegExp(`new THREE\\.${from}\\b`, 'g'), `${SHAPES}.${to}()`);
    if (rewrite.text !== before) shaped = true;
    rewrite.replace('type', new RegExp(`THREE\\.${from}\\b`, 'g'), () => nameFor('Geometry'));
  }
  rewrite.replace('attribute', /new THREE\.Float32BufferAttribute\(/g, () => `${nameFor('floats')}(`);
  rewrite.replace('renamed', /THREE\.(\w+)\b/g, (_, name) => nameFor(RENAMED[name] ?? name));
  for (const [from, to] of Object.entries(FLAGS)) {
    rewrite.replace('flag', new RegExp(`\\.${from}\\b`, 'g'), `.${to}`);
  }
  if (found) {
    const [, typeOnly, , path] = found;
    const lines = [];
    // (from the one module, `shapes` one of its names; or from the API's index and its shapes' beside it)
    if (into && shaped) used.add(SHAPES);
    if (used.size) lines.push(importOf(used, into ?? `${path}api/index.ts`, !!typeOnly && !shaped));
    if (shaped && !into) lines.push(`import * as ${SHAPES} from '${path}api/shapes/index.ts';`);
    rewrite.text = rewrite.text.replace(importLine, lines.length ? `${lines.join('\n')}\n` : '');
    rewrite.counts.import = 1;
  }
  return rewrite;
}

/** Every TypeScript file at `path`, a folder's walked (the API's own left alone). */
function filesAt(path) {
  if (statSync(path).isFile()) return [path];
  const files = [];
  for (const name of readdirSync(path)) {
    if (name === 'node_modules' || name === 'out' || name === 'api') continue;
    files.push(...filesAt(join(path, name)));
  }
  return files.filter((file) => /\.ts$/.test(file));
}

/** The files at `paths` ported (or only counted, `check`), their names from `into` where it's given, and what
 *  changed said. */
function main(paths, check, into) {
  const totals = {};
  let changed = 0;
  for (const file of paths.flatMap(filesAt)) {
    const source = readFileSync(file, 'utf8');
    if (!/\bTHREE\b|three\//.test(source)) continue;
    const { text, counts, clashes } = port(source, into && specifierOf(file, into));
    for (const name of clashes) console.log(`${file}: names ${name} itself: give it another name`);
    if (text === source) continue;
    changed++;
    for (const [kind, count] of Object.entries(counts)) totals[kind] = (totals[kind] ?? 0) + count;
    if (!check) writeFileSync(file, text);
  }
  console.log(`${check ? 'would change' : 'changed'} ${changed} files`);
  for (const [kind, count] of Object.entries(totals)) console.log(`  ${kind}: ${count}`);
}

/** The command line's paths, `--check` and `--into <module>`. */
function readArgs(args) {
  const at = args.indexOf('--into');
  const into = at < 0 ? undefined : args[at + 1];
  const paths = args.filter((arg, index) => arg !== '--check' && index !== at && index !== at + 1);
  return { paths, check: args.includes('--check'), into };
}

const { paths, check, into } = readArgs(process.argv.slice(2));
main(paths, check, into);
