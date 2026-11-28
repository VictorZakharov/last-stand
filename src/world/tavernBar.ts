// The tavern's bar counter (from play, "lets include bar counter rework in this PR, it looks dull"): a plain box under a
// board, it reads now as a joiner's counter. A dark plinth, a front of framed panels (stiles and rails standing proud,
// each bay's raised field set back in it), the end toward the door framed the same, a thick top overhanging its front
// with a rounded nosing along it and a moulding under it, and a brass foot rail on brackets along its foot. Its footprint is the
// box's: the keeper's walks, the obstacles and the stools read `BAR` (data/tavern.ts), and its top stands where it did.
import { Material, Mesh, Node } from '../engine/api/index.ts';
import * as shapes from '../engine/api/shapes/index.ts';
import { box, type Mats } from './rooms';
import { woodTint } from './woodTint';
import { boxWithUV } from './props';

/** the counter's woods, apart from the floor's and the walls' browns (in the rooms' woods it sank into the room, from
 *  play): a frame stained near black and fields of pale honey oak (redder, review read them as "red pleated
 *  curtains"); its top is the tables' (`Top`) */
const FRAME_TONE = 0x2a1c12;
const FIELD_TONE = 0xc8a878;
const FIELD_ROUGH = 0.7;

/** the counter's top: the tavern's tables' own, a pale worn top on a ruddy rim (from play, "can we make countertop of
 *  same material as table top nearby ?") */
export interface Top {
  worn: Material;
  rim: Material;
}

/** the counter's body (m: across, from its back) and its top's height */
const DEEP = 0.55;
const HIGH = 1.0;
/** the top: how thick, how far it overhangs the front, and its nosing's radius */
const TOP_THICK = 0.07;
const OVERHANG = 0.075;
const NOSING = 0.035;
/** the plinth's height and how far it stands out from the front */
const PLINTH = 0.11;
const PLINTH_OUT = 0.02;
/** the frame's members (m wide, and how far they stand proud of the body) and a field's (set in from its frame) */
const STILE = 0.075;
const RAIL = 0.09;
const FRAME_OUT = 0.03;
const FIELD_OUT = 0.014;
const FIELD_IN = 0.035;
/** how long a bay is at most */
const BAY = 0.7;
/** the foot rail: its radius, height, how far out from the front, and its brackets' spacing at most */
const RAIL_R = 0.02;
const RAIL_Y = 0.22;
const RAIL_OUT = 0.12;
const BRACKETS = 0.9;
/** the rail's brass: worn, duller than the room's */
const RAIL_BRASS = 0x8a6a34;
const RAIL_ROUGH = 0.6;

/** a field's grain: tiles a metre (the kit's box lays 0.5, and on a field's half metre its streaks read as "red
 *  pleated curtains", from review) */
const FIELD_GRAIN = 2.5;

/** A field: a box as `box` in rooms.ts stands one, its grain finer. */
function fieldBox(g: Node, w: number, h: number, d: number, x: number, y: number, z: number,
  material: Material): void {
  const mesh = new Mesh(boxWithUV(w, h, d, FIELD_GRAIN, true), material);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
}

