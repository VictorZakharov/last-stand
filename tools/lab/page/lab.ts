// tools/lab in the game's page: the clock, the input, the set-ups and the pictures, so a measure is a few lines run on
// the game's own modules. They are imported as the game imports them (one copy of each module, never a stale one)
// and typechecked with the game, so a renamed joint breaks the build rather than a probe's numbers.
//
// The game's frames run on the lab's clock: each a hair over a 60th of a second, run as fast as the page can, nothing
// drawn unless asked (measures need no pixels; the scene's matrices are still updated, as a draw would). A set-up is
// checked once it's made and throws if it didn't take. A measure of a state that never happened reads as clean: a
// probe that scripted the game before its run began twice reported no clips at full draw, because it never drew.
import * as THREE from 'three';
import { G } from '../../../src/state';
import { input } from '../../../src/core/input';
import { CAMERA } from '../../../src/data/balance';
import { clearEnemies } from '../../../src/entities/enemy';
import * as renderer from '../../../src/core/renderer';
import { updateSeeThrough } from '../../../src/core/seeThrough';
import { CLASSES } from '../../../src/data/classes';
import type { Joints } from '../../../src/entities/models/rig';

/**
 * The clock the session installs before the page's own scripts (`tools/lab/node/browser.mjs`). While its mode is
 * `manual`, the game's animation frames are queued for the lab to run instead of the browser.
 */
interface LabClock {
  mode: 'real' | 'manual';
  /** the time handed to the frames, ms (on the clock's grid, so the game's frame time is exact) */
  t: number;
  /** a frame's length, ms: a hair over a 60th of a second, a whole number of the grid's steps */
  frame: number;
  queue: FrameRequestCallback[];
}

declare global {
  interface Window {
    __labClock: LabClock;
    /** starts the page's seeded `Math.random` again (`tools/lab/node/browser.mjs`) */
    __labSeed: (seed: number) => void;
    __lab?: Lab;
  }
}

/** the seed each set-up starts the page's random numbers from */
const SETUP_SEED = 0x2545f491;
/** the seed each command starts them from */
const COMMAND_SEED = 0x1b873593;
/** the game's clock at a set-up on a page booted for it, s (the idle's sway runs on it): past any moment the run's
 *  start reaches (at 5 s it never applied: the start had taken the clock past it, by as many frames as it took) */
const SETUP_TIME = 60;
/** the frames a set-up stands still once the hero is on his spot */
const SETTLE_FRAMES = 90;

/** One frame's input, as a player would give it. */
export interface Frame {
  /** keys held down this frame (`w`, `1`...) */
  keys?: string[];
  /** the left and right mouse buttons held */
  m0?: boolean;
  m2?: boolean;
  /** a mouse-look move, px */
  look?: [number, number];
  /** the point in the world the mouse is over (the lab's `aim` when not given) */
  aim?: THREE.Vector3;
}

/** The state a measure or a picture starts from. */
export interface Fixture {
  /** where the hero stands, x and z (12, 22 by default: off the dais, clear of props) */
  at?: [number, number];
  /** the way he faces, rad (0 is +z) */
  facing?: number;
  /** the game's view: top-down (the default), over the shoulder, or through the eyes */
  view?: renderer.ViewMode;
  /** a bow's hero with an arrow on the string: he shoots one and waits out its reload, as he walks between shots */
  nocked?: boolean;
}

/** The pictures the lab can take: the game's own views, or a close-up from round the hero. */
export const VIEW_NAMES = ['lobby', 'top', 'third', 'eyes', 'front', 'left', 'right', 'back', 'above'] as const;
export type ViewName = (typeof VIEW_NAMES)[number];

/**
 * What a command or a probe may return to say what it found: its text, and the problems that fail the command (a
 * canary the measure missed, a state that never came). A probe may return plain text or JSON instead.
 */
export interface Report {
  text: string;
  problems: string[];
}

/** A close-up's camera: how far round from the hero's front (rad, positive to his left), and how high (m). */
interface CloseUp {
  turn: number;
  rise: number;
}

const CLOSE_UPS: Partial<Record<ViewName, CloseUp>> = {
  front: { turn: 0, rise: 0.25 },
  left: { turn: Math.PI / 2, rise: 0.25 },
  right: { turn: -Math.PI / 2, rise: 0.25 },
  back: { turn: Math.PI, rise: 0.25 },
  above: { turn: Math.PI + 0.35, rise: 1.6 },
};

