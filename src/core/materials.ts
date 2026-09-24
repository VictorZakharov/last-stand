// Material kit: every entity builds its materials through a kit so that
// shared per-entity FX uniforms (dissolve, frozen, hit flash) can be driven
// with a single write each frame.
import * as THREE from 'three';

const FX_CHUNK_COMMON = /* glsl */ `
uniform float uDissolve;
uniform float uFrozen;
uniform float uHit;
uniform vec3 uEdge;
varying vec3 vFxPos;
float fxHash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float fxNoise(vec3 x){
  vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(fxHash(i),fxHash(i+vec3(1,0,0)),f.x), mix(fxHash(i+vec3(0,1,0)),fxHash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(fxHash(i+vec3(0,0,1)),fxHash(i+vec3(1,0,1)),f.x), mix(fxHash(i+vec3(0,1,1)),fxHash(i+vec3(1,1,1)),f.x),f.y), f.z);
}
`;

export function createKit(edgeColor: THREE.ColorRepresentation = 0x66ffcc) {
  const u = {
    uDissolve: { value: 0 },
    uFrozen: { value: 0 },
    uHit: { value: 0 },
    uEdge: { value: new THREE.Color(edgeColor).multiplyScalar(3) },
  };
  const mats: THREE.Material[] = [];

  function patch<M extends THREE.Material>(m: M): M {
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFxPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFxPos = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FX_CHUNK_COMMON)
        .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55,0.8,1.0), uFrozen*0.75);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float dn = fxNoise(vFxPos*7.0)*0.65 + fxNoise(vFxPos*19.0)*0.35;
          if (uDissolve > 0.0 && dn < uDissolve) discard;
          float edge = uDissolve > 0.0 ? (1.0 - smoothstep(uDissolve, uDissolve + 0.09, dn)) : 0.0;
          totalEmissiveRadiance += uEdge * edge * 3.0;
          totalEmissiveRadiance += vec3(0.25,0.55,0.9) * uFrozen * 0.35;
          totalEmissiveRadiance += vec3(1.0,0.9,0.85) * uHit * 0.9;`);
    };
    m.customProgramCacheKey = () => 'entityfx';
    mats.push(m);
    return m;
  }

  return {
    u,
    mats,
    std: (p?: THREE.MeshStandardMaterialParameters) => patch(new THREE.MeshStandardMaterial(p)),
    phys: (p?: THREE.MeshPhysicalMaterialParameters) => patch(new THREE.MeshPhysicalMaterial(p)),
    // Unlit glow (eyes, crystals) - still dissolves via patch on MeshStandard with black base.
    glow: (color: THREE.ColorRepresentation, intensity = 3) => patch(new THREE.MeshStandardMaterial({
      color: 0x000000, emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 1,
    })),
    dispose() { for (const m of mats) m.dispose(); },
  };
}

/**
 * How much to scale a glow of this colour so it looks as bright as a violet one: effects are tuned
 * on violet, and at the same strength a green one (mostly the eye's brightest channel) is nearly
 * three times as bright and blooms to white. Never brightens a dim colour.
 */
export function glowScale(color: THREE.ColorRepresentation): number {
  const c = new THREE.Color(color);
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return Math.min(1, 0.3 / Math.max(lum, 1e-3));
}

// Additive, unlit HDR material for VFX meshes.

export function additive(color: THREE.ColorRepresentation, intensity = 2, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(intensity),
    transparent: true, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, toneMapped: true,
  });
}
