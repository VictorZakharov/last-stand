// The Barkhide Hulk's vine (entities/throws.ts): a tendril creeping out along the ground from its feet, over the
// floor and through whatever stands in its way, two thin ones twisting round it, sap glowing in its grooves, and the
// coils it throws round a hero it catches. It is a thing lying on the floor, not light: drawn opaque, shaded by a
// light of its own from above (the same in every biome and quality, one program), its sap the only glow.
// Each piece grows from its root to `grow` metres (`uGrow`, its tip tapered to nothing) and withers back (`uWither`).
import * as THREE from 'three';
import { groundHeight } from '../world/ground';

/** the main tendril's radius, the thin ones' and how far round it they twist (m) */
const MAIN = 0.15, THIN = 0.06, TWIST = 0.14;
/** how many centimetres a ring of the tube is from the next, and its sides */
const STEP = 0.12, SIDES = 7;
/** how far the tip tapers to nothing (m) */
const TIP = 0.7;

const VERT = /* glsl */`attribute vec3 aOff; attribute float aAlong;
  uniform float uGrow; uniform float uWither;
  varying vec3 vN; varying float vAlong;
  void main(){
    float k = clamp((uGrow - aAlong) / ${TIP.toFixed(2)}, 0.0, 1.0) * (1.0 - uWither);
    vN = normalize(mat3(modelMatrix) * aOff);
    vAlong = aAlong;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position + aOff * sqrt(k), 1.0);
  }`;
const FRAG = /* glsl */`uniform vec3 uBark; uniform vec3 uSap; uniform float uGrow; uniform float uTime;
  varying vec3 vN; varying float vAlong;
  void main(){
    vec3 n = normalize(vN);
    // lit from above, as the scene's moon or sun would mostly light a thing on the floor
    float lit = 0.3 + 0.7 * max(dot(n, normalize(vec3(0.3, 0.9, 0.2))), 0.0);
    float groove = 0.5 + 0.5 * sin(vAlong * 23.0 + n.x * 3.0);
    vec3 c = uBark * lit * (0.75 + 0.35 * groove);
    // the sap runs in the grooves and pulses out toward the tip
    float vein = pow(max(0.0, 1.0 - groove * 1.8), 1.5);
    float pulse = 0.6 + 0.4 * sin(vAlong * 2.2 - uTime * 6.0);
    float tip = 1.0 - clamp((uGrow - vAlong) / 2.0, 0.0, 1.0);
    gl_FragColor = vec4(c + uSap * vein * pulse * (0.9 + tip), 1.0);
  }`;

/** One piece of vine: its mesh, grown to `grow` metres and withered by `wither` (0 to 1) each frame. */
export interface Vine {
  mesh: THREE.Mesh;
  grow: number;
  wither: number;
  /** its length grown in full (m) */
  length: number;
  update(time: number): void;
  dispose(): void;
}

/** A point of a centerline at `along` metres, and the tube's radius there. */
type Line = (along: number, out: THREE.Vector3) => THREE.Vector3;

const _t = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3(), _p = new THREE.Vector3();
const _q = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), SIDE = new THREE.Vector3(1, 0, 0);

/** A tube of `radius` round `line` from 0 to `length`, appended to the arrays: its rings' centres (position), each
 *  vertex's offset out from it at full size (`aOff`) and how far along it is (`aAlong`). */
function tube(line: Line, length: number, radius: number, pos: number[], off: number[], along: number[], index: number[]): void {
  const rings = Math.max(2, Math.ceil(length / STEP) + 1), first = pos.length / 3;
  for (let i = 0; i < rings; i++) {
    const u = (i / (rings - 1)) * length;
    line(u, _p);
    line(Math.min(length, u + 0.02), _q);
    if (u + 0.02 > length) line(u - 0.02, _t).subVectors(_p, _t);
    else _t.subVectors(_q, _p);
    _t.normalize();
    _b.crossVectors(_t, Math.abs(_t.y) > 0.9 ? SIDE : UP).normalize();
    _n.crossVectors(_b, _t);
    for (let s = 0; s < SIDES; s++) {
      const a = (s / SIDES) * Math.PI * 2, ca = Math.cos(a) * radius, sa = Math.sin(a) * radius;
      pos.push(_p.x, _p.y, _p.z);
      off.push(_n.x * ca + _b.x * sa, _n.y * ca + _b.y * sa, _n.z * ca + _b.z * sa);
      along.push(u);
    }
  }
  for (let i = 0; i < rings - 1; i++) {
    for (let s = 0; s < SIDES; s++) {
      const a = first + i * SIDES + s, b = first + i * SIDES + ((s + 1) % SIDES);
      index.push(a, a + SIDES, b, b, a + SIDES, b + SIDES);
    }
  }
}

