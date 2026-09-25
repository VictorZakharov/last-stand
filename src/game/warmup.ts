// Load-time shader warm-up: briefly creates one of everything that brings its own
// materials (enemies, effects, loot, skill visuals), compiles their shaders, then
// clears it all again. With core/shaders.ts pinning programs, nothing compiles mid-fight.
import * as THREE from 'three';
import { G } from '../state';
import { warmUp } from '../core/shaders';
import { sceneTarget } from '../core/renderer';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { SKILL_IMPLS } from '../combat/skills/index';
import { CLASSES } from '../data/classes/index';
import { buildModel } from '../entities/models/index';
import { spawnEnemy } from '../entities/spawner';
import { clearEnemies } from '../entities/enemy';
import { clearEffects, shockwave, groundFlash, decal, telegraph, lightning, iceSpikes, glyphMarker, lightPillar, crackDecal, crystalBurst } from '../fx/effects';
import { clearLights } from '../fx/lights';
import { particles } from '../fx/particles';
import { coreSamples } from '../combat/projectiles';

export async function warmShaders(): Promise<void> {
  const at = new THREE.Vector3(), p = { x: 0, z: 0 };
  // a few enemies at a time, letting the page paint in between (a window moved to another monitor
  // stays black while the main thread is busy)
  for (const [i, id] of (Object.keys(ENEMIES) as EnemyId[]).entries()) {
    if (i % 3 === 0) await new Promise((r) => setTimeout(r));
    spawnEnemy(id, at); spawnEnemy(id, at, { hero: true });
  }
  await new Promise((r) => setTimeout(r));
  shockwave(p); groundFlash(p); decal(p); decal(p, { type: 'frost' }); telegraph(p, 2, 1);
  lightning(at, new THREE.Vector3(1, 1, 1)); iceSpikes(p, 2); glyphMarker(p); lightPillar(p); crackDecal(p); crystalBurst(p);
  const extra: THREE.Object3D[] = [...coreSamples(), ...Object.values(SKILL_IMPLS).flatMap((s) => s.warm?.() ?? [])];
  // every other class's model, so picking a class in the lobby compiles nothing
  await new Promise((r) => setTimeout(r));
  const heroes = Object.values(CLASSES).filter((c) => c.model !== G.player.cls.model).map((c) => buildModel(c.model));
  for (const m of heroes) extra.push(m.root, ...(m.worldObjects ?? []));

  await warmUp(G.renderer, G.scene, G.camera, sceneTarget(), extra);
  for (const m of heroes) m.dispose();

  clearEnemies(); clearEffects(); clearLights(); particles.clear();
}
