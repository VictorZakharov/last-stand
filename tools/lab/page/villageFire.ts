// `lab village --only campfireBurns`: the village's campfire as the player meets it (from play, "we need better fire
// effects, more professional (lobby and main game, especially camp fire"), by night and by day, over the shoulder and
// from above: its picture from each, and how much of the frame its flames draw against the frame with them hidden, its
// flames found by their material; and what its own light adds to the frame by night (from play, "in our case, there is
// no light from fire, its a mistake"). `lab fire` reads the same flames in the biomes. `canary` hides them and puts its
// light out first.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { CAMPFIRE } from '../../../src/data/village';
import { holdHour } from '../../../src/game/clock';
import { faceCamera, viewMode, type ViewMode } from '../../../src/core/renderer';
import { groundHeight } from '../../../src/world/ground';
import { drawFrame, type Canvas } from './light';
import { changedShare, viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the hours and views read, how far before it he stands (m), the frames given to settle */
const HOURS = [0, 12];
const VIEWS: ViewMode[] = ['third', 'top'];
const BEFORE = 2.4;
/** how far to its side he stands (m): in line with it, he stood before it over the shoulder */
const ASIDE = 3;
const SETTLE = 60;
/** the least of the frame its flames must draw from each view (a share of its pixels) */
const LEAST_DRAWN = 0.0003;
/** a fire's own colour, how near it its light stands (m), and the least its light must add to the red of what it
 *  changes by night, levels of 255 on average: what it changed a little, over much of the frame, read as no light
 *  at all */
const FIRE_LIGHT_COLOUR = 0xff9a48;
const FIRE_LIGHT_NEAR = 2.5;
const LEAST_ADDED = 30;
/** a change of red too small to see (levels of 255) */
const LEAST_SEEN = 2;

/** The flames over the campfire: the shader with a box over its place. */
function campfireFlames(): THREE.Mesh {
  let found: THREE.Mesh | null = null;
  G.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    const uniforms = (mesh.material as THREE.ShaderMaterial | undefined)?.uniforms;
    if (!uniforms?.uPuff || !uniforms.uCentre) return;
    const centre = uniforms.uCentre.value as THREE.Vector3;
    if (Math.hypot(centre.x - CAMPFIRE[0], centre.z - CAMPFIRE[1]) < 0.5) found = mesh;
  });
  if (!found) throw new Error('lab: village: no flames over the campfire');
  return found;
}

/** What `lit` adds over `unlit` to the red of the pixels it changes, in levels of 255 on average. */
function redAdded(lit: Canvas, unlit: Canvas): number {
  let added = 0;
  let changed = 0;
  for (let at = 0; at < lit.pixels.length; at += 4) {
    // (a canvas's pixels run from 0 to 1)
    const red = (lit.pixels[at] - unlit.pixels[at]) * 255;
    if (red <= LEAST_SEEN) continue;
    added += red;
    changed++;
  }
  return changed ? added / changed : 0;
}

/** The campfire's own light: the point light of a fire's colour nearest it. */
function campfireLight(): THREE.PointLight {
  let found: THREE.PointLight | null = null;
  G.scene.traverse((object) => {
    const light = object as THREE.PointLight;
    if (!light.isPointLight || light.color.getHex() !== FIRE_LIGHT_COLOUR) return;
    if (Math.hypot(light.position.x - CAMPFIRE[0], light.position.z - CAMPFIRE[1]) < FIRE_LIGHT_NEAR) found = light;
  });
  if (!found) throw new Error('lab: village: no light over the campfire');
  return found;
}

/** The campfire at each hour from each view. */
export async function campfireBurns(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  const flames = campfireFlames();
  const light = campfireLight();
  const at = new THREE.Vector3(CAMPFIRE[0] + BEFORE, 0, CAMPFIRE[1] + ASIDE);
  at.y = groundHeight(at.x, at.z);
  G.player.walkTo = null;
  G.player.place(at, -Math.PI / 2);
  if (canary) {
    flames.visible = false;
    light.visible = false;
  }
  const said: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  try {
    for (const hour of HOURS) {
      holdHour(hour);
      for (const view of VIEWS) {
        await viewBy(lab, view);
        if (view !== 'top') faceCamera(Math.atan2(CAMPFIRE[0] - at.x, CAMPFIRE[1] - at.z));
        await lab.step(SETTLE);
        const shown = drawFrame(lab);
        const was = flames.visible;
        flames.visible = false;
        const hidden = drawFrame(lab);
        flames.visible = was;
        const drawn = changedShare(shown, hidden);
        if (hour === 0 && view === 'third') {
          const held = light.intensity;
          const stays = light.visible;
          light.intensity = 0;
          const unlit = drawFrame(lab);
          light.intensity = held;
          light.visible = stays;
          const share = changedShare(shown, unlit);
          const added = redAdded(shown, unlit);
          // (read off its matrix as three's lights read it: `getWorldPosition` would make it again first)
          const place = new THREE.Vector3().setFromMatrixPosition(light.matrixWorld);
          const off = Math.hypot(place.x - CAMPFIRE[0], place.z - CAMPFIRE[1]);
          if (off > FIRE_LIGHT_NEAR) problems.push(`the campfire's light stands ${off.toFixed(1)} m from it`);
          said.push(`its light ${held.toFixed(1)} cd at ${place.toArray().map((part) => part.toFixed(1))}, `
            + `${light.visible ? 'on' : 'off'}, changes ${(share * 100).toFixed(1)}%, adds ${added.toFixed(1)} of red`);
          if (added < LEAST_ADDED) problems.push(`the campfire's light adds ${added.toFixed(1)} of red by night`);
        }
        said.push(`${hour}:00 ${view} ${(drawn * 100).toFixed(2)}%`);
        if (drawn < LEAST_DRAWN) problems.push(`the campfire's flames drew nothing at ${hour}:00 ${view}`);
        moments.push(await lab.screen(`campfire ${hour}h ${view}`, []));
      }
    }
  } finally {
    flames.visible = true;
    holdHour(null);
    await viewBy(lab, kept);
  }
  const line = `the campfire's flames, of the frame: ${said.join(', ')}`;
  if (canary) return { lines: [line], problems: [], caught: problems.length > 0, moments: [] };
  return { lines: [line], problems, caught: null, moments };
}
