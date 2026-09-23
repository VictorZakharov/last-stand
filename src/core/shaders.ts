// Shader program lifetime. three.js deletes a compiled program as soon as the last
// material using it is disposed. Spell and enemy materials are short-lived, so every
// cast or wave recompiled its shaders: a 10-30 ms hitch, worse on ANGLE / Metal.
// The set of distinct programs is small and bounded, so we keep all of them for the
// whole session, and compile the known ones up front (warmUp) before the first frame.
import type * as THREE from 'three';

const pinned = new WeakSet<object>();
let compiled = 0;

/** Take one extra reference on every program not seen yet, so it is never released. */
export function pinPrograms(renderer: THREE.WebGLRenderer): void {
  for (const p of renderer.info.programs ?? []) {
    if (pinned.has(p)) continue;
    pinned.add(p);
    p.usedTimes++;
    compiled++;
  }
}

let atLoad = 0;
/** Call once loading is done; later compiles are counted as in-game hitches. */
export function markLoaded(): void { atLoad = compiled; }
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
