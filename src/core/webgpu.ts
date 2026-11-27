// What's left of the game's WebGPU side beside the engine (VictorZakharov/last-stand#973: three left it): the
// places' point lights the engine is handed, and waiting for the engine's GPU work. three's renderer is gone: the
// engine (src/engine) draws the frame on the page's canvas (core/screen.ts).
// What the renderer's hooks here measured is docs/agents/webgpu.md's history.
import { Node, PointLight, World } from '../engine/api/index.ts';
import { PIPELINES, engineWorkDone } from '../engine/pipelinesAside';

/** `group`'s point lights, those casting shadows first (as the rig has them: `rigPointLights`). */
function pointLightsIn(group: Node): PointLight[] {
  const lights: PointLight[] = [];
  group.traverse((o) => { if ((o as PointLight).isPointLight) lights.push(o as PointLight); });
  return [...lights.filter((l) => l.castShadow), ...lights.filter((l) => !l.castShadow)];
}

/**
 * The biomes' and the hall of heroes' point lights, each place's kept for the engine to be handed the shown one's
 * (`shownPointLights`), its own hidden from the scene's walk. three's WebGPU renderer keyed every lit pipeline by its
 * lights' ids, so a rig of lights copied the shown place's in the scene's hook; the engine runs no hook, and the rig
 * is gone with three. Each place has as many lights as every other, as many casting (`arena.ts` checks). (`_scene` is
 * unread: the rig stood in it.)
 */
export function rigPointLights(_scene: World, groups: Node[]): void {
  for (const group of groups) rigMorePointLights(group);
}

/**
 * The shown place's own point lights (`rigPointLights`), which the scene's walk never meets, as they're hidden:
 * walking the scene for its lights, the engine found the rig's alone, as the last hook left them, and a house's
 * candles, hearth and chandelier lit nothing (`lab rust --village --room library`: "0 point lights").
 */
export function shownPointLights(): readonly PointLight[] {
  const shown = rigPlaces.groups.find((group) => group.visible);
  return (shown && rigPlaces.lightsOf.get(shown)) || NO_LIGHTS;
}
const NO_LIGHTS: readonly PointLight[] = [];

/** The place shown now, of those whose lights are kept (the Rust engine draws its lights' shadows of
 *  what stands still in it: engine/lampShadows.ts). */
export const shownPlace = (): Node | undefined => rigPlaces.groups.find((group) => group.visible);

/** the places whose lights are kept, each with its point lights (`rigPointLights`, `rigMorePointLights`) */
const rigPlaces = { groups: [] as Node[], lightsOf: new Map<Node, PointLight[]>() };

/** A place built after the others (a fight's biome, built at the run's start: world/arena.ts), its lights kept too. */
export function rigMorePointLights(group: Node): void {
  const lights = pointLightsIn(group);
  rigPlaces.lightsOf.set(group, lights);
  rigPlaces.groups.push(group);
  for (const light of lights) light.visible = false;
}

/** The engine's pipelines made so far, and those first asked for in play (`PIPELINES.late`): the profiler's count
 *  of what its parts made. */
export const pipelinesMade = (): { made: number; atDraw: number } => ({ made: PIPELINES.made, atDraw: PIPELINES.late });

/** Waits for the GPU to be done with every command sent so far: the engine's device's queue, which draws the game.
 *  (Its argument is the host's, which the lab still hands it: unread.) */
export async function gpuDone(_host?: unknown): Promise<void> {
  await engineWorkDone();
}
