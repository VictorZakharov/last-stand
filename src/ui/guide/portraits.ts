// The guide's portraits: each foe's own model and each hero's in his starting gear (entities/models), drawn once into a
// picture by a small WebGL renderer of the guide's own. The game's renderer never sees these models, so it links no
// program for them (the root's "shaders compile at load"). They're made once the guide is first opened, never before
// (most players never open it, and on a phone's WebGL each portrait made behind the lobby beforehand held its frames
// up 130 to 950 ms, trace S307-J274), a piece a frame as the heroes are (game/behind.ts): the renderer, each
// model (a hero's in his build's own pieces), its compile waited on (`compileAsync`, in parallel where the browser can),
// and its draw copied into a canvas of its own the guide's places are drawn from (`made`: shown the frame it's drawn,
// where a PNG encoded first held each picture back a few frames more; Victor on #665: "model renders take 5-10sec to
// appear"). While the guide is open they're made first (`stepPortraits`), the ones it shows before the others. Made all at once as the guide opened, they held it up
// 330 ms and then 90 to 110 ms a picture (from Victor's review of #665: "lags for 1-2sec"; `npm run lab -- guide`).
// A production build keeps them in the browser's storage for its own build (`CACHE`), so a later visit makes none.
// Opened before they're made, the guide shows a picture as it comes, the ones it shows first (`hurryPortrait`).
// The village folk are pictured here too, each first as his card asks for it (Brother Hollis's talk, Odo's trade):
// another of him built on his own model, looking into the camera, head and shoulders in the room behind him
// (`folkPortraits.ts`; from play, "lets have an actual picture of him, of his actual face", "Have him look straight").
//
// TODO(#973): the pictures were drawn by a WebGL renderer of three's, gone with three. Until the engine draws them
// (a render of its own into a canvas), none is made: every one asked for settles with none (`steps`), and a place
// shows what it shows for no picture (a foe's glyph, the talk card's spinner). The staging below is kept for it.
import {
  Box3, DirectionalLight, HemisphereLight, Material, Maths, Mesh, Node, PerspectiveCamera, Texture, Vec3, World,
} from '../../engine/api/index.ts';
import { foeLoaded, loadFoe } from '../../entities/bosses';
import { ENEMIES, type EnemyId } from '../../data/enemies';
import { CLASSES, CLASS_IDS } from '../../data/classes/index';
import { buildModel, modelSteps } from '../../entities/models/index';
import { gearOf, makeItem } from '../../loot/items';
import { disposeGeometries } from '../../entities/models/rig';
import { buildFirst, buildLater, buildOnly, finishNow, queued } from '../../game/behind';
import { perfClock } from '../perfHud';
import type { Model, Profile } from '../../types';
import { FOLK, folkStaged, isFolk, type FolkId } from './folkPortraits';

declare const __BUILD__: { ref: string; time: string };

/** the pictures' size (px): shown at up to half of it, crisp on a screen of 2 pixels a css px */
const SIZE = 320;
/** where the camera stands: how far round from the foe's front (rad) and how far above level it looks down (rad) */
const VIEW = { round: 0.55, down: 0.12, fov: 28 };
/** how many frames one of the folk's pictures waits for his room to build him (asked for as the hero walks in) */
const FOLK_WAIT = 600;
/** the build's key behind the lobby */
const JOB = 'guide portraits';
/** the browser's store the pictures are kept in, a production build's alone (a dev build's models change under it) */
const CACHE = { db: 'last-stand-guide', store: 'portraits', on: !import.meta.env.DEV && typeof indexedDB !== 'undefined' };

/** how much of a frame the pictures may take while the guide is open (ms, and the most pieces): made only behind the
 *  lobby, 2 ms a frame after the heroes and never while the fight's warm-up ran, a first visit's guide showed one
 *  picture 20 s after it opened and most of them after a minute (from play: "icons not loading in guide") */
