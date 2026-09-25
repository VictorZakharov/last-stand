// Void Lance: channeled piercing beam. The hand first draws a portal in the air (a spark tracing a
// circle that opens into turning rune rings); only once it is open does the lance pour out of it.
import * as THREE from 'three';
import { nearGlow } from '../../core/materials';
import { G } from '../../state';
import { hitEnemy } from '../damage';
import { particles, col, burst } from '../../fx/particles';
import { flash, release } from '../../fx/lights';
import { sfx } from '../../core/audio';
import { viewMode, viewSettled } from '../../core/renderer';
import { rand } from '../../util';
import type { ChannelSkill, Needs } from './types';
import type { LightSlot } from '../../fx/lights';

type Def = Needs<'damage' | 'length' | 'width'>;

/** Per-channel state: beam and portal meshes, lights and the damage tick timer. */
interface LanceState {
  outer: THREE.Mesh; core: THREE.Mesh; portal: THREE.Mesh;
  outerMat: THREE.ShaderMaterial; coreMat: THREE.ShaderMaterial; portalMat: THREE.ShaderMaterial;
  lightA: LightSlot; lightB: LightSlot;
  tick: number; t: number;
  /** the beam is out (the portal finished opening) */
  firing: boolean;
  stopHum?: () => void;
}

const COLOR = new THREE.Color(0x5dffa8);
const TICK = 0.12;
/** the portal's radius once open (m); it opens from a spark to this, and shrinks a little while the beam pours out */
const PORTAL_R = 0.72;

const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true).translate(0, 0.5, 0);
/** the portal's quad spans -1..1; its rim sits at RIM of that */
const portalGeo = new THREE.PlaneGeometry(2, 2);
const RIM = 0.85;