/** A bar counter down the room (along z, from `from` to `to`) with its back at `x + DEEP / 2`, its front toward -x. */
export function barCounter(g: Node, M: Mats, x: number, from: number, to: number, top: Top): void {
  const long = to - from, middle = (from + to) / 2, front = x - DEEP / 2;
  const frame = woodTint(M.timber, FRAME_TONE), field = woodTint(M.oak, FIELD_TONE, FIELD_ROUGH);
  // (the body, behind its front)
  box(g, DEEP, HIGH - TOP_THICK + 0.07, long, x, 0, middle, M.panel);
  box(g, DEEP + PLINTH_OUT, PLINTH, long + PLINTH_OUT, x - PLINTH_OUT / 2, 0, middle + PLINTH_OUT / 2, frame);
  // (the front's frame and fields, bay by bay)
  const bays = Math.ceil(long / BAY), bay = long / bays;
  const frameFoot = PLINTH, frameTop = HIGH + 0.07 - TOP_THICK - 0.045;
  for (const y of [frameFoot, frameTop - RAIL]) {
    box(g, FRAME_OUT, RAIL, long, front - FRAME_OUT / 2, y, middle, frame);
  }
  for (let k = 0; k <= bays; k++) {
    const z = from + k * bay;
    box(g, FRAME_OUT, frameTop - frameFoot, STILE, front - FRAME_OUT / 2, frameFoot, z, frame);
  }
  const fieldFoot = frameFoot + RAIL + FIELD_IN, fieldHigh = frameTop - RAIL - FIELD_IN - fieldFoot;
  for (let k = 0; k < bays; k++) {
    const z = from + (k + 0.5) * bay, wide = bay - STILE - FIELD_IN * 2;
    // (a raised field: its flat middle, and a bevel round it a step back)
    // (the fields pale, the frame round them dark: all the panels' one wood, the front read flat and black)
    fieldBox(g, FIELD_OUT, fieldHigh, wide, front - FIELD_OUT / 2, fieldFoot, z, field);
    box(g, FIELD_OUT * 0.5, fieldHigh + 0.03, wide + 0.03, front - FIELD_OUT * 0.25, fieldFoot - 0.015, z, M.panel);
  }
  // (the end toward the door, framed and fielded the same)
  const endZ = to + FRAME_OUT / 2, endWide = DEEP - STILE * 2;
  for (const y of [frameFoot, frameTop - RAIL]) box(g, DEEP, RAIL, FRAME_OUT, x, y, endZ, frame);
  for (const side of [-1, 1]) {
    box(g, STILE, frameTop - frameFoot, FRAME_OUT, x + side * (DEEP - STILE) / 2, frameFoot, endZ, frame);
  }
  fieldBox(g, endWide - FIELD_IN * 2, fieldHigh, FIELD_OUT, x, fieldFoot, to + FIELD_OUT / 2, field);
  // (the top: a thick board, its nosing rounded along the front and the end, a moulding under it)
  // (as wide as the old top, 0.7 m, overhanging both sides and 5 cm past each end: the keeper wipes it and slides
  // mugs across it to its edges, `BAR.half`)
  const topY = HIGH + 0.07 - TOP_THICK, topFront = front - OVERHANG, topLong = long + 0.1;
  const topWide = DEEP + OVERHANG * 2 - NOSING;
  // (the board in the tables' rim, its face their worn top a hair over it, as a table's is)
  box(g, topWide, TOP_THICK - 0.004, topLong, x + NOSING / 2, topY, middle, top.rim);
  box(g, topWide - 0.01, 0.004, topLong - 0.02, x + NOSING / 2, topY + TOP_THICK - 0.004, middle, top.worn)
    .castShadow = false;
  const nosing = new Mesh(shapes.cylinder(NOSING, NOSING, topLong, 10).rotateX(Math.PI / 2), top.rim);
  nosing.position.set(topFront + NOSING, topY + TOP_THICK - NOSING, middle);
  nosing.castShadow = nosing.receiveShadow = true;
  g.add(nosing);
  box(g, 0.035, 0.04, long, front - 0.0175, topY - 0.04, middle, frame);
  // (the brass foot rail on its brackets, its ends capped)
  const railFrom = from + 0.25, railTo = to - 0.1, railLong = railTo - railFrom;
  // (a worn brass, duller than the room's polished fittings: in theirs the rail glowed "like a hot neon tube" along
  // its length, from review)
  const brass = woodTint(M.brass, RAIL_BRASS, RAIL_ROUGH);
  const rail = new Mesh(shapes.cylinder(RAIL_R, RAIL_R, railLong, 12).rotateX(Math.PI / 2), brass);
  rail.position.set(front - RAIL_OUT, RAIL_Y, (railFrom + railTo) / 2);
  rail.castShadow = true;
  g.add(rail);
  const brackets = Math.ceil(railLong / BRACKETS);
  for (let k = 0; k <= brackets; k++) {
    const z = railFrom + (k / brackets) * railLong;
    const arm = new Mesh(shapes.cylinder(0.009, 0.012, RAIL_OUT, 8).rotateZ(Math.PI / 2), brass);
    arm.position.set(front - RAIL_OUT / 2, RAIL_Y, z);
    g.add(arm);
    const plate = new Mesh(shapes.cylinder(0.028, 0.028, 0.008, 12).rotateZ(Math.PI / 2), brass);
    plate.position.set(front - FRAME_OUT - 0.004, RAIL_Y, z);
    g.add(plate);
  }
  for (const z of [railFrom, railTo]) {
    const cap = new Mesh(shapes.sphere(RAIL_R * 1.4, 10, 8), brass);
    cap.position.set(front - RAIL_OUT, RAIL_Y, z);
    g.add(cap);
  }
}