export const WHILE_OPEN = { ms: 8, most: 40 };

/** a harness's planted faults: each picture drawn and encoded at once, as they were (`remakeAllNow`); the pictures not
 *  made while the guide is open, only behind the lobby, as they were (`lab guide --canary=slow`); the next try at
 *  `failNext`'s picture failing, as one came back empty in play and the talk card showed a drawing (`lab talk`) */
export const portraitPlant = { allAtOnce: false, notWhileOpen: false, failNext: null as Who | null };

/** Whose picture: a foe's id, `hero:` and a class's id, or one of the village folk. */
export type Who = EnemyId | `hero:${string}` | FolkId;

/** each picture made: a canvas of its own (`SIZE` square) every place showing it is drawn from */
const made = new Map<Who, HTMLCanvasElement>();
const waiting = new Map<Who, ((pic: HTMLCanvasElement | null) => void)[]>();
/** the pictures still to make, the first made next */
let pending: Who[] = [];
/** a picture couldn't be drawn here (no WebGL): every foe shows its glyph */
let failed = false;
/** the browser's store read (once) and the rest queued */
let started = false;

/** Each piece's name, when it began and how long it took (ms, by `perfClock`: a harness's, `lab guide`, reads the
 *  browser's own), the latest `PIECES_KEPT`: what the slowest is made of, and where a late one waited. */
export const portraitPieces: { what: string; at: number; ms: number; waited?: boolean }[] = [];
/** when each picture's compile was done, when its draw was sent to the card and the card had done it, and when it was
 *  drawn into its canvas (by `perfClock`), for a harness (`lab guide`) */
export const portraitTimes = new Map<Who, { compiled: number; sent: number; onCard: number; drawn: number }>();
const PIECES_KEPT = 2000;
/** `work` done as a piece named `what`, its time kept. */
function piece<T>(what: string, work: () => T): T {
  const at = perfClock.now();
  try { return work(); } finally {
    portraitPieces.push({ what, at, ms: perfClock.now() - at });
    if (portraitPieces.length > PIECES_KEPT) portraitPieces.shift();
  }
}

/** A build in pieces, each piece timed as `what`'s. */
function* timedSteps<T>(what: string, steps: Generator<void, T, undefined>): Generator<void, T, undefined> {
  for (;;) {
    const next = piece(what, () => steps.next());
    if (next.done) return next.value;
    yield;
  }
}

/** Every picture the guide shows: the foes', the bosses' and the heroes'. */
function guides(): Who[] {
  const foes = (Object.keys(ENEMIES) as EnemyId[]).filter((id) => !ENEMIES[id].dummy);
  return [...foes.filter((id) => !ENEMIES[id].boss), ...foes.filter((id) => ENEMIES[id].boss), ...CLASS_IDS.map((id) => `hero:${id}` as Who)];
}
/** Every picture the guide makes once it's opened (the folk's are their cards', each made as it asks for it:
 *  `startFolk`). */
const everyone = (): Who[] => guides();

/** The pictures not made yet, of every foe, boss and hero the guide shows (a harness's: `lab guide`). */
export const portraitsLeft = (): Who[] => guides().filter((id) => !made.has(id));

/** A picture made already, or null. */
export const portraitMade = (id: Who): HTMLCanvasElement | null => made.get(id) ?? null;

/** `pic` drawn into `into` (a place in the guide showing it), filling it. */
export function drawPortrait(into: HTMLCanvasElement, pic: HTMLCanvasElement): void {
  if (into.width !== SIZE) into.width = into.height = SIZE;
  const ctx = into.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.drawImage(pic, 0, 0);
}

/** A canvas of the pictures' size holding what `from` shows now. */
function copied(from: CanvasImageSource): HTMLCanvasElement {
  const pic = document.createElement('canvas');
  pic.width = pic.height = SIZE;
  pic.getContext('2d')?.drawImage(from, 0, 0, SIZE, SIZE);
  return pic;
}

