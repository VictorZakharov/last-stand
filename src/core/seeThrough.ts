// Screen-door dissolve of world geometry between the camera and the character it follows, so
// nothing hides the player. Only the main pass: shadow maps render with their own depth
// material, so shadows stay whole.
import {
  AddEquation, Attribute, CustomBlending, InstancedMesh, LookMaterial, Mat4, Material, Mesh, Node,
  OneMinusSrcAlphaFactor, Side, SrcAlphaFactor, Uniform, UnlitMaterial, Vec2, Vec3, Vec4, ZeroFactor,
} from '../engine/api/index.ts';
import { HALL, TERRACE } from '../data/village';
import { DOOR_ROW, DOOR_SOFT, HIS_ROW, SIGHT, SIGHT_LOOK } from './sight';
import { onWholeView, wholeView } from './wholeView';
import { tunable } from './tuning';

/** how far over his floor a prop starts to dissolve (m): the terrace's and the hall's floor came apart round his feet
 *  when this was held at the village's ground, 1.6 m under them */
const FLOOR_CLEAR = 0.12;

/** the followed character (chest height), set by the camera every frame */
const focus = { value: new Vec3() };

/**
 * How a class of material dissolves: x..y the radius round the camera-to-player line where the
 * fade runs out, z the share of pixels dropped at its core (0 turns it off), w how far short of
 * the player it stops. `minY`: nothing lower dissolves (the floor under a prop stays).
 */
interface Kind {
  k: { value: Vec4 };
  minY: { value: number };
  across: { value: number };
  whole: { value: number };
  /** how far short of him what thins whole comes back (m) */
  ramp: { value: number };
  /** whether it thins by blending, not by a pattern of dropped pixels */
  blended?: boolean;
  /** a part of a house (a wall, a roof, a gable): from above the Rust engine drops it whole where it hides ground he
   *  sees and leaves it whole elsewhere, by his sight alone (`src/engine/AGENTS.md`, Bulwark's `cover_kept`) */
  cover?: boolean;
  /** of `cover`: the floor its house stands on (m; the village's ground 0, the hall's its terrace), whatever floor he
   *  stands on: read at his own, a cottage's roof opened over ground he saw before it once he stood on the terrace:
   *  the ground it hides is found at that height, wherever he stands */
  floor?: number;
  /** of `floor`: where that floor lies when it's raised over the ground, in up to two boxes (each its least x and z,
   *  its most): past them the ground is the village's, 0 */
  floorBoxes?: readonly (readonly [number, number, number, number])[];
  /** of `cover`, a roof: the room it roofs (its least x and z, its most). While he stands in it all of the roof
   *  opens, the one exception to the rule: "if the player is inside a building... we will thin whole roof no
   *  matter what" */
  roofs?: readonly [number, number, number, number];
  /** of `cover`, a wall: the room it walls. While he stands in it the wall opens over that room's floor alone, and
   *  over all of it, seen or not: by what he saw it stood in ragged pieces where a column hid the floor behind it,
   *  and opened on the ground he saw out of a window ("can see ground in hall of heroes") */
  walls?: readonly [number, number, number, number];
  /** of `walls`: the floor past the room's walls he may see out to from in it (a porch through its door), where
   *  a wall across the room still opens by the rule: "forgot to thin the portico wall that covers visible
   *  ground". Past both, the meadow, it opens on nothing */
  porch?: readonly [number, number, number, number];
  /** of `blended`: whether a pale surface of it keeps less of itself than a dark one (`PALE`) */
  pale?: boolean;
  /** of `blended`: its meshes lie in layers (a roof's slabs over its deck over its beams), and the Rust engine draws
   *  the nearest of them alone at each pixel (`src/engine/AGENTS.md`, Bulwark's `ONE_LAYER`) */
  oneLayer?: boolean;
  /** of `blended`: thinned where it hides the floor he sees (`HALL_SIGHT`), its depth let go there */
  sight?: boolean;
  /** of `sight`: the share of that it thins by (all if not given) */
  sightShare?: number;
  /** of `sight`: how far it thins by it now (`HALL_SIGHT` if not given) */
  sightOn?: { value: number };
  /** how far round the line to him what thins whole reaches: from x it comes back, whole by y (m at his depth); all of it
   *  if not given */
  reach?: { value: Vec2 };
  /** of a cover with a `reach`: how high it stands over its floor (m). Where it stands between the camera and him
   *  all of it is a ghost, foot to top, by that height */
  high?: number;
  /** of a cover with `walls`: never gone whole. Where its wall would be (he stands in its room, or before its door
   *  seeing in), all of it is the rule's ghost instead: what keeps him out of where it stands, a door's leaves */
  stays?: boolean;
  /** the room it thins for (least x, least z, most x, most z): only what has it just past it along the view thins whole;
   *  everywhere if not given */
  room?: { value: Vec4 };
  /** the door's two jambs (x, z, x, z), for the cone he sees through it to open in it; none if not given */
  door?: { value: Vec4 };
  /** how far that cone is open (a share of what's in it dropped) */
  doorOn?: { value: number };
}
/** what thins whole reaching all of it */
const ALL_OF_IT = { value: new Vec2(1e5, 1e6) };
/** how far the hall's walls aside of him and behind thin where they hide the floor he sees (`hallSightCone`): not at
 *  all with him in the hall, where they stand whole or thin each as a whole (`wallHidesNearHim`), from play "here we
 *  should not try to make transparent the side which doesn't help see the hero" */
const HALL_SIGHT_ASIDE = { value: 0 };
/** the same for its columns: with him in the hall or on its portico the portico's alone, told by a share under none.
 *  The room's thinned past him (`lab village --only wallsPastHimWhole`) and those seen through the door went with it
 *  (`--only roomColumnsStay`); left whole from inside, the portico's stood solid by the front wall thinned over the
 *  floor he sees (from play, "black column should partially thin here too", "these should thin too, right ?") */
const HALL_SIGHT_COLUMNS = { value: 0 };
/** a reach under this is something's own, placed by its middle (`seeFade`'s `seeOn`) */

export const PLACED_BY_MIDDLE = 1e4;
/** the attribute that keeps each part's middle (its object's place in the world) through a merge into one mesh: the
 *  village's still meshes are drawn merged (`mergeStill` in world/props.ts), each at the origin */
export const MIDDLE_ATTRIBUTE = 'seeAt';

/** Whether what's drawn in `material` thins by its own middle, read from `MIDDLE_ATTRIBUTE` (a kind with a reach). */
export function thinsByMiddle(material: Material | Material[]): boolean {
  if (Array.isArray(material)) return false;
  const see = (material as { seeThrough?: SeeThrough }).seeThrough;
  return see?.reach !== undefined;
}

/** `mesh` given its place in the world as every vertex's middle (`MIDDLE_ATTRIBUTE`), on a copy of its geometry of
 *  its own (a geometry is shared by every column). */
export function keepMiddle(mesh: Mesh): void {
  const at = new Vec3().setFromMatrixPosition(mesh.matrixWorld);
  const geometry = mesh.geometry.clone();
  const count = geometry.attributes.position.count;
  const middles = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) at.toArray(middles, i * 3);
  geometry.setAttribute(MIDDLE_ATTRIBUTE, new Attribute(middles, 3));
  mesh.geometry = geometry;
}

/** the most columns whose share of the floor they hide is kept (`columnsSeen`): the hall's 8 and its portico's 4 */
const COLUMNS_MOST = 16;
/** each column's middle on the floor (x, z) and how far he sees the floor it hides (0 to 1), eased by the game */
const COLUMNS_SEEN = { value: Array.from({ length: COLUMNS_MOST }, () => new Vec3(1e6, 1e6, 0)) };

