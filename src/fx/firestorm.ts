// Maelstrom's look (combat/skills/maelstrom.ts), after its icon: a tornado of fire, narrow where it touches the ground
// and flaring wide at the top, its lip curling in over a dark eye. Spiral ribbons of flame wind up it (a bright
// leading edge and a long tail, frayed into fibres by noise), deep red to orange to yellow-white where they're
// hottest, round a core of dark smoke; a swirl burns on the floor under it, embers spin up it and are flung from its
// lip, smoke is kicked up at its foot and lightning crackles over it. Drawn in layers, so the ribbons' far walls show
// through the smoke and the near walls lie over it: from above, a bright spiral round a black eye.
import * as THREE from 'three';
import { NEAR_GLOW } from '../core/materials';
import { groundHeight } from '../world/ground';
import { floorPatch, lay } from './floorPatch';
import { particles, col } from './particles';
import { lightning } from './effects';
import { rand } from '../util';

/** the embers' colour as they leave and as they cool, the smoke's and the crackles' (the flames' are in their shader) */
const EMBER = 0xff8a3c, EMBER_END = 0x401000, SMOKE = 0x0d0705, CRACKLE = 0xffc890;
/** the funnel's height, and its narrow foot, as shares of its top's radius */
const HEIGHT = 1.3, FOOT = 0.08;
/** how it flares from its foot to its top (its radius goes with its height to this power) */
const FLARE = 1.2;
/** the profile's points up the cone and round the lip */
const CONE_POINTS = 18;
const LIP: [number, number][] = [[0.98, 1.035], [0.92, 1.07], [0.83, 1.085], [0.73, 1.075], [0.65, 1.05]];
/** crackles of lightning over it a second, and the swirl on the floor's reach (a share of the top's radius) */
const CRACKLES = 2.5, FLOOR_REACH = 0.85;

/** The funnel's profile, a unit tall and a unit wide at its top: a cone that flares, and its lip curling in. */
function profile(): THREE.Vector2[] {
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= CONE_POINTS; i++) {
    const s = i / CONE_POINTS;
    points.push(new THREE.Vector2(FOOT + (1 - FOOT) * s ** FLARE, s));
  }
  for (const [r, y] of LIP) points.push(new THREE.Vector2(r, y));
  return points;
}

const funnelGeo = new THREE.LatheGeometry(profile(), 64);

const NOISE = /* glsl */`
  float fsHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float fsNoise(vec3 x){
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(fsHash(i), fsHash(i + vec3(1, 0, 0)), f.x), mix(fsHash(i + vec3(0, 1, 0)), fsHash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(fsHash(i + vec3(0, 0, 1)), fsHash(i + vec3(1, 0, 1)), f.x), mix(fsHash(i + vec3(0, 1, 1)), fsHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fsFbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * fsNoise(p); p *= 2.03; a *= 0.5; } return s; }`;

// Its flames are drawn as colour over what lies behind them, premultiplied (the light they give added to it, their
// alpha covering it), not added light alone: four walls of orange added over each other went white, and over the
// forest's green the orange turned tan, where the icon's ribbons are solid. Their glow (the light past their colour)
// dims with their distance from the camera as nearGlow() dims an effect's (core/materials.ts); the wrapper itself
// dims a colour without its alpha, which turned the near walls brown.
const OVER = {
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
} as const;
const NEAR = /* glsl */`
  float fsNear(float depth){
    return clamp(pow(depth / ${NEAR_GLOW.ref.toFixed(1)}, ${NEAR_GLOW.pow.toFixed(2)}), ${NEAR_GLOW.min.toFixed(2)}, 1.0);
  }`;

// (the funnel sways, more the higher it is; its depth from the camera is for the walls up close)
const FUNNEL_VERTEX = /* glsl */`
  varying vec2 vUv; varying float vDepth; uniform float uTime;
  void main(){
    vUv = uv;
    vec3 p = position;
    p.x += sin(uTime * 2.3 + p.y * 2.0) * 0.06 * p.y;
    p.z += cos(uTime * 1.9 + p.y * 1.7) * 0.06 * p.y;
    vec4 view = modelViewMatrix * vec4(p, 1.0);
    vDepth = -view.z;
    gl_Position = projectionMatrix * view;
  }`;

/** The ribbons' look: how many wind round it, how far they twist up it, how fast they run, how hot and which noise. */
interface Ribbons {
  bands: number;
  twist: number;
  speed: number;
  heat: number;
  seed: number;
}

