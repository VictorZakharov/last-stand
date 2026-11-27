// The game's world drawn by the Rust engine (Bulwark, `pkg/`, VictorZakharov/last-stand#973). The world is the
// engine's as it changes (`stage.ts`): a node under it is the engine's node from the moment it comes under it, a
// mesh's records are kept on its node (`draws.ts`), and a frame writes only what moved and what changed, then the
// frame's globals (camera, sun and its shadow's view, sky, point lights, fog) and the particles. Nothing walks the
// world each frame.
// Its parts, each a module beside it: what they share (`core.ts`), the nodes (`stage.ts`), the draws (`draws.ts`),
// the maps (`maps.ts`), the materials (`materials.ts`), the geometry and bones (`geometry.ts`), the lights
// (`lights.ts`), the kinds of see-through (`seeKinds.ts`), the particles (`sprites.ts`), the foes drawn as one
// (`bodies.ts`) and the frame's globals (`globals.ts`). Here: a frame drawn or written down.
import type { Material, Mesh, Node, PerspectiveCamera, World } from './api/index.ts';
import type { Engine, InitOutput } from './pkg/bulwark';
import { writeOutlined } from './outlined';
import type { LookHost } from './index';
import { perfClock } from '../core/perfClock';
import { shownPlace, shownPointLights } from '../core/webgpu';
import { Core, MAX_MAP, RECORD } from './core';
import { Geometries } from './geometry';
import { Ahead } from './ahead';
import { LampShadows } from './lampShadows';
import { AHEAD } from './pipelinesAside';
import { G } from '../state';
import { lampShadowsAllowed } from '../core/lamps';
import { LightCache } from './lightCache';
import { GLOBALS, PLAIN_GRADE, TUNE, shadowSizeOf, writeGlobals, type Grade } from './globals';
import { Levels } from './levels';
import { FrameLook } from './frameLook';
import { Lights } from './lights';
import { Bodies } from './bodies';
import { Draws } from './draws';
import { Maps } from './maps';
import { Materials } from './materials';
import { SEE_FLAGS, SeeKinds } from './seeKinds';
import { Sprites } from './sprites';
import { Stage } from './stage';
import { recording, Tape } from './tape';

export { TUNE, type Grade } from './globals';
export type { FrameStats } from './core';

export class Bridge {
  private core: Core;
  /** The engine's handle, for the calls of the parts kept apart from the bridge (the overlay: engine/overlay.ts). */
  get handle(): Engine { return this.core.engine; }
  private maps: Maps;
  private seeKinds: SeeKinds;
  private materials: Materials;
  private geometries: Geometries;
  private lit: Lights;
  private lampShadows: LampShadows;
  private lightCache: LightCache;
  /** what the quality level asks of the engine (`levels.ts`) */
  readonly levels: Levels;
  private readonly frameLook: FrameLook;
  private particles: Sprites;
  /** the world's nodes in the engine (`stage.ts`), and what their meshes draw (`draws.ts`) */
  readonly stage: Stage;
  readonly draws: Draws;
  /** the foes drawn as one (`bodies.ts`) */
  readonly bodies: Bodies;
  /** what a frame handed over and drew */
  readonly stats: Core['stats'];
  /** what wasn't handed over, by its kind, on the last frame */
  readonly skipped: Core['skipped'];
  /** how many of each the engine holds */
  readonly held: Core['held'];
  /** what's handed over ahead of its first frame (`ahead.ts`) */
  readonly ahead: Ahead;
  /** A harness's: the meshes handed to the engine since it was set (`lab rustcheck`: every foe of a fight drawn). */
  watched: Set<Node> | null = null;

