// Screen-door dissolve of world geometry between the camera and the character it follows, so
// nothing hides the player. Only the main pass: shadow maps render with their own depth
// material, so shadows stay whole.
import * as THREE from 'three';

/** the followed character (chest height), set by the camera every frame */
const focus = { value: new THREE.Vector3() };

/**
 * How a class of material dissolves: x..y the radius round the camera-to-player line where the
 * fade runs out, z the share of pixels dropped at its core (0 turns it off), w how far short of
 * the player it stops. `minY`: nothing lower dissolves (the floor under a prop stays).
 */
interface Kind { k: { value: THREE.Vector4 }; minY: { value: number }; across: { value: number } }
const kinds = {
  /** canopies: a wide hole in every view, since the tree line can hide the player top-down */
  foliage: { k: { value: new THREE.Vector4(2.5, 5, 0.9, 1) }, minY: { value: -1e9 }, across: { value: 1 } },
  /** props and walls: a narrow hole round the line to the player, in every view but through the eyes */
  prop: { k: { value: new THREE.Vector4(1.0, 1.8, 0, 0.25) }, minY: { value: 0.12 }, across: { value: 1 } },
} satisfies Record<string, Kind>;

/** Props' dissolve strength at full weight: they stay a faint ghost, so the player can still see what they stand behind. */
const PROP_STRENGTH = 0.7;
/** The props' hole over the shoulder (wide round the camera's way past him) and from above, about the hero's own
 *  size on screen there: at the shoulder's, a stump beside him came apart though it hid nothing of him. */
const PROP_HOLE_CLOSE = { from: 1.0, to: 1.8 };
const PROP_HOLE_TOP = { from: 0.55, to: 1.05 };
/** How much more the props' hole counts an offset across the view (level, aside of the line to him) than up and down
 *  it, over the shoulder and from above: a body is a third as wide as it is tall (at 3, the wall half a metre beside
 *  him still came apart in a strip), and a round hole his height across
 *  took the wall or the cottage he stood beside apart toward the camera, though it hid nothing of him ("should not see
 *  through here, because I'm in the front"). */
const PROP_ACROSS = { close: 4, top: 1.2 };
/** the props' across held by a harness (the round hole as it was, 1), or null */
let acrossHeld: number | null = null;
/** whether a harness holds the props' hole shut (a frame drawn as without it) */
let fadeHeld = false;

/** The fragment side's declarations and `seeFade()`: the share of this fragment to drop (0 where it hides nothing). */
const SEE_FRAGMENT = `varying vec3 vSeeWp;
uniform vec3 uSeeFocus;
uniform vec4 uSeeK;
uniform float uSeeMinY;
uniform float uSeeAcross;
float seeFade() {
  if (uSeeK.z <= 0.0 || vSeeWp.y <= uSeeMinY) return 0.0;
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
  return (1.0 - smoothstep(uSeeK.x, uSeeK.y, seeR)) * uSeeK.z;
}`;

function bindUniforms(uniforms: Record<string, THREE.IUniform>, kind: keyof typeof kinds): void {
  const u = kinds[kind];
  uniforms.uSeeFocus = focus;
  uniforms.uSeeK = u.k;
  uniforms.uSeeMinY = u.minY;
  uniforms.uSeeAcross = u.across;
}

/** Dissolve `m` where it stands between the camera and the player. Keeps any patch the material already has. */
export function seeThrough<M extends THREE.Material>(m: M, kind: keyof typeof kinds): M {
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
 * Each frame: where the followed character is, how far props dissolve (0..1: none through the eyes) and how far the
 * view is from above (0..1), whose hole is narrower.
 */
export function updateSeeThrough(x: number, y: number, z: number, props: number, top: number): void {
  focus.value.set(x, y, z);
  const k = kinds.prop.k.value;
  k.x = PROP_HOLE_CLOSE.from + (PROP_HOLE_TOP.from - PROP_HOLE_CLOSE.from) * top;
  k.y = PROP_HOLE_CLOSE.to + (PROP_HOLE_TOP.to - PROP_HOLE_CLOSE.to) * top;
  k.z = fadeHeld ? 0 : PROP_STRENGTH * props;
  kinds.prop.across.value = acrossHeld ?? PROP_ACROSS.close + (PROP_ACROSS.top - PROP_ACROSS.close) * top;
}

/** For a harness (tools/lab): the props' hole held shut, at once (a frame drawn again as it was, without it), and its
 *  across held (null: the game's) from the next frame. */
export function holdPropHole(shut: boolean, across: number | null = null): void {
  fadeHeld = shut;
  acrossHeld = across;
  if (shut) kinds.prop.k.value.z = 0;
}
