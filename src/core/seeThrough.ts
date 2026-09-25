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
interface Kind { k: { value: THREE.Vector4 }; minY: { value: number } }
const kinds = {
  /** canopies and ferns: a wide hole in every view, since the tree line can hide the player top-down */
  foliage: { k: { value: new THREE.Vector4(2.5, 5, 0.9, 1) }, minY: { value: -1e9 } },
  /** props and walls: only in the close views, where the camera sits among them instead of pulling in */
  prop: { k: { value: new THREE.Vector4(1.0, 1.8, 0, 0.25) }, minY: { value: 0.12 } },
} satisfies Record<string, Kind>;

/** Props' dissolve strength at full weight: they stay a faint ghost, so the player can still see what they stand behind. */
const PROP_STRENGTH = 0.7;

/** Dissolve `m` where it stands between the camera and the player. Keeps any patch the material already has. */
export function seeThrough<M extends THREE.Material>(m: M, kind: keyof typeof kinds): M {
  const prev = m.onBeforeCompile, key = m.customProgramCacheKey();
  const u = kinds[kind];
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    shader.uniforms.uSeeFocus = focus;
    shader.uniforms.uSeeK = u.k;
    shader.uniforms.uSeeMinY = u.minY;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSeeWp;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 seeWp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          seeWp = instanceMatrix * seeWp;
        #endif
        vSeeWp = (modelMatrix * seeWp).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSeeWp;\nuniform vec3 uSeeFocus;\nuniform vec4 uSeeK;\nuniform float uSeeMinY;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (uSeeK.z > 0.0 && vSeeWp.y > uSeeMinY) {
          vec3 seeCa = uSeeFocus - cameraPosition;
          float seeL = length(seeCa);
          vec3 seeDir = seeCa / seeL, seeCp = vSeeWp - cameraPosition;
          float seeAlong = dot(seeCp, seeDir);
          if (seeAlong > 0.0 && seeAlong < seeL - uSeeK.w) {
            float seeFade = 1.0 - smoothstep(uSeeK.x, uSeeK.y, length(seeCp - seeDir * seeAlong));
            float seeN = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
            if (seeN < seeFade * uSeeK.z) discard;
          }
        }`);
  };
  // the same code for every kind (they differ in uniforms only), so kinds share programs
  m.customProgramCacheKey = () => `${key}|seethrough`;
  return m;
}

/** Each frame: where the followed character is, and how far into the close views the camera is (0..1). */
export function updateSeeThrough(x: number, y: number, z: number, close: number): void {
  focus.value.set(x, y, z);
  kinds.prop.k.value.z = PROP_STRENGTH * close;
}