function ribbonMaterial(side: THREE.Side): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uFade: { value: 0 }, uBands: { value: 3 }, uTwist: { value: 1 }, uSpeed: { value: 1 },
      uHeat: { value: 1 }, uSeed: { value: 0 },
    },
    transparent: true, depthWrite: false, ...OVER, side,
    vertexShader: FUNNEL_VERTEX,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying float vDepth;
      uniform float uTime, uFade, uBands, uTwist, uSpeed, uHeat, uSeed;
      ${NOISE}
      ${NEAR}
      void main(){
        // (the noise is read on a circle round the funnel, so its seam meets itself)
        float ang = vUv.x * 6.2831853, v = vUv.y;
        vec3 round = vec3(cos(ang), 0.0, sin(ang));
        float warp = fsFbm(round * 1.6 + vec3(0.0, v * 3.0 - uTime * 0.7, 0.0) + uSeed);
        // each ribbon winds up and round, its leading edge burning brightest and the rest cooling behind it
        float f = fract(vUv.x * uBands + v * uTwist - uTime * uSpeed + (warp - 0.5) * 0.9);
        float band = smoothstep(0.0, 0.05, f) * pow(1.0 - f, 2.4);
        float edge = smoothstep(0.0, 0.03, f) * (1.0 - smoothstep(0.03, 0.14, f));
        // frayed into strands along it: the ridges of a noise across it, dark between them
        // (flowing up along them)
        float n = fsNoise(round * 2.0 + vec3(f * 24.0, v * 2.0 - uTime * 1.6, f * 24.0) + uSeed * 3.0);
        float strand = pow(1.0 - abs(2.0 * n - 1.0), 3.0);
        float heat = band * (0.55 + 0.6 * strand) * (0.75 + 0.5 * warp);
        float ends = smoothstep(0.03, 0.2, v) * (1.0 - smoothstep(0.86, 1.0, v));
        // (its walls fade within 7 m: it rises round the camera through the eyes and just past it over the shoulder,
        // and up close its walls laid an orange veil over the whole view)
        float a = clamp(heat * 1.4 + edge * 0.5, 0.0, 0.95) * ends * uFade * smoothstep(1.5, 7.0, vDepth);
        vec3 c = mix(vec3(0.55, 0.04, 0.0), vec3(0.95, 0.28, 0.02), smoothstep(0.05, 0.4, heat));
        c = mix(c, vec3(1.0, 0.7, 0.28), smoothstep(0.5, 0.9, heat + edge * 0.6));
        gl_FragColor = vec4(c * mix(1.0, uHeat, fsNear(vDepth)) * a, a);
      }`,
  });
}

function smokeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFade: { value: 0 }, uColor: { value: new THREE.Color(SMOKE) } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: FUNNEL_VERTEX,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying float vDepth; uniform float uTime, uFade; uniform vec3 uColor;
      ${NOISE}
      void main(){
        float ang = vUv.x * 6.2831853, v = vUv.y;
        float n = fsFbm(vec3(cos(ang), 0.0, sin(ang)) * 1.3 + vec3(0.0, v * 2.2 - uTime * 0.5, 0.0) + 11.0);
        float ends = smoothstep(0.05, 0.3, v) * (1.0 - smoothstep(0.8, 1.0, v));
        float a = smoothstep(0.2, 0.6, n) * 0.75 * ends * uFade * smoothstep(1.5, 7.0, vDepth);
        gl_FragColor = vec4(uColor, a);
      }`,
  });
}

function floorMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFade: { value: 0 }, uReach: { value: 1 } },
    transparent: true, depthWrite: false, ...OVER,
    vertexShader: /* glsl */`
      varying vec2 vAt; varying float vDepth;
      void main(){
        vAt = position.xz;
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        vDepth = -view.z;
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vAt; varying float vDepth; uniform float uTime, uFade, uReach;
      ${NOISE}
      ${NEAR}
      void main(){
        float r = length(vAt) / uReach;
        // (atan of the middle itself is undefined: never quite there)
        float ang = atan(vAt.y, vAt.x + 1e-5);
        float n = fsFbm(vec3(vAt * 1.3, uTime * 0.5));
        // three arms spiralling in to the foot, turning with the storm
        float arms = fract(ang / 6.2831853 * 3.0 + r * 1.6 + uTime * 0.9 + n * 0.5);
        float arm = smoothstep(0.0, 0.1, arms) * pow(1.0 - arms, 3.0);
        float inside = 1.0 - smoothstep(0.15, 1.0, r);
        float glow = arm * inside * (0.5 + n);
        // (the ground scorched dark under it, its arms burning)
        float scorch = 0.45 * inside * (0.6 + 0.4 * n);
        vec3 c = mix(vec3(0.5, 0.05, 0.0), vec3(1.0, 0.42, 0.08), smoothstep(0.2, 0.8, glow));
        float a = clamp(scorch + glow, 0.0, 0.9) * uFade;
        gl_FragColor = vec4(c * glow * mix(1.0, 1.5, fsNear(vDepth)) * uFade, a);
      }`,
  });
}

