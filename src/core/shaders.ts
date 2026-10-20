// Shader program lifetime. three.js deletes a compiled program as soon as the last
// material using it is disposed. Spell and enemy materials are short-lived, so every
// cast or wave recompiled its shaders: a 10-30 ms hitch, worse on ANGLE / Metal.
// The set of distinct programs is small and bounded, so we keep all of them for the
// whole session, and compile the known ones up front (warmUp) before the first frame.
import type * as THREE from 'three';
import { G } from '../state';
import { CROWD_LAYER, WARM_LAYER } from './layers';

const pinned = new WeakSet<object>();
const known: { name: string; key: string[] }[] = [];
let compiled = 0, loaded = false;
/** Programs compiled after loading, described for the perf report (what differs from the nearest known one). */
export const lateCompiles: string[] = [];

/** Take one extra reference on every program not seen yet, so it is never released. */
export function pinPrograms(renderer: THREE.WebGLRenderer, context?: () => string): void {
  for (const p of renderer.info.programs ?? []) {
    if (pinned.has(p)) continue;
    pinned.add(p);
    p.usedTimes++;
    compiled++;
    const key = p.cacheKey.split(',');
    // (an unnamed material's program by its kind: three's shader for it, `depth` a shadow caster's)
    const kind = p.name || key[0];
    // (a warm-up's after loading, the heroes' made when needed, isn't late: nothing was drawn waiting for it)
    if (loaded && behind) atLoad++;
    else if (loaded) lateCompiles.push(`${ownerOf(renderer, p)} (${kind}) ${context?.() ?? ''} | ${describeNew(p.name, key)}`);
    known.push({ name: p.name, key });
  }
}

/** Which scene object renders with program `p` (for the report): material type and object path. */
function ownerOf(renderer: THREE.WebGLRenderer, p: THREE.WebGLProgram): string {
  let found = 'unknown owner (shadow / post pass?)';
  G.scene.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
      if ((renderer.properties.get(m) as { currentProgram?: unknown }).currentProgram !== p) continue;
      const path: string[] = [];
      for (let a: THREE.Object3D | null = o; a && a !== G.scene; a = a.parent) path.unshift(a.name || a.type);
      found = `${m.type}${m.name ? ` "${m.name}"` : ''} on ${path.join(' > ')}`;
    }
  });
  return found;
}

/**
 * Shadows' programs made the same whatever order the casters are drawn in. three's shadow pass draws every caster
 * that tests no alpha with one depth material, and copies the caster's `map` onto it each draw, but builds a new
 * program for it only when the instancing, the instance colours or the skinning change from one draw to the next: a
 * textured caster drawn just after such a change made a program with a map, one without it otherwise. Which ones the
 * boot compiled hung on the order its warm-up drew in, and a new order mid-fight compiled one more (#243: the forest's
 * wood rubble, after its trees cast from shadow copies of their own). The map does nothing there (a caster that tests
 * alpha gets a depth material of its own, which keeps it), so it's let go before each such draw.
 */
export function steadyShadowPrograms(renderer: THREE.WebGLRenderer): void {
  const draw = renderer.renderBufferDirect.bind(renderer);
  renderer.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
    // (a shadow pass's draw: three gives it no scene)
    const depth = material as THREE.MeshDepthMaterial;
    if (scene === null && depth.isMeshDepthMaterial && !(depth.alphaTest > 0)) {
      depth.map = null;
      depth.alphaMap = null;
    }
    draw(camera, scene, geometry, material, object, group);
  };
}

/** A program as three made it, for the lab (`lab programs`): the loading step showing as it was made, whether
 *  `compile()` made it (the warm-ups' compile) or a draw, the material's type and what it was made for (its
 *  material and object, as `ownerOf` says it; three names a program after its material's name alone), the draws
 *  that used it since, and what uses it: the scene's top-level object (by name, else type) of each object compiled
 *  or drawn with it, so a program the foes alone use is told from one the lobby shares. Its shaders' GLSL as three
 *  gave it, which three's own program drops once linked (what `lab programs --cost` compiles again). */