/**
 * How far he sees the floor each column hides, as the game has eased it (`columnsFade` in game/village.ts): read off
 * the rays at each pixel, a column went from ghost to whole within a step of his as the place it hides crossed the
 * edge of what he sees, the portico's last one flickering as he walked about (from play, "when I move around on
 * portico, last pillar flickers", "it should fade in/out over 1 sec (all changes to it)").
 */
export function columnsSeen(columns: readonly { x: number; z: number; seen: number }[]): void {
  if (columns.length > COLUMNS_MOST) throw new Error(`seeThrough: ${columns.length} columns, at most ${COLUMNS_MOST}`);
  COLUMNS_SEEN.value.forEach((kept, index) => {
    const column = columns[index];
    if (column) kept.set(column.x, column.z, column.seen);
    else kept.set(1e6, 1e6, 0);
  });
}

/** no room to thin for */
const ANYWHERE = { value: new Vec4(-1e5, -1e5, 1e5, 1e5) };
/** the hall's room, for what thins whole of its walls */
const HALL_ROOM = { value: new Vec4(-1e5, -1e5, 1e5, 1e5) };
/** the hall's door's jambs, and how far the middle bay over it thins when looking in from outside (`seeOverDoor`) */
const HALL_DOOR = { value: new Vec4() };
const HALL_DOOR_ON = { value: 0 };
/** no door to see through */
const NO_DOOR = { value: new Vec4() };
const DOOR_SHUT = { value: 0 };
/** the props' hole, which what fades whole has too */
const PROP_K = { value: new Vec4(1.0, 1.8, 0, 0.25) }, PROP_ACROSS_NOW = { value: 1 };
/** nothing under this height dissolves in a prop: the floor he stands on (`updateSeeThrough`) and what lies lower */
const PROP_MIN_Y = { value: FLOOR_CLEAR };
/** the hole in what's built (`built`), and in the hall's walls and roof, which stays his own size: wide, it opened the
 *  hall's side wall onto the grass */
const BUILT_K = { value: new Vec4(1.0, 1.8, 0, 0.25) };
/** a fence's hole (`fence`: the village's palisade), opened wide by the fence hiding him alone, as what's built is by a
 *  house: one hole for both, the palisade hiding him at the village's edge opened the houses' too, and the cottage beside
 *  him went to its footing (from play, "at border of map, the house behind player suddenly disappeared") */
const FENCE_K = { value: new Vec4(1.0, 1.8, 0, 0.25) };
// (reaching past him, its w far under 0: a wall thins as one, or not at all, `hallInside` in game/village.ts)
const HALL_K = { value: new Vec4(1.0, 1.8, 0, -1000) };
/** a hall column's: no hole of its own, as the hall's walls have none: each thins whole. On top of that, a wall's hole cut
 *  a round bite out of the door's jambs and the lintel as he stood in the doorway, and a column's left it clear below and
 *  solid above, a smoke gradient (from play, "still looks broken to me"; a review) */
/** how high the hall's columns stand over its floor, their capitals' tops (m) */
const COLUMN_HIGH = 6;
/** how far the hall's front wall thins whole: its door's leaves' too, a kind of their own */
const FRONT_WHOLE = { value: 0 };
const COLUMN_K = { value: new Vec4(1.0, 1.8, 0, 0.25) };
/** the share of the floor he sees the hall's columns thin by (`HALL_SIGHT`; their pale surfaces further, `PALE`) */
const COLUMN_SIGHT = 1.45;
/** the roofs' hole: reaching past him (its w far under 0), so a ghost of a roof is one all over, whichever side of him
 *  the camera looks at it from */
const ROOF_K = { value: new Vec4(1.0, 1.8, 0, -1000) };
/** how far every roof thins from above, whatever it hides (a share of its pixels; from play, "we should make roof
 *  semi-transparent in this case too, even if hero is not directly under it") */
export const ROOF_GHOST_ABOVE = 0.25;
/** thinned past this a roof lets its depth go, for the fog to read what's under it */
const ROOF_LET_GO = 0.1;
/** the share of what's built's widening a roof's hole takes */
const ROOF_HOLE_WIDER = 0.25;
/** how far a house's gables thin from above: gone, as any ghost of plaster that pale stood as a band over what lay past it */
const GABLE_GHOST_ABOVE = 1;
/** how much wider what's built opens from above while it hides him (m at his depth): his own size, he showed alone in a
 *  roof, "it needs to match the previous screenshot, logically" */
const BUILT_OPENS = 5;
/** the walls' way back over the last of the way to him */
const WALL_RAMP = { value: 2 };
/** how far short of him a ghost comes back (m): over 2 m, as the hall's walls do, a post a stride before him stayed whole */
const GHOST_RAMP = 0.5;
/** the raised floor the hall of heroes stands on: its terrace, and its own narrower footing past the terrace's back */
const HALL_FLOORS = [
  [TERRACE.x - TERRACE.half, TERRACE.back, TERRACE.x + TERRACE.half, TERRACE.front],
  // (to its side walls' inner faces: out to their outer ones, a line ending in a wall's own thickness read as
  // floor he saw, and the roof was a ghost over the wall in a band along it)
  [TERRACE.x - HALL.inHalf, HALL.wall - 0.6, TERRACE.x + HALL.inHalf, TERRACE.back],
] as const;
/** the hall's room, between its walls' inner faces (its least x and z, its most) */
const HALL_IN = [TERRACE.x - HALL.inHalf, HALL.wall, TERRACE.x + HALL.inHalf, HALL.inFront] as const;
/** the terrace before the hall's front wall: its porch, seen from in the hall through its door */
const HALL_PORCH = [TERRACE.x - TERRACE.half, HALL.door, TERRACE.x + TERRACE.half, TERRACE.front] as const;

