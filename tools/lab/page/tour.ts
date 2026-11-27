// `lab tour`: the game pictured at a round of fixed stands as the player sees them (the square and the cottages from
// above, each cottage's door, the hall from above and from inside, every house's room, a fight in each biome), so
// a change to how the world is drawn is held to the pictures of the commit before it (`--ab=<commit>`). Each stand's
// frame is drawn twice at one moment of the game, the eye's adaptation held: what differs between the two flickers in
// play (things drawn in an order that changes from draw to draw). From VictorZakharov/last-stand#973:
// three's removal lost the cottages' doors, laid boxes over the ground and set the library's carpet flickering, and
// no check pictured any of them.
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { COTTAGES, CAMPFIRE, type Cottage } from '../../../src/data/village';
import { doorOf } from '../../../src/world/villagePlan';
import { HOUSES, type RoomId } from '../../../src/data/houses';
import { enterRoom, leaveRoom } from '../../../src/game/rooms';
import type { BiomeId } from '../../../src/data/biomes';
import { standAt } from './draws';
import { inHallLookingOut } from './villageHallCull';
import { percent } from './rustPlain';
import { drawFrame, type Canvas } from './light';
import { faceCamera, holdAdaptation, setZoom } from '../../../src/core/renderer';
import { groundHeight } from '../../../src/world/ground';
import { closeHeroSelect, openHeroSelect } from '../../../src/ui/heroSelect';

/** the hour the village is lit for at every stand: the late afternoon of the owner's pictures, long shadows */
const HOUR = 16;
/** the frames a stand is given to settle (the camera's glide, the fades) before it's pictured */
const SETTLE_FRAMES = 90;
/** the share of the frame two draws at one moment may differ in (a spark, a mote), and by how much of white a
 *  channel differs to count (the canvas is read as floats) */
const STILL_SHARE = 0.0005;
const SAME = 3 / 255;
/** the draws before the two compared: the engine's first after a change isn't its steady one */
const STEADY_DRAWS = 2;
/** how far out from a cottage's door he stands to look at it (m), and the zoom from above over the square */
const DOOR_OUT = 3.2;
const ZOOM_OUT = 1.7;

/** A stand of the tour: its name and how the hero is put there. */
interface Stand {
  name: string;
  go: (lab: Lab) => Promise<void>;
}

/** The share of `one`'s pixels that differ from `other`'s by more than `SAME` in a channel. */
function apart(one: Canvas, other: Canvas): number {
  let differing = 0;
  for (let at = 0; at < one.pixels.length; at += 4) {
    const red = Math.abs(one.pixels[at] - other.pixels[at]);
    const green = Math.abs(one.pixels[at + 1] - other.pixels[at + 1]);
    const blue = Math.abs(one.pixels[at + 2] - other.pixels[at + 2]);
    if (Math.max(red, green, blue) > SAME) differing++;
  }
  return differing / (one.pixels.length / 4);
}

/** The frame drawn twice at this moment of the game, once steady: the share of it the two draws differ in.
 *  `canary`: the hero hidden for the second draw, as a thing drawn in one frame and not the next. */
function apartAtOneMoment(lab: Lab, canary: boolean): number {
  holdAdaptation(true);
  try {
    for (let draw = 0; draw < STEADY_DRAWS; draw++) drawFrame(lab);
    const first = drawFrame(lab);
    if (canary) G.player.obj.visible = false;
    return apart(first, drawFrame(lab));
  } finally {
    G.player.obj.visible = true;
    holdAdaptation(false);
  }
}

/** What a stand read: its picture and the share of it two draws at one moment differ in. */
interface StandRead {
  name: string;
  apart: number;
  pictured: Pictured;
}

/** The hero before cottage `cottage`'s door, facing it, seen over his shoulder. */
async function atDoor(lab: Lab, cottage: Cottage): Promise<void> {
  const [doorX, doorZ] = doorOf(cottage);
  const out: [number, number] = [doorX + Math.sin(cottage.facing) * DOOR_OUT, doorZ + Math.cos(cottage.facing) * DOOR_OUT];
  await standAt(lab, { biome: G.arena.biome, view: 'third', village: true, hour: HOUR, at: out });
  // (turned to the door where he stands: `inVillage` again would leave a run already left, its Escape opening the
  // lobby's pause menu, which the next stand's set-up couldn't get past)
  const facing = cottage.facing + Math.PI;
  // (a vector of the hero's own kind: an A/B's other commit may predate the engine's API)
  G.player.place(G.player.pos.clone().set(out[0], groundHeight(out[0], out[1]), out[1]), facing);
  faceCamera(facing);
}

