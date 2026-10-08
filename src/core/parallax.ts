// The floors' relief (parallax occlusion): the floor's height, kept in its roughness map's red channel (core/pbr.ts),
// read along the view ray, so the grout between the crypt's cobbles and the soil round the forest's pebbles and leaves
// lie sunk below their tops and shift against them as the view moves. Only the hollows sink: the tops stay at the
// floor's own level, where everything on the floor stands (feet, arrows, marks). The steps a ray takes are a uniform the
// quality preset sets (none on Low), so switching presets compiles nothing.
import type * as THREE from 'three';

/** How a floor's relief lies. */
export interface FloorRelief {
  /** m: how far its lowest point lies under its tops */
  depth: number;
  /** its maps' tiles a metre over the floor (their repeat over the floor's span), u along x and v along -z */
  perMetre: number;
  /** m from the camera: the relief fades out up to here (too fine to see that far, and the steps cost the same) */
  fade: number;
}

/** the most steps down the view ray (looking straight down it takes half) */
const steps = { value: 16 };

/** The quality preset's steps (0: no relief). */
export function setReliefSteps(n: number): void {
  steps.value = n;
}

const RELIEF_GLSL = /* glsl */`
varying vec3 vReliefWorld;
uniform int uReliefSteps;
uniform vec3 uRelief;
// Where the view ray through this point meets the relief, in uv: walked down from the tops a layer at a time, then
// between the last two layers where it crossed (the height map's red channel: 1 the tops, 0 the lowest point). The
// gradients are the floor's own: inside a loop the GPU's are undefined, and the moved uv's jump at each stone's edge.
vec2 reliefUv(vec2 uv, vec2 dx, vec2 dy) {
  vec3 toEye = cameraPosition - vReliefWorld;
  float dist = length(toEye);
  toEye /= dist;
  float depth = uRelief.x * (1.0 - smoothstep(uRelief.z * 0.6, uRelief.z, dist));
  if (uReliefSteps <= 0 || depth <= 0.0 || toEye.y <= 0.0) return uv;
  // a metre down the ray moves it this far over the floor, in uv (away from the eye; v runs along -z)
  vec2 slide = vec2(-toEye.x, toEye.z) / max(toEye.y, 0.25) * uRelief.y;
  float n = max(1.0, floor(mix(float(uReliefSteps) * 0.5, float(uReliefSteps), 1.0 - toEye.y)));
  float layer = 1.0 / n;
  vec2 stepUv = slide * depth * layer;
  vec2 at = uv;
  float ray = 0.0;
  float surface = 1.0 - textureGrad(roughnessMap, at, dx, dy).r;
  if (surface <= 0.0) return uv;
  for (int i = 0; i < 64; i++) {
    if (float(i) >= n) break;
    vec2 next = at + stepUv;
    float nextRay = ray + layer;
    float nextSurface = 1.0 - textureGrad(roughnessMap, next, dx, dy).r;
    if (nextRay >= nextSurface) {
      float above = surface - ray, below = nextRay - nextSurface;
      return at + stepUv * clamp(above / max(above + below, 1e-4), 0.0, 1.0);
    }
    at = next;
    ray = nextRay;
    surface = nextSurface;
  }
  return at;
}
`;

/**
 * Gives a floor's standard material (a map, a normal map and a roughness map, tiling alike) its relief: applied in its
 * `onBeforeCompile` after the floor's own edits, its maps are read where the view ray meets the relief.
 */
export function floorRelief(shader: THREE.WebGLProgramParametersWithUniforms, relief: FloorRelief): void {
  shader.uniforms.uReliefSteps = steps;
  shader.uniforms.uRelief = { value: [relief.depth, relief.perMetre, relief.fade] };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vReliefWorld;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvReliefWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  shader.fragmentShader = shader.fragmentShader
    .replace(/void\s+main\s*\(\s*\)/, `${RELIEF_GLSL}\nvoid main()`)
    .replace('#include <map_fragment>', `vec2 reliefDx = dFdx(vMapUv), reliefDy = dFdy(vMapUv);
      vec2 reliefAt = reliefUv(vMapUv, reliefDx, reliefDy);
      diffuseColor *= textureGrad(map, reliefAt, reliefDx, reliefDy);`)
    .replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness;
      roughnessFactor *= textureGrad(roughnessMap, reliefAt, reliefDx, reliefDy).g;`)
    .replace('#include <normal_fragment_maps>', `vec3 mapN = textureGrad(normalMap, reliefAt, reliefDx, reliefDy).xyz * 2.0 - 1.0;
      mapN.xy *= normalScale;
      normal = normalize(tbn * mapN);`);
}
