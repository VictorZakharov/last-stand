// Screen-door dissolve of world geometry between the camera and the character it follows, so
// nothing hides the player. Only the main pass: shadow maps render with their own depth
// material, so shadows stay whole.
import * as THREE from 'three';
import { RUNNING } from './rendererChoice';

/** how far over his floor a prop starts to dissolve (m): the terrace's and the hall's floor came apart round his feet
 *  when this was held at the village's ground, 1.6 m under them */
const FLOOR_CLEAR = 0.12;

/** the followed character (chest height), set by the camera every frame */
const focus = { value: new THREE.Vector3() };

/**
 * How a class of material dissolves: x..y the radius round the camera-to-player line where the
 * fade runs out, z the share of pixels dropped at its core (0 turns it off), w how far short of
 * the player it stops. `minY`: nothing lower dissolves (the floor under a prop stays).
 */
interface Kind {
  k: { value: THREE.Vector4 };
  minY: { value: number };
  across: { value: number };
  whole: { value: number };
  /** how far short of him what thins whole comes back (m) */
  ramp: { value: number };
  /** whether it thins by blending, not by a pattern of dropped pixels */
  blended?: boolean;
  /** how far round the line to him what thins whole reaches: from x it comes back, whole by y (m at his depth); all of it
   *  if not given */
  reach?: { value: THREE.Vector2 };
  /** the room it thins for (least x, least z, most x, most z): only what has it just past it along the view thins whole;
   *  everywhere if not given */
  room?: { value: THREE.Vector4 };
  /** the door's two jambs (x, z, x, z), for the cone he sees through it to open in it; none if not given */
  door?: { value: THREE.Vector4 };
  /** how far that cone is open (a share of what's in it dropped) */
  doorOn?: { value: number };
}
/** what thins whole reaching all of it */
const ALL_OF_IT = { value: new THREE.Vector2(1e5, 1e6) };
/** no room to thin for */
const ANYWHERE = { value: new THREE.Vector4(-1e5, -1e5, 1e5, 1e5) };
/** the hall's room, for what thins whole of its walls */
const HALL_ROOM = { value: new THREE.Vector4(-1e5, -1e5, 1e5, 1e5) };
/** the hall's door's jambs, and how far what hides the cone he sees through it is thinned (`seeDoorCone`) */
const HALL_DOOR = { value: new THREE.Vector4() };
const HALL_DOOR_ON = { value: 0 };
/** the same for what stands in the room past it, less than none (`seeFade`) */
const HALL_DOOR_ROOM = { value: 0 };
/** no door to see through */
const NO_DOOR = { value: new THREE.Vector4() };
const DOOR_SHUT = { value: 0 };
/** how far in from its sides the cone through the door comes in whole, as a share of the way to its middle there: by a
 *  width on the floor, its edges up the wall were razor sharp and the columns behind them spikes (a review) */
const DOOR_CONE_SOFT = 0.8;
/** how far past a place along the view its room is looked for (m): past a wall's thickness */
const ROOM_PAST = 1.2;
/** the props' hole, which what fades whole has too */
const PROP_K = { value: new THREE.Vector4(1.0, 1.8, 0, 0.25) }, PROP_ACROSS_NOW = { value: 1 };
/** nothing under this height dissolves in a prop: the floor he stands on (`updateSeeThrough`) and what lies lower */
const PROP_MIN_Y = { value: FLOOR_CLEAR };
/** the hole in what's built (`built`), and in the hall's walls and roof, which stays his own size: wide, it opened the
 *  hall's side wall onto the grass */
const BUILT_K = { value: new THREE.Vector4(1.0, 1.8, 0, 0.25) };
const HALL_K = { value: new THREE.Vector4(1.0, 1.8, 0, 0.25) };
/** a hall column's: no hole of its own, as the hall's walls have none: each thins whole. On top of that, a wall's hole cut
 *  a round bite out of the door's jambs and the lintel as he stood in the doorway, and a column's left it clear below and
 *  solid above, a smoke gradient (from play, "still looks broken to me"; a review) */
const COLUMN_K = { value: new THREE.Vector4(1.0, 1.8, 0, 0.25) };
/** the roofs' hole: reaching past him (its w far under 0), so a ghost of a roof is one all over, whichever side of him
 *  the camera looks at it from */
const ROOF_K = { value: new THREE.Vector4(1.0, 1.8, 0, -1000) };
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
/** how far short of him the hall's walls come back (m): `WALL_RAMP`'s way, and while what's built hides him, none to speak
 *  of: stood a hand from the side wall with the camera past it, all of that wall lay in the way back, solid over him and
 *  its courses in black bars, from play, "also this is broken" */
