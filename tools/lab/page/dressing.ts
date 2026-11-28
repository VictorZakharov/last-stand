// `lab dressing`: what dresses the tavern's walls and beams, the hero put straight into the room (no door, no
// village): its mantel's cups, the herbs hung over the bar, the bar's bottles, its counter, its barrels, its stools,
// its lanterns, and its shelves against the wall's posts, pictured close up and as the player stands in the room.
// Read: each shelf's board clear of the wall's posts, what stands on the mantel standing on its top, and the candles'
// flames moving. `--canary` slides a board onto a post, lifts a thing off the mantel and reads the flames from one
// frame twice, each of which must be found.
import { Vec3, Vec3Tuple } from './sceneApi.ts';
import type { Lab, Pictured, Report } from './lab';
import { G } from '../../../src/state';
import { enterRoom } from '../../../src/game/rooms';
import { stand, viewAs } from './houses';
import { toVillage } from './village';
import { boardsIn, flamesNow, mantelIn, onMantel, postsIn, readFlames, readMantel, readPosts } from './dressingReads';

export interface DressingOptions {
  canary: boolean;
}

/** A close-up: its label, where it's framed and from how far, the hero's view it's taken in. */
interface CloseUp {
  label: string;
  view: 'back' | 'left' | 'right';
  at: Vec3Tuple;
  distance: number;
}

/** the close-ups, taken with the hero facing the back wall square on (they turn with his facing) */
const CLOSE_UPS: readonly CloseUp[] = [
  { label: 'dressing-mantel', view: 'back', at: [0.6, 1.6, -3.2], distance: 4.2 },
  { label: 'dressing-mantel-candle', view: 'back', at: [1.22, 1.62, -3.2], distance: 1.0 },
  { label: 'dressing-shelf-by-the-post', view: 'back', at: [3.6, 2.1, -3.85], distance: 5.5 },
  { label: 'dressing-herbs', view: 'back', at: [4.4, 2.5, -2.2], distance: 3.2 },
  { label: 'dressing-bottles', view: 'left', at: [5.2, 1.7, -1.0], distance: 2.8 },
  { label: 'dressing-bottles-close', view: 'left', at: [5.2, 1.95, -1.3], distance: 1.1 },
  { label: 'dressing-bottles-low', view: 'left', at: [5.2, 1.45, -0.9], distance: 1.4 },
  { label: 'dressing-lantern', view: 'left', at: [5.1, 2.45, -2.6], distance: 1.2 },
  { label: 'dressing-bar', view: 'left', at: [3.7, 0.7, -0.9], distance: 3.4 },
  { label: 'dressing-bar-end', view: 'back', at: [4.1, 0.7, 1.0], distance: 4.5 },
  { label: 'dressing-barrels', view: 'right', at: [-4.6, 0.7, 3.3], distance: 5.0 },
  { label: 'dressing-bar-stools', view: 'left', at: [2.95, 0.45, -1.2], distance: 2.6 },
  { label: 'dressing-table-stools', view: 'left', at: [0.92, 0.35, 0.22], distance: 1.8 },
  { label: 'dressing-bar-front', view: 'left', at: [5.0, 0.7, -2.6], distance: 4.5 },
];

/** the frames between the lantern's two pictures */
const LANTERN_LATER = 9;
/** the frames between the flames' two readings */
const FLAME_FRAMES = 6;
/** the canary's plants (m): a thing lifted off the mantel */
const LIFT = 0.01;

/** where the hero stands to see the bar's corner over the shoulder, and the way he faces (0 is +z) */
const IN_THE_ROOM = { label: 'dressing-in-the-room', at: [1.0, -0.4] as const, facing: 2.5 };

/** The dressing pictured: each close-up, and the bar's corner as the player sees it. */
async function pictured(lab: Lab): Promise<Pictured[]> {
  await stand(lab, [0, -1], Math.PI);
  const moments = CLOSE_UPS.map(({ label, view, at, distance }) => lab.picture(label, [view], [], {
    at: new Vec3(...at), distance,
  }));
  // (the lantern again a few frames on: its flame moved, as the reading of the flames says)
  const lantern = CLOSE_UPS.find((closeUp) => closeUp.label === 'dressing-lantern')!;
  await lab.step(LANTERN_LATER);
  moments.push(lab.picture('dressing-lantern-later', [lantern.view], [], {
    at: new Vec3(...lantern.at), distance: lantern.distance,
  }));
  await stand(lab, IN_THE_ROOM.at, IN_THE_ROOM.facing);
  moments.push(await lab.screen(IN_THE_ROOM.label));
  return moments;
}

export async function dressing(lab: Lab, options: DressingOptions): Promise<Report> {
  await toVillage(lab);
  lab.drawing = true;
  enterRoom('tavern');
  await lab.until(() => G.arena.room === 'tavern', 600, 'dressing: the tavern never opened');
  await viewAs(lab, 'third');
  G.arena.rooms!.tavern.group.updateMatrixWorld(true);
  const room = G.arena.rooms!.tavern.group;
  const moments = await pictured(lab);
  const lines: string[] = [];
  const problems: string[] = [];
  const posts = postsIn(room);
  const boards = boardsIn(room);
  const mantel = mantelIn(room);
  const things = onMantel(room, mantel);
  const before = flamesNow(room);
  await lab.step(FLAME_FRAMES);
  const after = flamesNow(room);
  if (!options.canary) {
    readPosts(posts, boards, lines, problems);
    readMantel(mantel, things, lines, problems);
    readFlames(before, after, lines, problems);
    return { text: lines.join('\n'), problems, moments };
  }
  // (a board moved onto the first post, the first thing lifted, the flames read from one frame twice)
  const post = posts[0].getCenter(new Vec3());
  const board = boards[0].getCenter(new Vec3());
  boards[0].translate(new Vec3(post.x - board.x, 0, post.z - board.z));
  things[0].translate(new Vec3(0, LIFT, 0));
  const planted: string[] = [];
  readPosts(posts, boards, lines, planted);
  readMantel(mantel, things, lines, planted);
  readFlames(before, before, lines, planted);
  const found = (word: string): boolean => planted.some((problem) => problem.includes(word));
  const caught = { post: found('through a post'), mantel: found('over its top'), flames: found('stood still') };
  lines.push(`canary: a board on a post ${caught.post ? 'found' : 'unseen'}; a thing lifted ${LIFT * 100} cm off `
    + `the mantel ${caught.mantel ? 'found' : 'unseen'}; the flames read still ${caught.flames ? 'found' : 'unseen'}`);
  if (!caught.post || !caught.mantel || !caught.flames) problems.push('canary: a planted fault went unseen');
  return { text: lines.join('\n'), problems, moments };
}