/** `id`'s picture, as it's made behind the lobby (or at once if it is); null where none can be made. */
export function portrait(id: Who): Promise<HTMLCanvasElement | null> {
  const have = made.get(id);
  if (have || failed) return Promise.resolve(have ?? null);
  if (isFolk(id)) startFolk(id); else startPortraits();
  return new Promise((done) => waiting.set(id, [...(waiting.get(id) ?? []), done]));
}

/** One of the folk's pictures alone queued, for his card: the guide's are made once the guide is opened, not because
 *  he was talked to or traded with. */
function startFolk(id: FolkId): void {
  if (made.has(id) || pending.includes(id) || making.some((m) => m.id === id)) return;
  pending.unshift(id);
  requeue();
}

/** `id`'s picture made before the others (a page showing it opened), the build behind the lobby moved to the front. */
export function hurryPortrait(id: Who): void {
  if (!made.has(id)) own = id;
  const at = pending.indexOf(id);
  if (at > 0) { pending.splice(at, 1); pending.unshift(id); }
  buildFirst(JOB);
}

/** the page's own picture while it's being made: no other picture's compile is started until it's drawn (started
 *  beside it, theirs ran on the card ahead of its draw, and the Twins' pages showed theirs 200 to 330 ms after
 *  their compiles, `lab guide`) */
let own: Who | null = null;

/** `id`'s picture tried again, first, after a try came back empty (a talk's card waits on with a spinner). */
export function retryPortrait(id: Who): void {
  if (made.has(id)) return;
  failed = false;
  if (!pending.includes(id)) pending.unshift(id);
  requeue();
  hurryPortrait(id);
}

/** A harness's: `id`'s picture forgotten, to be made again as if it never had been (`lab talk`). */
export function forgetPortrait(id: Who): void {
  made.delete(id);
  portraitTimes.delete(id);
  if (!pending.includes(id)) pending.unshift(id);
  requeue();
}

/** The pictures made while the guide is open, ahead of everything built behind the lobby and whatever holds it
 *  (called each frame it's open, from main.ts): the player is looking at them. `all` false: the talk's card's alone,
 *  while it waits for it. */
export function stepPortraits(all = true): void {
  if (portraitPlant.notWhileOpen) return;
  // (all of them once the guide is opened; while the talk's card waits for his picture, his alone, already queued)
  if (all) startPortraits();
  buildOnly(JOB, WHILE_OPEN);
}

/** `ids`' pictures made before the others (the entries the guide's list shows), in their order. */
export function hurryPortraits(ids: Who[]): void {
  const first = ids.filter((id) => pending.includes(id));
  if (!first.length) return;
  pending = [...first, ...pending.filter((id) => !first.includes(id))];
  buildFirst(JOB);
}

/** A harness's: every picture forgotten, to be made again as on a first visit (`lab guide`). */
export function forgetPortraits(): void {
  // (the guide's alone: the scholar's is his talk's card's, made as it asks for it)
  for (const id of guides()) made.delete(id);
  portraitTimes.clear();
  pending = guides();
  started = true;
  requeue();
}

/** The pictures queued to be made, once the guide is first opened (once; those the browser kept are read first). */
export function startPortraits(): void {
  if (started || failed) return;
  started = true;
  void kept().then(() => {
    pending = everyone().filter((id) => !made.has(id));
    if (pending.length && !queued(JOB)) buildLater(JOB, steps(), () => undefined);
  });
}

/** A picture made: kept, and given to whoever waits for it. */
function settle(id: Who, pic: HTMLCanvasElement | null): void {
  if (pic) made.set(id, pic);
  for (const done of waiting.get(id) ?? []) done(pic);
  waiting.delete(id);
}

/** A picture being made: its model staged, its textures still to send, and whether the browser has compiled it
 *  (waited on out of the queue: the build queued again as it's done). */