const HALL_RAMP = { value: 2 };
const HALL_RAMP_HIDDEN = 0.15;
/** how far short of him a ghost comes back (m): over 2 m, as the hall's walls do, a post a stride before him stayed whole */
const GHOST_RAMP = 0.5;
const kinds = {
  /** canopies: a wide hole in every view, since the tree line can hide the player top-down */
  foliage: { k: { value: new THREE.Vector4(2.5, 5, 0.9, 1) }, minY: { value: -1e9 }, across: { value: 1 }, whole: { value: 0 }, ramp: WALL_RAMP },
  /** what stands free: a hole round the line to the player, and all of it a ghost while it hides him, in every view but
   *  through the eyes */
  prop: { k: PROP_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: { value: GHOST_RAMP } },
  /** what's built (a house's walls and roof, the palisade): the same hole from above alone. Over the shoulder the camera
   *  stands on his side of it, and a hole there showed both sides of a wall at once (from play, "I should not able to
   *  see through walls like this") */
  built: { k: BUILT_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: WALL_RAMP, blended: true },
  /** a thing's foot on the floor: as `prop`, from the ground up */
  propFoot: { k: PROP_K, minY: { value: -1e9 }, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: { value: GHOST_RAMP } },
  /** the hall of heroes' front wall and its roof over the hero inside: a prop, all of it before him thinned by a share
   *  of its own (`fadeWhole`) */
  // (a wall with the room past it: all that stood short of him thinned, the side walls went to glass, the grass past them
  // showing through, where from over the room they hide nothing of it, from play, "why am I seeing through walls here?")
  hallFront: { k: HALL_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: HALL_RAMP, blended: true,
    room: HALL_ROOM, door: HALL_DOOR, doorOn: HALL_DOOR_ON },
  hallRoof: { k: ROOF_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: WALL_RAMP, blended: true,
    door: HALL_DOOR, doorOn: HALL_DOOR_ON },
  /** the other roofs: as what's built, and a ghost from above (`ROOF_GHOST_ABOVE`) */
  roof: { k: ROOF_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: WALL_RAMP, blended: true },
  /** a house's gables from above, fainter than its roof: at the roof's own ghost, plaster that pale read as a strip
   *  standing off the roof's end, edge on (a review; from play, "chimney/gable needs work") */
  gable: { k: ROOF_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: WALL_RAMP, blended: true },
  /** what stands free in the hall (its columns, its banners), which hides as much of the room as of him */
  // (those near the line to him: a column well aside of it hides nothing of him, and all gone, the portico stood on plinths)
  hallColumn: { k: COLUMN_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: { value: 0.4 }, blended: true,
    reach: { value: new THREE.Vector2(0.8, 1.6) }, door: HALL_DOOR, doorOn: HALL_DOOR_ROOM },
} satisfies Record<string, Kind>;

/** how far under his middle a hole round him comes in, from none to all (m) */
const HOLE_UNDER = { from: 0.2, to: -0.1 };

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

