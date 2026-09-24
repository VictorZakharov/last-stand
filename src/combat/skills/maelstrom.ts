// Maelstrom: a roaming storm vortex that pulls enemies in and strikes them with lightning.
import * as THREE from 'three';
import { G } from '../../state';
import { hitEnemy } from '../damage';
import { addEffect, lightning, shockwave } from '../../fx/effects';
import { particles, col } from '../../fx/particles';
import { flash, release } from '../../fx/lights';
import { sfx } from '../../core/audio';
import type { InstantSkill, Needs } from './types';
import type { SkillDef } from '../../types';
import { rand } from '../../util';

const BLUE = 0x9fb2ff, FIRE = 0xff8a3c;
const TICK = 0.25;

const funnelGeo = new THREE.CylinderGeometry(1, 0.18, 1, 32, 8, true).translate(0, 0.5, 0);

function funnelMaterial(color: THREE.ColorRepresentation, speed: number, stripes: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uFade: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying vec2 vUv; uniform float uTime;
      void main(){
        vUv = uv;
        vec3 p = position;
        float wob = sin(uTime * 3.0 + p.y * 4.0) * 0.08 * p.y;
        p.x += wob; p.z += cos(uTime * 2.6 + p.y * 3.0) * 0.08 * p.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; uniform float uTime; uniform vec3 uColor; uniform float uFade;
      void main(){
        float s = sin((vUv.x * ${stripes.toFixed(1)} + vUv.y * 2.5 - uTime * ${speed.toFixed(2)}) * 6.2831);
        float band = smoothstep(0.2, 1.0, s);
        float fade = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.6, 1.0, vUv.y));
        // the storm starts right in front of the caster: in first person the camera is inside the
        // funnel, so its near walls fade out rather than stacking with the far ones
        float a = band * fade * uFade * 0.7 * smoothstep(0.5, 3.5, 1.0 / gl_FragCoord.w);
        gl_FragColor = vec4(uColor * 1.7 * a, a);

      }`,
  });
}

const funnelMaterials = () => [funnelMaterial(BLUE, 1.6, 3), funnelMaterial(0xc8d4ff, 2.4, 5), funnelMaterial(FIRE, 1.1, 2)];

const skill: InstantSkill = {
  anim: 'cast',
  warm: () => funnelMaterials().map((m) => new THREE.Mesh(funnelGeo, m)),
  cast(player, rawDef, target) {
    const def = rawDef as Needs<'damage' | 'radius' | 'duration' | 'speed' | 'pull'>;
    const dir = new THREE.Vector3(target.x - player.pos.x, 0, target.z - player.pos.z);
    if (dir.lengthSq() < 0.01) dir.set(Math.sin(player.facing), 0, Math.cos(player.facing));
    dir.normalize();
    const pos = player.pos.clone().addScaledVector(dir, 1.8);
    const group = new THREE.Group();
    const mats = funnelMaterials();
    const scales = [[def.radius * 0.9, 4.2], [def.radius * 0.6, 3.6], [def.radius * 0.45, 2.4]];
    const meshes = mats.map((m, i) => {
      const mesh = new THREE.Mesh(funnelGeo, m);
      mesh.scale.set(scales[i][0], scales[i][1], scales[i][0]);
      mesh.frustumCulled = false;
      group.add(mesh);
      return mesh;
    });
    group.position.copy(pos);
    G.scene.add(group);
    const light = flash({ color: BLUE, intensity: 30, distance: 10, life: 1, hold: def.duration, follow: () => new THREE.Vector3(pos.x, 2, pos.z) });
    sfx.maelstrom();
    shockwave(pos, { color: BLUE, intensity: 2, from: 0.5, to: def.radius, life: 0.4 });

    let t = 0, tick = 0;
    addEffect({
      update(dt) {
        t += dt;
        const fade = Math.min(1, t / 0.3) * Math.min(1, (def.duration - t) / 0.4);
        pos.addScaledVector(dir, def.speed * dt);
        const R = G.arena.radius - 1, r = Math.hypot(pos.x, pos.z);
        if (r > R) { pos.x *= R / r; pos.z *= R / r; }
        group.position.copy(pos);
        meshes.forEach((m, i) => { m.rotation.y = t * (3 + i * 1.5) * (i % 2 ? -1 : 1); m.material.uniforms.uTime.value = t; m.material.uniforms.uFade.value = fade; });

        // swirling debris & embers
        for (let i = 0; i < 6; i++) {
          const a = Math.random() * Math.PI * 2, rr = rand(0.3, def.radius), h = rand(0, 3.5);
          const tang = 7;
          particles.glow.spawn({
            x: pos.x + Math.cos(a) * rr, y: h, z: pos.z + Math.sin(a) * rr,
            vx: -Math.sin(a) * tang - Math.cos(a) * 2, vy: rand(0.5, 2), vz: Math.cos(a) * tang - Math.sin(a) * 2,
            life: 0.35, size: rand(0.1, 0.3), sizeEnd: 0, color: col(i % 3 ? BLUE : FIRE, 2.5), colorEnd: col(0x3040ff, 0.4), drag: 2,
          });
        }
        if (Math.random() < 0.3) {
          particles.smoke.spawn({ x: pos.x + rand(-1, 1), y: 0.2, z: pos.z + rand(-1, 1), vy: 1.5, vx: rand(-1, 1), vz: rand(-1, 1), life: 1, size: 1.5, sizeEnd: 3, color: col(0x20242e), alpha: 0.4 });
        }

        // pull
        for (const e of G.enemies) {
          if (!e.alive || e.boss) continue;
          const dx = pos.x - e.pos.x, dz = pos.z - e.pos.z, d = Math.hypot(dx, dz);
          if (d < def.radius * 1.6 && d > 0.3) {
            e.knock.x += (dx / d) * def.pull * dt * 4 * (1 - (e.def.knockbackResist || 0));
            e.knock.z += (dz / d) * def.pull * dt * 4 * (1 - (e.def.knockbackResist || 0));
          }
        }

        // damage ticks with lightning
        tick += dt;
        if (tick >= TICK && t < def.duration - 0.2) {
          tick -= TICK;
          const inside = G.enemies.filter((e) => e.alive && Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < def.radius + e.radius);
          for (const e of inside) hitEnemy(e, def.damage * TICK, { by: player, tags: def.tags, type: 'lightning', silent: true });
          const top = new THREE.Vector3(pos.x, 4, pos.z);
          const targets = inside.sort(() => Math.random() - 0.5).slice(0, 2);
          if (targets.length) {
            for (const e of targets) lightning(top, new THREE.Vector3(e.pos.x, e.height * 0.6, e.pos.z), { color: BLUE, intensity: 6 });
            sfx.zap();
          } else if (Math.random() < 0.5) {
            lightning(top, new THREE.Vector3(pos.x + rand(-1.5, 1.5), 0, pos.z + rand(-1.5, 1.5)), { color: BLUE, intensity: 4, branches: 1 });
          }
        }
        return t < def.duration;
      },
      dispose() {
        G.scene.remove(group);
        mats.forEach((m) => m.dispose());
        release(light);
      },
    });
  },
};

export default skill;
