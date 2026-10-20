// Load-time shader warm-up. The lobby's, before it shows (`warmLobby`): every effect, loot and skill visual (the
// lobby lets the hero try his skills on its dummies), the hero with all he can wear, the lobby's biome. The rest
// after it (`warmTheRest`), as two needs (game/warm.ts): the fight's (every foe, the other biomes), a part at a time
// behind the lobby while each comes from a cache, else at once when something needs them; and the other classes'
// heroes, at once when something needs them (built behind the lobby, a hero's first build held it up 250 ms: his
// head's hair). Each briefly creates one of everything that brings its own materials, compiles their shaders and
// clears it all again: with core/shaders.ts pinning programs, nothing compiles mid-fight. Compiling a program took
// ANGLE a third of a second on a first visit, and a third of the boot's are the fight's alone (`lab programs`).
import * as THREE from 'three';
import { G } from '../state';
import { behindTheLobby, markLoaded, warmUp, type WarmedUp } from '../core/shaders';
import { sceneTarget } from '../core/renderer';
import { mapsArrived, mapsMadeAfresh } from '../core/textures';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { BIOME_IDS } from '../data/biomes';
import { SKILL_IMPLS } from '../combat/skills/index';
import { CLASSES } from '../data/classes/index';
import { buildModel } from '../entities/models/index';
import { Enemy } from '../entities/enemy';
import { crowdSlots } from '../entities/models/crowd';
import { clearEffects, shockwave, groundFlash, decal, telegraph, lightning, iceSpikes, glyphMarker, lightPillar, crackDecal, crystalBurst } from '../fx/effects';
import { rubble } from '../fx/rubble';
import { clearLights } from '../fx/lights';
import { particles } from '../fx/particles';
import { coreSamples } from '../combat/projectiles';
import { sporeOrbSample } from '../fx/sporeOrb';
import { riftBoltSamples } from '../fx/riftBolts';
import { swingTrailSamples } from '../fx/swingTrail';
import { groundSamples } from './groundItems';
import { warmOutline } from '../ui/overlay/outline';
import { markWarm, wanted, warming, type Need } from './warm';
import type { Model } from '../types';

/** far outside the arena, past what the lobby's camera sees: where the fight's warm-up stands what it builds */
const AWAY = new THREE.Vector3(4000, 0, 4000);
/** of the fight's warm-up at once (its progress), the share done once its foes and heroes are built */
const BUILT = 0.3;
/**
 * Not from a cache: a part of the fight's waited longer than this for its programs' links (ms; a return's wait a few
 * ms, a first visit's hundreds). Compiled behind the live lobby, ANGLE's work on the GPU's process held its frames
 * up for seconds (a first visit drew 21 frames in 7 s): what's cold waits for what needs it, under the fight's
 * loading bar.
 */
const COLD_PART_MS = 150;

const nextTask = (): Promise<void> => new Promise((r) => setTimeout(r));

/** `model`'s hero with all it can wear shown at once (a model hides what isn't worn, and a hidden mesh draws
 *  nothing), at `at`. */
function heroAllWorn(model: string, at?: THREE.Vector3): Model {
  const m = buildModel(model);
  m.root.traverse((o) => { o.visible = true; });
  m.root.name = `warm-up: ${model}, all worn`;   // names show up in the perf report
  if (at) m.root.position.copy(at);
  return m;
}

/** the biomes the lobby doesn't show */
const otherBiomes = () => BIOME_IDS.filter((id) => id !== G.arena.biome);