export interface ProgramMade {
  program: THREE.WebGLProgram; step: string; byCompile: boolean; type: string; owner: string; draws: number;
  users: Set<string>; vertex: string; fragment: string;
}
/** Every program made since `watchPrograms`, in dev builds (nothing in a production build records them). */
export const programsMade: ProgramMade[] = [];

/** whether the warm-up behind the lobby is on (game/warmup.ts warmTheRest): its programs are the boot's */
let behind = false;
export function behindTheLobby(on: boolean): void { behind = on; }

/** The loading screen's step, or after it. */
const stepShowing = (): string => {
  if (behind) return 'behind the lobby';
  const loading = document.getElementById('loading');
  return !loading || loading.classList.contains('done') ? 'after the reveal' : loading.querySelector('.ld-sub')?.textContent ?? '?';
};

/** `material` on `object` as the ledger says it: its type, its name and the object's path. */
function madeFor(material: THREE.Material, object: THREE.Object3D): string {
  const path: string[] = [];
  for (let a: THREE.Object3D | null = object; a?.parent; a = a.parent) path.unshift(a.name || a.type);
  return `${material.type}${material.name ? ` "${material.name}"` : ''} on ${path.join(' > ') || object.type}`;
}

/** The scene's top-level object `object` is under (itself, if it's one), by name, else its type. */
function topOf(object: THREE.Object3D): string {
  let top = object;
  while (top.parent?.parent) top = top.parent;
  return top.name || top.type;
}

/** Names what `compile()` made each of `made` for (the first material in `scene`, and its object, using it), and
 *  adds every object it compiled to the users of its program, new or not (`byProgram`). */
function ownCompiled(renderer: THREE.WebGLRenderer, scene: THREE.Object3D, made: ProgramMade[], byProgram: Map<object, ProgramMade>): void {
  const waiting = new Map<object, ProgramMade>(made.map((entry) => [entry.program, entry]));
  scene.traverse((object) => {
    const mats = (object as THREE.Mesh).material;
    for (const material of Array.isArray(mats) ? mats : mats ? [mats] : []) {
      const program = (renderer.properties.get(material) as { currentProgram?: object }).currentProgram;
      if (program) byProgram.get(program)?.users.add(topOf(object));
      const entry = program && waiting.get(program);
      if (!entry) continue;
      entry.type = material.type;
      entry.owner = madeFor(material, object);
      waiting.delete(program!);
    }
  });
}

/** Records each program three makes and each draw that uses it (`programsMade`), in dev builds: the boot's programs
 *  are made before any lab command can watch. */
export function watchPrograms(renderer: THREE.WebGLRenderer): void {
  if (!import.meta.env.DEV) return;
  let compiling = false;
  let drawing: { material: THREE.Material; object: THREE.Object3D } | null = null;
  const byProgram = new Map<object, ProgramMade>();
  const compile = renderer.compile.bind(renderer);
  renderer.compile = (scene, camera, targetScene = null) => {
    const before = programsMade.length;
    compiling = true;
    try { return compile(scene, camera, targetScene); } finally {
      compiling = false;
      ownCompiled(renderer, scene, programsMade.slice(before), byProgram);
    }
  };
  const gl = renderer.getContext();
  const sources = new WeakMap<WebGLShader, string>();
  const shaderSource = gl.shaderSource.bind(gl);
  gl.shaderSource = (shader, source) => { sources.set(shader, source); shaderSource(shader, source); };
  const sourceOf = (shader: unknown): string => sources.get(shader as WebGLShader) ?? '';
  const programs = renderer.info.programs!;
  const push = programs.push.bind(programs);
  programs.push = (...made: THREE.WebGLProgram[]) => {
    for (const program of made) {
      const type = drawing?.material.type ?? '?';
      const owner = drawing ? madeFor(drawing.material, drawing.object) : '?';
      const { vertexShader, fragmentShader } = program as unknown as { vertexShader: unknown; fragmentShader: unknown };
      const entry = {
        program, step: stepShowing(), byCompile: compiling, type, owner, draws: 0, users: new Set<string>(),
        vertex: sourceOf(vertexShader), fragment: sourceOf(fragmentShader),
      };
      programsMade.push(entry);
      byProgram.set(program, entry);
    }
    return push(...made);
  };
  const draw = renderer.renderBufferDirect.bind(renderer);
  renderer.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
    drawing = { material, object };
    try { draw(camera, scene, geometry, material, object, group); } finally { drawing = null; }
    const used = (renderer.properties.get(material) as { currentProgram?: object }).currentProgram;
    const entry = used && byProgram.get(used);
    if (!entry) return;
    entry.draws++;
    entry.users.add(topOf(object));
  };
}

