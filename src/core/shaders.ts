// Shader program lifetime. three.js deletes a compiled program as soon as the last
// material using it is disposed. Spell and enemy materials are short-lived, so every
// cast or wave recompiled its shaders: a 10-30 ms hitch, worse on ANGLE / Metal.
// The set of distinct programs is small and bounded, so we keep all of them for the
// whole session, and compile the known ones up front (warmUp) before the first frame.
import type * as THREE from 'three';

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
    if (loaded) lateCompiles.push(`${p.name} ${context?.() ?? ''} | ${describeNew(p.name, key)}`);
    known.push({ name: p.name, key });
  }
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

let atLoad = 0;
/** Call once loading is done; later compiles are counted as in-game hitches. */
export function markLoaded(): void { atLoad = compiled; loaded = true; }
/** Shader programs compiled since loading finished (each one was a frame hitch). */
export const programsCompiledInGame = (): number => compiled - atLoad;

/**
 * Compile every shader the scene (plus `objects`, added temporarily) needs, and keep them.
 * This is a real render, not renderer.compile(): programs differ between the screen and
 * a render target (tone mapping, output colour space), the game always draws into the
 * post-processing `target`, and compile() skips the shadow-map depth shaders.
 */
export function warmUp(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, target: THREE.WebGLRenderTarget, objects: THREE.Object3D[] = []): void {
  for (const o of objects) scene.add(o);
  const unculled: THREE.Object3D[] = [];
  scene.traverse((o) => { if (o.frustumCulled) { o.frustumCulled = false; unculled.push(o); } });
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  renderer.setRenderTarget(prev);
  for (const o of unculled) o.frustumCulled = true;
  pinPrograms(renderer);
  for (const o of objects) scene.remove(o);
}