/** The meshes of one of each material, for the warm-up (core/shaders.ts: every program compiled at load). */
export function warmFirestorm(): THREE.Mesh[] {
  const floor = floorPatch(0, 1, 2, 8);
  return [
    new THREE.Mesh(funnelGeo, ribbonMaterial(THREE.BackSide)),
    new THREE.Mesh(funnelGeo, ribbonMaterial(THREE.FrontSide)),
    new THREE.Mesh(funnelGeo, smokeMaterial()),
    new THREE.Mesh(floor, floorMaterial()),
  ];
}

/** A layer of the funnel: its ribbons (or its smoke), its size against the top's radius, and its spin (rad/s). */
interface Layer {
  ribbons?: Ribbons;
  width: number;
  height: number;
  spin: number;
}

// (outer ribbons, inner ribbons spinning faster as a vortex's do, and the smoke inside both; their ribbons pass a
// point about once a second each, the fire flowing along them instead: wide ones passing at 4 a second flashed a
// sixteenth of the screen 3 to 4 times a second, `npm run lab -- cast maelstrom`)
const OUTER: Layer = { ribbons: { bands: 4, twist: 1.4, speed: 0.12, heat: 1.15, seed: 0 }, width: 1, height: 1, spin: 1.4 };
const INNER: Layer = { ribbons: { bands: 3, twist: 1.9, speed: 0.18, heat: 0.8, seed: 7 }, width: 0.72, height: 0.94, spin: 2 };
const SMOKE_LAYER: Layer = { width: 0.58, height: 0.92, spin: 2.2 };

/** A firestorm in the scene: placed, grown and faded by its owner each frame, and disposed when it's over. */
export class Firestorm {
  readonly group = new THREE.Group();
  /** its top's radius (m) */
  readonly radius: number;
  private readonly meshes: { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>; layer: Layer }[] = [];
  private readonly floorGeo: THREE.BufferGeometry;
  private readonly floor: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private time = 0;
  private crackle = 0;

  constructor(radius: number, scene: THREE.Scene) {
    this.radius = radius;
    // (drawn in this order: the ribbons' far walls, the smoke, the near walls)
    const order: [Layer, THREE.Side | null][] = [
      [OUTER, THREE.BackSide], [INNER, THREE.BackSide], [SMOKE_LAYER, null], [INNER, THREE.FrontSide], [OUTER, THREE.FrontSide],
    ];
    order.forEach(([layer, side], i) => {
      const material = side === null ? smokeMaterial() : ribbonMaterial(side);
      const ribbons = layer.ribbons;
      if (ribbons) {
        const u = material.uniforms;
        u.uBands.value = ribbons.bands; u.uTwist.value = ribbons.twist; u.uSpeed.value = ribbons.speed;
        u.uHeat.value = ribbons.heat; u.uSeed.value = ribbons.seed;
      }
      const mesh = new THREE.Mesh(funnelGeo, material);
      mesh.renderOrder = 1 + i;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.meshes.push({ mesh, layer });
    });
    this.floorGeo = floorPatch(0, radius * FLOOR_REACH, 6, 48);
    this.floor = new THREE.Mesh(this.floorGeo, floorMaterial());
    this.floor.material.uniforms.uReach.value = radius * FLOOR_REACH;
    this.floor.frustumCulled = false;
    scene.add(this.group, this.floor);
  }

  /** How far out its surface is `height` m above its foot, grown `grow` of the way (m). */
  surfaceAt(height: number, grow = 1): number {
    const s = THREE.MathUtils.clamp(height / (this.radius * HEIGHT * grow), 0, 1);
    return (FOOT + (1 - FOOT) * s ** FLARE) * this.radius * grow;
  }

  /**
   * The storm at (x, z) for this frame: `grow` of its size (0 to 1: rising out of the ground, and sinking back),
   * `fade` of its light; its embers, smoke and crackles spawned.
   */
  update(dt: number, x: number, z: number, grow: number, fade: number): void {
    this.time += dt;
    const ground = groundHeight(x, z);
    this.group.position.set(x, ground, z);
    const r = this.radius * grow;
    for (const { mesh, layer } of this.meshes) {
      mesh.scale.set(r * layer.width, r * HEIGHT * layer.height * grow, r * layer.width);
      mesh.rotation.y = this.time * layer.spin;
      mesh.material.uniforms.uTime.value = this.time;
      mesh.material.uniforms.uFade.value = fade;
    }
    this.floor.position.set(x, 0, z);
    lay(this.floorGeo, x, z, 0.04);
    this.floor.material.uniforms.uTime.value = this.time;
    this.floor.material.uniforms.uFade.value = fade;
    if (fade > 0.05) this.emit(dt, x, ground, z, grow, fade);
  }

