// `lab dressing`: what dresses the tavern's walls and beams, the hero put straight into the room (no door, no
// village):
// its mantel's cups, the herbs hung over the bar, the bar's bottles, its lanterns, and its shelves against the wall's
// posts, pictured close up and as the player stands in the room. Read: each shelf's board clear of the wall's posts,
// what stands on the mantel standing on its top, and the candles' flames moving. `--canary` slides a board onto a
// post, lifts a thing off the mantel and reads the flames from one frame twice, each of which must be found.
import * as THREE from 'three';
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
  at: THREE.Vector3Tuple;
  distance: number;
}

/** the close-ups, taken with the hero facing the back wall square on (they turn with his facing) */
const CLOSE_UPS: readonly CloseUp[] = [
  { label: 'dressing-mantel', view: 'back', at: [0.6, 1.6, -3.2], distance: 4.2 },
  { label: 'dressing-mantel-candle', view: 'back', at: [0.3, 1.66, -3.2], distance: 1.0 },
  { label: 'dressing-shelf-by-the-post', view: 'back', at: [3.6, 2.1, -3.85], distance: 5.5 },
  { label: 'dressing-herbs', view: 'back', at: [4.4, 2.5, -2.2], distance: 3.2 },
  { label: 'dressing-bottles', view: 'left', at: [5.2, 1.7, -1.0], distance: 2.8 },
  { label: 'dressing-lantern', view: 'left', at: [5.1, 2.45, -2.6], distance: 1.2 },
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
    at: new THREE.Vector3(...at), distance,
  }));
  // (the lantern again a few frames on: its flame moved, as the reading of the flames says)
  const lantern = CLOSE_UPS.find((closeUp) => closeUp.label === 'dressing-lantern')!;
  await lab.step(LANTERN_LATER);
  moments.push(lab.picture('dressing-lantern-later', [lantern.view], [], {
    at: new THREE.Vector3(...lantern.at), distance: lantern.distance,
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
  const post = posts[0].getCenter(new THREE.Vector3());
  const board = boards[0].getCenter(new THREE.Vector3());
  boards[0].translate(new THREE.Vector3(post.x - board.x, 0, post.z - board.z));
  things[0].translate(new THREE.Vector3(0, LIFT, 0));
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