/** What the lobby shows and can do, warmed before it shows (the lobby's dummies already stand in it). */
export async function warmLobby(): Promise<void> {
  const at = new THREE.Vector3(), p = { x: 0, z: 0 };
  shockwave(p); groundFlash(p); decal(p); decal(p, { type: 'frost' }); telegraph(p, 2, 1);
  lightning(at, new THREE.Vector3(1, 1, 1)); iceSpikes(p, 2); glyphMarker(p); lightPillar(p); crackDecal(p); crystalBurst(p);
  for (const kind of ['stone', 'wood', 'shroom', 'ember'] as const) rubble(0, 0, { count: 24, color: 0x808080, kind, radius: 0.1, height: 0.1, size: 0.2, speed: 1 });
  const extra: THREE.Object3D[] = [...coreSamples(), sporeOrbSample(), ...riftBoltSamples(), ...groundSamples(), ...swingTrailSamples(), ...Object.values(SKILL_IMPLS).flatMap((s) => s.warm?.() ?? [])];
  // (the hero's class with all it can wear: equipping anything in the lobby compiles nothing)
  await nextTask();
  const hero = heroAllWorn(G.player.cls.model);
  extra.push(hero.root);
  const leaveOut = otherBiomes().map((id) => G.arena.groupOf(id));
  const start = performance.now();
  const took = await warmUp(G.renderer, G.scene, G.camera, sceneTarget(), { objects: extra, leaveOut, before: mapsArrived });
  performance.measure('warm the lobby', { start, duration: performance.now() - start, detail: took });
  hero.dispose();
  // (the outline a held skill draws round a foe: the dummies' meshes drawn into its mask)
  warmOutline(G.enemies.map((e) => e.obj));
  clearEffects(); clearLights(); particles.clear();
}

/** A part of the fight, built for its warm-up (one task) and then warmed (`warmPart`). */
interface Part {
  name: string;
  build(): Built;
}
/** A part built: what's compiled, what's added to the scene for it, what's drawn whatever the camera sees, what's
 *  shown in place of the lobby's biome for the draw, what's outlined, and its pieces let go (`done`). */
interface Built {
  compile: THREE.Object3D[];
  objects: THREE.Object3D[];
  unculled: THREE.Object3D[];
  swap?: { show: THREE.Object3D; hide: THREE.Object3D };
  outlined: THREE.Object3D[];
  done(): void;
}

/** The fight's parts: each foe (a plain one and a hero one of its kind, built away from the arena, where the
 *  lobby's camera never looks, and never let act), each other biome. */
function fightParts(): Part[] {
  const foes = (Object.keys(ENEMIES) as EnemyId[]).map((id): Part => ({
    name: id,
    build() {
      const pair = [new Enemy(id, { pos: AWAY }), new Enemy(id, { pos: AWAY, hero: true })];
      const roots = pair.map((e) => e.obj);
      const done = (): void => { for (const e of pair) e.dispose(); };
      return { compile: [...roots, ...crowdSlots(pair[0].model)], objects: [], unculled: roots, outlined: roots, done };
    },
  }));
  const biomes = otherBiomes().map((id): Part => ({
    name: id,
    build() {
      const swap = { show: G.arena.groupOf(id), hide: G.arena.groupOf(G.arena.biome) };
      return { compile: [swap.show], objects: [], unculled: [], swap, outlined: [], done: () => undefined };
    },
  }));
  return [...foes, ...biomes];
}

/** The heroes' parts: each other class's hero, with all he can wear, away from the arena. */
function heroParts(): Part[] {
  const models = [...new Set(Object.values(CLASSES).map((c) => c.model))].filter((m) => m !== G.player.cls.model);
  return models.map((model): Part => ({
    name: model,
    build() {
      const hero = heroAllWorn(model, AWAY);
      return { compile: [hero.root], objects: [hero.root], unculled: [], outlined: [], done: () => hero.dispose() };
    },
  }));
}

/** the warm-ups after the lobby shows, one after another: each sets the render target, and the needs' run apart */
let turn: Promise<unknown> = Promise.resolve();
/** `fn` in its turn, the ledger's programs made in it the boot's (`behindTheLobby`). */
function inTurn<T>(fn: () => Promise<T>): Promise<T> {
  const run = turn.then(async () => {
    behindTheLobby(true);
    try {
      return await fn();
    } finally {
      behindTheLobby(false);
    }
  });
  turn = run.catch(() => undefined);
  return run;
}