  /** The embers, smoke and crackles of a frame. */
  private emit(dt: number, x: number, ground: number, z: number, grow: number, fade: number): void {
    const top = this.radius * HEIGHT * grow;
    // embers spinning up its walls, the way the ribbons turn (a turn about +y: from +z towards +x)
    for (let i = 0; i < Math.round(8 * fade); i++) {
      const h = rand(0.1, top), a = rand(0, Math.PI * 2), rr = this.surfaceAt(h, grow) * rand(0.8, 1.08);
      const tang = rand(4, 7), out = rand(0.3, 1.2);
      particles.glow.spawn({
        x: x + Math.cos(a) * rr, y: ground + h, z: z + Math.sin(a) * rr,
        vx: Math.sin(a) * tang + Math.cos(a) * out, vy: rand(1, 3), vz: -Math.cos(a) * tang + Math.sin(a) * out,
        life: rand(0.45, 0.85), size: rand(0.06, 0.15), sizeEnd: 0,
        color: col(EMBER, rand(1.6, 2.8)), colorEnd: col(EMBER_END, 0.3), drag: 1.5,
      });
    }
    // and flung off its lip, falling as they cool
    for (let i = 0; i < Math.round(2 * fade); i++) {
      const a = rand(0, Math.PI * 2), rr = this.radius * grow * 0.95, out = rand(2.5, 4.5);
      particles.glow.spawn({
        x: x + Math.cos(a) * rr, y: ground + top, z: z + Math.sin(a) * rr,
        vx: Math.cos(a) * out + Math.sin(a) * 3, vy: rand(1, 2.5), vz: Math.sin(a) * out - Math.cos(a) * 3,
        life: rand(0.6, 1.1), size: rand(0.05, 0.1), sizeEnd: 0,
        color: col(EMBER, 2.2), colorEnd: col(EMBER_END, 0.2), gravity: 4, drag: 0.8,
      });
    }
    // smoke kicked up round its foot
    if (Math.random() < 0.5 * fade) {
      const a = rand(0, Math.PI * 2), rr = rand(0.4, 1.6);
      particles.smoke.spawn({
        x: x + Math.cos(a) * rr, y: ground + 0.2, z: z + Math.sin(a) * rr,
        vx: Math.sin(a) * 2, vy: rand(1, 2), vz: -Math.cos(a) * 2,
        life: 1.2, size: 1.2, sizeEnd: 3, color: col(SMOKE), alpha: 0.35, drag: 0.6,
      });
    }
    // lightning crackling over it, short and dim: no flash
    this.crackle += dt * CRACKLES * fade;
    if (this.crackle >= 1) {
      this.crackle -= 1;
      const h = rand(0.3, 0.85) * top, a = rand(0, Math.PI * 2), turn = rand(0.35, 0.6);
      const from = this.pointOn(x, ground, z, h, a, grow);
      const to = this.pointOn(x, ground, z, h + rand(0.3, 0.7), a + turn, grow);
      lightning(from, to, { color: CRACKLE, intensity: 3, width: 0.035, life: 0.12, segments: 6, jag: 0.18, branches: 0 });
    }
  }

  /**
   * Its rising out of the ground at (x, z): embers bursting out round its foot. (A shockwave's ring of added light,
   * at full from its first frame, swept the floor under the camera through the eyes: the frame's mean leapt a third.)
   */
  burst(x: number, z: number): void {
    const ground = groundHeight(x, z);
    for (let i = 0; i < 40; i++) {
      const a = rand(0, Math.PI * 2), out = rand(2, 5);
      particles.glow.spawn({
        x: x + Math.cos(a) * 0.4, y: ground + 0.15, z: z + Math.sin(a) * 0.4,
        vx: Math.cos(a) * out + Math.sin(a) * 2, vy: rand(1.5, 4), vz: Math.sin(a) * out - Math.cos(a) * 2,
        life: rand(0.5, 0.9), size: rand(0.06, 0.14), sizeEnd: 0,
        color: col(EMBER, 2.4), colorEnd: col(EMBER_END, 0.3), gravity: 5, drag: 1.2,
      });
    }
  }

  /** A point on its surface `h` m up, `a` round (rad), a little outside it. */
  pointOn(x: number, ground: number, z: number, h: number, a: number, grow = 1): THREE.Vector3 {
    const r = this.surfaceAt(h, grow) * 1.04;
    return new THREE.Vector3(x + Math.cos(a) * r, ground + h, z + Math.sin(a) * r);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group, this.floor);
    for (const { mesh } of this.meshes) mesh.material.dispose();
    this.floor.material.dispose();
    this.floorGeo.dispose();
  }
}
