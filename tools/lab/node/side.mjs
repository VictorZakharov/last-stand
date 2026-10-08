// One side of the lab (tools/lab): a tree of the game served by a Vite dev server of the lab's own and booted in a
// page of the lab's browser. This tree is one side; for an A/B another commit is exported (commits.mjs) and served
// as the other, the lab's page modules copied into it so both run the same measures.
//
// Every command runs on a page booted for it: a page a command has run on is left as that command left it (the
// game's clock on, the hero wherever it took him), and a set-up on it started from another moment than a fresh
// boot's, so the same command gave other numbers depending on what ran before it.
import { createServer } from 'vite';
import { cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PAGE_SCRIPTS } from './browser.mjs';
import { exportedTreePaths } from './commits.mjs';
import { compileError, labError } from './errors.mjs';
import { probeFiles } from './probeFiles.mjs';
import { decodeMappings, sourceOf } from './sourceMaps.mjs';

const VIEWPORT = { width: 1920, height: 1080 };
const BOOT_TIMEOUT_MS = 180_000;
/** how often a booting page is asked whether the loading screen is gone, ms */
const BOOT_POLL_MS = 100;
/** the ports the two sides' servers try first (another free one is taken if it's in use) */
const REPO_PORT = 5190;
const OTHER_PORT = 5191;
/** a change here boots this tree's page afresh before the next command */
const WATCHED = /[\\/](src|tools[\\/]lab[\\/]page)[\\/]|[\\/]index\.html$/;
/** the dev server's own config and what it reads: a change here starts this tree's server afresh, then the page */
const SERVER_CONFIG = /[\\/](vite\.config\.ts|package(-lock)?\.json|scripts[\\/]pwa\.ts)$/;
/** what this tree's server never watches: scratch, the lab's own output, the face harness's Python environment */
const UNWATCHED = ['**/.tmp/**', '**/tools/lab/out/**', '**/tools/facelab/**', '**/dist/**'];
/** the cookies every boot starts with besides its hero's: the forest, the high quality preset */
const BOOT_COOKIES = { 'last-stand-biome': 'forest', 'last-stand-quality': 'high' };

const toSlashes = (path) => path.split('\\').join('/');