/** a close-up's distance from the whole body, and from a joint it's focused on (m) */
const BODY_DISTANCE = 4.3;
const JOINT_DISTANCE = 1.7;
const CLOSE_UP_FOV = 30;
/** the top of the hat over the head joint, for the hero's height on screen (m) */
const ABOVE_HEAD = new THREE.Vector3(0, 0.3, 0);

/** One picture, as a PNG data URL. */
export interface Tile {
  view: ViewName;
  png: string;
  width: number;
  height: number;
}

export interface CaptureOptions {
  /** the joint a close-up is framed on (the whole body by default) */
  focus?: keyof Joints;
}

const SPOT: [number, number] = [12, 22];
/** the mouse is put this far ahead of the hero: a shot goes off into the distance, out of the pictures */
const AIM_AHEAD = 20;

/** A task boundary, so workers' messages and the page's own events get through (a timeout's is 4 ms). */
const nextTask = (() => {
  const channel = new MessageChannel();
  const waiting: (() => void)[] = [];
  channel.port1.onmessage = () => waiting.shift()?.();
  return () => new Promise<void>((resolve) => {
    waiting.push(resolve);
    channel.port2.postMessage(0);
  });
})();

/** The lab's hold on the game in this page. */
export class Lab {
  /** three.js as the game uses it, for probe modules */
  readonly THREE = THREE;
  /** the anatomy warnings the page logged, since the session last read them (its errors the session sees itself) */
  readonly warnings: string[] = [];
  /** draw each frame as the game does (off: only the scene's matrices are updated) */
  drawing = false;
  /** the point the mouse is over unless a frame says otherwise */
  aim = new THREE.Vector3();
  /** what every frame of the current set-up needs before its input (the foes kept away, the hero unhurt) */
  private keepUp: (() => void)[] = [];

  get player() {
    return G.player;
  }

  get model() {
    return G.player.model;
  }

  get joints(): Joints {
    return G.player.model.joints!;
  }

  /**
   * Readies the page for a command: the random numbers started again. A booted page waits for its command while the
   * textures made in workers land, and every three.js object made draws a random number for its id, so one command
   * in four started at another point of the sequence, and the haze and pollen spawned before its set-up (alive up to
   * 10 s) lay elsewhere in its pictures.
   */
  begin(): void {
    window.__labSeed(COMMAND_SEED);
  }

  /** The hero the page booted, and the heroes the game has: the session checks it booted the one it asked for. */
  heroes(): { hero: string; heroes: string[] } {
    return { hero: this.player.cls.id, heroes: Object.keys(CLASSES) };
  }

  /** Takes the game's clock over, makes its draws skippable, and starts keeping its anatomy warnings. */
  install(): void {
    const gl = G.renderer;
    const draw = gl.render.bind(gl);
    gl.render = (scene, camera) => {
      if (this.drawing) return draw(scene, camera);
      // (what a draw would have done that the game reads back: the world matrices)
      if (scene === G.scene) {
        scene.updateMatrixWorld();
        camera.updateMatrixWorld();
      }
    };
    const warn = console.warn.bind(console);
    console.warn = (...args: unknown[]) => {
      if (String(args[0]).includes('anatomy')) this.warnings.push(String(args[0]));
      warn(...args);
    };
    window.__labClock.mode = 'manual';
    // (one frame with the game held still, so its timer counts from a lab frame: the first frame after the reveal
    // was measured from the game's last frame in real time, a browser frame earlier on some boots, and each emitter's
    // accumulated time started that much apart, its bursts a frame early or late)
    const paused = G.paused;
    G.paused = true;
    this.runGameFrame();
    G.paused = paused;
    // (the game's clock from 0: the idle's sway runs on it, so a boot's first set-up is always at the same moment)
    G.time = 0;
    window.__lab = this;
  }

  /** Puts the mouse over a point in the world, as the player would. */
  pointAt(point: THREE.Vector3): void {
    const ndc = point.clone().project(G.camera);
    input.mouse.x = (ndc.x + 1) / 2 * innerWidth;
    input.mouse.y = (1 - ndc.y) / 2 * innerHeight;
    input.mouse.overUI = false;
  }

