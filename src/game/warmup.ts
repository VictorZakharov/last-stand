// Load-time shader warm-up: briefly creates one of everything that brings its own
// materials (enemies, effects, loot, skill visuals), compiles their shaders, then
// clears it all again. With core/shaders.ts pinning programs, nothing compiles mid-fight.
import * as THREE from 'three';
import { G } from '../state';
import { warmUp } from '../core/shaders';
import { sceneTarget } from '../core/renderer';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { SLOTS } from '../data/items';
import { SKILL_IMPLS } from '../combat/skills/index';
import { CLASSES } from '../data/classes/index';
import { buildModel } from '../entities/models/index';
import { spawnEnemy } from '../entities/spawner';
import { clearEnemies } from '../entities/enemy';
import { makeItem } from '../loot/items';
import { dropItem, clearDrops } from '../loot/drops';
import { clearEffects, shockwave, groundFlash, decal, telegraph, lightning, iceSpikes, glyphMarker, lightPillar, crackDecal, crystalBurst } from '../fx/effects';
import { clearLights } from '../fx/lights';
import { particles } from '../fx/particles';

export async function warmShaders(): Promise<void> {
  const at = new THREE.Vector3(), p = { x: 0, z: 0 };
  for (const id of Object.keys(ENEMIES) as EnemyId[]) { spawnEnemy(id, at); spawnEnemy(id, at, { hero: true }); }
  for (const rarity of ['common', 'rare'] as const) dropItem(makeItem({ slot: SLOTS[0], rarity }), at);
  shockwave(p); groundFlash(p); decal(p); decal(p, { type: 'frost' }); telegraph(p, 2, 1);
  lightning(at, new THREE.Vector3(1, 1, 1)); iceSpikes(p, 2); glyphMarker(p); lightPillar(p); crackDecal(p); crystalBurst(p);
  const extra = Object.values(SKILL_IMPLS).flatMap((s) => s.warm?.() ?? []);
  // every other class's model, so picking a class in the lobby compiles nothing
  const heroes = Object.values(CLASSES).filter((c) => c.model !== G.player.cls.model).map((c) => buildModel(c.model));
  for (const m of heroes) extra.push(m.root, ...(m.worldObjects ?? []));

  await warmUp(G.renderer, G.scene, G.camera, sceneTarget(), extra);
  for (const m of heroes) m.dispose();

  clearEnemies(); clearDrops(); clearEffects(); clearLights(); particles.clear();
}