/** The fragment side's declarations and `seeFade()`: the share of this fragment to drop (0 where it hides nothing). */
const SEE_FRAGMENT = `varying vec3 vSeeWp;
uniform vec3 uSeeFocus;
uniform vec4 uSeeK;
uniform float uSeeMinY;
uniform float uSeeAcross;
uniform float uSeeWhole;
uniform float uSeeRamp;
uniform vec2 uSeeReach;
uniform vec4 uSeeRoom;
uniform vec4 uSeeDoor;
uniform float uSeeDoorOn;
// (what hides the floor he sees through a door: the floor this fragment hides, in the wedge from him past the door's
// jambs. Standing at a door the wall over it hid all he could see, from play, "here should open the wall above hero, so
// user can see in the cone up")
float seeDoorCone() {
  float seeDown = cameraPosition.y - vSeeWp.y;
  if (seeDown <= 0.01) return 0.0;
  float seeFloorDown = cameraPosition.y - (uSeeMinY - ${FLOOR_CLEAR.toFixed(2)});
  vec2 seeHidden = cameraPosition.xz + (vSeeWp.xz - cameraPosition.xz) * seeFloorDown / seeDown;
  vec2 seeTo = seeHidden - uSeeFocus.xz, seeA = uSeeDoor.xy - uSeeFocus.xz, seeB = uSeeDoor.zw - uSeeFocus.xz;
  float seeTurn = sign(seeA.x * seeB.y - seeA.y * seeB.x);
  float seeInA = seeTurn * (seeA.x * seeTo.y - seeA.y * seeTo.x) / max(length(seeA), 0.01);
  float seeInB = seeTurn * (seeTo.x * seeB.y - seeTo.y * seeB.x) / max(length(seeB), 0.01);
  float seeInRoom = min(min(seeHidden.x - uSeeRoom.x, uSeeRoom.z - seeHidden.x), min(seeHidden.y - uSeeRoom.y, uSeeRoom.w - seeHidden.y));
  float seeHalfSine = sqrt(max(0.0, (1.0 - dot(seeA, seeB) / max(length(seeA) * length(seeB), 1e-4)) * 0.5));
  float seeInCone = min(seeInA, seeInB) / max(length(seeTo) * seeHalfSine, 0.05);
  return smoothstep(-0.05, ${DOOR_CONE_SOFT.toFixed(2)}, seeInCone) * smoothstep(0.0, 0.3, seeInRoom);
}
float seeFade() {
  if (vSeeWp.y <= uSeeMinY) return 0.0;
  // (a column in the room past the door, its door on told as less than none, shows only as far as the wall before it has
  // opened: drawn after the wall, it stopped at the depth of what stays whole of it in a hard spike, a review)
  float seeCone = uSeeDoorOn > 0.0 ? uSeeDoorOn * seeDoorCone()
    : uSeeDoorOn < 0.0 && vSeeWp.z < uSeeDoor.y ? 1.0 - seeDoorCone() : 0.0;
  if (uSeeK.z <= 0.0 && uSeeWhole <= 0.0) return seeCone;
  vec3 seeCa = uSeeFocus - cameraPosition;
  float seeL = length(seeCa);
  vec3 seeDir = seeCa / seeL, seeCp = vSeeWp - cameraPosition;
  float seeAlong = dot(seeCp, seeDir);
  // (how far past him it stands on the floor, along the view: only what stands short of him there can hide him. By its
  // depth along the sight, from above the top of a wall or a column past him counted as before him and thinned, a wall
  // he stood in front of and a column cut across at his depth, from play, "not supposed to make walls transparent like
  // this, because I'm front of the wall", "these pillars in hero hall are oddly cut")
  float seeFlat = length(seeCa.xz);
  float seePast = seeFlat > 0.01 ? dot(vSeeWp.xz - uSeeFocus.xz, seeCa.xz) / seeFlat : seeAlong - seeL;
  if (seeAlong <= 0.0 || seePast >= -uSeeK.w) return seeCone;
  // (the offset from the line, its part aside of it, level, counted uSeeAcross times over)
  vec3 seeOff = seeCp - seeDir * seeAlong, seeLevel = vec3(-seeDir.z, 0.0, seeDir.x);
  float seeLevelLength = length(seeLevel);
  vec3 seeSide = seeLevelLength > 1e-3 ? seeLevel / seeLevelLength : vec3(1.0, 0.0, 0.0);
  float seeAside = dot(seeOff, seeSide);
  float seeR = length(seeOff + seeSide * seeAside * (uSeeAcross - 1.0));
  // (a cone from the eye to him, its hole his own size where he stands: what hides him from the eye. A tube as wide all
  // the way took the eave over the camera and the wall beside it apart, at the frame's edges)
  seeR /= max(seeAlong / seeL, 0.05);
  // (what thins whole comes back over the last of the way to him: cut at his depth, a column's foot behind it stood as a
  // pale crescent on its base, a review)
  // (its reach is on the floor, aside of the way to him: all of a column's shaft stands as far aside, and thins as one. By
  // the disc round him on the screen, one side of a shaft stood clear and the other solid, a flat pane, a review)
  float seeFloorOff = seeFlat > 0.01 ? abs(dot(vSeeWp.xz - uSeeFocus.xz, vec2(-seeCa.z, seeCa.x))) / seeFlat : seeR;
  float seeWhole = uSeeWhole * (1.0 - smoothstep(-uSeeK.w - uSeeRamp, -uSeeK.w, seePast))
    * (1.0 - smoothstep(uSeeReach.x, uSeeReach.y, seeFloorOff));
  vec2 seeOn = vSeeWp.xz + (seeFlat > 0.01 ? seeCa.xz / seeFlat : vec2(0.0)) * ${ROOM_PAST.toFixed(2)};
  seeWhole *= smoothstep(0.0, 0.3, min(min(seeOn.x - uSeeRoom.x, uSeeRoom.z - seeOn.x), min(seeOn.y - uSeeRoom.y, uSeeRoom.w - seeOn.y)));
  // (no hole under his middle: what lies that low hides his feet at most, and a terrace's coping he stood past took a patch
  // of stipple for nothing, a review)
  float seeAtHim = smoothstep(uSeeFocus.y - ${HOLE_UNDER.from.toFixed(2)}, uSeeFocus.y - ${HOLE_UNDER.to.toFixed(2)}, vSeeWp.y);
  return max(max((1.0 - smoothstep(uSeeK.x, uSeeK.y, seeR)) * uSeeK.z * seeAtHim, seeWhole), seeCone);
}`;