const kinds = {
  /** canopies: a wide hole in every view, since the tree line can hide the player top-down */
  foliage: { k: { value: new Vec4(2.5, 5, 0.9, 1) }, minY: { value: -1e9 }, across: { value: 1 }, whole: { value: 0 }, ramp: WALL_RAMP },
  /** what stands free: a hole round the line to the player, and all of it a ghost while it hides him, in every view but
   *  through the eyes */
  prop: { k: PROP_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: { value: GHOST_RAMP } },
  /** what's built (a house's walls and roof, the palisade): the same hole from above alone. Over the shoulder the camera
   *  stands on his side of it, and a hole there showed both sides of a wall at once (from play, "I should not able to
   *  see through walls like this") */
  built: { k: BUILT_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: WALL_RAMP, blended: true, cover: true, floor: 0 },
  /** a fence (the palisade): as `built`, its hole opened by what of him it hides alone */
  fence: { k: FENCE_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: WALL_RAMP, blended: true },
  /** a thing's foot on the floor: as `prop`, from the ground up */
  propFoot: { k: PROP_K, minY: { value: -1e9 }, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: { value: GHOST_RAMP } },
  /** the hall of heroes' front wall and its roof over the hero inside: a prop, all of it before him thinned by a share
   *  of its own (`fadeWhole`) */
  // (each wall a kind of its own, thinned by itself: by how far along the view each place stood, a side wall hiding nothing
  // near him thinned where it stood short of him, and one hiding him stayed solid over the last of the way to him, from
  // play, "here we should not try to make transparent the side which doesn't help see the hero", "this wall should be
  // transparent but the one 90 degree to it should not", "here both should be transparent, but only 1 is")
  hallFront: { k: HALL_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: FRONT_WHOLE, ramp: WALL_RAMP, blended: true, cover: true, floor: TERRACE.high, floorBoxes: HALL_FLOORS,
    sight: true, room: HALL_ROOM, door: HALL_DOOR, doorOn: HALL_DOOR_ON, walls: HALL_IN, porch: HALL_PORCH },
  /** the leaves of the door in that wall, swung in: its wall's own in everything, but never gone whole (`stays`):
   *  they keep him out of where they stand, and with their wall gone whole round him in its room nothing showed
   *  what stopped him, from play "can we not completely thin doors? because they are obstacles, players will not
   *  know why they cannot move" */
  hallLeaves: { k: HALL_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: FRONT_WHOLE, ramp: WALL_RAMP, blended: true, cover: true, floor: TERRACE.high, floorBoxes: HALL_FLOORS,
    sight: true, room: HALL_ROOM, door: HALL_DOOR, doorOn: HALL_DOOR_ON, walls: HALL_IN, porch: HALL_PORCH, stays: true },
  hallBack: { k: HALL_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: WALL_RAMP, blended: true, cover: true, floor: TERRACE.high, floorBoxes: HALL_FLOORS,
    sight: true, sightOn: HALL_SIGHT_ASIDE, walls: HALL_IN, porch: HALL_PORCH },
  // (the portico's beam goes with the roof it carries, whole (`roofs`): as a wall of his room it opened where it
  // stood before the room, was a ghost where it hid floor he saw and stood whole past that, one beam in three
  // pieces, a slab of it left on a column, from play "just odd geometry... we should not make player wondering
  // what the geometry was before thinning", "like, wth is this")
  hallBeam: { k: HALL_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: WALL_RAMP, blended: true, cover: true, floor: TERRACE.high, floorBoxes: HALL_FLOORS,
    sight: true, door: HALL_DOOR, doorOn: HALL_DOOR_ON, walls: HALL_IN, porch: HALL_PORCH, roofs: HALL_IN },
  hallEast: { k: HALL_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: WALL_RAMP, blended: true, cover: true, floor: TERRACE.high, floorBoxes: HALL_FLOORS,
    sight: true, sightOn: HALL_SIGHT_ASIDE, walls: HALL_IN, porch: HALL_PORCH },
  hallWest: { k: HALL_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: WALL_RAMP, blended: true, cover: true, floor: TERRACE.high, floorBoxes: HALL_FLOORS,
    sight: true, sightOn: HALL_SIGHT_ASIDE, walls: HALL_IN, porch: HALL_PORCH },
  hallRoof: { k: ROOF_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: WALL_RAMP, blended: true, cover: true, floor: TERRACE.high, floorBoxes: HALL_FLOORS, oneLayer: true,
    roofs: HALL_IN },
  /** the other roofs: as what's built, and a ghost from above (`ROOF_GHOST_ABOVE`) */
  roof: { k: ROOF_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: WALL_RAMP, blended: true, cover: true, floor: 0 },
  /** a house's gables from above, fainter than its roof: at the roof's own ghost, plaster that pale read as a strip
   *  standing off the roof's end, edge on (a review; from play, "chimney/gable needs work") */
  gable: { k: ROOF_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: WALL_RAMP, blended: true, cover: true, floor: 0 },
  /** what stands free in the hall (its columns, its banners), which hides as much of the room as of him */
  // (those near the line to him: a column well aside of it hides nothing of him, and all gone, the portico stood on plinths)
  hallColumn: { k: COLUMN_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: { value: 0.4 }, blended: true, cover: true, floor: TERRACE.high, floorBoxes: HALL_FLOORS,
    pale: true, sight: true, sightShare: COLUMN_SIGHT, sightOn: HALL_SIGHT_COLUMNS,
    reach: { value: new Vec2(0.8, 1.6) }, room: HALL_ROOM, door: HALL_DOOR, high: COLUMN_HIGH },
} satisfies Record<string, Kind>;

/** how far the hall's walls thin where they hide the floor he sees (a share of their pixels, `hallSightCone`): from
 *  above, a wall between the camera and him hid what he'd see over the shoulder or through the eyes, from play, "we need
 *  to make the side wall transparent too, because he otherwise cannot see what he could see with 3rd person or 1st person
 *  camera", "not whole wall, right? only the cone of view". Its depth is let go while it's on, or the fog read the floor
 *  seen through it as the wall's place, past what he sees */
const HALL_SIGHT = { value: 0 };

/** How far the hall's walls thin where they hide the floor he sees, 0 to 1 (the game's `hallInside`): with him `inside`
 *  the hall, its front wall and its beam alone (from play, "this should be semi transparent, right? visibility cone
 *  and all"); with him on its portico, the portico's columns alone. */
export function hallSightCone(share: number, inside: boolean, onPortico: boolean): void {
  coneAsked = [share, inside, onPortico];
  if (wholeView()) share = 0;
  // (the columns alone, each as one by its middle: a wall thins whole or not at all, the game's `hidesSeenFloor`. By
  // the floor each of its pixels hid, a cone of his sight stood cut across the wall, a slanted pane with the columns
  // through it, from play, "didnt we agree to thin whole wall? but mark unseen regions with fog of war ?")
  HALL_SIGHT.value = 0;
  HALL_SIGHT_ASIDE.value = 0;
  HALL_SIGHT_COLUMNS.value = inside || onPortico ? -share : share;
}

/** how far short of where a ray of his sight stops the floor counts as seen for `seeSightCone`, from all to none (m) */
const SIGHT_CONE_SHORT = { from: 0.4, to: 0.1 };


/** What the cone of his sight reads (engine/seeKinds.ts): how far it's on, how far short of each ray, and how far
 *  under his floor the floor it hides is found */
export const SIGHT_CONE = { on: HALL_SIGHT, short: SIGHT_CONE_SHORT, floorClear: FLOOR_CLEAR };

/** What a column's capital is drawn in (`userData`, kept by a clone): drawn after its shaft and thinned as pale as it.
 *  Dark granite kept most of itself where the stucco shaft under it thinned as pale, and drawn before the shaft with its
 *  depth let go, the shaft's top showed over it: a solid dark slab on a ghost (from play, "black column should
 *  partially thin here too, right ?"). */
export const OVER_SHAFT = 'overShaft';

/** Whether `material` is a column's capital's (`OVER_SHAFT`). */
export const overShaft = (material: Material): boolean => material.userData[OVER_SHAFT] === true;

/** A hall column standing inside the room (`userData`): drawn before walls that thin before it, and solid to the
 *  fog's alpha read so unseen columns behind a thinned front wall take the room's full fog instead of painting bright
 *  over the wall (`drawnInTurn`). */
export const IN_HALL_COLUMN = 'inHallColumn';

/** Whether `material` belongs to an interior hall column (`IN_HALL_COLUMN`). */
export const inHallColumn = (material: Material): boolean => material.userData[IN_HALL_COLUMN] === true;

/** A column shaft (`userData`): counted in `countGhosts` while capitals, bases, and iron bands over it are left out so
 *  they don't double-count the column over itself. */
export const COLUMN_SHAFT = 'columnShaft';

/** Whether `material` is a column shaft (`COLUMN_SHAFT`). */
export const columnShaft = (material: Material): boolean => material.userData[COLUMN_SHAFT] === true;

/** how much less of itself a pale surface keeps as it thins by blending (`Kind.pale`): of what's thinned, a share by
 *  its albedo's luminance from `from` to `to`. A pale stucco shaft's ghost over him at the dark granite's share washed
 *  him out, from play, "this needs to be ghosted more... maybe need to vary by color" */
export const PALE = { most: 0.7, from: 0.1, to: 0.55 };

/** how far under the line from the eye to his feet a hole round him comes in, from none to all (m): what lies under
 *  that line hides nothing of him. Opened from his middle down alone, a cottage's wall before him stood as a band over
 *  his legs, its posts across them (from play, "if its thinned, its thinned enough so I can see my full character, not
 *  part"); and by height alone, down to his floor, the disc round his middle took a ledge under his feet on the screen
 *  apart in dots, a band across the frame */
