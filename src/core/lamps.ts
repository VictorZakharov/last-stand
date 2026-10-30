// Lamps every lit surface is lit by, at any distance, as a renderer with clustered lights lights them (Unreal's
// forward shading lists the lights in a grid of cells and lights each pixel by its cell's): three's own point lights
// are as many as its programs were compiled for, and a light more compiles them all again, so the village's street
// lamps were lit by the pool's lights at the three nearest the hero alone, the rest drawn as painted pools that turned
// into lit ground as he walked up (from play: "I dont like when lights change from low quality to high quality when I
// come close, it looks lame"). These are a list in a uniform of three's own lit materials (`ShaderLib`), every lit
// shader's lights looping over it after three's point lights, by three's own falloff: the same light as a point light
// at that spot, and no light in the list changes a program. The list is one array of floats, shared by every material
// (three clones each material's uniforms from `ShaderLib`'s, vectors and arrays of them too, but keeps a typed array as
// it is), so a lamp set here is set for all.
import * as THREE from 'three';

/** the most lamps the list holds */
export const LAMPS_MOST = 16;
/** how far a lamp reaches (m), its light falling to nothing there as a point light's `distance` has it */
export const LAMP_REACH = 15;

/** the list, four floats an entry: its first the lamps' colour times their intensity, then each lamp's place and how
 *  lit it is (0 to 1: none, skipped) */
const list = new Float32Array((LAMPS_MOST + 1) * 4);
/** entry `i`'s first float */
const at = (i: number): number => i * 4;

/** each lit shader's lamps, after three's point lights (its `directLight` and `RE_Direct`, as they light those) */
const LAMPS_LIT = `
#if defined( RE_Direct )
	for ( int i = 1; i <= LAMPS_MOST; i ++ ) {
		float lampLit = lamps[ i ].w;
		if ( lampLit <= 0.0 ) continue;
		vec3 toLamp = ( viewMatrix * vec4( lamps[ i ].xyz, 1.0 ) ).xyz - geometryPosition;
		float lampDistance = length( toLamp );
		if ( lampDistance >= LAMP_REACH ) continue;
		directLight.direction = toLamp / lampDistance;
		directLight.color = lamps[ 0 ].rgb * ( lampLit * getDistanceAttenuation( lampDistance, LAMP_REACH, 2.0 ) );
		directLight.visible = true;
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
#endif
`;
const LAMPS_DECLARED = `
#define LAMPS_MOST ${LAMPS_MOST}
#define LAMP_REACH ${LAMP_REACH.toFixed(1)}
uniform vec4 lamps[ LAMPS_MOST + 1 ];
`;
/** where three's lit shaders begin their spot lights: the lamps go just before */
const SPOT_LIGHTS_IF = '#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )';

/** The lamps' list given to every lit material three makes and lit in its shaders; once, before any compiles. */
export function lightTheLamps(): void {
  const begin = THREE.ShaderChunk.lights_fragment_begin;
  if (!begin.includes(SPOT_LIGHTS_IF) || !begin.includes('IncidentLight directLight;')) {
    console.error('lightTheLamps: three\'s lit shaders have changed: the lamps light nothing');
    return;
  }
  THREE.ShaderChunk.lights_pars_begin += LAMPS_DECLARED;
  THREE.ShaderChunk.lights_fragment_begin = begin.replace(SPOT_LIGHTS_IF, LAMPS_LIT + SPOT_LIGHTS_IF);
  for (const shader of Object.values(THREE.ShaderLib)) {
    if ('pointLights' in shader.uniforms) shader.uniforms.lamps = { value: list };
  }
}

/** The lamps at `places` (none past `LAMPS_MOST`), each unlit until `lightLamp` lights it. */
export function placeLamps(places: readonly THREE.Vector3[]): void {
  if (places.length > LAMPS_MOST) console.error(`placeLamps: ${places.length} lamps, ${LAMPS_MOST} lit at the most`);
  list.fill(0, at(1));
  for (const [i, place] of places.slice(0, LAMPS_MOST).entries()) list.set([place.x, place.y, place.z, 0], at(i + 1));
}

/** The lamps' light: their colour times their intensity (a point light's, in candela). */
export function lampsGlow(color: THREE.Color, intensity: number): void {
  list.set([color.r * intensity, color.g * intensity, color.b * intensity, 0], at(0));
}

/** Lamp `i` (in `placeLamps`' order) lit by `share` of its light (0 to 1). */
export function lightLamp(i: number, share: number): void {
  if (i < LAMPS_MOST) list[at(i + 1) + 3] = share;
}

/** Every lamp put out. */
export function lampsOut(): void {
  for (let i = 1; i <= LAMPS_MOST; i++) list[at(i) + 3] = 0;
}