function bindUniforms(uniforms: Record<string, THREE.IUniform>, kind: keyof typeof kinds): void {
  const u = kinds[kind];
  uniforms.uSeeFocus = focus;
  uniforms.uSeeK = u.k;
  uniforms.uSeeMinY = u.minY;
  uniforms.uSeeAcross = u.across;
  uniforms.uSeeWhole = u.whole;
  uniforms.uSeeRamp = u.ramp;
  uniforms.uSeeReach = (u as Kind).reach ?? ALL_OF_IT;
  uniforms.uSeeRoom = (u as Kind).room ?? ANYWHERE;
  uniforms.uSeeDoor = (u as Kind).door ?? NO_DOOR;
  uniforms.uSeeDoorOn = (u as Kind).doorOn ?? DOOR_SHUT;
}

/** What a material dissolves by, as WebGPU reads it off the material (`SeeThrough`, core/shaderPorts.ts `seeMask`):
 *  the followed character, and its kind's hole and floor. */
export interface SeeThrough {
  focus: { value: THREE.Vector3 };
  k: { value: THREE.Vector4 };
  minY: { value: number };
  across: { value: number };
  whole: { value: number };
  ramp: { value: number };
  reach?: { value: THREE.Vector2 };
  room?: { value: THREE.Vector4 };
  door?: { value: THREE.Vector4 };
  doorOn?: { value: number };
  blended?: boolean;
  /** draws only what's left whole of it, for its depth (`depthOfWhatStaysWhole`) */
  wholeOnly?: boolean;
  /** of `wholeOnly`: thinned past this it writes no depth */
  stillWhole?: number;
}

/** each kind's values, one object a kind: what WebGPU keeps its nodes by */
const seen = new Map<keyof typeof kinds, SeeThrough>();

/** `m`'s dissolve given it for WebGPU (`seeThrough`, a property of its own: not copied to a clone, as its
 *  `onBeforeCompile` isn't). */
function markSeeThrough(m: THREE.Material, kind: keyof typeof kinds): void {
  let value = seen.get(kind);
  if (!value) seen.set(kind, value = { focus, ...kinds[kind] });
  Object.defineProperty(m, 'seeThrough', { value, configurable: true });
}

/** Dissolve `m` where it stands between the camera and the player. Keeps any patch the material already has. A roof and
 *  what the hall thins whole blend (from play, "Yes, real blending": a pattern of dots over a roof reads as a screen door,
 *  and the fog, reading the depth, stippled it too), with their depth kept, for the fog to read them as what they are. */
export function seeThrough<M extends THREE.Material>(m: M, kind: keyof typeof kinds): M {
  markSeeThrough(m, kind);
  const blended = (kinds[kind] as Kind).blended === true;
  if (blended) {
    m.transparent = true;
    m.depthWrite = true;
    if (kind === 'roof' || kind === 'gable') tellsItsShare(m);
    if (kind !== 'built') thinningWhole.set(kind, [...(thinningWhole.get(kind) ?? []), m]);
  }
  const prev = m.onBeforeCompile, key = m.customProgramCacheKey();
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    bindUniforms(shader.uniforms, kind);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSeeWp;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 seeWp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          seeWp = instanceMatrix * seeWp;
        #endif
        vSeeWp = (modelMatrix * seeWp).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SEE_FRAGMENT}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        // (a fine ordered pattern, a 4 by 4 Bayer matrix, an even tone: interleaved noise's long lines read on a roof as
        // z-fighting, "z fighting texture at this angle", and a hash's clumps as a broken picture, a review)
        vec2 seeBit = mod(floor(gl_FragCoord.xy), 2.0), seeTwo = mod(floor(gl_FragCoord.xy * 0.5), 2.0);
        float seeN = (abs(seeBit.x - seeBit.y) * 8.0 + seeBit.y * 4.0 + abs(seeTwo.x - seeTwo.y) * 2.0 + seeTwo.y + 0.5) / 16.0;
        if (seeN < seeFade()) discard;`);
    if (blended) thinByBlending(shader);
  };
  // the same code for every kind (they differ in uniforms only), so kinds share programs; on WebGPU a kind's uniforms are
  // nodes of its build, and sharing the first's, the fountain's stone (`prop`) stood solid over him as a wall (`built`) does
  m.customProgramCacheKey = () => (RUNNING.webgpu ? `${key}|seethrough|${kind}` : `${key}|seethrough${blended ? '|blended' : ''}`);
  return m;
}

/** A dissolve's pattern of dropped pixels in `shader` made a blend. */
function thinByBlending(shader: { fragmentShader: string }): void {
  shader.fragmentShader = shader.fragmentShader
    .replace('if (seeN < seeFade()) discard;', `float seeLeft = 1.0 - seeFade();
        if (seeLeft < ${BLEND_GONE.toFixed(2)}) discard;`)
    .replace('#include <opaque_fragment>', `diffuseColor.a *= seeLeft;
        #include <opaque_fragment>`);
}