  /**
   * Runs `count` frames: each frame's input from `frame`, then the game's frame, then `measure` on the frame as it
   * would be drawn. Returns what `measure` returned, a row a frame.
   */
  async step<T = void>(count: number, frame?: (f: number) => Frame, measure?: (f: number) => T): Promise<T[]> {
    const rows: T[] = [];
    for (let f = 0; f < count; f++) {
      for (const keep of this.keepUp) keep();
      this.applyInput(frame?.(f) ?? {});
      this.runGameFrame();
      if (measure) rows.push(measure(f));
      if (this.yieldsBetweenFrames) await nextTask();
    }
    return rows;
  }

  /**
   * Runs frames until `done` is true (checked after each frame), at most `limit` of them. Throws, saying `what` failed,
   * if it never is. Returns how many frames it took.
   */
  async until(done: () => boolean, limit: number, what: string, frame?: (f: number) => Frame): Promise<number> {
    for (let f = 0; f < limit; f++) {
      await this.step(1, frame && (() => frame(f)));
      if (done()) return f + 1;
    }
    throw new Error(`lab: ${what} (not within ${limit} frames)`);
  }

  /**
   * Whether the page gets a turn between frames: only for a hero with a cape, which steps in a web worker whose
   * results arrive between tasks. Without one the frames run back to back and two runs are exactly the same (with a
   * turn after every frame, whatever landed in it landed between different frames, and runs parted by micrometres).
   */
  private get yieldsBetweenFrames(): boolean {
    return (this.model.worldObjects?.length ?? 0) > 0;
  }

  private runGameFrame(): void {
    const clock = window.__labClock;
    const callbacks = clock.queue;
    clock.queue = [];
    clock.t += clock.frame;
    for (const callback of callbacks) callback(clock.t);
  }

  private applyInput(frame: Frame): void {
    this.pointAt(frame.aim ?? this.aim);
    if (frame.look) renderer.lookBy(frame.look[0], frame.look[1]);
    const keys = frame.keys ?? [];
    for (const key of [...input.down]) {
      if (!keys.includes(key)) input.down.delete(key);
    }
    for (const key of keys) {
      if (!input.down.has(key)) input.pressed.add(key);
      input.down.add(key);
    }
    if (frame.m0 && !input.mouse.left) input.pressed.add('mouse0');
    if (frame.m2 && !input.mouse.right) input.pressed.add('mouse2');
    input.mouse.left = !!frame.m0;
    input.mouse.right = !!frame.m2;
  }

  /** Sets the run up as `fixture` says and checks that it took (throws if not). Returns what it is, for the report. */
  async setup(fixture: Fixture = {}): Promise<Record<string, unknown>> {
    await this.enterRun();
    this.keepUp = [holdTheWave, keepHeroWhole];
    await this.until(() => !this.player.casting && !this.player.channel, 400, 'the hero is still busy with a cast');
    await this.useView(fixture.view ?? 'top');
    const [x, z] = fixture.at ?? SPOT;
    const facing = fixture.facing ?? 0;
    const spot = new THREE.Vector3(x, 0, z);
    this.player.place(spot, facing);
    // (standing still: an older tree's `place` kept the velocity, and the hero glided on from his spot)
    this.player.vel.set(0, 0, 0);
    this.player.facing = facing;
    this.model.reset?.();
    this.aim = new THREE.Vector3(x + Math.sin(facing) * AIM_AHEAD, 0, z + Math.cos(facing) * AIM_AHEAD);
    // (the same moment and the same random numbers from here on, however long the run took to start: the clock is
    // only ever moved forward, so nothing the game stamped with it is left in the future)
    if (G.time < SETUP_TIME) G.time = SETUP_TIME;
    window.__labSeed(SETUP_SEED);
    // (standing a moment: what was still moving as the run started, the camera gliding in and the hero settling on
    // his spot, comes to rest, so it reaches the measure the same however many frames the start took)
    await this.step(SETTLE_FRAMES);
    if (fixture.nocked) await this.nockAnArrow();
    if (this.player.pos.distanceTo(spot) > 0.3) throw new Error('lab: the hero moved off his spot during the set-up');
    return {
      class: this.player.cls.id,
      view: renderer.viewMode(),
      at: [x, z],
      facing,
      nocked: this.player.nocked,
      time: Number(G.time.toFixed(2)),
    };
  }

