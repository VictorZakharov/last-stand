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
//
// A lamp casts no shadow, and its light would go through walls: one box on the ground is a shelter (the hall of
// heroes' inside), and each lamp lights either what's inside it or what's outside (its torches lit the terrace through
// the hall's walls, and the street lamps its room; switched over at its door, the lamps went out as the hero walked
// in, "lights turn off when I enter the hall").
import * as THREE from 'three';

/** the most lamps the list holds */
export const LAMPS_MOST = 24;

/** the list, four floats an entry: its first the shelter (its least x and z, its most), then two a lamp: its place and
 *  how far it reaches (m), and its colour times its intensity, a point light's in candela, and which side of the
 *  shelter it lights (1 inside, -1 outside; 0: out, skipped) */
const list = new Float32Array((1 + LAMPS_MOST * 2) * 4);
/** lamp `i`'s first float, and its light's */
const placeOf = (i: number): number => (1 + i * 2) * 4;
const lightOf = (i: number): number => placeOf(i) + 4;

/** each lit shader's lamps, after three's point lights (its `directLight` and `RE_Direct`, as they light those) */
const LAMPS_LIT = `
#if defined( RE_Direct )
	{
		vec3 seen = transpose( mat3( viewMatrix ) ) * ( geometryPosition - viewMatrix[ 3 ].xyz );
		vec4 shelter = lamps[ 0 ];
		float side = all( greaterThan( seen.xz, shelter.xy ) ) && all( lessThan( seen.xz, shelter.zw ) ) ? 1.0 : - 1.0;
		for ( int i = 0; i < LAMPS_MOST; i ++ ) {
			vec4 lampLight = lamps[ 2 + i * 2 ];
			if ( lampLight.w != side ) continue;
			vec4 lamp = lamps[ 1 + i * 2 ];
			vec3 toLamp = ( viewMatrix * vec4( lamp.xyz, 1.0 ) ).xyz - geometryPosition;
			float lampDistance = length( toLamp );
			if ( lampDistance >= lamp.w ) continue;
			directLight.direction = toLamp / lampDistance;
			directLight.color = lampLight.rgb * getDistanceAttenuation( lampDistance, lamp.w, 2.0 );
			directLight.visible = true;
			RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
		}
	}
#endif
`;
const LAMPS_DECLARED = `
#define LAMPS_MOST ${LAMPS_MOST}
uniform vec4 lamps[ 1 + LAMPS_MOST * 2 ];
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

/** A lamp's place: where it burns, how far it reaches (m), and whether it lights the shelter's inside. */
export interface LampPlace { at: THREE.Vector3; reach: number; inside: boolean }

/** whether each lamp lights the shelter's inside, as placed */
let insides: boolean[] = [];

/** The shelter (its least x and z, its most) and the lamps (none past `LAMPS_MOST`), each out until `lightLamp`. */
export function placeLamps(shelter: [number, number, number, number], places: readonly LampPlace[]): void {
  if (places.length > LAMPS_MOST) console.error(`placeLamps: ${places.length} lamps, ${LAMPS_MOST} lit at the most`);
  list.fill(0);
  list.set(shelter, 0);
  insides = places.slice(0, LAMPS_MOST).map((place) => place.inside);
  for (const [i, place] of places.slice(0, LAMPS_MOST).entries()) {
    list.set([place.at.x, place.at.y, place.at.z, place.reach], placeOf(i));
  }
}

/** Lamp `i` (in `placeLamps`' order) lit in `color` at `intensity` (a point light's, in candela); 0 puts it out. */
export function lightLamp(i: number, color: THREE.Color, intensity: number): void {
  if (i >= insides.length) return;
  const side = intensity > 0 ? (insides[i] ? 1 : -1) : 0;
  list.set([color.r * intensity, color.g * intensity, color.b * intensity, side], lightOf(i));
}

/** Every lamp put out. */
export function lampsOut(): void {
  for (let i = 0; i < insides.length; i++) list[lightOf(i) + 3] = 0;
}