/** `built` warmed: compiled as the scene lights it, its programs' links waited for, drawn, outlined, let go. */
async function warmBuilt(built: Built[], progress?: (share: number) => void): Promise<WarmedUp> {
  const swaps = built.filter((b) => b.swap);
  const took = await warmUp(G.renderer, G.scene, G.camera, sceneTarget(), {
    compile: built.flatMap((b) => b.compile),
    objects: built.flatMap((b) => b.objects),
    unculled: built.flatMap((b) => b.unculled),
    swap: swaps[0]?.swap,
    before: mapsArrived,
    progress,
  });
  // (the other biomes each drawn in place of the lobby's, for their shadows' programs: compiled with the first)
  for (const b of swaps.slice(1)) await warmUp(G.renderer, G.scene, G.camera, sceneTarget(), { compile: [], unculled: [], swap: b.swap });
  // (the outline a held skill draws round a foe: every foe's meshes drawn into its mask)
  warmOutline(built.flatMap((b) => b.outlined));
  for (const b of built) b.done();
  return took;
}

/** `part` warmed on its own, behind the lobby: how long its links were waited for (ms). Timed as a user timing
 *  measure, `warm <part>`, its detail what its steps took (the stalls' boot lists them). */
async function warmPart(part: Part): Promise<number> {
  await nextTask();
  const start = performance.now();
  const built = part.build();
  const buildMs = performance.now() - start;
  await nextTask();
  const took = await warmBuilt([built]);
  performance.measure(`warm ${part.name}`, { start, duration: performance.now() - start, detail: { buildMs, ...took } });
  return took.linksMs;
}

/** `parts` built and warmed at once, `progress` told how far along: timed as `warm the <need> at once`. */
async function warmAtOnce(need: Need, parts: Part[], progress: (share: number) => void): Promise<void> {
  const start = performance.now();
  const built: Built[] = [];
  for (const [i, part] of parts.entries()) {
    await nextTask();
    built.push(part.build());
    progress(BUILT * (i + 1) / parts.length);
  }
  const took = await warmBuilt(built, (s) => progress(BUILT + (1 - BUILT) * s));
  performance.measure(`warm the ${need} at once`, { start, duration: performance.now() - start, detail: took });
}

/**
 * `need`'s `parts` warmed: a part at a time behind the lobby where `behind` and while they come from a cache (each
 * part's links timed after it), the rest at once when something needs them (game/warm.ts `wanted`); then what
 * waited for them goes ahead.
 */
async function warmNeed(need: Need, parts: Part[], behind: boolean): Promise<void> {
  let hurried = false;
  void wanted(need).then(() => { hurried = true; });
  let cold = !behind;
  let next = 0;
  while (next < parts.length && !cold && !hurried) {
    const part = parts[next++];
    cold = await inTurn(() => warmPart(part)) > COLD_PART_MS;
    warming(need, next / parts.length);
  }
  if (next < parts.length) {
    await wanted(need);
    const done = next / parts.length;
    await inTurn(() => warmAtOnce(need, parts.slice(next), (s) => warming(need, done + (1 - done) * s)));
  }
  warming(need, 1);
  markWarm(need);
}

/**
 * The programs the lobby doesn't use warmed (game/warm.ts): the fight's behind it, none on a visit whose maps were
 * made afresh (whose programs are new to the GPU's cache too, as likely as not), and the other heroes' once
 * something needs them. Once the fight's are warm, a program compiled but by a warm-up is counted as compiled late.
 */
export async function warmTheRest(): Promise<void> {
  const fight = warmNeed('fight', fightParts(), !mapsMadeAfresh()).then(() => {
    markLoaded();
    performance.mark('fight warm');
  });
  await Promise.all([fight, warmNeed('heroes', heroParts(), false)]);
}
