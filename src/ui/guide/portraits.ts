// The guide's portraits: each foe's own model and each hero's in his starting gear (entities/models), drawn once into a
// picture by the engine, in a scene of their own drawn apart before a frame (`sceneApart` in core/renderer.ts). They're
// made once the guide is first opened, never before
// (most players never open it, and on a phone's WebGL each portrait made behind the lobby beforehand held its frames
// up 130 to 950 ms, trace S307-J274), a piece a frame as the heroes are (game/behind.ts): the renderer, each
// model (a hero's in his build's own pieces), and its draw copied into a canvas of its own the guide's places are
// drawn from (`made`: shown the frame it's drawn,
// where a PNG encoded first held each picture back a few frames more; Victor on #665: "model renders take 5-10sec to
// appear"). While the guide is open they're made first (`stepPortraits`), the ones it shows before the others. Made all at once as the guide opened, they held it up
// 330 ms and then 90 to 110 ms a picture (from Victor's review of #665: "lags for 1-2sec"; `npm run lab -- guide`).
// A production build keeps them in the browser's storage for its own build (`CACHE`), so a later visit makes none.
// Opened before they're made, the guide shows a picture as it comes, the ones it shows first (`hurryPortrait`).
// The village folk are pictured here too, each first as his card asks for it (Brother Hollis's talk, Odo's trade):
// another of him built on his own model, looking into the camera, head and shoulders in the room behind him
// (`folkPortraits.ts`; from play, "lets have an actual picture of him, of his actual face", "Have him look straight").
//
// From #973 to its fix the pictures were drawn by nothing (three's WebGL renderer gone, the engine not drawing them yet),
// and every foe's place showed its glyph (from play, "mob pics dont show in guide, like ever").
import type { Node, PerspectiveCamera, World } from '../../engine/api/index.ts';
import { frameRect, sceneApart } from '../../core/renderer';
import { drawnNow, SIZE, staged } from './portraitDraw';
import { PLAIN_GRADE, type Grade } from '../../engine/globals';
import { CACHE, keep, kept } from './portraitStore';
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