/** Field-level diff against the closest known program of the same kind. */
function describeNew(name: string, key: string[]): string {
  let best: string[] | null = null, bestD = Infinity;
  for (const k of known) {
    if (k.name !== name || k.key.length !== key.length) continue;
    let d = 0;
    for (let i = 0; i < key.length; i++) if (key[i] !== k.key[i]) d++;
    if (d < bestD) { bestD = d; best = k.key; }
  }
  if (!best) return `no similar program; key starts ${key.slice(0, 3).join(',').slice(0, 80)}`;
  return key.map((v, i) => (v !== best![i] ? `[${i}] ${best![i].slice(0, 30)} -> ${v.slice(0, 30)}` : '')).filter(Boolean).join('; ');
}

/** Logs every program that failed to link, where three checked none as it was first used (production builds: its
 *  checks held the boot up, `initRenderer`), once the game is shown and the programs are long linked. */
export function checkPrograms(renderer: THREE.WebGLRenderer): void {
  if (renderer.debug.checkShaderErrors) return;
  const gl = renderer.getContext();
  for (const p of renderer.info.programs ?? []) {
    const program = (p as unknown as { program: WebGLProgram }).program;
    if (gl.getProgramParameter(program, gl.LINK_STATUS)) continue;
    console.error(`THREE.WebGLProgram: shader error (${p.name || p.cacheKey.slice(0, 60)})`, gl.getProgramInfoLog(program));
  }
}

let atLoad = 0;
/** Call once loading is done; later compiles are counted as in-game hitches. */
export function markLoaded(): void { atLoad = compiled; loaded = true; }
/** Shader programs compiled since loading finished (each one was a frame hitch). */
export const programsCompiledInGame = (): number => compiled - atLoad;

/** What `compile` gives back: the materials of the scene it made programs for. */
type Compiled = Set<THREE.Material>;
/** a program as three keeps it, with what its type leaves out */
type Program = THREE.WebGLProgram & { isReady(): boolean; getAttributes(): unknown };

/** the most of a frame the textures' uploads take before the page is let paint (ms): under the loading screen, and
 *  behind the lobby (a frame at 144 Hz is 7 ms, the lobby's own 5 of it) */
const UPLOAD_SLICE_MS = 25, UPLOAD_SLICE_BEHIND_MS = 2;

/**
 * `compile` run with the crowds' bodies' own meshes left out (put back after, where they were): their crowd draws
 * them (models/crowd.ts), their own materials never are, and three's compile makes a program for every mesh of
 * the scene whatever its layer (17 lit programs compiled for nothing, `lab programs`).
 */
function withoutCrowdBodies(root: THREE.Object3D, compile: () => Compiled): Compiled {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => { if (o.layers.mask === 1 << CROWD_LAYER && o.parent) out.push(o); });
  return without(out, compile);
}

/** The textures `materials` draw with (a render target's left out: drawn into, not uploaded). */
function texturesOf(materials: Compiled): Set<THREE.Texture> {
  const textures = new Set<THREE.Texture>();
  const add = (value: unknown): void => {
    const texture = value as THREE.Texture | null;
    if (texture?.isTexture && !(texture as THREE.Texture & { isRenderTargetTexture?: boolean }).isRenderTargetTexture) textures.add(texture);
  };
  for (const material of materials) {
    for (const value of Object.values(material)) add(value);
    for (const uniform of Object.values((material as THREE.ShaderMaterial).uniforms ?? {})) add(uniform?.value);
  }
  return textures;
}