/** The hero in house `room`'s room, seen from above. */
async function inRoom(lab: Lab, room: RoomId): Promise<void> {
  await standAt(lab, { biome: G.arena.biome, view: 'top', village: true, hour: HOUR });
  enterRoom(room);
}

/** the frames hero selection is given to show its hall, its heroes built behind it */
const SELECT_FRAMES = 240;

/** Hero selection opened from the village: its hall of heroes, every class's hero in it. */
async function inHeroSelect(lab: Lab): Promise<void> {
  await standAt(lab, { biome: G.arena.biome, view: 'top', village: true, hour: HOUR });
  openHeroSelect(G.player.cls.id);
  await lab.step(SELECT_FRAMES);
}

/** Hero selection opened and closed again, the hero back in the hall from above (the hall's heroes on its dais,
 *  their bodies taken out of the shown world and back). */
async function afterHeroSelect(lab: Lab): Promise<void> {
  await inHeroSelect(lab);
  closeHeroSelect();
  await lab.step(SETTLE_FRAMES);
  await standAt(lab, { biome: G.arena.biome, view: 'top', village: true, hour: HOUR, at: [-1.6, -22.3] });
}

/** The hero in `biome`'s battleground, seen over his shoulder. */
async function inBiome(lab: Lab, biome: BiomeId): Promise<void> {
  await standAt(lab, { biome, view: 'third', village: false });
}

/** Every stand of the tour, in order. */
function stands(): Stand[] {
  const village = (view: 'top' | 'third', at?: [number, number], zoom?: number) => async (lab: Lab) =>
    standAt(lab, { biome: G.arena.biome, view, village: true, hour: HOUR, at, zoom });
  const list: Stand[] = [
    { name: 'the square from above, furthest out', go: village('top', undefined, ZOOM_OUT) },
    { name: 'the campfire from above', go: village('top', [CAMPFIRE[0] + 1.4, CAMPFIRE[1] - 3.4]) },
    { name: 'the hall from above, in it', go: village('top', [-1.6, -22.3]) },
    { name: 'the hall from inside, looking out of its door', go: async (lab) => {
      await village('third')(lab);
      await inHallLookingOut(lab);
    } },
    { name: 'hero selection', go: inHeroSelect },
    { name: 'the hall from above, after hero selection', go: afterHeroSelect },
  ];
  COTTAGES.forEach((cottage, index) => list.push({ name: `cottage ${index}'s door`, go: (lab) => atDoor(lab, cottage) }));
  for (const house of Object.values(HOUSES)) {
    list.push({ name: `the ${house.name}'s room from above`, go: (lab) => inRoom(lab, house.id) });
  }
  list.push({ name: 'the crypt', go: (lab) => inBiome(lab, 'crypt') });
  list.push({ name: 'the Thornwood', go: (lab) => inBiome(lab, 'forest') });
  return list;
}

/** `stand` walked to, let settle, pictured, and drawn twice at one moment of the game. */
async function readStand(lab: Lab, stand: Stand, canary: boolean): Promise<StandRead> {
  try {
    try {
      await stand.go(lab);
    } catch (error) {
      throw new Error(`tour: ${stand.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
    lab.drawing = true;
    await lab.step(SETTLE_FRAMES);
    const pictured = await lab.screen(stand.name);
    return { name: stand.name, apart: apartAtOneMoment(lab, canary), pictured };
  } finally {
    closeHeroSelect();
    leaveRoom();
    setZoom(1);
  }
}

/** What the tour read: a line a stand, its problems, its pictures. */
export interface TourRead {
  lines: string[];
  problems: string[];
  moments: Pictured[];
}

/** The stands whose name holds `only` (every one when it's empty), each read: a line each, and its picture.
 *  `canary`: the hero hidden between each stand's two draws, which every stand must find flickering. */
export async function tour(lab: Lab, only: string, canary: boolean): Promise<TourRead> {
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  for (const stand of stands().filter((each) => each.name.includes(only))) {
    const read = await readStand(lab, stand, canary);
    lines.push(`${read.name}: ${percent(read.apart)} of the frame apart between two draws at one moment`);
    const flickers = read.apart > STILL_SHARE;
    if (flickers && !canary) problems.push(`${read.name}: ${percent(read.apart)} of the frame flickers`);
    if (!flickers && canary) problems.push(`${read.name}: the canary (the hero hidden for a draw) went unseen`);
    moments.push(read.pictured);
  }
  return { lines, problems, moments };
}