  private async enterRun(): Promise<void> {
    if (G.mode === 'run') return;
    document.getElementById('btn-start')?.click();
    await this.until(() => G.mode === 'run' && !this.player.sandbox, 600, 'the run never started');
  }

  private async useView(view: renderer.ViewMode): Promise<void> {
    if (renderer.viewMode() !== view) {
      // (the glide between views cut to a frame: it isn't what's measured)
      const camera = CAMERA as { switchTime: number };
      const glide = camera.switchTime;
      camera.switchTime = 1e-4;
      renderer.setView(view);
      await this.step(3);
      camera.switchTime = glide;
    }
    if (renderer.viewMode() !== view || !renderer.viewSettled()) {
      throw new Error(`lab: the view is ${renderer.viewMode()}, not ${view}`);
    }
  }

  private async nockAnArrow(): Promise<void> {
    if (!this.player.cls.quiver) throw new Error(`lab: nocked: the ${this.player.cls.id} carries no quiver`);
    await this.step(6, () => ({ m0: true }));
    await this.until(() => !this.player.casting, 300, "the shot's reload never ended");
    if (this.player.nocked < 1) throw new Error('lab: nocked: no arrow on the string after a shot and its reload');
    await this.step(20);
    if (this.player.nocked < 1) throw new Error('lab: nocked: the arrow went back in the quiver at once');
  }

  /**
   * Throws, saying why, unless `capture` can take each of `views` (framed on `focus`) in the game's view `mode`: so a
   * command can check its pictures before it sets anything up.
   */
  checkCapture(views: string[], mode: renderer.ViewMode, focus?: string): asserts views is ViewName[] {
    const throughEyes = mode === 'first';
    for (const view of views) {
      if (!(VIEW_NAMES as readonly string[]).includes(view)) {
        throw new Error(`lab: no view ${view} (the views: ${VIEW_NAMES.join(', ')})`);
      }
      if (throughEyes && view !== 'eyes') throw new Error(`lab: ${view}: through the eyes only the arms are shown`);
      if (!throughEyes && view === 'eyes') throw new Error('lab: eyes: needs the view through the eyes (--view first)');
    }
    if (focus !== undefined && !this.jointNames().includes(focus)) {
      throw new Error(`lab: --focus ${focus}: no such joint (the joints: ${this.jointNames().join(', ')})`);
    }
  }

  /** The names of the hero's joints (`hips`, `handL`...). */
  jointNames(): string[] {
    const joints = this.joints as unknown as Record<string, unknown>;
    return Object.keys(joints).filter((name) => joints[name] instanceof THREE.Object3D);
  }

  /** Pictures of the game as it is now, nothing advanced; the game's camera is put back as it was. */
  capture(views: ViewName[], options: CaptureOptions = {}): Tile[] {
    this.checkCapture(views, renderer.viewMode(), options.focus);
    const restore = this.saveCamera();
    const drawing = this.drawing;
    this.drawing = true;
    try {
      return views.map((view) => {
        const tile = this.captureOne(view, options);
        restore();
        return tile;
      });
    } finally {
      this.drawing = drawing;
      restore();
    }
  }

  private captureOne(view: ViewName, options: CaptureOptions): Tile {
    const closeUp = CLOSE_UPS[view];
    let crop: Crop;
    if (closeUp) crop = this.aimCloseUp(closeUp, options.focus);
    else if (view === 'eyes') crop = wholeFrame();
    else crop = this.aimGameView(view);
    renderer.render();
    return cropCanvas(G.renderer.domElement, crop, view);
  }

  /** the game's camera set for a close-up; the crop is the frame's middle */
  private aimCloseUp(closeUp: CloseUp, focus?: keyof Joints): Crop {
    const camera = G.camera;
    const target = (focus ? this.joints[focus] : this.joints.hips) as THREE.Object3D;
    const centre = target.getWorldPosition(new THREE.Vector3());
    const distance = focus ? JOINT_DISTANCE : BODY_DISTANCE;
    const angle = this.player.facing + closeUp.turn;
    camera.position.set(
      centre.x + Math.sin(angle) * distance,
      centre.y + closeUp.rise * distance / BODY_DISTANCE,
      centre.z + Math.cos(angle) * distance,
    );
    camera.fov = CLOSE_UP_FOV;
    camera.near = 0.05;
    camera.updateProjectionMatrix();
    camera.lookAt(centre);
    camera.updateMatrixWorld();
    // (the props stand whole: their dissolve round the hero is the over-the-shoulder view's)
    updateSeeThrough(centre.x, centre.y, centre.z, 0);
    return { centreX: innerWidth / 2, centreY: innerHeight / 2, width: innerHeight * 0.6, height: innerHeight };
  }