  constructor(engine: Engine, wasm: InitOutput) {
    const core = this.core = new Core(engine, wasm);
    this.maps = new Maps(core);
    this.seeKinds = new SeeKinds(core);
    this.materials = new Materials(core, this.maps, this.seeKinds);
    this.geometries = new Geometries(core);
    this.lit = new Lights(core);
    this.lampShadows = new LampShadows(core);
    this.lit.lampSlot = (lamp) => this.lampShadows.slot(lamp);
    this.lit.lampTaking = () => this.lampShadows.taking;
    this.lightCache = new LightCache(core);
    this.levels = new Levels(core);
    this.frameLook = new FrameLook(core, this.maps);
    this.ahead = new Ahead(core, this.geometries, this.materials);
    this.lit.lampReach = this.lampShadows.reachOf = (lamp, reach) => this.lightCache.reachOf(lamp, reach);
    this.lit.ownReach = this.lampShadows.ownReachOf = (light) => this.lightCache.ownReach(light);
    this.lit.ownSlot = (light) => this.lampShadows.ownSlot(light);
    this.particles = new Sprites(core);
    this.draws = new Draws(core, this.materials, this.geometries, this.seeKinds);
    this.stage = new Stage(core, wasm, this.draws);
    this.bodies = new Bodies(core, this.draws);
    this.stats = core.stats;
    this.skipped = core.skipped;
    this.held = core.held;
  }

  /** What's kept of what was handed over forgotten: the next frame hands everything over again. */
  private forget(): void {
    this.bodies.forget();
    this.draws.forget();
    this.geometries.forget();
    this.maps.forget();
    this.materials.forget();
  }

  /**
   * A frame drawn and written down as a tape (`tape.ts`): everything handed over anew, its maps no larger than
   * `mostMap` a side, for the engine's own harness to draw with no browser. The engine keeps what was handed over
   * before and for the tape too (a harness's page, not a player's: nothing is dropped).
   */
  capture(width: number, height: number, mostMap: number, ...frame: Parameters<Bridge['draw']>): Blob {
    const core = this.core, engine = core.engine, tape = new Tape(width, height);
    core.engine = recording(engine, tape);
    core.tape = tape;
    core.mostMap = mostMap;
    this.forget();
    try {
      this.draw(...frame);
    } finally {
      core.engine = engine;
      core.tape = null;
      core.mostMap = MAX_MAP;
      this.forget();
    }
    return tape.blob();
  }

  /** `mesh`'s records in this frame alone (a lamp's casters, an outline). */
  private addMesh(mesh: Mesh): void {
    this.draws.recordNow(mesh);
  }

  /** The first `lamps` lamps' shadows asked for, of `casters` (`lampShadows.ts`): drawn a lamp a frame. */
  bakeLamps(casters: Mesh[], lamps: number): void {
    this.lampShadows.ask(casters, lamps);
    this.lightCache.ask(casters);
  }
  /** A harness's: the lamps in the engine's light cache and its last bake (`lightCache.ts`). */
  lightCacheNow(): ReturnType<LightCache['now']> { return this.lightCache.now(); }
  /** A harness's: how many lamps' shadows are drawn, and how many wait. */
  lampShadowsNow(): ReturnType<LampShadows['now']> { return this.lampShadows.now(); }
  /** A harness's: every lamp's shadow of what stands still asked again, drawn a lamp a frame (a canary's). */
  lampShadowsAgain(): void { this.lampShadows.again(); }
  /** A harness's: the last frame's point lights, a line each (`Lights.pointLines`). */
  pointLines(): string[] { return this.lit.pointLines(); }

  /** The page's shaders' names by the engine's ids for them. */
  shaderNames(): Map<number, string> { return this.materials.shaderNames(); }

  /** A harness's: whether a see-through material is drawn solid this frame, with what's opaque. */
  drawnSolid(material: Material): boolean { return (this.seeKinds.flagsOf(material) & SEE_FLAGS.solid) !== 0; }

  /** A harness's: a material's see-through flags this frame, as its records carry them (`SEE_FLAGS`). */
  seenFlags(material: Material): number { return this.seeKinds.flagsOf(material); }

  /** A harness's: how many kinds of see-through the engine holds, and how many of them thin anything this frame (a
   *  hole, a share of the whole, a door open). */
  seeKindsNow(): { held: number; thinning: number } { return this.seeKinds.now(); }

  /** A harness's: how many point lights the last frame was lit by (a place's own, the effects', the lamps'). */
  pointsNow(): number { return this.lit.points; }

  /** A harness's: the shelter as the last frame had it (its box's least x and z and its most, the sky's share under
   *  it, its walls' tops). */
  shelterNow(): number[] { return this.lit.shelterNow(); }

  /** The lights the last frame was drawn under, as the globals hold them: for a report. */
  lights(): string { return this.lit.report(); }