interface Making {
  id: Who;
  root: Node;
  /** its meshes shown, their buffers still to send (a batch a piece: `BUFFERS_A_PIECE`) */
  meshes: Mesh[];
  scene: World;
  camera: PerspectiveCamera;
  textures: Texture[];
  /** each of its materials' maps and the small copy it's drawn with here */
  swaps: Swap[];
  compiled: boolean;
}
/** the pictures being made, their compiles running side by side: one at a time, each waited for in turn, every
 *  picture was drawn 24 s after the guide opened (`lab guide`, the lab's browser at below normal priority, where a
 *  compile took up to 12 s); 4 at a time, 8 to 10; 6, the page's own waited behind the others' compiles */
let making: Making[] = [];
/** the picture drawn, waiting for the card to have drawn it before it's copied (nothing else drawn meanwhile: the
 *  renderer's canvas holds it) */
let copying: { m: Making } | null = null;
/** how many are made side by side (a page's own picture is started whatever the count) */
const SIDE_BY_SIDE = 4;

/** The build queued again behind the lobby (what the browser was doing for it is done). */
function requeue(): void {
  if (!queued(JOB) && (pending.length || making.length || copying)) buildLater(JOB, steps(), () => undefined);
}

/** `m` done with, its picture (or none) given to whoever waits for it. */
function finished(m: Making, pic: HTMLCanvasElement | null): void {
  making = making.filter((x) => x !== m);
  if (own === m.id) own = null;
  pending = pending.filter((who) => who !== m.id);
  try { m.scene.remove(m.root); disposeGeometries(m.root); } catch { /* let go as it is */ }
  settle(m.id, pic);
}

/** The pictures made, a piece at a time. TODO(#973): drawn by the engine, the model staged (`modelOf`, `staged`,
 *  `folkStaged`) and drawn with its small maps (`smallTextures`, `withSmall`) into a canvas (`copied`). three's WebGL
 *  renderer drew them, a piece a frame (its compile asked for, its textures and buffers sent, its draw fenced and
 *  copied once the card had done it: the file's history); none is made till then, each asked for settled with none. */
function* steps(): Generator<void, void, undefined> {
  failed = true;
  for (const who of pending) settle(who, null);
  pending = [];
  for (const m of making) finished(m, null);
  copying = null;
}

/** Whose model built: a foe's in one piece, or a hero's in his build's own pieces, holding his class's starting gear. */
function* modelOf(id: Who): Generator<void, Model, undefined> {
  if (!id.startsWith('hero:')) {
    // (a boss's code is loaded at its wave: loaded here first, its picture a frame or more later)
    let here = foeLoaded(id as EnemyId);
    if (!here) void loadFoe(id as EnemyId).then(() => { here = true; });
    while (!here) yield;
    return buildModel(ENEMIES[id as EnemyId].model);
  }
  const cls = CLASSES[id.slice('hero:'.length)];
  const model = yield* modelSteps(cls.model);
  const equipped: Profile['equipped'] = {};
  for (const g of cls.starterGear) equipped[g.slot] = makeItem({ slot: g.slot, rarity: g.rarity, ilvl: g.ilvl, cls });
  model.setGear?.(gearOf(cls, equipped));
  return model;
}

/** A material's map, and the small copy a picture is drawn with in its place. */
interface Swap { material: Material; key: string; small: Texture }

/** the most a picture's texture is across (px): the picture is 320 px, its model a part of it */
const SMALL = 256;
/** each texture's small copy, made once (the game's textures are shared by every model of a kind) */
const smallOf = new WeakMap<Texture, Texture>();