/** how many frames one of the folk's pictures waits for his room to build him (asked for as the hero walks in) */
const FOLK_WAIT = 600;
/** the build's key behind the lobby */
const JOB = 'guide portraits';

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
  void kept<Who>((id, picture) => settle(id, copied(picture))).then(() => {
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

/** A picture being made: its model staged in a scene of its own, framed for a square picture. */
interface Making {
  id: Who;
  root: Node;
  scene: World;
  camera: PerspectiveCamera;
  /** the camera's field of view for a square picture (deg): widened for a frame taller than it's wide */
  fov: number;
  /** the frames it was drawn with a pipeline still compiling, its draws left out */
  tries: number;
}
/** the picture being made (one at a time: each is two draws of the engine's in a frame of the game's) */
let making: Making[] = [];
/** the most frames a picture is drawn again while its pipelines compile, before it's given up */
const MOST_TRIES = 900;

/** The build queued again behind the lobby. */
function requeue(): void {
  if (!queued(JOB) && (pending.length || making.length)) buildLater(JOB, steps(), () => undefined);
}

/** `m` done with, its picture (or none) given to whoever waits for it. */
function finished(m: Making, pic: HTMLCanvasElement | null): void {
  making = making.filter((x) => x !== m);
  if (own === m.id) own = null;
  pending = pending.filter((who) => who !== m.id);
  try {
    m.scene.remove(m.root);
    disposeGeometries(m.root);
  } catch { /* let go as it is */ }
  settle(m.id, pic);
}

/** the frame's grade a picture was last drawn with (a harness's canary draws one outside a frame with it) */
let lastGrade: Grade | null = null;

/** The picture being made drawn apart in this frame (`core/renderer.ts` calls it), settled once it's whole. */
function drawApart(width: number, height: number, graded: Grade): void {
  lastGrade = graded;
  const m = making[0];
  sceneApart.take = null;
  if (!m) return;
  let pic: HTMLCanvasElement | null = null;
  try {
    pic = piece(`${m.id}: drawn`, () => drawnNow(m, width, height, graded));
  } catch (err) {
    console.warn(`guide: no portrait of ${m.id}`, err);
    finished(m, null);
    return;
  }
  if (!pic) {
    if (++m.tries < MOST_TRIES) sceneApart.take = drawApart;
    else finished(m, null);
    return;
  }
  const at = perfClock.now();
  portraitTimes.set(m.id, { compiled: at, sent: at, onCard: at, drawn: at });
  // (kept for a later visit, encoded off the page's thread: nothing waits on it)
  if (CACHE.on && !portraitPlant.allAtOnce) pic.toBlob((blob) => { if (blob) keep(m.id, blob); }, 'image/png');
  finished(m, pic);
  requeue();
}

/** `next`'s model built and staged, a piece a frame: one of the folk on his room's sitter, else the foe's or hero's. */
function* stagedSteps(next: Who): Generator<void, Making, undefined> {
  if (portraitPlant.failNext === next) {
    portraitPlant.failNext = null;
    throw new Error('a planted failure');
  }
  let root: Node;
  let scene: World;
  let camera: PerspectiveCamera;
  if (isFolk(next)) {
    // (built a slice at a time, as his room builds him: whole, Brother Hollis was one task of 0.9 to 2.7 s)
    // (asked for as the hero walks into his room, before the room has built him: waited for, a while)
    const folk = FOLK[next];
    let building = folk.sitter();
    for (let f = 0; !building && f < FOLK_WAIT; f++) {
      yield;
      building = folk.sitter();
    }
    if (!building) throw new Error(`${next} was never built in his room: nothing to build him on`);
    const sitter = yield* timedSteps(`${next}: built`, building);
    yield;
    ({ root, scene, camera } = piece(`${next}: staged`, () => folkStaged(sitter, folk.backdrop)));
  } else {
    const model: Model = yield* timedSteps(`${next}: its model built`, modelOf(next));
    yield;
    root = model.root;
    ({ scene, camera } = piece(`${next}: staged and framed`, () => staged(model)));
  }
  return { id: next, root, scene, camera, fov: camera.fov, tries: 0 };
}

/**
 * The pictures made, one at a time, a piece a frame: its model built and staged, then drawn by the engine in the
 * frames after (`drawApart`, two draws in a frame's own task: against black and white, for its alpha). three's WebGL
 * renderer drew them before (#973), its compile asked for, its textures and buffers sent and its draw fenced; the
 * engine's pipelines compile aside, and the picture is drawn again till none of its draws is left out.
 */
function* steps(): Generator<void, void, undefined> {
  while (pending.length || making.length) {
    if (making.length) {
      // (a harness's canary: drawn at once, in this task, whatever its pipelines)
      if (portraitPlant.allAtOnce) {
        const frame = frameRect();
        const m = making[0];
        finished(m, drawnNow(m, frame.width, frame.height, lastGrade ?? PLAIN_GRADE));
        continue;
      }
      // (being drawn by the frames: looked at again next frame)
      yield;
      continue;
    }
    const next = pending[0];
    try {
      const m = yield* stagedSteps(next);
      making.push(m);
      if (!portraitPlant.allAtOnce) sceneApart.take = drawApart;
    } catch (err) {
      console.warn(`guide: no portrait of ${next}`, err);
      pending = pending.filter((who) => who !== next);
      settle(next, null);
    }
    if (!portraitPlant.allAtOnce) yield;
  }
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

/** Where the pictures' making stands, for a harness (`lab guide`): what's still to make, the one being made and how
 *  often it was drawn with its pipelines compiling, and whether the build is queued behind the lobby. */
export function portraitState(): string {
  const m = making.map((x) => `${x.id} (drawn ${x.tries} times with a pipeline compiling)`).join(', ') || 'none';
  return `to make: ${pending.join(', ') || 'none'}; being made: ${m}; queued: ${queued(JOB)}`;
}

/** A harness's planted fault (`lab guide --canary`): every picture forgotten and made again at once, in this task, as
 *  the guide made them before they were made behind the lobby. */
export function remakeAllNow(): void {
  made.clear();
  pending = everyone();
  started = true;
  portraitPlant.allAtOnce = true;
  try {
    if (!queued(JOB)) buildLater(JOB, steps(), () => undefined);
    finishNow(JOB);
  } finally { portraitPlant.allAtOnce = false; }
}