/** a step of a warm-up waited for: the next task, or behind the lobby the frame after the next (`WarmUp.step`) */
type Step = () => Promise<void>;
const nextTask: Step = () => new Promise((r) => setTimeout(r));

/**
 * Every one of `textures` uploaded, the page let paint between (`step`, after `sliceMs` of them): the render after
 * a warm-up's compile uploaded them as it drew, queued on the GPU's process ahead of what the render then waited on.
 */
async function uploaded(renderer: THREE.WebGLRenderer, textures: Set<THREE.Texture>, sliceMs: number, step: Step): Promise<void> {
  let slice = performance.now();
  for (const texture of textures) {
    renderer.initTexture(texture);
    if (performance.now() - slice < sliceMs) continue;
    await step();
    slice = performance.now();
  }
}

/**
 * Resolves once the GPU's process has done every command sent before: a fence, whose status WebGL reads between
 * tasks without a round trip, so a program asked whether it's linked after it doesn't wait behind them (a return's
 * fight warmed behind the lobby held it up 250 ms at a time asking, its programs read back from the cache meanwhile).
 * Asked every `poll`.
 */
async function commandsDone(renderer: THREE.WebGLRenderer, poll: Step): Promise<void> {
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  if (!fence) return;
  gl.flush();
  while (gl.getSyncParameter(fence, gl.SYNC_STATUS) !== gl.SIGNALED) await poll();
  gl.deleteSync(fence);
}

/** How `linked` waits: told how far along, asking every `poll`, a frame between each program's uniforms read
 *  (`step`, behind the lobby), and given up on after `giveUpMs` for one program. */
interface Linking { done?: (share: number) => void; poll: Step; step?: Step; giveUpMs?: number }

/**
 * Waits for `materials`' programs to link (on the GPU's process meanwhile, KHR_parallel_shader_compile), each asked
 * once it's the oldest left (a read of a query's result, no round trip), and a linked one's uniforms and attributes
 * read at once (one round trip, behind the lobby one a frame). three's compileAsync asked every material's program
 * each time, and their first draws read them: each a round trip to the GPU's process, waiting behind its work.
 * Whether they all linked: false where one wasn't `giveUpMs` after the commands were done (not from the GPU's cache).
 */
async function linked(renderer: THREE.WebGLRenderer, materials: Compiled, how: Linking): Promise<boolean> {
  await commandsDone(renderer, how.poll);
  const programs = new Set<Program>();
  for (const material of materials) {
    const program = (renderer.properties.get(material) as { currentProgram?: Program }).currentProgram;
    if (program) programs.add(program);
  }
  let linkedSoFar = 0;
  for (const program of programs) {
    const asked = performance.now();
    while (!program.isReady()) {
      if (how.giveUpMs !== undefined && performance.now() - asked > how.giveUpMs) return false;
      await how.poll();
    }
    program.getUniforms();
    program.getAttributes();
    how.done?.(++linkedSoFar / programs.size);
    await how.step?.();
  }
  return true;
}

