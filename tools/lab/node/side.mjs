// One side of the lab (tools/lab): a tree of the game served by a Vite dev server of the lab's own and booted in a
// page of the lab's browser. This tree is one side; for an A/B another commit is exported (`exportCommit`) and
// served as the other, the lab's page modules copied into it so both run the same measures.
//
// Every command runs on a page booted for it: a page a command has run on is left as that command left it (the
// game's clock on, the hero wherever it took him), and a set-up on it started from another moment than a fresh
// boot's, so the same command gave other numbers depending on what ran before it.
import { createServer } from 'vite';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PAGE_SCRIPTS } from './browser.mjs';

const VIEWPORT = { width: 1920, height: 1080 };
const BOOT_TIMEOUT_MS = 180_000;
/** a change here boots this tree's page afresh before the next command */
const WATCHED = /[\\/](src|tools[\\/]lab[\\/]page)[\\/]|[\\/]index\.html$/;
/** the dev server's own config and what it reads: a change here starts this tree's server afresh, then the page */
const SERVER_CONFIG = /[\\/](vite\.config\.ts|package(-lock)?\.json|scripts[\\/]pwa\.ts)$/;
/** what this tree's server never watches: scratch, the lab's own output, the face harness's Python environment */
const UNWATCHED = ['**/.tmp/**', '**/tools/lab/out/**', '**/tools/facelab/**', '**/dist/**'];
const EXPORTS_KEPT = 3;

const toSlashes = (path) => path.split('\\').join('/');