export const HOLE_UNDER = { from: 0.15, to: 0 };

/** Less of it than this left and a blended thing drops the pixel: nothing's drawn, its depth too, or the fog would read
 *  what's under a roof gone as the roof */
export const BLEND_GONE = 0.02;
/** Props' dissolve strength at full weight: they stay a faint ghost, so the player can still see what they stand behind. */
const PROP_STRENGTH = 0.7;
/** The props' hole over the shoulder (wide round the camera's way past him) and from above, about the hero's own
 *  size on screen there: at the shoulder's, a stump beside him came apart though it hid nothing of him. */
const PROP_HOLE_CLOSE = { from: 1.0, to: 1.8 };
const PROP_HOLE_TOP = { from: 1.1, to: 2.0 };
/** How much more the props' hole counts an offset across the view (level, aside of the line to him) than up and down
 *  it, over the shoulder and from above: a body is a third as wide as it is tall (at 3, the wall half a metre beside
 *  him still came apart in a strip), and a round hole his height across
 *  took the wall or the cottage he stood beside apart toward the camera, though it hid nothing of him ("should not see
 *  through here, because I'm in the front"). */
const PROP_ACROSS = { close: 4, top: 1.2 };
/** While something hides him (`updateSeeThrough`'s `open`), all that stands free nearer than him thinned alike, a ghost
 *  still there: a hole his own size showed him alone (from play, "character and context around character needs to be
 *  visible even if the character is behind props"), and a wide one cut what it met at its edge, a lantern left floating
 *  over its post and a wall torn along the grass (two reviews). Beside what hides nothing, it isn't thinned. */
const GHOST_WHILE_HIDDEN = 0.55;
/** the props' across held by a harness (the round hole as it was, 1), or null */
let acrossHeld: number | null = null;
/** the hole's opening held by a harness (0: his own size, as it was), or null */
let openHeld: number | null = null;
/** whether a harness thins what's built over the shoulder too, as it was */
let builtThinned = false;
/** whether a harness has what's built open round him whether or not it hides him, as it was */
let heldOpenAlways = false;
/** what a harness holds the roofs' ghost from above at */
let roofGhostHeld: number | null = null;
/** whether a harness holds the props' hole shut (a frame drawn as without it) */
let fadeHeld = false;
/** whether the hall alone is what's thinned for him now, so what stands free stays whole (`propsLeftWhole`) */
let propsWhole = false;

const HALL_FLOOR_CUT = { value: 0 };
const PORTICO_DEPTH_HELD = { value: 0 };

function bindUniforms(uniforms: Record<string, Uniform>, kind: keyof typeof kinds): void {
  const u = kinds[kind];
  uniforms.uSeeFocus = focus;
  uniforms.uSeeK = u.k;
  uniforms.uSeeMinY = u.minY;
  uniforms.uSeeFloorCut = HALL_FLOOR_CUT;
  uniforms.uSeeAcross = u.across;
  uniforms.uSeeWhole = u.whole;
  uniforms.uSeeRamp = u.ramp;
  uniforms.uSeeReach = (u as Kind).reach ?? ALL_OF_IT;
  if ((u as Kind).reach) uniforms.uSeeColumns = COLUMNS_SEEN;
  uniforms.uSeeRoom = (u as Kind).room ?? ANYWHERE;
  uniforms.uSeeDoor = (u as Kind).door ?? NO_DOOR;
  uniforms.uSeeDoorOn = (u as Kind).doorOn ?? DOOR_SHUT;
}

/** What a material dissolves by, as the engine reads it off the material (`SeeThrough`): the followed character,
 *  and its kind's hole and floor. */
export interface SeeThrough {
  focus: { value: Vec3 };
  k: { value: Vec4 };
  minY: { value: number };
  across: { value: number };
  whole: { value: number };
  ramp: { value: number };
  reach?: { value: Vec2 };
  /** of a cover with a `reach`: how high it stands over its floor (m). Where it stands between the camera and him
   *  all of it is a ghost, foot to top, by that height */
  high?: number;
  /** of a cover with `walls`: never gone whole. Where its wall would be (he stands in its room, or before its door
   *  seeing in), all of it is the rule's ghost instead: what keeps him out of where it stands, a door's leaves */
  stays?: boolean;
  room?: { value: Vec4 };
  door?: { value: Vec4 };
  doorOn?: { value: number };
  blended?: boolean;
  cover?: boolean;
  floor?: number;
  floorBoxes?: readonly (readonly [number, number, number, number])[];
  roofs?: readonly [number, number, number, number];
  walls?: readonly [number, number, number, number];
  porch?: readonly [number, number, number, number];
  pale?: boolean;
  oneLayer?: boolean;
  sight?: boolean;
  sightShare?: number;
  sightOn?: { value: number };
  /** draws only what's left whole of it, for its depth (`depthOfWhatStaysWhole`) */
  wholeOnly?: boolean;
  /** of `wholeOnly`: thinned past this it writes no depth (a uniform's for the hall's columns, `COLUMN_STILL`) */
  stillWhole?: number | { value: number };
}

/** each kind's values, one object a kind */
const seen = new Map<keyof typeof kinds, SeeThrough>();

/** `m`'s dissolve given it for the engine (`seeThrough`, a property of its own: not copied to a clone). */
function markSeeThrough(m: Material, kind: keyof typeof kinds): void {
  Object.defineProperty(m, 'seeThrough', { value: seeValue(kind), configurable: true });
}

/** A kind's numbers as a material of it carries them (`material.seeThrough`): one object a kind. For a renderer
 *  with no hook of three's, which fades a glow by them (the Rust engine's `RustLook.fades`). */
export function seeValue(kind: keyof typeof kinds): SeeThrough {
  let value = seen.get(kind);
  if (!value) seen.set(kind, value = { focus, ...kinds[kind] });
  return value;
}

/** The hole that keeps the hero in sight as it stands now, for a renderer of our own (src/engine): the point
 *  nothing may hide, the props' hole (`Kind.k`) and the height nothing lower dissolves at. */
export const holeNow = (): { focus: Vec3; k: Vec4; minY: number } =>
  ({ focus: focus.value, k: PROP_K.value, minY: PROP_MIN_Y.value });

/** Dissolve `m` where it stands between the camera and the player (the engine thins it by its marker,
 *  `seeThrough`: engine/materials.ts). A roof and
 *  what the hall thins whole blend (from play, "Yes, real blending": a pattern of dots over a roof reads as a screen door,
 *  and the fog, reading the depth, stippled it too), with their depth kept, for the fog to read them as what they are. */
export function seeThrough<M extends Material>(m: M, kind: keyof typeof kinds): M {
  markSeeThrough(m, kind);
  const blended = (kinds[kind] as Kind).blended === true;
  if (blended) {
    m.transparent = true;
    m.depthWrite = true;
    // (a portico column too: its depth let go, the fog fogged its own share with the ground past it, a dark slab over
    // the portico, "without 'slanted roof' on it"; an interior column keeps normal blending so its alpha stays 1 under
    // a thinned front wall, letting the fog dark-tint it whole instead of showing through the wall)
    if (kind === 'roof' || kind === 'gable' || (kind === 'hallColumn' && !inHallColumn(m))) tellsItsShare(m);
    if (kind !== 'built' && kind !== 'fence') thinningWhole.set(kind, [...(thinningWhole.get(kind) ?? []), m]);
  }
  return m;
}

