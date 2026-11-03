// Screen-door dissolve of world geometry between the camera and the character it follows, so
// nothing hides the player. Only the main pass: shadow maps render with their own depth
// material, so shadows stay whole.
import * as THREE from 'three';

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
}
/** the props' hole, which what fades whole has too */
const PROP_K = { value: new THREE.Vector4(1.0, 1.8, 0, 0.25) }, PROP_ACROSS_NOW = { value: 1 };
/** nothing under this height dissolves in a prop: the floor he stands on (`updateSeeThrough`) and what lies lower */
const PROP_MIN_Y = { value: FLOOR_CLEAR };
/** the hole in what's built (`built`), and in the hall's walls and roof, which stays his own size: wide, it opened the
 *  hall's side wall onto the grass */
const BUILT_K = { value: new THREE.Vector4(1.0, 1.8, 0, 0.25) };
const HALL_K = { value: new THREE.Vector4(1.0, 1.8, 0, 0.25) };
/** the walls' way back over the last of the way to him */
const WALL_RAMP = { value: 2 };
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
  built: { k: BUILT_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: WALL_RAMP },
  /** a thing's foot on the floor: as `prop`, from the ground up */
  propFoot: { k: PROP_K, minY: { value: -1e9 }, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: { value: GHOST_RAMP } },
  /** the hall of heroes' front wall and its roof over the hero inside: a prop, all of it before him thinned by a share
   *  of its own (`fadeWhole`) */
  hallFront: { k: HALL_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: WALL_RAMP },
  hallRoof: { k: HALL_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: WALL_RAMP },
  /** what stands free in the hall (its columns, its banners), which hides as much of the room as of him */
  hallColumn: { k: PROP_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: WALL_RAMP },
} satisfies Record<string, Kind>;

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
/** whether a harness holds the props' hole shut (a frame drawn as without it) */
let fadeHeld = false;

/** The fragment side's declarations and `seeFade()`: the share of this fragment to drop (0 where it hides nothing). */
const SEE_FRAGMENT = `varying vec3 vSeeWp;
uniform vec3 uSeeFocus;
uniform vec4 uSeeK;
uniform float uSeeMinY;
uniform float uSeeAcross;
uniform float uSeeWhole;
uniform float uSeeRamp;
float seeFade() {
  if ((uSeeK.z <= 0.0 && uSeeWhole <= 0.0) || vSeeWp.y <= uSeeMinY) return 0.0;
  // (all of it, behind him too: the roof from above, whose beams past him were left as stray lines)
  if (uSeeWhole >= 1.0) return 1.0;
  vec3 seeCa = uSeeFocus - cameraPosition;
  float seeL = length(seeCa);
  vec3 seeDir = seeCa / seeL, seeCp = vSeeWp - cameraPosition;
  float seeAlong = dot(seeCp, seeDir);
  if (seeAlong <= 0.0 || seeAlong >= seeL - uSeeK.w) return 0.0;
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
  float seeWhole = uSeeWhole * (1.0 - smoothstep(seeL - uSeeK.w - uSeeRamp, seeL - uSeeK.w, seeAlong));
  return max((1.0 - smoothstep(uSeeK.x, uSeeK.y, seeR)) * uSeeK.z, seeWhole);
}`;

function bindUniforms(uniforms: Record<string, THREE.IUniform>, kind: keyof typeof kinds): void {
  const u = kinds[kind];
  uniforms.uSeeFocus = focus;
  uniforms.uSeeK = u.k;
  uniforms.uSeeMinY = u.minY;
  uniforms.uSeeAcross = u.across;
  uniforms.uSeeWhole = u.whole;
  uniforms.uSeeRamp = u.ramp;
}

/** What a material dissolves by, as WebGPU reads it off the material (`SeeThrough`, core/shaderPorts.ts `seeMask`):
 *  the followed character, and its kind's hole and floor. */
export interface SeeThrough { focus: { value: THREE.Vector3 }; k: { value: THREE.Vector4 }; minY: { value: number } }

/** `m`'s dissolve given it for WebGPU (`seeThrough`, a property of its own: not copied to a clone, as its
 *  `onBeforeCompile` isn't). */
function markSeeThrough(m: THREE.Material, kind: keyof typeof kinds): void {
  const value: SeeThrough = { focus, k: kinds[kind].k, minY: kinds[kind].minY };
  Object.defineProperty(m, 'seeThrough', { value, configurable: true });
}

/** Dissolve `m` where it stands between the camera and the player. Keeps any patch the material already has. */
export function seeThrough<M extends THREE.Material>(m: M, kind: keyof typeof kinds): M {
  markSeeThrough(m, kind);
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
        float seeN = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        if (seeN < seeFade()) discard;`);
  };
  // the same code for every kind (they differ in uniforms only), so kinds share programs
  m.customProgramCacheKey = () => `${key}|seethrough`;
  return m;
}

/** The kinds that thin whole. */
export type FadesWhole = 'hallFront' | 'hallRoof' | 'hallColumn';

/** How much of what's before the hero `kind` thins by a share of its own, a whole wall's rather than a hole round him. */
export function fadeWhole(kind: FadesWhole, share: number): void {
  kinds[kind].whole.value = share;
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
export function updateSeeThrough(x: number, y: number, z: number, props: number, top: number, floor = 0, open = 0): void {
  focus.value.set(x, y, z);
  PROP_MIN_Y.value = floor + FLOOR_CLEAR;
  const from = PROP_HOLE_CLOSE.from + (PROP_HOLE_TOP.from - PROP_HOLE_CLOSE.from) * top;
  const to = PROP_HOLE_CLOSE.to + (PROP_HOLE_TOP.to - PROP_HOLE_CLOSE.to) * top;
  const strength = fadeHeld ? 0 : PROP_STRENGTH * props;
  PROP_K.value.set(from, to, strength, PROP_K.value.w);
  // (from above alone, what's built: over the shoulder the camera is on his side of it)
  const built = builtThinned ? strength : strength * top;
  BUILT_K.value.set(from, to, built, BUILT_K.value.w);
  HALL_K.value.set(from, to, built, HALL_K.value.w);
  kinds.prop.whole.value = fadeHeld ? 0 : (openHeld ?? open) * GHOST_WHILE_HIDDEN * props;
  kinds.propFoot.whole.value = kinds.prop.whole.value;
  PROP_ACROSS_NOW.value = acrossHeld ?? PROP_ACROSS.close + (PROP_ACROSS.top - PROP_ACROSS.close) * top;
}

/** For a harness (tools/lab): the props' hole held shut, at once (a frame drawn again as it was, without it), and its
 *  across held (null: the game's) from the next frame. */
export function holdPropHole(shut: boolean, across: number | null = null): void {
  fadeHeld = shut;
  acrossHeld = across;
  if (!shut) return;
  for (const k of [PROP_K, BUILT_K, HALL_K]) k.value.z = 0;
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
  HALL_K.value.z = whole ? 0 : built;
  return was;
}

/** For a harness (tools/lab): what's built thinned over the shoulder too, as it was. */
export function thinBuiltOverShoulder(on: boolean): void {
  builtThinned = on;
}