/** How a warm-up goes (`warmUp`). */
export interface WarmUp {
  /** added to the scene for the draw alone, and taken away after (compiled with the scene where `compile` is left
   *  out): the lobby's frames mustn't draw what isn't linked yet, as three would link it there, the frame waiting */
  objects?: THREE.Object3D[];
  /** what's compiled, as the scene lights it (a part of the fight, behind the lobby: the lobby's own are warm);
   *  left out, the whole scene and `objects` */
  compile?: THREE.Object3D[];
  /** left out of it: what the lobby doesn't show (the other biomes), warmed behind it */
  leaveOut?: THREE.Object3D[];
  /** drawn alone, whatever the camera sees, on the warm-ups' layer (every light is on it too: their counts are the
   *  scene's, `lightThePasses` in renderer.ts), into a pixel of the target: the programs the draws make are the
   *  scene's, and its fragments none (a whole lobby drawn again for each part held its frames up); left out, the
   *  whole scene unculled */
  drawn?: THREE.Object3D[];
  /** shown in place of `hide` for the draw alone (a biome the lobby doesn't show, for its shadows' programs, made as
   *  they're drawn: one in place of the other, so the lights counted are as many) */
  swap?: { show: THREE.Object3D; hide: THREE.Object3D };
  /** called just before the draw: what the lobby's frames mustn't draw before its programs are linked brought in (a
   *  foe seated in its crowd, which draws it whatever the camera sees) */
  show?: () => void;
  /** awaited before the uploads, given the textures the compiled materials draw with (their maps, still coming) */
  before?: (textures: Set<THREE.Texture>) => Promise<void>;
  /** told how much of the warm-up is done, 0 to 1 (the share each step takes is a guess: the links, most) */
  progress?: (share: number) => void;
  /** awaited between its steps (each root's compile, a slice of uploads, each program's uniforms read, the draw):
   *  behind the lobby, a frame each; left out, they run back to back, the loading screen's way */
  step?: Step;
  /** given up on, nothing drawn (`cold`), where a program isn't linked this long after its commands were done (ms):
   *  one not from the GPU's cache, behind the lobby (compiled cold behind it, a return's lobby drew 3 frames a second) */
  giveUpMs?: number;
}

/** of a warm-up (`progress`), the share done once its maps have come, its textures uploaded, its programs linked */
const MAPS_DONE = 0.2, UPLOADS_DONE = 0.3, LINKS_DONE = 0.95;

/** What a warm-up took (ms): its compile and its draw (each one task, the compile a task a root with `step`), its
 *  wait for the maps it draws with (`WarmUp.before`) and their uploads, and the wait for its programs' links (the
 *  GPU's process's work: long where no program came from a cache, a first visit's); and whether it was given up on
 *  as cold (`WarmUp.giveUpMs`: nothing drawn). */
export interface WarmedUp { compileMs: number; mapsMs: number; uploadsMs: number; linksMs: number; drawMs: number; cold: boolean }

/** `run` with `out` taken out of their parents' lists (put back after, where they were): nothing else sees them go. */
function without<T>(out: THREE.Object3D[], run: () => T): T {
  const places = out.filter((o) => o.parent).map((o) => ({ parent: o.parent!, at: o.parent!.children.indexOf(o), o }));
  for (const { parent, at } of [...places].sort((a, b) => b.at - a.at)) parent.children.splice(at, 1);
  try {
    return run();
  } finally {
    for (const { parent, at, o } of [...places].sort((a, b) => a.at - b.at)) parent.children.splice(at, 0, o);
  }
}

/**
 * `draw` with `drawn` alone drawn, whatever the camera sees: what of it the camera draws put on the warm-ups' layer
 * too (not a crowd's bodies' own meshes, which their crowd draws: on the warm-ups' layer, 14 lit programs were made
 * for them, cold inside the draw on a first visit, 4.5 s), unculled, the camera on that layer alone, into a pixel of
 * `target` (its scissor); with no `drawn`, the whole scene unculled.
 */
function drawnAlone(scene: THREE.Scene, camera: THREE.Camera, target: THREE.WebGLRenderTarget, drawn: THREE.Object3D[] | undefined, draw: () => void): void {
  const unculled: THREE.Object3D[] = [], layered: THREE.Object3D[] = [];
  const uncull = (o: THREE.Object3D): void => {
    if (o.frustumCulled) { o.frustumCulled = false; unculled.push(o); }
    if (drawn && o.layers.test(camera.layers) && !o.layers.isEnabled(WARM_LAYER)) {
      o.layers.enable(WARM_LAYER);
      layered.push(o);
    }
  };
  for (const root of drawn ?? [scene]) root.traverse(uncull);
  const mask = camera.layers.mask;
  const scissor = target.scissor.clone(), scissorTest = target.scissorTest;
  if (drawn) {
    camera.layers.set(WARM_LAYER);
    target.scissor.set(0, 0, 1, 1);
    target.scissorTest = true;
  }
  try {
    draw();
  } finally {
    camera.layers.mask = mask;
    target.scissor.copy(scissor);
    target.scissorTest = scissorTest;
    for (const o of unculled) o.frustumCulled = true;
    for (const o of layered) o.layers.disable(WARM_LAYER);
  }
}

