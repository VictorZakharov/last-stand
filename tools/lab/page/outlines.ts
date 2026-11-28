// `lab outlines`: every kind of thing the game outlines, the outline held to its shape (`outlineShape.ts`): the hero
// in focus in hero selection (a hero frozen on his plinth, skinned), the hero in the village (skinned, moving), a foe
// in a fight (drawn as one: Quarry Mark's and a ping's outline go round one), and a seat by the campfire (one
// instance of an instanced mesh). The tavern's mug is a plain mesh, the simplest of them, and isn't stood at.
// Canaries: the outline round his head alone (an edge inside him), and the outline round him read against his head
// alone (a shape far from the thing, as his glove was when the engine skinned the mask from the inverse of where he
// was bound). His neighbour on the dais outlined with him went unseen: off the screen, the engine drew no line.
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { Vec3 } from './sceneApi.ts';
import type { Mesh, Node } from './sceneApi.ts';
import { CAMPFIRE } from '../../../src/data/village';
import type { Pictured } from './lab';
import { standAt } from './draws';
import { foeKind } from './death';
import { closeHeroSelect, openHeroSelect } from '../../../src/ui/heroSelect';
import { hallFocus, hallHeroes } from '../../../src/game/hall';
import { outline, type OutlineTarget } from '../../../src/ui/overlay/outline';
import { FAR_MOST, INSIDE_MOST, outlineShape, type OutlineShape } from './outlineShape';
import { percent } from './rustPlain';

/** the hour the village is lit for (the late afternoon of the owner's pictures) */
const HOUR = 16;
/** the frames hero selection is given to show its hall, and a stand to settle */
const SELECT_FRAMES = 240;
const SETTLE_FRAMES = 60;
/** how far before him a foe rises (m), and the frames it's given to rise */
const FOE_AWAY = 4.5;
const RISE_FRAMES = 240;

/** A thing outlined: what's outlined, and what's hidden for its silhouette. */
interface Outlined {
  targets: OutlineTarget[];
  roots: Node[];
}

/** A case of the command: its name, and how the thing is stood and named. */
interface Case {
  name: string;
  stand: (lab: Lab) => Promise<Outlined>;
}

/** The hero in focus in hero selection, as the mouse over him outlines him. */
async function hallHero(lab: Lab): Promise<Outlined> {
  await standAt(lab, { biome: G.arena.biome, view: 'top', village: true, hour: HOUR });
  openHeroSelect(G.player.cls.id);
  await lab.step(SELECT_FRAMES);
  const root = hallHeroes()[hallFocus()].player.obj;
  return { targets: [{ root }], roots: [root] };
}

/** The hero in the village, seen over his shoulder. */
async function villageHero(lab: Lab): Promise<Outlined> {
  await standAt(lab, { biome: G.arena.biome, view: 'third', village: true, hour: HOUR });
  await lab.step(SETTLE_FRAMES);
  return { targets: [{ root: G.player.obj }], roots: [G.player.obj] };
}

/** A foe risen before him in the crypt, from above (Quarry Mark's and a ping's outline go round a foe). */
async function cryptFoe(lab: Lab): Promise<Outlined> {
  await standAt(lab, { biome: 'crypt', view: 'top', village: false });
  const ahead = new Vec3(Math.sin(G.player.facing), 0, Math.cos(G.player.facing)).multiplyScalar(FOE_AWAY);
  const foe = lab.spawnFoe(foeKind(), G.player.pos.clone().add(ahead));
  await lab.until(() => foe.spawning <= 0, RISE_FRAMES, 'outlines: the foe never rose');
  foe.dazed = 999;
  await lab.step(SETTLE_FRAMES);
  return { targets: [{ root: foe.obj }], roots: [foe.obj] };
}