/** Whether `material` thins by blending: drawn blended, it's as solid as what's opaque, to a body or a shot. */
export const thinsByBlending = (material: THREE.Material): boolean =>
  (material as { seeThrough?: SeeThrough }).seeThrough?.blended === true;

/** Whether `material` is seen through from above whatever it hides: a roof, or the hall's walls. A cottage's walls and the
 *  palisade blend too, but only open round him while they hide him. */
export const seenThroughFromAbove = (material: THREE.Material): boolean => {
  const k = (material as { seeThrough?: SeeThrough }).seeThrough?.k;
  return k === ROOF_K || k === HALL_K;
};

/** What three sorts a list's blended things by. */
interface Sorted {
  groupOrder: number; renderOrder: number; z: number; id: number; material: THREE.Material; object: THREE.Object3D;
}

/** the middle of what each blended thing draws, in the world: what's built stands still, and is merged, so its own place
 *  says nothing of where it's drawn */
const middles = new WeakMap<THREE.Object3D, THREE.Vector3>();

/** The middle of what `object` draws. */
function middleOf(object: THREE.Object3D): THREE.Vector3 {
  let middle = middles.get(object);
  if (middle) return middle;
  const geometry = (object as THREE.Mesh).geometry;
  if (geometry && !geometry.boundingSphere) geometry.computeBoundingSphere();
  middle = (geometry?.boundingSphere?.center.clone() ?? new THREE.Vector3()).applyMatrix4(object.matrixWorld);
  middles.set(object, middle);
  return middle;
}

/** Which comes first of what thins by blending: the depth of what's left whole, so nothing behind it draws over it
 *  whatever the order, then the walls, what stands free before them (drawn under them, a column's ghost was gone, its
 *  capital left in the air, from play, "this geometry is messed up"), the roofs over all (from above nothing built stands
 *  over a roof). */
function drawnInTurn(material: THREE.Material): number {
  const see = (material as { seeThrough?: SeeThrough }).seeThrough;
  // (a column's depth after the walls it stands over, before its own colour)
  if (see?.wholeOnly) return see.k === COLUMN_K && !columnsUnderWalls ? 1.5 : 0;
  if (see?.k === ROOF_K) return 3;
  return see?.k === COLUMN_K && !columnsUnderWalls ? 2 : 1;
}

/** whether a harness has what stands free drawn in with the walls, as it was */
let columnsUnderWalls = false;

/** For a harness (tools/lab): what stands free in the hall drawn in with its walls, as it was. */
export function holdColumnsUnderWalls(held: boolean): void {
  columnsUnderWalls = held;
}

/** For a harness (tools/lab): the hall's columns hidden, or back. */
export function hideHallColumns(hidden: boolean): void {
  for (const material of thinningWhole.get('hallColumn') ?? []) material.visible = !hidden;
}

/** The hall's room told to what thins whole of its walls, and its door's jambs (x, z, x, z). */
export function hallRoomIs(room: THREE.Vector4, door: THREE.Vector4): void {
  HALL_ROOM.value.copy(room);
  hallRoomKept.copy(room);
  HALL_DOOR.value.copy(door);
}

/** the hall's room as told, while what thins whole of its walls may be told to thin for anywhere */
const hallRoomKept = new THREE.Vector4();

