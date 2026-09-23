// Void Lance: channeled piercing beam.
import * as THREE from 'three';
import { G } from '../../state';
import { hitEnemy } from '../damage';
import { particles, col, burst } from '../../fx/particles';
import { flash, release } from '../../fx/lights';
import { sfx } from '../../core/audio';
import { rand } from '../../util';
import type { ChannelSkill, Needs } from './types';
import type { LightSlot } from '../../fx/lights';

type Def = Needs<'damage' | 'length' | 'width'>;

/** Per-channel state: beam meshes, lights and the damage tick timer. */
interface LanceState {
  outer: THREE.Mesh; core: THREE.Mesh;
  outerMat: THREE.ShaderMaterial; coreMat: THREE.ShaderMaterial;
  lightA: LightSlot; lightB: LightSlot;
  tick: number; t: number;
  stopHum?: () => void;
}

const COLOR = new THREE.Color(0x5dffa8);
const TICK = 0.12;

const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true).translate(0, 0.5, 0);

function beamMaterial(core: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
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
  });
}

const _dir = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _end = new THREE.Vector3();

const skill: ChannelSkill<LanceState> = {
  anim: 'channel',
  channel: true,
  start() {
    const outerMat = beamMaterial(false), coreMat = beamMaterial(true);
    const outer = new THREE.Mesh(beamGeo, outerMat), core = new THREE.Mesh(beamGeo, coreMat);
    outer.frustumCulled = core.frustumCulled = false;
    G.scene.add(outer, core);
    return {
      outer, core, outerMat, coreMat, tick: 0, t: 0,
      lightA: flash({ color: 0x5dffa8, intensity: 20, distance: 8, life: 1, hold: 999 }),
      lightB: flash({ color: 0x5dffa8, intensity: 25, distance: 7, life: 1, hold: 999 }),
      stopHum: sfx.lance(),
    };
  },

  tick(player, rawDef, dt, st) {
    const def = rawDef as Def;
    st.t += dt;
    const origin = player.palmPoint;
    origin.y = Math.max(1.0, origin.y);
    _dir.set(player.aim.x - origin.x, 0, player.aim.z - origin.z);
    if (_dir.lengthSq() < 1e-4) _dir.set(Math.sin(player.facing), 0, Math.cos(player.facing));
    _dir.normalize();

    // beam stops at obstacles (not enemies: it pierces)
    let len = def.length;
    for (const o of G.arena.obstacles) {
      const ox = o.x - origin.x, oz = o.z - origin.z;
      const proj = ox * _dir.x + oz * _dir.z;
      if (proj <= 0 || proj > len) continue;
      const perp = Math.abs(ox * _dir.z - oz * _dir.x);
      if (perp < o.r) len = Math.min(len, proj - Math.sqrt(o.r * o.r - perp * perp));
    }
    const edge = G.arena.radius + 1;
    for (let k = 0; k < 20 && Math.hypot(origin.x + _dir.x * len, origin.z + _dir.z * len) > edge; k++) len *= 0.95;

    const fadeIn = Math.min(1, st.t / 0.12);
    const w = def.width * (0.9 + Math.sin(st.t * 30) * 0.08);
    for (const [m, mat, scale] of [[st.outer, st.outerMat, w], [st.core, st.coreMat, w * 0.3]] as const) {
      m.position.copy(origin);
      m.quaternion.setFromUnitVectors(_up, _dir);
      m.scale.set(scale, len, scale);
      mat.uniforms.uTime.value = G.time;
      mat.uniforms.uLen.value = len;
      mat.uniforms.uFade.value = fadeIn;
    }
    _end.copy(origin).addScaledVector(_dir, len);
    st.lightA.light.position.copy(origin);
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
          hitEnemy(e, def.damage * TICK, { tags: def.tags, type: 'arcane', knock: 0.6, from: origin });
          burst(new THREE.Vector3(e.pos.x, 1.1, e.pos.z), { count: 4, color: 0x5dffa8, speed: 3, life: 0.3, size: 0.25 });
        }
      }
    }
  },

  stop(_player, _def, st) {
    G.scene.remove(st.outer, st.core);
    st.outerMat.dispose(); st.coreMat.dispose();
    release(st.lightA); release(st.lightB);
    st.stopHum?.();
  },
};

export default skill;