  /** The lamps' and the places' casting lights' shadows for the frame, drawn ahead of it. */
  private lampsAhead(camera: PerspectiveCamera): void {
    const add = (mesh: Mesh): void => this.addMesh(mesh);
    // (a lamp's shadow drawn ahead of the frame, whose own records are written over its casters')
    this.lampShadows.facesNow.still = this.lampShadows.facesNow.movers = 0;
    if (this.lightCache.step(add)) this.lampShadows.again();
    // (the shown place's own casting lights: asked again as the place, its lights or its props change)
    this.lampShadows.keepOwn(shownPlace(), shownPointLights(), AHEAD.propsRev, camera.position);
    this.lampShadows.step(add);
    // (only where the level reads the lamps' shadows at all: drawn at Very low, where nothing read them, the
    // movers' faces were 12 passes a frame for nothing, a phone's GPU split from 15% outside the frame to 48%)
    const moving = TUNE.lampShadows > 0 && TUNE.points && lampShadowsAllowed();
    this.lampShadows.moved(add, moving ? G.players.map((player) => player.obj) : []);
  }

  /** The frame's lights: the world's shown, the shown place's own (asked of the game), the lamps. */
  private lightsNow(): void {
    for (const light of this.stage.lights) {
      // (the rig's copies of the shown place's lights are its own: the place's are added after)
      if (!light.userData.rigged && this.stage.seen(light)) this.lit.add(light);
    }
    for (const light of shownPointLights()) this.lit.add(light);
    this.lit.addLamps();
  }

  /** A frame of `world` from `camera`, drawn by the engine. */
  draw(world: World, camera: PerspectiveCamera, time: number, _host: LookHost | null = null,
    grade: Grade = PLAIN_GRADE): void {
    const began = perfClock.now();
    const core = this.core, stats = core.stats;
    core.frame++;
    core.count = core.boneFloats = 0;
    core.skipped.clear();
    stats.newMeshes = stats.movedMeshes = stats.newTextures = stats.newMaterials = stats.arms = 0;
    this.stage.show(world);
    this.draws.begin({ camera, arms: grade.arms ?? null, grade });
    this.lit.begin();
    this.lampsAhead(camera);
    this.stage.place();
    const placed = perfClock.now();
    core.freshViews();
    core.globals.fill(0, GLOBALS.camPos, GLOBALS.floats);
    this.bodies.sync();
    this.draws.frame((node) => this.stage.seen(node));
    stats.solid = this.draws.solid;
    stats.casters = this.draws.casters;
    // (what the page outlines, its records again beside the frame's for the outline's mask alone)
    if (!core.tape) writeOutlined(core, (mesh) => this.draws.recordNow(mesh, true));
    if (this.watched) this.watch(this.watched);
    this.lightsNow();
    this.lightCache.tell();
    this.seeKinds.write();
    const clear = writeGlobals(core.globals, world, camera, time, this.lit, grade);
    this.levels.tell(grade, shadowSizeOf(this.lit.sun));
    this.frameLook.tell(grade);
    this.particles.send();
    core.freshViews();
    const written = perfClock.now();
    const records = core.records.subarray(0, core.count * RECORD);
    core.tape?.frame(records, core.bones.subarray(0, core.boneFloats), core.globals, clear);
    core.engine.render(TUNE.scene > 0 ? core.count : 0, core.boneFloats, clear[0], clear[1], clear[2]);
    const drawn = perfClock.now();
    const [draws, shadowDraws, objects, culled, triangles, gpuMs, gpuReads, gpuBusy, shadowTriangles, shadowsKept,
      lowDraws, lightsLeftOut, fieldKept, fieldCounted] = core.engine.stats();
    Object.assign(stats, {
      records: core.count + this.bodies.drawn().records, draws, shadowDraws, objects, culled, triangles, gpuMs,
      gpuReads, gpuBusy, shadowTriangles, shadowsKept, lowDraws, lightsLeftOut, fieldKept, fieldCounted,
      placeMs: placed - began, walkMs: written - placed, engineMs: drawn - written,
      lampFaces: this.lampShadows.facesNow.still, moverFaces: this.lampShadows.facesNow.movers,
    });
  }

  /** Every mesh drawn this frame added to `watched` (a harness's). */
  private watch(watched: Set<Node>): void {
    this.draws.eachDrawn((mesh) => {
      if (this.stage.seen(mesh)) watched.add(mesh);
    });
  }
}