/** Whether `material` thins by blending: drawn blended, it's as solid as what's opaque, to a body or a shot. */
export const thinsByBlending = (material: Material): boolean =>
  (material as { seeThrough?: SeeThrough }).seeThrough?.blended === true;

/** Whether `material` is seen through from above whatever it hides: a roof, or the hall's walls. A cottage's walls and the
 *  palisade blend too, but only open round him while they hide him. */
export const seenThroughFromAbove = (material: Material): boolean => {
  const k = (material as { seeThrough?: SeeThrough }).seeThrough?.k;
  return k === ROOF_K || k === HALL_K;
};

/** What three sorts a list's blended things by. */
interface Sorted {
  groupOrder: number; renderOrder: number; z: number; id: number; material: Material; object: Node;
}

/** the middle of what each blended thing draws, in the world: what's built stands still, and is merged, so its own place
 *  says nothing of where it's drawn */
const middles = new WeakMap<Node, Vec3>();

/** The middle of what `object` draws. */
function middleOf(object: Node): Vec3 {
  let middle = middles.get(object);
  if (middle) return middle;
  const geometry = (object as Mesh).geometry;
  if (geometry && !geometry.boundingSphere) geometry.computeBoundingSphere();
  middle = (geometry?.boundingSphere?.center.clone() ?? new Vec3()).applyMatrix4(object.matrixWorld);
  middles.set(object, middle);
  return middle;
}

/** middle of the hall's interior colonnade, for comparing wall distance against the columns inside */
const HALL_MIDDLE = new Vec3(
  TERRACE.x,
  TERRACE.high + HALL.wallHigh * 0.5,
  (HALL.columnZ[0] + HALL.columnZ[HALL.columnZ.length - 1]) * 0.5,
);

/** whether a harness has what stands free drawn in with the walls, as it was */
let columnsUnderWalls = false;

/** For a harness (tools/lab): what stands free in the hall drawn in with its walls, as it was. */
export function holdColumnsUnderWalls(held: boolean): void {
  columnsUnderWalls = held;
}

/** whether a harness draws interior hall columns after the thinned front wall, as they were */
let roomColumnsOverWalls = false;

/** For a harness (tools/lab): interior hall columns drawn over thinned walls, as they were. */
export function holdRoomColumnsOverWalls(held: boolean): void {
  roomColumnsOverWalls = held;
}

/** Which comes first of what thins by blending: the depth of what's left whole, then while all solid the legacy
 *  walls/columns/roofs turns; while anything thins, interior columns draw before a thinned wall nearer the eye so
 *  the wall blends over them rather than letting unseen columns paint bright over the front wall and jambs. */
function drawnInTurn(material: Material, object: Node, nearFirst: boolean): number {
  const see = (material as { seeThrough?: SeeThrough }).seeThrough;
  if (nearFirst) {
    if (see?.wholeOnly) return see.k === COLUMN_K && !columnsUnderWalls ? 1.5 : 0;
    if (see?.k === ROOF_K) return 3;
    if (see?.k === COLUMN_K && !columnsUnderWalls) return overShaft(material) ? 2.5 : 2;
    return 1;
  }
  if (columnsUnderWalls && see?.k === COLUMN_K) return 0.5;
  if (see?.k === ROOF_K) return 3;
  if (see?.wholeOnly) {
    if (see.k !== COLUMN_K) return 0;
    if (inHallColumn(material)) return roomColumnsOverWalls ? 2.0 : 1.2;
    return sortEye.value.z >= HALL.door ? 2.0 : 0.6;
  }
  if (see?.k === COLUMN_K) {
    if (inHallColumn(material)) {
      if (roomColumnsOverWalls) return overShaft(material) ? 2.5 : 2.2;
      return overShaft(material) ? 1.6 : 1.4;
    }
    if (sortEye.value.z >= HALL.door) return overShaft(material) ? 2.5 : 2.2;
    return overShaft(material) ? 0.8 : 0.7;
  }
  if (see?.k === HALL_K && !material.depthWrite && awayFromEye(object) < HALL_MIDDLE.distanceToSquared(sortEye.value)) {
    return 1.8;
  }
  return 1;
}

/** For a harness (tools/lab): the hall's columns hidden, or back. */
export function hideHallColumns(hidden: boolean): void {
  for (const material of thinningWhole.get('hallColumn') ?? []) material.visible = !hidden;
  // (their depth with them: a portico's column keeps all of it, and left, its depth stood where none was drawn)
  for (const twin of wholeDepths.get('hallColumn') ?? []) (twin.material as Material).visible = !hidden;
}

/** The hall's room told to what thins whole of its walls, and its door's jambs (x, z, x, z). */
export function hallRoomIs(room: Vec4, door: Vec4): void {
  HALL_ROOM.value.copy(room);
  HALL_DOOR.value.copy(door);
}


/** Whether what stands free stays whole, while the hall alone is what's thinned for him: thinned too, the terrace's coping
 *  stood in dots across the frame, over the hall's foot, for hiding nothing of him, from play, "also this is broken". */
export function propsLeftWhole(whole: boolean): void {
  propsWhole = whole && !propsThinnedHeld;
}

/** whether a harness has what stands free thin while the hall alone is thinned for him, as it did */
let propsThinnedHeld = false;

/** For a harness (tools/lab): what stands free thinned while the hall alone is thinned for him, as it was. */
export function holdPropsThinned(held: boolean): void {
  propsThinnedHeld = held;
}

/** How two things that thin by blending are ordered: in their turns, each back to front by the middle of what it draws.
 *  With its depth let go a whole wall past him was painted over by what stood behind it, in an order that changed with
 *  the camera, as all a merge draws stands at the origin (from play, "this is still flickering"). */
function blendedOrder(a: Sorted, b: Sorted): number {
  const nearFirst = orderHeld === 'nearFirst' || (orderHeld === 'asIs' && solidNow && BLENDED_ORDER.nearFirst > 0);
  // (in their turns either way: where two lie at one depth, a column's base on its block, the turn decides which shows,
  // as it did; ordered by distance alone, which showed changed with what else was drawn, the hall's doorway culling)
  const turn = drawnInTurn(a.material, a.object, nearFirst) - drawnInTurn(b.material, b.object, nearFirst);
  if (turn !== 0) return turn;
  if (nearFirst) {
    const nearer = awayFromEye(a.object) - awayFromEye(b.object);
    return nearer !== 0 ? nearer : a.id - b.id;
  }
  const away = awayFromEye(b.object) - awayFromEye(a.object);
  return away !== 0 ? away : a.id - b.id;
}

/** How far `object` stands from the eye, squared, for the order of what blends: a ring's by its nearest part ahead, any
 *  other's by its middle. */
const awayFromEye = (object: Node): number =>
  nearestAhead.get(object) ?? middleOf(object).distanceToSquared(sortEye.value);

/** what's ordered by its part nearest the eye (`sortByNearest`): each one's parts' places in the world */
const ringParts = new Map<Node, Vec3[]>();
/** each such one's distance this frame, squared (`sortBlendedFrom`) */
const nearestAhead = new Map<Node, number>();
/** whether a harness has the rings ordered by their middles, as they were */
let ringsByMiddle = false;

/**
 * `mesh` ordered among what blends by its instance nearest the eye ahead of it, not by its middle: the palisade, a ring
 * round the village, has its middle in the village's, so seen from outside it was drawn before the cottages past it, and
 * its ghost in its hole wrote depth they then failed, their walls and roofs gone to their footings (from play, "where
 * did the house go?"; `lab village --only housesPastFence`).
 */
export function sortByNearest(mesh: InstancedMesh): void {
  const parts: Vec3[] = [];
  const matrix = new Mat4();
  mesh.updateMatrixWorld(true);
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix);
    parts.push(new Vec3().setFromMatrixPosition(matrix.premultiply(mesh.matrixWorld)));
  }
  ringParts.set(mesh, parts);
}