/** A seat by the campfire outlined as the cursor on it outlines it: one instance of its logs. */
async function campfireSeat(lab: Lab): Promise<Outlined> {
  const by: [number, number] = [CAMPFIRE[0] + 1.4, CAMPFIRE[1] - 3.4];
  await standAt(lab, { biome: G.arena.biome, view: 'top', village: true, hour: HOUR, at: by });
  const seat = G.arena.seats.find((each) => each.outline.some((target) => target.instance !== undefined));
  if (!seat) throw new Error('outlines: no seat outlined by an instance in the village');
  await lab.step(SETTLE_FRAMES);
  return { targets: seat.outline, roots: seat.outline.map((target) => target.root) };
}

const CASES: Case[] = [
  { name: 'the hero in focus in hero selection', stand: hallHero },
  { name: 'the hero in the village', stand: villageHero },
  { name: 'a foe in the crypt', stand: cryptFoe },
  { name: 'a seat by the campfire', stand: campfireSeat },
];

/** the outline's look in the pictures: hero selection's (white, a little soft) */
const PICTURED_COLOUR = 0xffffff;
const PICTURED_STRENGTH = 0.85;

/** The screen pictured with `targets` outlined as the game outlines them, for an A/B's pictures. */
async function outlinedPicture(lab: Lab, name: string, targets: OutlineTarget[]): Promise<Pictured> {
  try {
    for (let frame = 0; frame < 3; frame++) {
      outline(targets, PICTURED_COLOUR, PICTURED_STRENGTH);
      await lab.step(1);
    }
    return await lab.screen(name);
  } finally {
    outline(null);
  }
}

/** The line a shape is said in, and what's wrong with it. */
function judged(name: string, shape: OutlineShape): { line: string; wrong: string[] } {
  const line = `${name}: ${shape.pixels} pixels of outline, ${percent(shape.inside)} deep inside it, `
    + `${percent(shape.far)} far from it`;
  const wrong: string[] = [];
  if (shape.pixels === 0) wrong.push('no outline drawn');
  if (shape.inside > INSIDE_MOST) wrong.push(`${percent(shape.inside)} of the outline inside the thing`);
  if (shape.far > FAR_MOST) wrong.push(`${percent(shape.far)} of the outline far from the thing`);
  return { line, wrong };
}

/** The head of `root`'s hero: his mesh named `face` (`models/head.ts`). */
function headOf(root: Node): Mesh {
  const face = root.getObjectByName('face');
  if (!face) throw new Error('outlines: the hero has no face mesh');
  return face as Mesh;
}

/** The canaries, on the hall's hero: each a fault the shape must find. */
async function canaries(lab: Lab): Promise<{ lines: string[]; problems: string[] }> {
  const lines: string[] = [];
  const problems: string[] = [];
  try {
    const hero = await hallHero(lab);
    const head = await outlineShape(lab, [{ root: headOf(hero.roots[0]) }], hero.roots);
    lines.push(`canary, his head alone outlined: ${percent(head.inside)} inside him`);
    if (head.inside <= INSIDE_MOST) problems.push('canary: an outline round his head alone went unseen inside him');
    const stray = await outlineShape(lab, hero.targets, [headOf(hero.roots[0])]);
    lines.push(`canary, his outline read against his head alone: ${percent(stray.far)} far from it`);
    if (stray.far <= FAR_MOST) problems.push('canary: an outline far from the thing went unseen');
  } finally {
    closeHeroSelect();
  }
  return { lines, problems };
}

/** Every case whose name holds `only`, each outline's shape read; or the canaries. */
export async function outlines(lab: Lab, only: string, canary: boolean): Promise<{ lines: string[];
  problems: string[]; moments: Pictured[] }> {
  if (canary) return { ...await canaries(lab), moments: [] };
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  for (const each of CASES.filter((one) => one.name.includes(only))) {
    try {
      const thing = await each.stand(lab);
      const { line, wrong } = judged(each.name, await outlineShape(lab, thing.targets, thing.roots));
      moments.push(await outlinedPicture(lab, each.name, thing.targets));
      lines.push(wrong.length ? `${line}: ${wrong.join(', ')}` : line);
      problems.push(...wrong.map((one) => `${each.name}: ${one}`));
    } finally {
      closeHeroSelect();
    }
  }
  return { lines, problems, moments };
}