function vineOf(tubes: { line: Line; radius: number }[], length: number, bark: number, sap: number): Vine {
  const pos: number[] = [], off: number[] = [], along: number[] = [], index: number[] = [];
  for (const t of tubes) tube(t.line, length, t.radius, pos, off, along, index);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aOff', new THREE.Float32BufferAttribute(off, 3));
  geo.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  // (its rings' centres alone bound it; out by the main tendril's girth and its twist)
  geo.boundingSphere!.radius += MAIN + TWIST + THIN;
  const uniforms = {
    uGrow: { value: 0 }, uWither: { value: 0 }, uTime: { value: 0 },
    uBark: { value: new THREE.Color(bark) }, uSap: { value: new THREE.Color(sap) },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'vine';
  const vine: Vine = {
    mesh, grow: 0, wither: 0, length,
    update(time) {
      uniforms.uGrow.value = vine.grow;
      uniforms.uWither.value = vine.wither;
      uniforms.uTime.value = time;
    },
    dispose() {
      mesh.removeFromParent();
      geo.dispose();
      mat.dispose();
    },
  };
  return vine;
}

/** A vine lying along the floor from (x, z) along (dx, dz) (a unit way) for `length` metres, through anything in its
 *  way, wandering a little either side of its line. In world space. */
export function groundVine(x: number, z: number, dx: number, dz: number, length: number, bark: number, sap: number): Vine {
  const lay = (u: number, sway: number, out: THREE.Vector3, lift = 0): THREE.Vector3 => {
    const px = x + dx * u - dz * sway, pz = z + dz * u + dx * sway;
    return out.set(px, groundHeight(px, pz) + MAIN * 0.6 + lift, pz);
  };
  const wander = (u: number): number => Math.sin(u * 1.3) * 0.12 + Math.sin(u * 3.1 + 1) * 0.05;
  const twisted = (phase: number): Line => (u, out) => {
    const a = u * 4.5 + phase;
    return lay(u, wander(u) + Math.cos(a) * TWIST, out, Math.sin(a) * TWIST);
  };
  return vineOf([
    { line: (u, out) => lay(u, wander(u), out), radius: MAIN },
    { line: twisted(0), radius: THIN },
    { line: twisted(Math.PI), radius: THIN },
  ], length, bark, sap);
}

/** a coil's length along its turns (m) */
const COIL_LENGTH = 5;

/** The coils a vine throws round a hero it catches: two tendrils winding up his legs from the floor to `high`,
 *  narrowing as they go. Placed by its mesh's position at his feet. */
export function coils(high: number, bark: number, sap: number): Vine {
  const turns = 2.5, rise = (u: number): number => u / COIL_LENGTH;
  const coil = (phase: number): Line => (u, out) => {
    const k = rise(u), a = k * turns * Math.PI * 2 + phase, r = 0.36 - 0.12 * k;
    return out.set(Math.cos(a) * r, 0.04 + k * high, Math.sin(a) * r);
  };
  return vineOf([{ line: coil(0), radius: 0.055 }, { line: coil(Math.PI), radius: 0.045 }], COIL_LENGTH, bark, sap);
}
/** A short vine, for the warm-up to compile their program. */
export function vineSamples(): THREE.Mesh[] {
  const vine = groundVine(0, 0, 1, 0, 2, 0x2a3a18, 0x9cff3a);
  vine.grow = 2;
  vine.update(0);
  return [vine.mesh];
}