/** For a harness (tools/lab): the rings ordered by their middles, as they were. */
export function holdRingsByMiddle(held: boolean): void {
  ringsByMiddle = held;
}

/** Each ring's part nearest the eye ahead of it (`toward`, the way it looks), squared, kept for this frame's order. */
function measureRings(toward: Vec3): void {
  nearestAhead.clear();
  if (ringsByMiddle) return;
  for (const [ring, parts] of ringParts) {
    let nearest = Infinity;
    for (const part of parts) {
      _toPart.subVectors(part, sortEye.value);
      if (_toPart.dot(toward) > 0) nearest = Math.min(nearest, _toPart.lengthSq());
    }
    if (nearest < Infinity) nearestAhead.set(ring, nearest);
  }
}
const _toPart = new Vec3();

/** Whether `material` draws for what blends' order: what thins by blending, or the depth of what's left whole of it. */
const drawsWithTheBlended = (material: Material): boolean =>
  thinsByBlending(material) || (material as { seeThrough?: SeeThrough }).seeThrough?.wholeOnly === true;

/** where the camera stands, for what thins by blending to be ordered by */
const sortEye = { value: new Vec3() };

/** whether nothing that thins by blending may thin this frame: each is as solid as what's opaque, drawn whole */
let solidNow = false;
/** For a harness (tools/lab, `--tune blendedOrder.nearFirst=0`): what blends drawn back to front even when it's all
 *  solid, as it was. */
const BLENDED_ORDER = tunable('blendedOrder', { nearFirst: 1 });

/** How a harness holds the order of what blends: as the game has it, back to front always (as it was), or near to far
 *  always (the canary's: with something thinned, a ghost drawn before what's behind it hides it). */
export type BlendedOrderHeld = 'asIs' | 'backToFront' | 'nearFirst';
let orderHeld: BlendedOrderHeld = 'asIs';

/** For a harness (tools/lab): the order of what blends held as `how` says. */
export function holdBlendedOrder(how: BlendedOrderHeld): void {
  orderHeld = how;
}

/** Whether what blends was all solid as this frame was sorted (a harness's state checked). */
export const blendedSolid = (): boolean => solidNow;

/** Whether `kind` may thin any of itself this frame: none of its uniforms asks for any, and its fragment is dropped. */
function mayThin(kind: keyof typeof kinds): boolean {
  const u = kinds[kind] as Kind;
  if (u.k.value.z > 0 || u.whole.value > 0) return true;
  if ((u.doorOn ?? DOOR_SHUT).value !== 0) return true;
  return u.sight === true && (u.sightOn ?? HALL_SIGHT).value !== 0;
}

/** Whether every kind that thins by blending is whole this frame (nothing thinned, no hole, no door open). */
const allBlendedSolid = (): boolean =>
  (Object.keys(kinds) as (keyof typeof kinds)[]).every((kind) => !(kinds[kind] as Kind).blended || !mayThin(kind));

/** The camera's place told to the order of what blends, as it's about to be drawn, and the way it looks; with nothing
 *  of it thinning (over the shoulder, in the hall or on the square), it's drawn near to far, as what's opaque is, so
 *  what a nearer wall or column covers is never lit (back to front, the hall's walls lit the floor and walls behind
 *  each column and each other: what's see-through or cut out, 21 ms of the 4080's 34 ms scene pass there). */
export function sortBlendedFrom(eye: Vec3, toward: Vec3): void {
  sortEye.value.copy(eye);
  measureRings(toward);
  solidNow = allBlendedSolid();
}

/** whether a harness has what thins by blending sorted among the glows, as it was */
let blendedAmongGlows = false;

/** For a harness (tools/lab): what thins by blending sorted by distance with all else that blends, as it was. */
export function holdBlendedAmongGlows(held: boolean): void {
  blendedAmongGlows = held;
}

/** The order of what blends, for `setTransparentSort`: what's built and thins by blending before all else, as it's as
 *  solid as what's opaque, then back to front as three has it. Sorted by its distance among them, a stair of the tomb past
 *  a portal drew over the portal's vortex, which writes no depth, from the angles that put its mesh nearer the camera
 *  (from play, "some kinda glitch at the portal, only under some angles"). */
export function blendedBuiltFirst(a: Sorted, b: Sorted): number {
  if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
  const firstA = !blendedAmongGlows && drawsWithTheBlended(a.material);
  const firstB = !blendedAmongGlows && drawsWithTheBlended(b.material);
  if (firstA !== firstB) return firstA ? -1 : 1;
  if (firstA) return blendedOrder(a, b);
  if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
  if (a.z !== b.z) return b.z - a.z;
  return a.id - b.id;
}

/** The roof's pixel says how much of it is roof: its alpha over what's opaque comes to what's left of what's under it,
 *  which the fog alone lies over (`seenColour`'s `under`). With its depth kept, the fog read a roof's whole pixel as the
 *  roof, and the grass and walls seen through it stood bright over what he can't see (from play, "fog of war bugs"); and
 *  fogged by what's under it, a roof would be the fog's colour whole, as a house's inside is always hidden from him. */
function tellsItsShare(m: Material): void {
  m.blending = CustomBlending;
  m.blendEquation = AddEquation;
  m.blendSrc = SrcAlphaFactor;
  m.blendDst = OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = ZeroFactor;
  m.blendDstAlpha = OneMinusSrcAlphaFactor;
}

/** the blended materials of what thins whole, by kind, their depth let go as they thin */
const thinningWhole = new Map<string, Material[]>();
/** thinned past this share, what thins whole leaves the depth to what's behind it: the fog reads the frame's depth, and
 *  the room behind a ghost of the hall's front wall lay under the fog of the wall's own place, whole */
const DEPTH_LET_GO = 0.3;

/** the meshes that write the depth of what's left whole, by kind, each shown only while its kind's depth is let go; the
 *  first of a kind always, for its program to be warmed with the rest */
const wholeDepths = new Map<FadesWhole, Mesh[]>();
/** how little thinned counts as left whole: a wall all but solid that gave up its depth let what's behind it draw over
 *  it, the hall's columns standing on the front wall as if painted there (from play, "still looks broken to me"). At half
 *  thinned, the fog read a wall where the ground past it showed through: `--only sightBlacksOut` */
const STILL_WHOLE = 0.15;
/** A column keeps all its depth, drawn after the walls (`drawnInTurn`), so nothing thins past this: where it left off at
 *  the disc round him, the shaft's top drew over its capital's corner, and a column behind over the capital (from play,
 *  "this geometry is messed up", "but this is a defect, right ?"). Walls are drawn after their depth, so a ghost of a
 *  wall must leave what's behind it room; a column's is drawn over them already. */
const KEEPS_ALL = 2;
/** How thinned the hall's columns count as left whole now: all of them with him in the hall (`KEEPS_ALL`), and with him
 *  outside as a wall does, `STILL_WHOLE` (`columnsKeepAllDepth`). Their depth kept, the fog read a thinned column's
 *  place inside the hall, which he can't see, and from over the roof one stood over him as a dark slab (from play,
 *  "why this not becoming transparent ?") */
const COLUMN_STILL = { value: KEEPS_ALL };

/** Whether the hall's columns keep all their depth however thinned (him in the hall), or let a thinned part's go. */
export function columnsKeepAllDepth(all: boolean): void {
  COLUMN_STILL.value = all ? KEEPS_ALL : STILL_WHOLE;
}

