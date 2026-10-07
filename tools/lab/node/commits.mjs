// Another commit of the game for an A/B (tools/lab, `--ab`): exported with `git archive` (no worktree, no links into
// this tree's folders), and served by a Vite config that finds its packages in this tree's node_modules.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { labError } from './errors.mjs';

/** how many exported commits are kept, the newest */
const EXPORTS_KEPT = 3;
/** the file an export's folder holds once it's complete: its commit's sha */
const COMPLETE = '.lab-sha';

const toSlashes = (path) => path.split('\\').join('/');

/** Runs a program and returns what it printed. */
function run(program, args, cwd) {
  return execFileSync(program, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
}

/** The sha of commit `ref`; throws if git knows none by that name. */
function commitOf(git, ref) {
  try {
    return git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
  } catch {
    throw labError(`--ab: git knows no commit ${ref}`);
  }
}

/**
 * Exports commit `ref` into `outDir`/commits/<sha> (once: kept while it's among the newest few). A remote's branch
 * (`origin/main`) is fetched first. Returns its sha and folder.
 */
export function exportCommit(repoRoot, outDir, ref) {
  const git = (...args) => run('git', args, repoRoot);
  if (ref.startsWith('origin/')) {
    try {
      git('fetch', '-q', 'origin');
    } catch {
      console.log(`lab: git fetch failed; comparing with the last fetched ${ref}`);
    }
  }
  const sha = commitOf(git, ref);
  const base = join(outDir, 'commits');
  const dir = join(base, sha.slice(0, 12));
  if (!existsSync(join(dir, COMPLETE))) {
    // (a folder left by an export cut short is exported again from scratch)
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const archive = join(base, 'export.tar');
    git('archive', '-o', archive, sha);
    // (a relative path: to GNU tar, a C: in one names a remote host)
    run('tar', ['-xf', '../export.tar'], dir);
    rmSync(archive);
    writeFileSync(join(dir, COMPLETE), sha);
  }
  pruneExports(base, dir);
  return { sha, dir };
}

/** Keeps the newest few exports besides `keep`. */
function pruneExports(base, keep) {
  const others = readdirSync(base)
    .map((name) => join(base, name))
    .filter((path) => path !== keep && statSync(path).isDirectory())
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  for (const old of others.slice(EXPORTS_KEPT - 1)) rmSync(old, { recursive: true, force: true });
}

/**
 * A Vite plugin for an exported tree, whose config finds its packages in its own node_modules, which it hasn't:
 * they are this tree's. It points the tree's ez-tree alias, and the stub for ez-tree's textures, at them, written
 * exactly as this tree's config writes them: a path cased otherwise opens the same file on Windows but is another
 * module to Vite (its lowercased alias bundled ez-tree with a second copy of three, and the two sides drew random
 * numbers apart).
 */
export function exportedTreePaths(treeRoot, repoRoot) {
  const ezTree = toSlashes(join(repoRoot, 'node_modules/@dgreenheck/ez-tree/src/lib/'));
  return {
    name: 'lab-exported-tree-paths',
    enforce: 'pre',
    config(config) {
      const alias = config.resolve?.alias;
      if (Array.isArray(alias)) {
        for (const entry of alias) if (entry.find === 'ez-tree') entry.replacement = ezTree + 'index.js';
      } else if (alias?.['ez-tree']) {
        alias['ez-tree'] = ezTree + 'index.js';
      }
    },
    resolveId(source, importer) {
      const fromEzTree = importer && toSlashes(importer).toLowerCase().startsWith(ezTree.toLowerCase());
      if (source !== './textures' || !fromEzTree) return null;
      return join(treeRoot, 'src/world/ezTreeTextures.ts');
    },
  };
}
