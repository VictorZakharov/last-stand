// Arcane Aegis: a hexagonal ward that absorbs incoming damage.
import * as THREE from 'three';
import { G } from '../../state';
import { addEffect, shockwave } from '../../fx/effects';
import { burst } from '../../fx/particles';
import type { InstantSkill, Needs } from './types';
import type { SkillDef } from '../../types';
import { sfx } from '../../core/audio';

const COLOR = new THREE.Color(0xa890ff);
const geo = new THREE.IcosahedronGeometry(1, 4);

function wardMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHit: { value: 0 }, uFade: { value: 0 }, uColor: { value: COLOR } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        vP = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      uniform float uTime, uHit, uFade; uniform vec3 uColor;
      // hex grid distance on a 2D projection of the sphere
      float hex(vec2 p){ p = abs(p); return max(dot(p, normalize(vec2(1.0,1.73))), p.x); }
      void main(){
        float fres = 1.0 - abs(dot(vN, vV));
        vec2 uv = vec2(atan(vP.z, vP.x + 1e-4) * 3.0, vP.y * 5.0 + uTime * 0.3);
        vec2 r = vec2(1.0, 1.73); vec2 h = r * 0.5;
        vec2 a = mod(uv, r) - h; vec2 b = mod(uv - h, r) - h;
        vec2 g = dot(a,a) < dot(b,b) ? a : b;
        float edge = smoothstep(0.42, 0.5, hex(g));
        float shimmer = 0.5 + 0.5 * sin(uTime * 4.0 + vP.y * 8.0);
        float i = pow(fres, 2.2) * 1.4 + edge * (0.25 + shimmer * 0.25) + uHit * (0.6 + edge);
        gl_FragColor = vec4(uColor * i * 1.6 * uFade, i * uFade);
      }`,
  });
}

const skill: InstantSkill = {
  anim: 'buff',
  warm: () => [new THREE.Mesh(geo, wardMaterial())],
  cast(player, rawDef) {
    const def = rawDef as Needs<'absorbPct' | 'duration'>;
    const mat = wardMaterial();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.setScalar(1.25);
    G.scene.add(mesh);
    sfx.aegis();
    shockwave(player.pos, { color: 0xa890ff, intensity: 2, from: 0.3, to: 2.5, life: 0.4 });
    let t = 0, ended = false;
    const prev = player.ward;
    prev?.onEnd?.();
    player.ward = {
      amount: player.stats.maxLife * def.absorbPct,
      t: def.duration,
      onHit: () => { mat.uniforms.uHit.value = 1; },
      onEnd: () => { ended = true; },
    };
    addEffect({
      update(dt) {
        t += dt;
        const p = player.pos;
        mesh.position.set(p.x, player.obj.position.y + 1.05, p.z);
        mesh.rotation.y += dt * 0.5;
        mat.uniforms.uTime.value = t;
        mat.uniforms.uHit.value = Math.max(0, mat.uniforms.uHit.value - dt * 4);
        const fadeIn = Math.min(1, t / 0.2);
        mat.uniforms.uFade.value = ended ? Math.max(0, mat.uniforms.uFade.value - dt * 5) : fadeIn;
        if (ended && mat.uniforms.uFade.value <= 0) {
          burst(mesh.position, { count: 30, color: 0xa890ff, speed: 5, life: 0.5, size: 0.25, gravity: 2 });
          return false;
        }
        return true;
      },
      dispose() { G.scene.remove(mesh); mat.dispose(); },
    });
  },
};

export default skill;
