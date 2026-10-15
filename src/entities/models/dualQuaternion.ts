// Dual-quaternion skinning for a skinned material: each vertex's bones are blended as turns and moves, not as
// matrices. Matrices blended (three's own skinning) pull a vertex shared by two bones through their axis as one of
// them twists: the thumb, a half turn round its length as it closes over a handle, folded its glove into a fin across
// the web and creased the thenar. Blended as dual quaternions, a vertex halfway goes halfway round. Its four bones'
// matrices are made one in `skinbase_vertex`, and three's own chunks then apply it as they would any.
import * as THREE from 'three';

const FUNCTIONS = /* glsl */ `
#ifdef USE_SKINNING
  /** a rotation's quaternion (x, y, z, w), from the largest of its diagonal's terms (m[column][row]) */
  vec4 dqsTurn( mat3 m ) {
    float trace = m[0][0] + m[1][1] + m[2][2];
    if ( trace > 0.0 ) {
      float s = sqrt( trace + 1.0 ) * 2.0;
      return vec4( m[1][2] - m[2][1], m[2][0] - m[0][2], m[0][1] - m[1][0], 0.25 * s * s ) / s;
    }
    if ( m[0][0] > m[1][1] && m[0][0] > m[2][2] ) {
      float s = sqrt( 1.0 + m[0][0] - m[1][1] - m[2][2] ) * 2.0;
      return vec4( 0.25 * s * s, m[1][0] + m[0][1], m[2][0] + m[0][2], m[1][2] - m[2][1] ) / s;
    }
    if ( m[1][1] > m[2][2] ) {
      float s = sqrt( 1.0 + m[1][1] - m[0][0] - m[2][2] ) * 2.0;
      return vec4( m[1][0] + m[0][1], 0.25 * s * s, m[2][1] + m[1][2], m[2][0] - m[0][2] ) / s;
    }
    float s = sqrt( 1.0 + m[2][2] - m[0][0] - m[1][1] ) * 2.0;
    return vec4( m[2][0] + m[0][2], m[2][1] + m[1][2], 0.25 * s * s, m[0][1] - m[1][0] ) / s;
  }

  vec4 dqsProduct( vec4 a, vec4 b ) {
    return vec4( a.w * b.xyz + b.w * a.xyz + cross( a.xyz, b.xyz ), a.w * b.w - dot( a.xyz, b.xyz ) );
  }

  /** a bone's matrix (a turn, a move and a scale the same every way) added to the blend, by its weight, on the same
   *  side of the turns as the pivot (a quaternion and its negative are one turn: blended across, they cancel) */
  void dqsAdd( mat4 m, float w, vec4 pivot, inout vec4 real, inout vec4 dual, inout float scale ) {
    float s = length( m[0].xyz );
    vec4 turn = dqsTurn( mat3( m ) / s );
    float side = dot( turn, pivot ) < 0.0 ? -w : w;
    real += turn * side;
    dual += 0.5 * dqsProduct( vec4( m[3].xyz, 0.0 ), turn ) * side;
    scale += s * w;
  }

  /** four bones' matrices blended by their weights as dual quaternions, as one matrix */
  mat4 dqsBlend( mat4 a, mat4 b, mat4 c, mat4 d, vec4 w ) {
    vec4 pivot = dqsTurn( mat3( a ) / length( a[0].xyz ) );
    vec4 real = vec4( 0.0 );
    vec4 dual = vec4( 0.0 );
    float scale = 0.0;
    dqsAdd( a, w.x, pivot, real, dual, scale );
    dqsAdd( b, w.y, pivot, real, dual, scale );
    dqsAdd( c, w.z, pivot, real, dual, scale );
    dqsAdd( d, w.w, pivot, real, dual, scale );
    float size = length( real );
    real /= size;
    dual /= size;
    scale /= w.x + w.y + w.z + w.w;
    vec3 move = 2.0 * ( real.w * dual.xyz - dual.w * real.xyz + cross( real.xyz, dual.xyz ) );
    float x = real.x, y = real.y, z = real.z, r = real.w;
    vec3 across = vec3( 1.0 - 2.0 * ( y * y + z * z ), 2.0 * ( x * y + r * z ), 2.0 * ( x * z - r * y ) );
    vec3 up = vec3( 2.0 * ( x * y - r * z ), 1.0 - 2.0 * ( x * x + z * z ), 2.0 * ( y * z + r * x ) );
    vec3 toward = vec3( 2.0 * ( x * z + r * y ), 2.0 * ( y * z - r * x ), 1.0 - 2.0 * ( x * x + y * y ) );
    across *= scale;
    up *= scale;
    toward *= scale;
    return mat4( vec4( across, 0.0 ), vec4( up, 0.0 ), vec4( toward, 0.0 ), vec4( move, 1.0 ) );
  }
#endif
`;

// (three's chunks sum the four matrices by their weights: each one the blend over the weights' sum, they sum to it)
const BLENDED = /* glsl */ `
#include <skinbase_vertex>
#ifdef USE_SKINNING
  {
    mat4 blended = dqsBlend( boneMatX, boneMatY, boneMatZ, boneMatW, skinWeight );
    blended /= skinWeight.x + skinWeight.y + skinWeight.z + skinWeight.w;
    boneMatX = blended;
    boneMatY = blended;
    boneMatZ = blended;
    boneMatW = blended;
  }
#endif
`;

/** `material` skinned by dual quaternions (after what its own `onBeforeCompile` does); it's returned. (Its program's
 *  key is read before the hook goes on: three's own key is the hook's source, the same for every material hooked
 *  here, so materials patched in different ways before would have shared one program.) */
export function dualQuaternionSkinned<T extends THREE.Material>(material: T): T {
  const own = material.onBeforeCompile;
  const key = `${material.customProgramCacheKey()}-dqs`;
  material.onBeforeCompile = (shader, renderer) => {
    own.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <skinning_pars_vertex>', `#include <skinning_pars_vertex>\n${FUNCTIONS}`)
      .replace('#include <skinbase_vertex>', BLENDED);
  };
  material.customProgramCacheKey = () => key;
  return material;
}