/** `t` drawn small, or `t` itself where it's small already or not a picture the page can draw (a data texture). */
function small(t: Texture): Texture {
  const have = smallOf.get(t);
  if (have) return have;
  const img = t.image as { width?: number; height?: number } | null;
  const drawable = typeof HTMLCanvasElement !== 'undefined' && (img instanceof HTMLCanvasElement
    || (typeof OffscreenCanvas !== 'undefined' && img instanceof OffscreenCanvas)
    || (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) || img instanceof HTMLImageElement);
  let made = t;
  if (drawable && img?.width && img.height && Math.max(img.width, img.height) > SMALL) {
    const k = SMALL / Math.max(img.width, img.height);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    c.getContext('2d')?.drawImage(img as CanvasImageSource, 0, 0, c.width, c.height);
    made = t.clone();
    made.image = c;
    made.needsUpdate = true;
  }
  smallOf.set(t, made);
  return made;
}

/** Every map of what's shown of `root`, each with its small copy (made here, once for each texture). The game's
 *  textures are canvases as large as 2048 px, shared by its own renderer: the guide's context read each back to send it
 *  (the Voidling's first, 338 ms in one frame), where a picture shows them a few dozen pixels across. */
function smallTextures(root: Node): Swap[] {
  const swaps: Swap[] = [];
  const seen = new Set<Material>();
  root.traverseVisible((o) => {
    const mats = (o as Mesh).material;
    if (!mats) return;
    for (const m of Array.isArray(mats) ? mats : [mats]) {
      if (seen.has(m)) continue;
      seen.add(m);
      for (const [key, v] of Object.entries(m)) {
        if ((v as Texture | null)?.isTexture) swaps.push({ material: m, key, small: small(v as Texture) });
      }
    }
  });
  return swaps;
}

/** `draw` done with every map swapped for its small copy, and each put back after (the materials are the game's own:
 *  they're never left changed between its frames). */
function withSmall(swaps: Swap[], draw: () => void): void {
  const kept = swaps.map((w) => (w.material as unknown as Record<string, unknown>)[w.key]);
  for (const w of swaps) (w.material as unknown as Record<string, unknown>)[w.key] = w.small;
  try { draw(); } finally {
    swaps.forEach((w, i) => { (w.material as unknown as Record<string, unknown>)[w.key] = kept[i]; });
  }
}

/** how many vertices' buffers a piece sends (each batch drawn alone, `drawnAlone`) */
const BUFFERS_A_PIECE = 12000;

/** Every mesh shown of `root`. */
function meshesOf(root: Node): Mesh[] {
  const found: Mesh[] = [];
  root.traverseVisible((o) => { if ((o as Mesh).isMesh) found.push(o as Mesh); });
  return found;
}

/** The next meshes from `left`, up to `BUFFERS_A_PIECE` vertices (one at least). */
function takeBatch(left: Mesh[]): Mesh[] {
  const batch: Mesh[] = [];
  let vertices = 0;
  while (left.length && (!batch.length || vertices + left[0].geometry.attributes.position.count <= BUFFERS_A_PIECE)) {
    const mesh = left.shift()!;
    vertices += mesh.geometry.attributes.position.count;
    batch.push(mesh);
  }
  return batch;
}

/** The lights a portrait is drawn by: a warm key from the front right, a cool rim from behind, a dim fill. */
function lights(scene: World): void {
  scene.add(new HemisphereLight(0xcfd8ff, 0x2a1e14, 1.1));
  const key = new DirectionalLight(0xfff0dc, 2.6);
  key.position.set(3, 5, 6);
  scene.add(key);
  const rim = new DirectionalLight(0x9fc4ff, 2.2);
  rim.position.set(-4, 3, -5);
  scene.add(rim);
}

/** The box round what's shown of `root` (a hero's model holds every piece of gear he could wear, hidden). */
function shownBox(root: Node): Box3 {
  const box = new Box3(), part = new Box3();
  root.traverseVisible((o) => {
    const geo = (o as Mesh).geometry;
    if (!(o as Mesh).isMesh || !geo) return;
    if (!geo.boundingBox) geo.computeBoundingBox();
    box.union(part.copy(geo.boundingBox!).applyMatrix4(o.matrixWorld));
  });
  return box;
}