function beamMaterial(core: boolean): THREE.ShaderMaterial {
  return nearGlow(new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLen: { value: 10 }, uColor: { value: COLOR.clone() }, uCore: { value: core ? 1 : 0 }, uFade: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying vec2 vUv; varying float vFres;
      void main(){
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        vFres = abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying float vFres;
      uniform float uTime, uLen, uCore, uFade; uniform vec3 uColor;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        float along = vUv.y * uLen;
        float flow = n(vec2(vUv.x * 10.0, along * 1.4 - uTime * 14.0)) * 0.6 + n(vec2(vUv.x * 22.0, along * 3.0 - uTime * 22.0)) * 0.4;
        float ends = smoothstep(0.0, 0.03, vUv.y) * (1.0 - smoothstep(0.9, 1.0, vUv.y));
        float body = pow(vFres, uCore > 0.5 ? 2.5 : 1.2);
        vec3 c = uCore > 0.5 ? mix(uColor, vec3(1.0), 0.7) * 2.5 : uColor * (0.4 + flow * 1.6);
        float a = body * ends * (uCore > 0.5 ? 1.0 : (0.35 + flow * 0.65)) * uFade;
        gl_FragColor = vec4(c * a, a);
      }`,
  }));
}

/**
 * The portal, in the quad's -1..1 space: a crackling rim of sparks that a bright head traces round
 * (uOpen 0..0.7), then two rune rings turning against each other, spokes and a slow swirl inside
 * fading in (0.4..1). Added light, no depth write.
 */
function portalMaterial(): THREE.ShaderMaterial {
  return nearGlow(new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpen: { value: 0 }, uFade: { value: 1 }, uColor: { value: COLOR.clone() } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */`varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      varying vec2 vP; uniform float uTime, uOpen, uFade; uniform vec3 uColor;
      const float TAU = 6.2831853, R = ${RIM.toFixed(2)};
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        float r = length(vP);
        if (r > 1.0) discard;
        // angle from the top, running clockwise the way the head traces it (atan's (0, 0) is undefined)
        float a = r < 1e-4 ? 0.0 : atan(vP.x, vP.y);
        float u = fract(a / TAU + 1.0);
        float trace = clamp(uOpen / 0.7, 0.0, 1.0);
        // how far behind the tracing head this angle is (0 at the head)
        float behind = trace - u;
        float drawn = trace >= 1.0 ? 1.0 : step(0.0, behind);
        float head = trace >= 1.0 ? 0.0 : exp(-max(behind, 0.0) * 18.0) * drawn;
        // the rim: a thin crackling band of sparks turning round
        float crackle = n(vec2(u * 90.0 - uTime * 30.0, uTime * 9.0)) * 0.7 + n(vec2(u * 260.0 + uTime * 55.0, 3.0)) * 0.6;
        float band = exp(-pow((r - R) / (0.018 + 0.02 * crackle), 2.0));
        float halo = exp(-pow((r - R) / 0.09, 2.0)) * 0.25;
        float rim = (band * (0.6 + crackle) + halo) * drawn + head * (exp(-pow((r - R) / 0.06, 2.0)) * 3.0);
        // rune rings, turning against each other: broken bands of ticks
        float k2 = smoothstep(0.4, 1.0, uOpen);
        // (glyph ticks of uneven length: each cell's own height)
        float cell1 = floor(u * 48.0 + uTime * 0.8), len1 = 0.012 + 0.03 * h(vec2(cell1, 1.0));
        float ring1 = smoothstep(0.008, 0.0, abs(r - 0.72 * R) - len1);
        float ticks1 = step(0.72, fract(u * 48.0 + uTime * 0.8)) * step(0.15, fract(u * 6.0 + uTime * 0.13));
        float ring2 = smoothstep(0.008, 0.0, abs(r - 0.56 * R) - 0.014);
        float ticks2 = step(0.62, fract(u * 30.0 - uTime * 0.9));
        float lines = smoothstep(0.01, 0.0, abs(r - 0.8 * R) - 0.004) + smoothstep(0.01, 0.0, abs(r - 0.64 * R) - 0.003);
        // spokes, a squared-off star turning slowly between the rings
        float spokes = exp(-abs(sin((a + uTime * 0.25) * 4.0)) * 30.0) * step(0.3 * R, r) * step(r, 0.56 * R);
        float runes = (ring1 * ticks1 + ring2 * ticks2 * 0.8 + lines * 0.6 + spokes * 0.5) * k2;
        // the portal itself: a slow swirl, brightest at the middle once open
        float sw = n(vec2(u * 6.0 + r * 5.0 - uTime * 1.5, r * 7.0 - uTime * 2.0));
        // (faint: over the shoulder the view looks through it)
        float inner = (sw * sw * 0.08 + exp(-r * r * 60.0) * 0.45) * k2 * smoothstep(R, 0.3, r);
        vec3 spark = mix(uColor, vec3(1.0, 0.98, 0.85), 0.55);
        vec3 c = spark * rim * 2.2 + uColor * runes * 2.6 + uColor * inner * 1.4;
        gl_FragColor = vec4(c * uFade, 1.0);
      }`,
  }));
}

const _dir = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _end = new THREE.Vector3(), _c = new THREE.Vector3();
const _u = new THREE.Vector3(), _v = new THREE.Vector3(), _n = new THREE.Vector3(), _cam = new THREE.Vector3(), _m = new THREE.Matrix4();
const easeOutBack = (k: number) => 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2;

const skill: ChannelSkill<LanceState> = {
  anim: 'channel',
  channel: true,
  warm: () => [new THREE.Mesh(beamGeo, beamMaterial(false)), new THREE.Mesh(portalGeo, portalMaterial())],
  start(_player, rawDef) {
    const outerMat = beamMaterial(false), coreMat = beamMaterial(true), portalMat = portalMaterial();
    const outer = new THREE.Mesh(beamGeo, outerMat), core = new THREE.Mesh(beamGeo, coreMat), portal = new THREE.Mesh(portalGeo, portalMat);
    outer.frustumCulled = core.frustumCulled = portal.frustumCulled = false;
    outer.visible = core.visible = false;
    G.scene.add(outer, core, portal);
    const opens = rawDef.opening ?? 0;
    if (opens > 0) sfx.charge(opens);
    return {
      outer, core, portal, outerMat, coreMat, portalMat, tick: 0, t: 0, firing: false,
      lightA: flash({ color: 0x5dffa8, intensity: 6, distance: 8, life: 1, hold: 999 }),
      lightB: flash({ color: 0x5dffa8, intensity: 0, distance: 7, life: 1, hold: 999 }),
    };
  },

  tick(player, rawDef, dt, st) {
    const def = rawDef as Def;
    st.t += dt;
    const opens = def.opening ?? 0;
    const open = opens > 0 ? Math.min(1, st.t / opens) : 1;

    const hand = player.palmPoint;
    _dir.set(player.aim.x - player.pos.x, 0, player.aim.z - player.pos.z);
    if (_dir.lengthSq() < 1e-4) _dir.set(Math.sin(player.facing), 0, Math.cos(player.facing));
    _dir.normalize();
    // the portal hangs in front of the chest, where the free hand pushes into it; seen through the
    // eyes, a smaller one in front of the hand in view (full size, it would fill the view)
    const eyes = player.local && viewMode() === 'first' && viewSettled();
    if (eyes) _c.copy(hand).addScaledVector(_dir, 0.35);
    else _c.set(player.pos.x + _dir.x * 0.85, 1.7, player.pos.z + _dir.z * 0.85);
    const origin = _c;

    // the portal stands across the beam, its top leaning away (clear of the body) the more the camera
    // looks down on it: upright it would be edge-on from the top-down view
    G.camera.getWorldDirection(_cam);
    _u.set(-_dir.z, 0, _dir.x);
    _n.copy(_dir).negate().addScaledVector(_up, THREE.MathUtils.clamp(-_cam.y * 1.3, 0, 1.1)).normalize();
    _v.crossVectors(_n, _u);
    st.portal.quaternion.setFromRotationMatrix(_m.makeBasis(_u, _v, _n));
    st.portal.position.copy(origin);
    const radius = PORTAL_R * (eyes ? 0.4 : 1) * (0.2 + 0.8 * easeOutBack(open)) * (st.firing ? 0.9 + Math.sin(st.t * 9) * 0.03 : 1);
    st.portal.scale.setScalar(radius / RIM);
    st.portalMat.uniforms.uTime.value = G.time;
    st.portalMat.uniforms.uOpen.value = open;
    st.lightA.light.position.copy(origin);
    st.lightA.peak = 6 + 14 * open;

    if (!st.firing) {
      // sparks thrown off the tracing head, falling away
      const trace = Math.min(1, open / 0.7);
      const n = trace < 1 ? 5 : 2;
      for (let i = 0; i < n; i++) {
        const ang = (trace < 1 ? trace : Math.random()) * Math.PI * 2 + rand(-0.08, 0.02);
        const s = Math.sin(ang), c = Math.cos(ang), r = radius;
        particles.glow.spawn({
          x: origin.x + (_u.x * s + _v.x * c) * r, y: origin.y + _v.y * c * r, z: origin.z + (_u.z * s + _v.z * c) * r,
          // along the circle (clockwise from the top) and a little outwards
          vx: _u.x * (c * 3 + s * 1.2) + _v.x * (c * 1.2 - s * 3) + rand(-0.6, 0.6), vy: _v.y * (c * 1.2 - s * 3) + rand(0, 1.5),
          vz: _u.z * (c * 3 + s * 1.2) + _v.z * (c * 1.2 - s * 3) + rand(-0.6, 0.6),
          life: rand(0.25, 0.5), size: rand(0.05, 0.11), sizeEnd: 0, color: col(0xeaffd8, 3), colorEnd: col(0x5dffa8, 0.6), drag: 2, gravity: 7,
        });
      }
      if (open < 1) return;
      // open: the lance bursts out of the portal
      st.firing = true;
      st.outer.visible = st.core.visible = true;
      st.stopHum = sfx.lance();
      burst(origin, { count: 18, color: 0x5dffa8, speed: 5, life: 0.35, size: 0.22, gravity: 2 });
      st.lightB.peak = 25;
    }
    const ft = st.t - opens;

    // beam stops at obstacles that reach up to it (not enemies: it pierces)
    let len = def.length;
    for (const o of G.arena.obstacles) {
      if (o.h <= origin.y) continue;
      const ox = o.x - origin.x, oz = o.z - origin.z;
      const proj = ox * _dir.x + oz * _dir.z;
      if (proj <= 0 || proj > len) continue;
      const perp = Math.abs(ox * _dir.z - oz * _dir.x);
      if (perp < o.r) len = Math.min(len, proj - Math.sqrt(o.r * o.r - perp * perp));
    }
    const edge = G.arena.radius + 1;
    for (let k = 0; k < 20 && Math.hypot(origin.x + _dir.x * len, origin.z + _dir.z * len) > edge; k++) len *= 0.95;

    const fadeIn = Math.min(1, ft / 0.12);
    // it bursts out wide and settles
    const w = def.width * (0.9 + Math.sin(st.t * 30) * 0.08) * (1 + 0.5 * Math.max(0, 1 - ft / 0.25));
    for (const [m, mat, scale] of [[st.outer, st.outerMat, w], [st.core, st.coreMat, w * 0.3]] as const) {
      m.position.copy(origin);
      m.quaternion.setFromUnitVectors(_up, _dir);
      m.scale.set(scale, len, scale);
      mat.uniforms.uTime.value = G.time;
      mat.uniforms.uLen.value = len;
      mat.uniforms.uFade.value = fadeIn;
    }
    _end.copy(origin).addScaledVector(_dir, len);
    st.lightB.light.position.copy(_end);

    // particles swirling along the beam
    for (let i = 0; i < 6; i++) {
      const d = Math.random() * len;
      const a = Math.random() * Math.PI * 2;
      particles.glow.spawn({
        // offset on the ring around the beam axis (perpendicular = (-dir.z, dir.x))
        x: origin.x + _dir.x * d - _dir.z * Math.cos(a) * w * 0.5, y: origin.y + Math.sin(a) * w * 0.5, z: origin.z + _dir.z * d + _dir.x * Math.cos(a) * w * 0.5,
        vx: _dir.x * 6 + rand(-1, 1), vy: rand(-0.5, 1), vz: _dir.z * 6 + rand(-1, 1),
        life: 0.3, size: rand(0.1, 0.25), sizeEnd: 0, color: col(0x5dffa8, 3), colorEnd: col(0x2050ff, 0.5), drag: 4,
      });
    }
    burst(_end, { count: 2, color: 0x5dffa8, speed: 3, life: 0.3, size: 0.3, gravity: 3 });

    // damage ticks
    st.tick += dt;
    if (st.tick >= TICK) {
      st.tick -= TICK;
      for (const e of G.enemies) {
        if (!e.alive) continue;
        const ex = e.pos.x - origin.x, ez = e.pos.z - origin.z;
        const proj = ex * _dir.x + ez * _dir.z;
        if (proj < 0 || proj > len + e.radius) continue;
        if (Math.abs(ex * _dir.z - ez * _dir.x) < w * 0.5 + e.radius) {
          hitEnemy(e, def.damage * TICK, { by: player, tags: def.tags, type: 'arcane', knock: 0.6, from: origin });
          burst(new THREE.Vector3(e.pos.x, 1.1, e.pos.z), { count: 4, color: 0x5dffa8, speed: 3, life: 0.3, size: 0.25 });
        }
      }
    }
  },

  stop(_player, _def, st) {
    G.scene.remove(st.outer, st.core, st.portal);
    st.outerMat.dispose(); st.coreMat.dispose(); st.portalMat.dispose();
    release(st.lightA); release(st.lightB);
    st.stopHum?.();
  },
};

export default skill;
