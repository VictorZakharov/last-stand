// The little of a page the fight's modules read as they load, for Node: an address with no query, a window of a laptop's
// size, storage kept in memory, no cookies. Imported first by the headless entry, so it's in place before any module
// that reads it runs. What draws is swapped out of the build instead (`src/headless/swap/`), never answered here.
const scope = globalThis as Record<string, unknown>;

/** Storage as the page's, kept in memory for the process's life. */
class MemoryStorage {
  private readonly items = new Map<string, string>();
  get length(): number { return this.items.size; }
  key(index: number): string | null { return [...this.items.keys()][index] ?? null; }
  getItem(key: string): string | null { return this.items.get(key) ?? null; }
  setItem(key: string, value: string): void { this.items.set(key, String(value)); }
  removeItem(key: string): void { this.items.delete(key); }
  clear(): void { this.items.clear(); }
}

const noop = (): void => undefined;

/** Pixels as a canvas hands them back: all clear. */
const pixels = (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) });

/** A 2D context that draws nothing: what the fight's modules paint as they load (the textures of effects and models)
 *  is never seen here. Every call is taken and dropped; what a call returns is a blank of the kind asked. */
function blankContext(canvas: BlankCanvas): object {
  const answers: Record<string, unknown> = {
    canvas,
    getImageData: (_x: number, _y: number, w: number, h: number) => pixels(w, h),
    createImageData: (w: number | { width: number; height: number }, h?: number) =>
      typeof w === 'number' ? pixels(w, h ?? w) : pixels(w.width, w.height),
    measureText: () => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createConicGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({ setTransform: noop }),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    isPointInPath: () => false,
    getLineDash: () => [],
  };
  const settings = new Map<PropertyKey, unknown>();
  return new Proxy(answers, {
    get: (target, key) => (key in target ? target[key as string] : settings.has(key) ? settings.get(key) : noop),
    set: (_target, key, value) => { settings.set(key, value); return true; },
  });
}

/** A canvas that is never drawn: its size kept, its 2D context `blankContext`, no WebGL or WebGPU. */
class BlankCanvas {
  width: number;
  height: number;
  readonly style: Record<string, string> = {};
  private context: object | null = null;
  constructor(width = 300, height = 150) { this.width = width; this.height = height; }
  getContext(kind: string): object | null {
    if (kind !== '2d') return null;
    return (this.context ??= blankContext(this));
  }
  addEventListener(): void {}
  removeEventListener(): void {}
  toDataURL(): string { return 'data:,'; }
  convertToBlob(): Promise<Blob> { return Promise.resolve(new Blob()); }
  transferToImageBitmap(): object { return { width: this.width, height: this.height, close: noop }; }
}

/** Any other element: never shown, and a picture it's told to load never loads (the photos a look takes colours
 *  from are looks alone). */
class BlankElement {
  readonly style: Record<string, string> = {};
  src = '';
  setAttribute(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
}
const element = (tag: string): object => (tag === 'canvas' ? new BlankCanvas() : new BlankElement());

if (!('window' in scope)) {
  scope.window = globalThis;
  scope.location = new URL('http://fight.localhost/');
  scope.localStorage = new MemoryStorage();
  scope.sessionStorage = new MemoryStorage();
  scope.innerWidth = 1920;
  scope.innerHeight = 1080;
  scope.devicePixelRatio = 1;
  scope.addEventListener = noop;
  scope.removeEventListener = noop;
  scope.matchMedia = () => ({ matches: false, addEventListener: noop, removeEventListener: noop });
  scope.requestAnimationFrame = () => 0;
  scope.cancelAnimationFrame = noop;
  scope.OffscreenCanvas = BlankCanvas;
  // (the stylesheet the labels' fonts are read from: none, so they take their own defaults)
  scope.getComputedStyle = () => ({ getPropertyValue: () => '' });
  scope.ImageData = class { constructor(public data: Uint8ClampedArray, public width: number, public height = 1) {} };
  scope.document = {
    createElement: element,
    createElementNS: (_space: string, tag: string) => element(tag),
    documentElement: new BlankElement(),
    body: new BlankElement(),
    fonts: { load: () => Promise.resolve([]), ready: Promise.resolve(), check: () => true, addEventListener: noop },
    cookie: '',
    hidden: true,
    visibilityState: 'hidden',
    addEventListener: noop,
    removeEventListener: noop,
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
  };
}