/** A material for the depth alone of what's left whole of `kind`. */
function wholeDepthMaterial(kind: FadesWhole, side: Side): Material {
  // (a hair behind what it follows, whose own draw must pass the depth test over it)
  const material = new UnlitMaterial({
    colorWrite: false, transparent: true, depthWrite: true, side, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2,
  });
  const column = kind === 'hallColumn';
  const stillWhole = column ? COLUMN_STILL : STILL_WHOLE;
  Object.defineProperty(material, 'seeThrough', {
    value: { focus, ...kinds[kind], blended: false, wholeOnly: true, stillWhole },
  });
  return material;
}

/**
 * For each mesh under `root` of a kind that lets its depth go, one writing the depth of what's left whole of it. The fog
 * reads the frame's depth: with a wall's let go whole, for what's seen through its ghost to be read as itself, the part of
 * it past him read as the room behind it, and lay in that room's fog, dark glass over the wall he stood before (from play,
 * "here we dont need to see through the wall, because I'm in front of the wall"), and what's behind it drew over it.
 * Depth is written fragment by fragment only by a draw of its own. They stand still, as what they follow does.
 */
export function depthOfWhatStaysWhole(root: Node): void {
  const made = new Map<string, Material>();
  const twins: { mesh: Mesh; kind: FadesWhole; of: Mesh }[] = [];
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || (mesh as InstancedMesh).isInstancedMesh || Array.isArray(mesh.material)) return;
    const kind = ([...HALL_WALL_KINDS, 'hallColumn'] as const).find((name) => thinningWhole.get(name)?.includes(mesh.material as Material));
    if (!kind) return;
    const inside = inHallColumn(mesh.material);
    const key = `${kind}|${mesh.material.side}|${inside ? 'in' : ''}`;
    let material = made.get(key);
    if (!material) {
      material = wholeDepthMaterial(kind, mesh.material.side);
      if (inside) material.userData[IN_HALL_COLUMN] = true;
      made.set(key, material);
    }
    const twin = new Mesh(mesh.geometry, material);
    mesh.updateWorldMatrix(true, false);
    twin.matrix.copy(mesh.matrixWorld);
    twin.matrixWorld.copy(mesh.matrixWorld);
    twin.matrixAutoUpdate = false;
    twin.matrixWorldAutoUpdate = false;
    twin.userData.noMerge = true;
    // (nothing to meet: it's what it follows, a second surface in its plane to a ray)
    twin.raycast = () => {};
    twins.push({ mesh: twin, kind, of: mesh });
  });
  for (const { mesh, kind, of } of twins) {
    // (under what it follows, hidden with it)
    of.add(mesh);
    const ofKind = wholeDepths.get(kind) ?? [];
    mesh.visible = ofKind.length === 0;
    wholeDepths.set(kind, [...ofKind, mesh]);
  }
}

/** The twins that counted the ghosts that blend over each pixel were drawn by the WebGL renderer alone
 *  (`core/ghostLayers.ts`): nothing is counted now, each ghost kept as one alone is. Kept for its callers. */
export function countGhosts(_root: Node, _layer: number): void {}

/** The kinds that thin whole. */
export type FadesWhole = HallWallKind | 'hallRoof' | 'hallColumn' | 'hallLeaves';

/** The hall's walls, each thinning by itself. */
export const HALL_WALL_KINDS = ['hallFront', 'hallBack', 'hallEast', 'hallWest', 'hallBeam'] as const;
export type HallWallKind = (typeof HALL_WALL_KINDS)[number];

/** How much of what's before the hero `kind` thins by a share of its own, a whole wall's rather than a hole round him. */
export function fadeWhole(kind: FadesWhole, share: number): void {
  wholeAsked.set(kind, share);
  if (wholeView()) share = 0;
  kinds[kind].whole.value = share;
  const letGo = share >= DEPTH_LET_GO || ((kind === 'hallFront' || kind === 'hallBeam') && HALL_DOOR_ON.value > 0)
    || ((kinds[kind] as Kind).sight === true && ((kinds[kind] as Kind).sightOn ?? HALL_SIGHT).value !== 0);
  for (const material of thinningWhole.get(kind) ?? []) material.depthWrite = !letGo;
  (wholeDepths.get(kind) ?? []).forEach((mesh, at) => {
    mesh.visible = letGo || at === 0;
  });
}

/** The share `kind` is thinned by now. */
export const wholeShare = (kind: FadesWhole): number => kinds[kind].whole.value;

/** Whether `kind` is thinned at all now. */
export const fadedWhole = (kind: FadesWhole): boolean => kinds[kind].whole.value > 0;

let doorAsked = 0;

/** How far the middle doorway bay over the hall's door (`hallFront` and `hallBeam`) thins when looking in from outside. */
export function fadeHallDoor(share: number): void {
  doorAsked = share;
  if (wholeView()) share = 0;
  const wasOpen = HALL_DOOR_ON.value > 0;
  HALL_DOOR_ON.value = share;
  if (wasOpen !== (share > 0)) {
    fadeWhole('hallFront', wholeAsked.get('hallFront') ?? 0);
    fadeWhole('hallBeam', wholeAsked.get('hallBeam') ?? 0);
  }
}

/** The share the middle doorway bay over the hall's door is thinned by now. */
export const doorFadeShare = (): number => HALL_DOOR_ON.value;

/**
 * A look material's share of `seeThrough`: its kind's values bound to its uniforms by name, for a glow or a veil to
 * fade out by rather than dither (a screen door in a glow reads as noise). The engine fades its look by `seeValue`.
 */
export function seeThroughFade<M extends LookMaterial>(m: M, kind: keyof typeof kinds): M {
  bindUniforms(m.uniforms, kind);
  return m;
}

/** How far short of the followed character a prop's see-through hole ends (m). */
export const seeHoleEnd = (): number => kinds.prop.k.value.w;

/**
 * Each frame: where the followed character is, how far props dissolve (0..1: none through the eyes), how far the view
 * is from above (0..1), whose hole is narrower, and how far the hole opens round him (0..1: `core/heroHidden.ts`): for
 * what hides him, for what's built alone and for a fence alone.
 */
