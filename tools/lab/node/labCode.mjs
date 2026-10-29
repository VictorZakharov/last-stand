// The lab's code a command runs on an A/B's other side (tools/lab), for the key its result is kept under
// (sideCache.mjs): its page modules (those `page/lab.ts` and its own entry in `page/commands.ts` import, and theirs in
// turn), its own work in `node/commands.mjs` and the helpers it calls there, how a page boots (`node/side.mjs`) and the
// scripts every page runs first (`node/browser.mjs`). Keyed on all of `page/` and those files whole, every lab PR
// (a measure added, a command's options) ran main's side of every job of a check again.
import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { REPO } from './paths.mjs';

const PAGE = 'tools/lab/page';
const NODE = 'tools/lab/node';

/** The code every command's side runs whatever it is: how its page boots (kept whole). */
const BOOT_FILES = [`${NODE}/side.mjs`];

/** a top-level declaration, and the name it declares */
const DECLARATION = /^(?:export\s+)?(?:async\s+)?(?:function\*?\s+|class\s+|const\s+|let\s+)(\w+)/;
/** a static import or re-export at run time (not `import type`), and its module; or a bare `import '...'` */
const STATIC_IMPORT = /^\s*(?:import|export)\s+(?!type\s)[^;'"]*?from\s+['"](\.[^'"]+)['"]|^\s*import\s+['"](\.[^'"]+)['"]/gm;
/** a dynamic `import('...')`, and its module */
const DYNAMIC_IMPORT = /\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g;

const read = (path) => readFileSync(join(REPO, path), 'utf8');
const mentions = (text, name) => new RegExp(`\\b${name}\\b`).test(text);

/** The relative modules `text` imports at run time, as written (`import type` and `export type` left out). */
export function runtimeImports(text) {
  const found = [];
  for (const match of text.matchAll(STATIC_IMPORT)) found.push(match[1] ?? match[2]);
  for (const match of text.matchAll(DYNAMIC_IMPORT)) found.push(match[1]);
  return found;
}

/**
 * A file's top-level parts by the name each declares (a function, a class, a `const` or a `let`), each with the doc
 * comment over it and every line up to the next part; `null` holds what comes before the first (the imports).
 */
export function partsOf(text) {
  const parts = new Map();
  let name = null;
  let lines = [];
  let docOpen = false;
  const flush = () => {
    parts.set(name, [parts.get(name), ...lines].filter((part) => part !== undefined).join('\n'));
    lines = [];
  };
  for (const line of text.split('\n')) {
    const declared = line.match(DECLARATION)?.[1];
    if (line.startsWith('/**')) {
      flush();
      name = undefined;
      docOpen = true;
    } else if (declared) {
      if (!docOpen) flush();
      name = declared;
      docOpen = false;
    }
    lines.push(line);
  }
  flush();
  parts.delete(undefined);
  return parts;
}

/** The parts of `parts` that `seed` mentions by name, and those they mention in turn: their texts, in file order. */
export function partsReached(parts, seed) {
  const reached = new Set();
  const queue = [seed];
  while (queue.length) {
    const text = queue.shift();
    for (const [name, body] of parts) {
      if (name === null || reached.has(name) || !mentions(text, name)) continue;
      reached.add(name);
      queue.push(body);
    }
  }
  return [...parts.keys()].filter((name) => reached.has(name)).map((name) => parts.get(name));
}

/** `COMMANDS[command]`'s entry in `node/commands.mjs` (the object every command's work is in), or null. */
export function commandEntry(text, command) {
  const start = text.match(new RegExp(`^ {2}${command}: \\{$`, 'm'));
  if (!start) return null;
  const rest = text.slice(start.index);
  const firstLine = rest.indexOf('\n') + 1;
  const end = rest.slice(firstLine).search(/^(?: {2}\w+: \{|\};)$/m);
  return end < 0 ? rest : rest.slice(0, firstLine + end);
}

/** A page module's path from an import of it in `from` (both relative to the repo), or null outside `page/`. */
function pageModule(from, specifier) {
  const path = posix.normalize(posix.join(posix.dirname(from), specifier));
  if (!path.startsWith(`${PAGE}/`)) return null;
  const candidates = [path, `${path}.ts`, `${path}/index.ts`].filter((candidate) => candidate.endsWith('.ts'));
  return candidates.find((candidate) => existsSync(join(REPO, candidate))) ?? null;
}

/** The page modules `entries` (`{ from, text }`: a text as if in the file `from`) import, and theirs in turn. */
function pageClosure(entries) {
  const seen = new Set();
  const queue = [...entries];
  while (queue.length) {
    const { from, text } = queue.shift();
    for (const specifier of runtimeImports(text)) {
      const path = pageModule(from, specifier);
      if (!path || seen.has(path)) continue;
      seen.add(path);
      queue.push({ from: path, text: read(path) });
    }
  }
  return [...seen];
}

/**
 * The page code `command` runs: its entry in `commands.ts` and what of that file it calls (as texts), and as files
 * `lab.ts` and every page module those import; all of `page/` for a command with no entry of its own.
 */
function pageCodeOf(command) {
  const from = `${PAGE}/commands.ts`;
  const parts = partsOf(read(from));
  const entry = parts.get(command);
  if (!entry) return { texts: [], files: [PAGE] };
  const texts = [entry, ...partsReached(parts, entry).filter((text) => text !== entry)];
  const header = parts.get(null) ?? '';
  const lab = `${PAGE}/lab.ts`;
  const entries = [{ from: lab, text: read(lab) }, { from, text: [header, ...texts].join('\n') }];
  return { texts, files: [lab, ...pageClosure(entries)] };
}

/** The relative modules `text` imports names from, each with those names. */
function namedImports(text) {
  const imports = [];
  for (const match of text.matchAll(/^import\s+\{([^}]*)\}\s+from\s+['"](\.[^'"]+)['"]/gm)) {
    const names = match[1].split(',').map((name) => name.trim().split(/\s+as\s+/).pop()).filter(Boolean);
    imports.push({ names, specifier: match[2] });
  }
  return imports;
}