/** The model at rest, a moment into its idle, in a scene of its own, and a camera framing it head to feet from a
 *  little round its front. */
function staged(model: Model): { scene: World; camera: PerspectiveCamera } {
  for (let i = 0; i < 3; i++) model.animate({ t: 0.4 + i * 0.1, dt: 0.1, phase: 0, move: 0, action: null, hit: 0, dead: -1 });
  const scene = new World();
  lights(scene);
  scene.add(model.root);
  model.root.updateMatrixWorld(true);
  const box = shownBox(model.root);
  const size = box.getSize(new Vec3()), mid = box.getCenter(new Vec3());
  const camera = new PerspectiveCamera(VIEW.fov, 1, 0.05, 200);
  // (far enough that the taller of its height and its width fills the frame, with a margin)
  const fit = Math.max(size.y, Math.hypot(size.x, size.z) * 0.85) * 0.56;
  const dist = fit / Math.tan(Maths.degToRad(VIEW.fov / 2));
  camera.position.set(
    mid.x + Math.sin(VIEW.round) * Math.cos(VIEW.down) * dist,
    mid.y + Math.sin(VIEW.down) * dist,
    mid.z + Math.cos(VIEW.round) * Math.cos(VIEW.down) * dist,
  );
  camera.lookAt(mid);
  return { scene, camera };
}

/** Where the pictures' making stands, for a harness (`lab guide`): what's still to make, the one being made and how
 *  far the browser has come with it, and whether the build is queued behind the lobby. */
export function portraitState(): string {
  const m = making.map((x) => `${x.id} (compiled ${x.compiled}, textures left ${x.textures.length})`).join(', ') || 'none';
  return `to make: ${pending.join(', ') || 'none'}; being made: ${m}; queued: ${queued(JOB)}`;
}

/** A harness's planted fault (`lab guide --canary`): every picture forgotten and made again at once, in this task, as
 *  the guide made them before they were made behind the lobby. */
export function remakeAllNow(): void {
  made.clear();
  pending = everyone();
  started = true;
  portraitPlant.allAtOnce = true;
  // (those already in flight drawn at once too, their compiles not waited for)
  for (const m of making) { m.compiled = true; m.textures = []; }
  try {
    if (!queued(JOB)) buildLater(JOB, steps(), () => undefined);
    finishNow(JOB);
  } finally { portraitPlant.allAtOnce = false; }
}

// --- kept in the browser for the build -------------------------------------------------------------------------------

/** the build's own key: its commit and time (a new deploy's models may differ) */
const buildKey = (): string => `${__BUILD__.ref}@${__BUILD__.time}`;

function openStore(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(CACHE.db, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(CACHE.store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

/** The pictures this build kept on an earlier visit, each drawn into its canvas; another build's let go. */
async function kept(): Promise<void> {
  if (!CACHE.on) return;
  const db = await openStore();
  if (!db) return;
  const found: [Who, Blob][] = [];
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(CACHE.store, 'readwrite');
      const store = tx.objectStore(CACHE.store);
      const req = store.openCursor();
      const prefix = `${buildKey()}|`;
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        const key = String(cursor.key);
        if (key.startsWith(prefix) && cursor.value instanceof Blob) found.push([key.slice(prefix.length) as Who, cursor.value]);
        else cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch { resolve(); }
  });
  db.close();
  // (decoded off the page's thread)
  await Promise.all(found.map(async ([id, blob]) => {
    try { settle(id, copied(await createImageBitmap(blob))); } catch { /* left to be made again */ }
  }));
}

/** A picture kept for this build's later visits. */
function keep(id: Who, blob: Blob): void {
  if (!CACHE.on) return;
  void openStore().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(CACHE.store, 'readwrite');
      tx.objectStore(CACHE.store).put(blob, `${buildKey()}|${id}`);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    } catch { db.close(); }
  });
}