  /** the game's camera in one of its own views; the crop is round the hero, as large as the player sees him */
  private aimGameView(view: ViewName): Crop {
    renderer.setView(view === 'third' ? 'third' : 'top');
    if (view !== 'third') renderer.setZoom(view === 'lobby' ? CAMERA.lobbyZoom : 1);
    // (a long step: every glide and ease of the camera at its end)
    for (let i = 0; i < 3; i++) renderer.updateCamera(10, this.player.pos, this.model.height);
    const camera = G.camera;
    camera.updateMatrixWorld();
    const hips = this.joints.hips.getWorldPosition(new THREE.Vector3()).project(camera);
    const headTop = this.joints.head.getWorldPosition(new THREE.Vector3()).add(ABOVE_HEAD);
    const top = headTop.project(camera);
    const foot = this.player.pos.clone().project(camera);
    const heroHeight = Math.abs(top.y - foot.y) / 2 * innerHeight;
    const height = THREE.MathUtils.clamp(heroHeight * 1.5, 160, innerHeight);
    return {
      centreX: (hips.x + 1) / 2 * innerWidth,
      centreY: (1 - hips.y) / 2 * innerHeight,
      width: height * 0.6,
      height,
    };
  }

  /** The game's camera and its rig as they are now, and a function that puts them back. */
  private saveCamera(): () => void {
    const camera = G.camera;
    const position = camera.position.clone();
    const quaternion = camera.quaternion.clone();
    const { fov, near } = camera;
    const view = renderer.viewMode();
    // (`saveCamera` restores the rig exactly; a tree without it goes back to its view at zoom 1, as a run starts)
    const restoreRig = (renderer as { saveCamera?: () => () => void }).saveCamera?.();
    return () => {
      if (restoreRig) {
        restoreRig();
      } else {
        renderer.setView(view);
        renderer.setZoom(1);
        for (let i = 0; i < 3; i++) renderer.updateCamera(10, this.player.pos, this.model.height);
      }
      // (an update with no time passing: the camera and the props' dissolve back as the rig has them)
      renderer.updateCamera(0, this.player.pos, this.model.height);
      camera.position.copy(position);
      camera.quaternion.copy(quaternion);
      camera.fov = fov;
      camera.near = near;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
    };
  }
}

/** a region of the frame to keep, px */
interface Crop {
  centreX: number;
  centreY: number;
  width: number;
  height: number;
}

function wholeFrame(): Crop {
  return { centreX: innerWidth / 2, centreY: innerHeight / 2, width: innerWidth, height: innerHeight };
}

/** The region of the canvas just drawn, as a PNG (read in the same task as the draw, before the browser shows it). */
function cropCanvas(source: HTMLCanvasElement, crop: Crop, view: ViewName): Tile {
  const width = Math.round(Math.min(crop.width, innerWidth));
  const height = Math.round(Math.min(crop.height, innerHeight));
  const left = Math.round(THREE.MathUtils.clamp(crop.centreX - width / 2, 0, innerWidth - width));
  const top = Math.round(THREE.MathUtils.clamp(crop.centreY - height / 2, 0, innerHeight - height));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(source, left, top, width, height, 0, 0, width, height);
  return { view, png: canvas.toDataURL('image/png'), width, height };
}

/**
 * The run held in its countdown before the first wave: no foes and none coming, so a set-up's state is the hero's
 * alone. (Foes parked far off still thought, drew random numbers and turned the hero's head towards them.)
 */
function holdTheWave(): void {
  const run = G.run;
  if (!run) return;
  if (G.enemies.length) clearEnemies();
  run.queue = [];
  run.phase = 'countdown';
  run.timer = Infinity;
}

function keepHeroWhole(): void {
  G.player.life = G.player.stats.maxLife;
}

/** The session's entry: the lab installed on this page. */
export function install(): Lab {
  const lab = new Lab();
  lab.install();
  return lab;
}