/**
 * Compile every shader the scene (plus `objects`) needs, and keep them.
 * This is a real render, not renderer.compile(): programs differ between the screen and
 * a render target (tone mapping, output colour space), the game always draws into the
 * post-processing `target`, and compile() skips the shadow-map depth shaders. The render
 * waits for `before` too (the maps it uploads: compiling reads none of their pixels); the
 * maps are uploaded and the programs' links waited for first (`uploaded`, `linked`).
 */
export async function warmUp(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, target: THREE.WebGLRenderTarget, how: WarmUp = {}): Promise<WarmedUp> {
  const { objects = [], leaveOut = [], swap, before, progress, step } = how;
  const compiled = how.compile ?? [scene, ...objects];
  const prev = renderer.getRenderTarget();
  // compile in the background first where the browser can (KHR_parallel_shader_compile), so the
  // loading screen stays live; the target is set because program variants depend on it
  renderer.setRenderTarget(target);
  let compileMs = 0;
  const materials = new Set<THREE.Material>();
  for (const root of compiled) {
    const at = performance.now();
    const made = without(leaveOut, () => withoutCrowdBodies(root, () => renderer.compile(root, camera, scene)));
    compileMs += performance.now() - at;
    for (const material of made) materials.add(material);
    // (behind the lobby a root's programs a frame: each is brought in from the GPU's cache on its process's main
    // thread, which draws the lobby's frames too)
    if (step) {
      renderer.setRenderTarget(prev);
      await step();
      renderer.setRenderTarget(target);
    }
  }
  renderer.setRenderTarget(prev);
  const textures = texturesOf(materials);
  let at = performance.now();
  await before?.(textures);
  const mapsMs = performance.now() - at;
  progress?.(MAPS_DONE);
  at = performance.now();
  await uploaded(renderer, textures, step ? UPLOAD_SLICE_BEHIND_MS : UPLOAD_SLICE_MS, step ?? nextTask);
  const uploadsMs = performance.now() - at;
  progress?.(UPLOADS_DONE);
  at = performance.now();
  const links = (share: number): void => progress?.(UPLOADS_DONE + share * (LINKS_DONE - UPLOADS_DONE));
  const poll = step ?? ((): Promise<void> => new Promise((r) => setTimeout(r, 4)));
  const ready = await linked(renderer, materials, { done: links, poll, step, giveUpMs: how.giveUpMs });
  const linksMs = performance.now() - at;
  pinPrograms(renderer);
  if (!ready) return { compileMs, mapsMs, uploadsMs, linksMs, drawMs: 0, cold: true };
  await step?.();
  renderer.setRenderTarget(target);
  at = performance.now();
  for (const o of objects) scene.add(o);
  how.show?.();
  // once: the shadow pass of a render sees the light setup of the one before, and shadow depth
  // programs are keyed by light counts, but the compile above set the scene's lights up
  if (swap) { swap.show.visible = true; swap.hide.visible = false; }
  const drawn = how.drawn && [...how.drawn, ...objects, ...(swap ? [swap.show] : [])];
  drawnAlone(scene, camera, target, drawn, () => without(leaveOut, () => renderer.render(scene, camera)));
  if (swap) { swap.show.visible = false; swap.hide.visible = true; }
  const drawMs = performance.now() - at;
  renderer.setRenderTarget(prev);
  pinPrograms(renderer);
  for (const o of objects) scene.remove(o);
  progress?.(1);
  return { compileMs, mapsMs, uploadsMs, linksMs, drawMs, cold: false };
}