/**
 * The code of the Node module at `path` that `seed` reaches: the parts it mentions (`partsReached`), and every
 * relative module they import a name from, whole.
 */
function nodeCodeReached(path, seed) {
  const text = read(path);
  const texts = [seed, ...partsReached(partsOf(text), seed)];
  const used = texts.join('\n');
  const modules = namedImports(text)
    .filter(({ names }) => names.some((name) => mentions(used, name)))
    .map(({ specifier }) => posix.join(posix.dirname(path), specifier));
  return { texts, modules };
}

/**
 * The lab's code `command` runs on an A/B's other side: texts (the parts of files it reaches), and files whole (paths
 * relative to the repo, a folder for everything in it); their contents key its kept result.
 */
export function labCodeOf(command) {
  const page = pageCodeOf(command);
  const commands = read(`${NODE}/commands.mjs`);
  const entry = commandEntry(commands, command);
  const work = entry ? nodeCodeReached(`${NODE}/commands.mjs`, entry) : { texts: [commands], modules: [] };
  const browser = read(`${NODE}/browser.mjs`);
  const scripts = browser.match(/^export const PAGE_SCRIPTS = .*$/m)?.[0] ?? browser;
  const boot = nodeCodeReached(`${NODE}/browser.mjs`, `${scripts}\ngpuArgs`);
  const files = new Set([...page.files, ...nodeClosure(work.modules), ...BOOT_FILES]);
  return { texts: [...page.texts, ...work.texts, ...boot.texts], files: [...files].sort() };
}

/** The Node modules `modules` are (paths relative to the repo), and every relative module they import in turn. */
function nodeClosure(modules) {
  const seen = new Set();
  const queue = [...modules];
  while (queue.length) {
    const path = queue.shift();
    if (seen.has(path) || !existsSync(join(REPO, path))) continue;
    seen.add(path);
    const imported = runtimeImports(read(path)).filter((specifier) => specifier.endsWith('.mjs'));
    queue.push(...imported.map((specifier) => posix.join(posix.dirname(path), specifier)));
  }
  return [...seen];
}