export class Side {
  /**
   * @param name what reports call it
   * @param root the tree it serves
   * @param repo the lab's own tree: its packages, and its page modules (copied into an exported tree)
   * @param outDir where the lab writes (this tree's Vite cache)
   * @param browser the lab's browser
   * @param sha an exported commit's sha (null for this tree)
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
    /** where its server serves the game, once it's up */
    this.url = null;
    this.context = null;
    this.page = null;
    /** a co-op partner's page's context, while one is open (`coop`) */
    this.partnerContext = null;
    /** the hero its page booted, null until one booted whole */
    this.heroClass = null;
    /** the source changed since the page booted */
    this.stale = true;
    /** the dev server's config changed since it started */
    this.serverStale = false;
    /** a command has run on the page since it booted */
    this.used = false;
    /** called with the file when this tree's source changes (the server boots the next page then) */
    this.onStale = null;
    /** what the page raised or logged as an error since they were last read */
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
    if (this.isRepo) this.server.watcher.on('all', (_event, file) => this.sourceChanged(file));
  }

  /** Marks the page stale (and the server, for its config) when `file` is part of what they were made from. */
  sourceChanged(file) {
    const configChanged = SERVER_CONFIG.test(file);
    if (!configChanged && !WATCHED.test(file)) return;
    if (configChanged) this.serverStale = true;
    this.stale = true;
    this.onStale?.(file);
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
        server: { port: REPO_PORT, strictPort: false, hmr: false, watch: { ignored: UNWATCHED } },
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
        port: OTHER_PORT,
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

  /**
   * Boots a page for `heroClass`: the game loaded with nothing kept from the last boot, the lab installed once the
   * loading screen is gone, and the hero checked. A boot that fails leaves no page behind (none counts as fresh).
   */
  async boot(heroClass) {
    if (!this.isRepo) cpSync(join(this.repo, 'tools/lab/page'), join(this.root, 'tools/lab/page'), { recursive: true });
    await this.closePage();
    this.heroClass = null;
    try {
      await this.openPage(heroClass);
      const booted = await this.page.evaluate(async () => {
        const lab = await import('/tools/lab/page/lab.ts');
        return lab.install().heroes();
      });
      if (booted.hero !== heroClass) {
        throw labError(`--class ${heroClass}: no such hero (the heroes: ${booted.heroes.join(', ')})`);
      }
    } catch (error) {
      await this.closePage();
      throw error;
    }
    this.heroClass = heroClass;
  }

  /** Opens a page on the game for `heroClass` and waits out its loading screen. */
  async openPage(heroClass) {
    this.context ??= await this.newContext();
    this.errors = [];
    this.stale = false;
    this.used = false;
    this.page = await this.openPageIn(this.context, heroClass, '');
  }

  /**
   * Opens a second page of this side's game in a context of its own, booted for `heroClass` and with the lab installed
   * as `boot` does: a co-op partner (`coop`). Its errors count as this side's, said to be the partner's. Returns the
   * page; `closePartner` closes it.
   */
  async openPartner(heroClass) {
    await this.closePartner();
    this.partnerContext = await this.newContext();
    const page = await this.openPageIn(this.partnerContext, heroClass, 'partner: ');
    await page.evaluate(async () => {
      const lab = await import('/tools/lab/page/lab.ts');
      lab.install();
    });
    return page;
  }

  /** Closes the co-op partner's page, if one is open. */
  async closePartner() {
    await this.partnerContext?.close().catch(() => {});
    this.partnerContext = null;
  }

  /** A browser context as every page of the lab's has it: its viewport and the scripts run before the page's own. */
  async newContext() {
    const context = await this.browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    for (const script of PAGE_SCRIPTS) await context.addInitScript(script);
    return context;
  }

  /**
   * Opens a page on the game for `heroClass` in `context` and waits out its loading screen, its errors kept as this
   * side's (each after `prefix`).
   */
  async openPageIn(context, heroClass, prefix) {
    // (nothing kept from the last boot: the game writes cookies of its own, the skill loadout's among them, and a boot
    // after them ended its set-up a frame apart from the first; storage is cleared as the page starts, browser.mjs)
    await context.clearCookies();
    const cookies = { ...BOOT_COOKIES, 'last-stand-class': heroClass };
    await context.addCookies(Object.entries(cookies).map(([name, value]) => ({ name, value, url: this.url })));
    const page = await context.newPage();
    page.on('pageerror', (error) => this.errors.push(`${prefix}${String(error)}`));
    page.on('console', (message) => {
      if (message.type() === 'error') this.errors.push(`${prefix}${message.text()}`);
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(this.url);
    // (polled on a timer: by default it polls by animation frame, and the lab's clock holds those once the game shows)
    const polling = { polling: BOOT_POLL_MS, timeout: BOOT_TIMEOUT_MS };
    await page.waitForFunction(() => !document.getElementById('loading'), null, polling);
    return page;
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
  async probe(path, options, fixture) {
    this.forgetModulesUnder(dirname(join(this.root, path)));
    await this.checkCompiles(probeFiles(this.root, path));
    return this.page.evaluate(async ([path, options, fixture]) => {
      const commands = await import('/tools/lab/page/commands.ts');
      const probe = await import(`/${path}?t=${Date.now()}`);
      if (typeof probe.default !== 'function') throw new Error(`lab: probe: ${path} has no default export to run`);
      window.__lab.begin();
      if (fixture) await commands.setup(window.__lab, fixture);
      return probe.default(window.__lab, options);
    }, [path, options, fixture]);
  }

  /**
   * Throws, saying where and why, unless each module at `paths` (under the tree) compiles: imported in the page, one
   * that didn't said only "Failed to fetch dynamically imported module", whatever was wrong with it.
   */
  async checkCompiles(paths) {
    for (const path of paths) {
      try {
        await this.server.environments.client.transformRequest(`/${path}`);
      } catch (error) {
        const { reason, where } = compileError(error);
        throw labError(`${path}${where} doesn't compile: ${reason}`);
      }
    }
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

  /**
   * Where the code this side's server compiled came from, for the scripts at `urls` (`--profile`): a function of a
   * script's address, line and column (from 0) to `{ file, line }` in the source, or null where it doesn't know.
   */
  async sourceLocator(urls) {
    const origin = new URL(this.url).origin;
    const maps = new Map();
    for (const url of urls) {
      if (!url.startsWith(`${origin}/`)) continue;
      // (Vite keeps what it compiled, so this compiles nothing again)
      const compiled = await this.server.transformRequest(url.slice(origin.length)).catch(() => null);
      const map = compiled?.map;
      if (map?.mappings) maps.set(url, { sources: map.sources ?? [], lines: decodeMappings(map.mappings) });
    }
    return (url, line, column) => {
      const map = maps.get(url);
      const found = map && sourceOf(map.lines, line, column);
      if (!found) return null;
      return { file: map.sources[found.source] ?? url, line: found.line };
    };
  }

  /** Evaluates `expression` in the page, with the lab as `lab`, readied first. */
  evaluate(expression) {
    return this.page.evaluate(`(async (lab) => { lab.begin(); return (${expression}); })(window.__lab)`);
  }

  /** The page's errors and the lab's anatomy warnings since the last call. */
  async drainMessages() {
    const errors = [...new Set(this.errors)];
    this.errors = [];
    const readWarnings = () => window.__lab?.warnings.splice(0) ?? [];
    const warnings = this.page ? await this.page.evaluate(readWarnings).catch(() => []) : [];
    return { errors, warnings: [...new Set(warnings)] };
  }

  /** Closes its page (the server stays up). */
  /** Serves its pages from `browser` from now on (a new one, the last having closed): nothing of the old kept. */
  useBrowser(browser) {
    this.browser = browser;
    this.context = null;
    this.partnerContext = null;
    this.page = null;
    this.heroClass = null;
  }

  async closePage() {
    if (!this.page) return;
    await this.page.close().catch(() => {});
    this.page = null;
  }

  async close() {
    await this.closePartner();
    await this.closePage();
    await this.context?.close().catch(() => {});
    await this.server?.close();
  }
}