/** Whether the hall's walls thin wherever they stand before him, or only over its room. Stood outside it, past a wall from
 *  the camera, that wall has no room past it and stayed whole, and hid him, from play, "and here cannot see hero". */
export function hallThinsAnywhere(anywhere: boolean): void {
  HALL_ROOM.value.copy(anywhere && !roomAlways ? ANYWHERE.value : hallRoomKept);
}

/** whether a harness holds the hall's walls to thinning over its room alone, as they did */
let roomAlways = false;

/** For a harness (tools/lab): the hall's walls thinning over its room alone and coming back over the last 2 m to him,
 *  as they did. */
export function holdHallRoomAlways(held: boolean): void {
  roomAlways = held;
}

/** How far what hides the floor he sees through the hall's door is thinned (0: not at all). */
export function openThroughDoor(share: number): void {
  HALL_DOOR_ON.value = doorHeldShut ? 0 : share;
  HALL_DOOR_ROOM.value = -HALL_DOOR_ON.value;
}

/** How far the cone through the hall's door is open now. */
export const doorConeOpen = (): number => HALL_DOOR_ON.value;

/** whether a harness holds the cone through the hall's door shut, as it was */
let doorHeldShut = false;

/** For a harness (tools/lab): the cone through the hall's door shut, as it was. */
export function holdDoorShut(held: boolean): void {
  doorHeldShut = held;
  if (held) {
    HALL_DOOR_ON.value = 0;
    HALL_DOOR_ROOM.value = 0;
  }
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
  const turn = drawnInTurn(a.material) - drawnInTurn(b.material);
  if (turn !== 0) return turn;
  const away = middleOf(b.object).distanceToSquared(sortEye.value) - middleOf(a.object).distanceToSquared(sortEye.value);
  return away !== 0 ? away : a.id - b.id;
}

/** Whether `material` draws for what blends' order: what thins by blending, or the depth of what's left whole of it. */
const drawsWithTheBlended = (material: THREE.Material): boolean =>
  thinsByBlending(material) || (material as { seeThrough?: SeeThrough }).seeThrough?.wholeOnly === true;

/** where the camera stands, for what thins by blending to be ordered by */
const sortEye = { value: new THREE.Vector3() };