/** Runs a program and returns what it printed. */
function run(program, args, cwd) {
  return execFileSync(program, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
}

/**
 * An exported tree's Vite config finds its packages in its own node_modules, which it hasn't: they are this tree's.
 * This plugin points its ez-tree alias, and the stub for ez-tree's textures, at them, written exactly as this tree's
 * config writes them: a path cased otherwise opens the same file on Windows but is another module to Vite (its
 * lowercased alias bundled ez-tree with a second copy of three, and the two sides drew random numbers apart).
 */
function exportedTreePaths(treeRoot, repoRoot) {
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

/**
 * Exports commit `ref` into `outDir`/commits/<sha> (once: kept while it's among the newest few) with git archive: no
 * worktree, no links. Returns its sha and folder.
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
  const sha = git('rev-parse', `${ref}^{commit}`);
  const base = join(outDir, 'commits');
  const dir = join(base, sha.slice(0, 12));
  if (!existsSync(join(dir, '.lab-sha'))) {
    mkdirSync(dir, { recursive: true });
    const archive = join(base, 'export.tar');
    git('archive', '-o', archive, sha);
    // (a relative path: to GNU tar, a C: in one names a remote host)
    run('tar', ['-xf', '../export.tar'], dir);
    rmSync(archive);
    writeFileSync(join(dir, '.lab-sha'), sha);
  }
  pruneExports(base, dir);
  return { sha, dir };
}

/** keeps the newest few exports besides `keep` */
function pruneExports(base, keep) {
  const others = readdirSync(base)
    .map((name) => join(base, name))
    .filter((path) => path !== keep && statSync(path).isDirectory())
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  for (const old of others.slice(EXPORTS_KEPT - 1)) rmSync(old, { recursive: true, force: true });
}

export class Side {
  /**
   * @param name what reports call it
   * @param root the tree it serves
   * @param repo the lab's own tree: its packages, and its page modules (copied into an exported tree)
   */
  constructor({ name, root, repo, outDir, browser, sha = null }) {
    this.name = name;
    this.root = root;
    this.repo = repo;
    this.outDir = outDir;
    this.browser = browser;
    this.sha = sha;
    this.isRepo = root === repo;
    this.server = null;
    this.context = null;
    this.page = null;
    this.heroClass = null;
    /** the source changed since the page booted */
    this.stale = true;
    /** the dev server's config changed since it started */
    this.serverStale = false;
    /** a command has run on the page since it booted */
    this.used = false;
    /** called when this tree's source changes (the server boots the next page then) */
    this.onStale = null;
    this.errors = [];
  }

  /**
   * Starts its Vite server (HMR off: a probe never meets a stale copy of a module), afresh when its config changed (a
   * server made with `createServer` keeps the config it started with, and the pre-bundled packages made from it).
   */
  async serve() {
    if (this.server && this.serverStale) {
      await this.closePage();
      await this.server.close();
      this.server = null;
    }
    this.serverStale = false;
    if (this.server) return;
    // (an exported tree's build is its own commit: vite.config.ts asks git, which, from inside this tree, names its)
    const buildSha = process.env.BUILD_SHA;
    if (this.sha) process.env.BUILD_SHA = this.sha;
    try {
      this.server = await createServer(this.viteConfig());
    } finally {
      if (buildSha === undefined) delete process.env.BUILD_SHA;
      else process.env.BUILD_SHA = buildSha;
    }
    await this.server.listen();
    this.url = this.server.resolvedUrls.local[0];
    if (this.isRepo) {
      this.server.watcher.on('all', (_event, file) => {
        const configChanged = SERVER_CONFIG.test(file);
        if (!configChanged && !WATCHED.test(file)) return;
        if (configChanged) this.serverStale = true;
        this.stale = true;
        this.onStale?.();
      });
    }
  }

  /** This tree watched for changes; an exported one never changes, and finds its packages in this tree. */
  viteConfig() {
    // (the config loaded by Vite's module runner: bundled, it's written next to itself, imported and deleted, and
    // `node --watch` took that for a change to the lab's code and restarted the server mid-command)
    const common = { root: this.root, logLevel: 'error', configLoader: 'runner' };
    if (this.isRepo) {
      return {
        ...common,
        cacheDir: join(this.outDir, 'vite'),
        server: { port: 5190, strictPort: false, hmr: false, watch: { ignored: UNWATCHED } },
      };
    }
    return {
      ...common,
      configFile: join(this.root, 'vite.config.ts'),
      // (a cache of its own per commit: commits may differ in their packages, and a cache shared between them kept a
      // bundle made before the paths above were right, ez-tree with a second copy of three in it)
      cacheDir: join(this.root, '.lab-vite'),
      plugins: [exportedTreePaths(this.root, this.repo)],
      server: {
        port: 5191,
        strictPort: false,
        hmr: false,
        watch: null,
        fs: { allow: [this.root, join(this.repo, 'node_modules')] },
      },
    };
  }

  /** Whether its page is booted for `heroClass` from the current source, and no command has run on it yet. */
  isFresh(heroClass) {
    const alive = this.page && !this.page.isClosed();
    return Boolean(alive && !this.stale && !this.used && this.heroClass === heroClass);
  }

  /** Boots a page for `heroClass` unless a fresh one is up already. Returns whether it booted. */
  async ready(heroClass) {
    await this.serve();
    if (this.isFresh(heroClass)) return false;
    await this.boot(heroClass);
    return true;
  }

  async boot(heroClass) {
    if (!this.isRepo) cpSync(join(this.repo, 'tools/lab/page'), join(this.root, 'tools/lab/page'), { recursive: true });
    await this.page?.close().catch(() => {});
    if (!this.context) {
      this.context = await this.browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      for (const script of PAGE_SCRIPTS) await this.context.addInitScript(script);
    }
    // (nothing kept from the last boot: the game writes cookies of its own, the skill loadout's among them, and a boot
    // after them ended its set-up a frame apart from the first; storage is cleared as the page starts, browser.mjs)
    await this.context.clearCookies();
    const cookies = { 'last-stand-class': heroClass, 'last-stand-biome': 'forest', 'last-stand-quality': 'high' };
    await this.context.addCookies(Object.entries(cookies).map(([name, value]) => ({ name, value, url: this.url })));
    const page = await this.context.newPage();
    this.page = page;
    this.errors = [];
    page.on('pageerror', (error) => this.errors.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') this.errors.push(message.text());
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    this.stale = false;
    this.used = false;
    await page.goto(this.url);
    // (polled on a timer: by default it polls by animation frame, and the lab's clock holds those once the game shows)
    const polling = { polling: 100, timeout: BOOT_TIMEOUT_MS };
    await page.waitForFunction(() => !document.getElementById('loading'), null, polling);
    await page.evaluate(async () => {
      const lab = await import('/tools/lab/page/lab.ts');
      lab.install();
    });
    this.heroClass = heroClass;
  }

  // A command runs in one task of the page, its modules imported first and the lab readied after them (`begin`: the
  // random numbers started again): while a module loads, whatever lands meanwhile (a texture made in a worker, each
  // three.js object drawing a random number for its id) runs, and a command readied before its imports started at
  // another point of the sequence one boot in four.

  /** Calls `fn` from page/commands.ts with the lab and `options`; returns its result. */
  command(fn, options) {
    return this.page.evaluate(async ([fn, options]) => {
      const commands = await import('/tools/lab/page/commands.ts');
      window.__lab.begin();
      return commands[fn](window.__lab, options);
    }, [fn, options]);
  }

  /**
   * Imports a probe module (a path under the tree, read afresh each time) and runs its default export, after setting
   * `fixture` up (none when null).
   */
  probe(path, options, fixture) {
    this.forgetModulesUnder(dirname(join(this.root, path)));
    return this.page.evaluate(async ([path, options, fixture]) => {
      const commands = await import('/tools/lab/page/commands.ts');
      const probe = await import(`/${path}?t=${Date.now()}`);
      window.__lab.begin();
      if (fixture) await commands.setup(window.__lab, fixture);
      return probe.default(window.__lab, options);
    }, [path, options, fixture]);
  }

  /**
   * Drops the modules from files under `dir` out of Vite's cache, so the next import compiles them afresh. Its watcher
   * leaves scratch folders alone (`UNWATCHED`), so it never saw a probe edited there, and went on serving the probe
   * as it was first compiled, whatever its import's query said.
   */
  forgetModulesUnder(dir) {
    const graph = this.server.environments.client.moduleGraph;
    const prefix = toSlashes(dir).toLowerCase() + '/';
    for (const [file, modules] of graph.fileToModulesMap) {
      if (!toSlashes(file).toLowerCase().startsWith(prefix)) continue;
      for (const module of modules) graph.invalidateModule(module);
    }
  }

  /** Evaluates `expression` in the page, with the lab as `lab`, readied first. */
  evaluate(expression) {
    return this.page.evaluate(`(async (lab) => { lab.begin(); return (${expression}); })(window.__lab)`);
  }

  /** The page's errors and the lab's anatomy warnings since the last call. */
  async drainMessages() {
    const fromPage = this.page
      ? await this.page.evaluate(() => {
        const lab = window.__lab;
        const messages = { errors: [...(lab?.errors ?? [])], warnings: [...(lab?.warnings ?? [])] };
        lab?.errors.splice(0);
        lab?.warnings.splice(0);
        return messages;
      }).catch(() => ({ errors: [], warnings: [] }))
      : { errors: [], warnings: [] };
    const errors = [...new Set([...this.errors, ...fromPage.errors])];
    this.errors = [];
    return { errors, warnings: [...new Set(fromPage.warnings)] };
  }

  /** Closes its page (the server stays up). */
  async closePage() {
    if (!this.page) return;
    await this.page.close().catch(() => {});
    this.page = null;
  }

  async close() {
    await this.page?.close().catch(() => {});
    await this.context?.close().catch(() => {});
    await this.server?.close();
  }
}