export function updateSeeThrough(x: number, y: number, z: number, props: number, top: number, floor = 0, open = 0,
  builtOpen = 0, fenceOpen = 0, propsOver = 1): void {
  seeAsked = [x, y, z, props, top, floor, open, builtOpen, fenceOpen, propsOver];
  // (nothing dissolved in a whole view: every hole's strength and every ghost's share is a share of `props`)
  if (wholeView()) props = 0;
  focus.value.set(x, y, z);
  PROP_MIN_Y.value = floor + FLOOR_CLEAR;
  const from = PROP_HOLE_CLOSE.from + (PROP_HOLE_TOP.from - PROP_HOLE_CLOSE.from) * top;
  const to = PROP_HOLE_CLOSE.to + (PROP_HOLE_TOP.to - PROP_HOLE_CLOSE.to) * top;
  const strength = fadeHeld ? 0 : PROP_STRENGTH * props;
  // (the hole his own size only while what stands free hides him at his waist or above: a parapet before his legs alone
  // stood in dots over them, "dont thin if obstacle is below waist", and the hole took the corner of the notice board
  // beside him, which hid nothing of him, "half drawn props")
  const overHeld = heldOpenAlways || openHeld !== null || fadeHeld;
  PROP_K.value.set(from, to, strength * (overHeld ? 1 : propsOver), PROP_K.value.w);
  // (from above alone, what's built: over the shoulder the camera is on his side of it)
  const built = builtThinned ? strength : strength * top;
  const wider = (openHeld ?? builtOpen) * top * BUILT_OPENS;
  // (only while it hides him: a hole his own size all the time thinned the wall he stood beside, hiding nothing of him,
  // and a shutter thinned there, its depth written, held back the wall behind it, the grass past both showing through,
  // from play, "it shows green where it should not")
  const hides = (share: number): number => (heldOpenAlways ? 1 : openHeld === null ? share : 1);
  BUILT_K.value.set(from + wider, to + wider, built * hides(builtOpen), BUILT_K.value.w);
  const fenceWider = (openHeld ?? fenceOpen) * top * BUILT_OPENS;
  FENCE_K.value.set(from + fenceWider, to + fenceWider, built * hides(fenceOpen), FENCE_K.value.w);
  // (a roof's hole opens less wide: wide as a wall's while it hides him, it took all of a cottage's roof, and what lay under
  // it stood as a glass box with a strip of grass across it, where the roof of the next cottage stood whole, a review)
  const roofWider = wider * ROOF_HOLE_WIDER;
  ROOF_K.value.set(from + roofWider, to + roofWider, built, ROOF_K.value.w);
  kinds.roof.whole.value = (roofGhostHeld ?? ROOF_GHOST_ABOVE) * top * props;
  kinds.gable.whole.value = GABLE_GHOST_ABOVE * top * props;
  for (const material of [...(thinningWhole.get('roof') ?? []), ...(thinningWhole.get('gable') ?? [])]) {
    material.depthWrite = kinds.roof.whole.value < ROOF_LET_GO;
  }
  // (what's built hiding him alone leaves what stands free whole: a lamp past a cottage stood in dots, a review; and what
  // stands free thins all the way as soon as it hides any of him, never by a share: by the share of him hidden, the
  // notice board's roof grazing him thinned a little, and only in the hole round him, "if its thinned, its thinned
  // enough so I can see my full character")
  const propsHide = openHeld ?? propsOver;
  kinds.prop.whole.value = fadeHeld || propsWhole ? 0 : propsHide * GHOST_WHILE_HIDDEN * props;
  kinds.propFoot.whole.value = kinds.prop.whole.value;
  PROP_ACROSS_NOW.value = acrossHeld ?? PROP_ACROSS.close + (PROP_ACROSS.top - PROP_ACROSS.close) * top;
}

/** what the game last asked of `updateSeeThrough`, `hallSightCone` and `fadeWhole`: a whole view (`core/wholeView.ts`)
 *  draws none of it, and it's put back as that view is let go */
let seeAsked: Parameters<typeof updateSeeThrough> | null = null;
let coneAsked: Parameters<typeof hallSightCone> | null = null;
const wholeAsked = new Map<FadesWhole, number>();
// (set again at once, as asked: with the game frozen, no frame of its own sets them. The cone first: a wall's depth
// is let go by it, `fadeWhole`)
onWholeView(() => {
  if (coneAsked) hallSightCone(...coneAsked);
  fadeHallDoor(doorAsked);
  if (seeAsked) updateSeeThrough(...seeAsked);
  for (const [kind, share] of [...wholeAsked]) fadeWhole(kind, share);
});

/** How far a roof thins from above now, where it thins (0: not from above): a house's walls thin by it too, where
 *  they hide ground he sees. */
/** How far the engine's rule for a house from above is on, 0 to 1 (`Kind.cover`): all of it from above, coming in
 *  as the roofs' own ghost does when the view changes. */
export function coverRuleNow(): number {
  return Math.min(1, kinds.roof.whole.value / ROOF_GHOST_ABOVE);
}

export function roofGhostNow(): number {
  return kinds.roof.whole.value;
}

/** For a harness (tools/lab): every roof thinned from above by `ghost` (null: the game's), from the next frame: thinner,
 *  what lies under one shows enough to read the fog on it. */
export function holdRoofGhost(ghost: number | null): void {
  roofGhostHeld = ghost;
}

/** For a harness (tools/lab): the props' hole held shut, at once (a frame drawn again as it was, without it), and its
 *  across held (null: the game's) from the next frame. */
export function holdPropHole(shut: boolean, across: number | null = null): void {
  fadeHeld = shut;
  acrossHeld = across;
  if (!shut) return;
  for (const k of [PROP_K, BUILT_K, FENCE_K, ROOF_K]) k.value.z = 0;
  kinds.prop.whole.value = 0;
  kinds.propFoot.whole.value = 0;
}

/** For a harness (tools/lab): the hole's opening held (0: his own size, as it was; null: the game's). */
export function holdHoleOpening(opening: number | null): void {
  openHeld = opening;
}

/** For a harness (tools/lab): what's built drawn with no hole, at once (a frame drawn again as it was without it). */
export function holdBuiltWhole(whole: boolean, built: number): number {
  const was = BUILT_K.value.z;
  BUILT_K.value.z = whole ? 0 : built;
  FENCE_K.value.z = whole ? 0 : built;
  ROOF_K.value.z = whole ? 0 : built;
  return was;
}

/** For a harness (tools/lab): the hole in what's built or in a fence drawn shut, at once, until the next frame opens it as
 *  the game does (a frame drawn again as it was without it). */
export function shutHole(kind: 'built' | 'fence'): void {
  (kind === 'built' ? BUILT_K : FENCE_K).value.z = 0;
}

/** For a harness (tools/lab): what's built and the hall's columns drawn with nothing thinned (the floor he sees thinning
 *  them too, `hallSightCone`), at once, and a function that puts it back. What stands free and the roofs stay as they are: a ghost of one over a wall is no fault of the wall's. */
export function thinningLetGo(): () => void {
  const kept = BUILT_K.value.z;
  const fenceKept = FENCE_K.value.z;
  const sight = HALL_SIGHT.value;
  const doorKept = doorAsked;
  const thinned = ([...HALL_WALL_KINDS, 'hallColumn'] as const).map((kind) => [kind, kinds[kind].whole.value] as const);
  BUILT_K.value.z = 0;
  FENCE_K.value.z = 0;
  HALL_SIGHT.value = 0;
  const aside = HALL_SIGHT_ASIDE.value;
  const columns = HALL_SIGHT_COLUMNS.value;
  HALL_SIGHT_ASIDE.value = 0;
  HALL_SIGHT_COLUMNS.value = 0;
  fadeHallDoor(0);
  for (const [kind] of thinned) fadeWhole(kind, 0);
  return () => {
    BUILT_K.value.z = kept;
    FENCE_K.value.z = fenceKept;
    HALL_SIGHT.value = sight;
    HALL_SIGHT_ASIDE.value = aside;
    HALL_SIGHT_COLUMNS.value = columns;
    fadeHallDoor(doorKept);
    for (const [kind, share] of thinned) fadeWhole(kind, share);
  };
}

/** For a harness (tools/lab): what thins reaching past him, as a depth along the sight had it from above. */
export function holdThinningReach(past: boolean): void {
  for (const k of [PROP_K, BUILT_K, FENCE_K, COLUMN_K]) k.value.w = past ? -1000 : 0.25;
}

/** For a harness (tools/lab): what's built open round him whether or not it hides him, as it was. */
export function holdBuiltOpenAlways(always: boolean): void {
  heldOpenAlways = always;
}

/** For a harness (tools/lab): what's built thinned over the shoulder too, as it was. */
export function thinBuiltOverShoulder(on: boolean): void {
  builtThinned = on;
}

/** For a harness (tools/lab): keep the `FLOOR_CLEAR` bottom cut on whole-thinned hall walls and roofs, as it was. */
export function holdHallFloorClear(held: boolean): void {
  HALL_FLOOR_CUT.value = held ? 1 : 0;
}

/** For a harness (tools/lab): keep full depth on portico columns even while inside the hall, as it was. */
export function holdPorticoDepthInside(held: boolean): void {
  PORTICO_DEPTH_HELD.value = held ? 1 : 0;
}