/** The camera's place told to the order of what blends, as it's about to be drawn. */
export function sortBlendedFrom(eye: THREE.Vector3): void {
  sortEye.value.copy(eye);
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

/** whether a harness has the roofs keep their depth over what's under them, as they did */
let roofDepthHeld = false;

/** For a harness (tools/lab): the roofs' depth kept when thinned, so the fog reads a roof over what's under it. */
export function holdRoofDepth(held: boolean): void {
  roofDepthHeld = held;
}

/** The roof's pixel says how much of it is roof: its alpha over what's opaque comes to what's left of what's under it,
 *  which the fog alone lies over (`seenColour`'s `under`). With its depth kept, the fog read a roof's whole pixel as the
 *  roof, and the grass and walls seen through it stood bright over what he can't see (from play, "fog of war bugs"); and
 *  fogged by what's under it, a roof would be the fog's colour whole, as a house's inside is always hidden from him. */
function tellsItsShare(m: THREE.Material): void {
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.SrcAlphaFactor;
  m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = THREE.ZeroFactor;
  m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
}

/** the blended materials of what thins whole, by kind, their depth let go as they thin */
const thinningWhole = new Map<string, THREE.Material[]>();
/** thinned past this share, what thins whole leaves the depth to what's behind it: the fog reads the frame's depth, and
 *  the room behind a ghost of the hall's front wall lay under the fog of the wall's own place, whole */
const DEPTH_LET_GO = 0.3;

/** the meshes that write the depth of what's left whole, by kind, each shown only while its kind's depth is let go; the
 *  first of a kind always, for its program to be warmed with the rest */
const wholeDepths = new Map<FadesWhole, THREE.Mesh[]>();
/** how little thinned counts as left whole: a wall all but solid that gave up its depth let what's behind it draw over
 *  it, the hall's columns standing on the front wall as if painted there (from play, "still looks broken to me"). At half
 *  thinned, the fog read a wall where the ground past it showed through: `--only sightBlacksOut` */
const STILL_WHOLE = 0.15;
/** A column keeps all its depth, drawn after the walls (`drawnInTurn`), so nothing thins past this: where it left off at
 *  the disc round him, the shaft's top drew over its capital's corner, and a column behind over the capital (from play,
 *  "this geometry is messed up", "but this is a defect, right ?"). Walls are drawn after their depth, so a ghost of a
 *  wall must leave what's behind it room; a column's is drawn over them already. */
const KEEPS_ALL = 2;

/** A material for the depth alone of what's left whole of `kind`. */
function wholeDepthMaterial(kind: FadesWhole, side: THREE.Side): THREE.Material {
  // (a hair behind what it follows, whose own draw must pass the depth test over it)
  const material = new THREE.MeshBasicMaterial({
    colorWrite: false, transparent: true, depthWrite: true, side, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2,
  });
  const stillWhole = kind === 'hallColumn' ? KEEPS_ALL : STILL_WHOLE;
  Object.defineProperty(material, 'seeThrough', {
    value: { focus, ...kinds[kind], blended: false, wholeOnly: true, stillWhole },
  });
  material.onBeforeCompile = (shader) => {
    bindUniforms(shader.uniforms, kind);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSeeWp;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vSeeWp = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SEE_FRAGMENT}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (seeFade() > ${stillWhole.toFixed(3)}) discard;`);
  };
  material.customProgramCacheKey = () => (RUNNING.webgpu ? `seethrough|wholeDepth|${kind}` : `seethrough|wholeDepth|${stillWhole}`);
  return material;
}

/**
 * For each mesh under `root` of a kind that lets its depth go, one writing the depth of what's left whole of it. The fog
 * reads the frame's depth: with a wall's let go whole, for what's seen through its ghost to be read as itself, the part of
 * it past him read as the room behind it, and lay in that room's fog, dark glass over the wall he stood before (from play,
 * "here we dont need to see through the wall, because I'm in front of the wall"), and what's behind it drew over it.
 * Depth is written fragment by fragment only by a draw of its own. They stand still, as what they follow does.
 */
export function depthOfWhatStaysWhole(root: THREE.Object3D): void {
  const made = new Map<string, THREE.Material>();
  const twins: { mesh: THREE.Mesh; kind: FadesWhole; of: THREE.Mesh }[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || Array.isArray(mesh.material)) return;
    const kind = (['hallFront', 'hallColumn'] as const).find((name) => thinningWhole.get(name)?.includes(mesh.material as THREE.Material));
    if (!kind) return;
    const key = `${kind}|${mesh.material.side}`;
    let material = made.get(key);
    if (!material) made.set(key, material = wholeDepthMaterial(kind, mesh.material.side));
    const twin = new THREE.Mesh(mesh.geometry, material);
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

/** The kinds that thin whole. */
export type FadesWhole = 'hallFront' | 'hallRoof' | 'hallColumn';

/** How much of what's before the hero `kind` thins by a share of its own, a whole wall's rather than a hole round him. */
export function fadeWhole(kind: FadesWhole, share: number): void {
  kinds[kind].whole.value = share;
  const letGo = share >= DEPTH_LET_GO || ((kind === 'hallFront' || kind === 'hallRoof') && HALL_DOOR_ON.value > 0);
  for (const material of thinningWhole.get(kind) ?? []) material.depthWrite = !letGo;
  (wholeDepths.get(kind) ?? []).forEach((mesh, at) => {
    mesh.visible = letGo || at === 0;
  });
}

/** The share `kind` is thinned by now. */
export const wholeShare = (kind: FadesWhole): number => kinds[kind].whole.value;

/** Whether `kind` is thinned at all now. */
export const fadedWhole = (kind: FadesWhole): boolean => kinds[kind].whole.value > 0;

/**
 * A raw shader's share of `seeThrough`: `seeFade()` in its fragment shader (written before its `main`), the share of
 * it to fade where it hides the player, for a glow or a veil to fade out by rather than dither (a screen door in a
 * glow reads as noise). Its vertex shader's world position is the mesh's own, before any displacement.
 */
export function seeThroughFade<M extends THREE.ShaderMaterial>(m: M, kind: keyof typeof kinds): M {
  bindUniforms(m.uniforms, kind);
  const main = /void\s+main\s*\(\s*\)\s*\{/;
  m.vertexShader = `varying vec3 vSeeWp;\n${m.vertexShader.replace(main, (head) => `${head}\n  vSeeWp = (modelMatrix * vec4(position, 1.0)).xyz;`)}`;
  m.fragmentShader = `${SEE_FRAGMENT}\n${m.fragmentShader}`;
  return m;
}

/**
 * Each frame: where the followed character is, how far props dissolve (0..1: none through the eyes), how far the view
 * is from above (0..1), whose hole is narrower, and how far the hole opens round him (0..1: `core/heroHidden.ts`).
 */
export function updateSeeThrough(x: number, y: number, z: number, props: number, top: number, floor = 0, open = 0,
  builtOpen = 0): void {
  focus.value.set(x, y, z);
  PROP_MIN_Y.value = floor + FLOOR_CLEAR;
  const from = PROP_HOLE_CLOSE.from + (PROP_HOLE_TOP.from - PROP_HOLE_CLOSE.from) * top;
  const to = PROP_HOLE_CLOSE.to + (PROP_HOLE_TOP.to - PROP_HOLE_CLOSE.to) * top;
  const strength = fadeHeld ? 0 : PROP_STRENGTH * props;
  PROP_K.value.set(from, to, strength, PROP_K.value.w);
  // (from above alone, what's built: over the shoulder the camera is on his side of it)
  const built = builtThinned ? strength : strength * top;
  const opening = openHeld ?? builtOpen;
  HALL_RAMP.value = WALL_RAMP.value + (HALL_RAMP_HIDDEN - WALL_RAMP.value) * (roomAlways ? 0 : builtOpen);
  const wider = opening * top * BUILT_OPENS;
  // (only while it hides him: a hole his own size all the time thinned the wall he stood beside, hiding nothing of him,
  // and a shutter thinned there, its depth written, held back the wall behind it, the grass past both showing through,
  // from play, "it shows green where it should not")
  const hides = heldOpenAlways ? 1 : openHeld === null ? builtOpen : 1;
  BUILT_K.value.set(from + wider, to + wider, built * hides, BUILT_K.value.w);
  // (a roof's hole opens less wide: wide as a wall's while it hides him, it took all of a cottage's roof, and what lay under
  // it stood as a glass box with a strip of grass across it, where the roof of the next cottage stood whole, a review)
  const roofWider = wider * ROOF_HOLE_WIDER;
  ROOF_K.value.set(from + roofWider, to + roofWider, built, ROOF_K.value.w);
  kinds.roof.whole.value = (roofGhostHeld ?? ROOF_GHOST_ABOVE) * top * props;
  kinds.gable.whole.value = GABLE_GHOST_ABOVE * top * props;
  for (const material of [...(thinningWhole.get('roof') ?? []), ...(thinningWhole.get('gable') ?? [])]) {
    material.depthWrite = roofDepthHeld || kinds.roof.whole.value < ROOF_LET_GO;
  }
  // (what's built hiding him alone leaves what stands free whole: a lamp past a cottage stood in dots, a review)
  const propsHide = openHeld ?? Math.max(0, open - builtOpen);
  kinds.prop.whole.value = fadeHeld || propsWhole ? 0 : propsHide * GHOST_WHILE_HIDDEN * props;
  kinds.propFoot.whole.value = kinds.prop.whole.value;
  PROP_ACROSS_NOW.value = acrossHeld ?? PROP_ACROSS.close + (PROP_ACROSS.top - PROP_ACROSS.close) * top;
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
  for (const k of [PROP_K, BUILT_K, ROOF_K]) k.value.z = 0;
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
  ROOF_K.value.z = whole ? 0 : built;
  return was;
}

/** For a harness (tools/lab): what's built and the hall's columns drawn with nothing thinned, at once, and a function that
 *  puts it back. What stands free and the roofs stay as they are: a ghost of one over a wall is no fault of the wall's. */
export function thinningLetGo(): () => void {
  const kept = BUILT_K.value.z;
  const front = kinds.hallFront.whole.value;
  const column = kinds.hallColumn.whole.value;
  BUILT_K.value.z = 0;
  fadeWhole('hallFront', 0);
  fadeWhole('hallColumn', 0);
  return () => {
    BUILT_K.value.z = kept;
    fadeWhole('hallFront', front);
    fadeWhole('hallColumn', column);
  };
}

/** For a harness (tools/lab): what thins reaching past him, as a depth along the sight had it from above. */
export function holdThinningReach(past: boolean, room?: THREE.Vector4): void {
  for (const k of [PROP_K, BUILT_K, HALL_K, COLUMN_K]) k.value.w = past ? -1000 : 0.25;
  if (room) HALL_ROOM.value.copy(past ? ANYWHERE.value : room);
}

/** For a harness (tools/lab): what's built open round him whether or not it hides him, as it was. */
export function holdBuiltOpenAlways(always: boolean): void {
  heldOpenAlways = always;
}

/** For a harness (tools/lab): what's built thinned over the shoulder too, as it was. */
export function thinBuiltOverShoulder(on: boolean): void {
  builtThinned = on;
}
