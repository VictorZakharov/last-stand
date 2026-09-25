// Swept blade arcs for melee skills: a flat ring segment on the ground plane whose
// glowing head sweeps across it, leaving a fading trail. Shared by the warrior's skills.
import * as THREE from 'three';
import { nearGlow } from '../../core/materials';
import { G } from '../../state';
import { addEffect } from '../../fx/effects';
import type { Effect } from '../../types';

export function slashMaterial(color: THREE.ColorRepresentation): THREE.ShaderMaterial {
  return nearGlow(new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) }, uProg: { value: 0 }, uFade: { value: 1 }, uDir: { value: 1 },
      uStart: { value: 0 }, uLen: { value: 1 }, uInner: { value: 0.3 }, uEven: { value: 0 },
    },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying vec2 vP;
      void main(){ vP = vec2(position.x, -position.z); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      varying vec2 vP;
      uniform vec3 uColor; uniform float uProg, uFade, uDir, uStart, uLen, uInner, uEven;
      void main(){
        // vP is the ring's own plane (the geometry was laid flat): position along the arc (0..1, in
        // the sweep direction) and across it (inner 0 .. outer 1); the inner radius is > 0, so atan
        // never sees (0, 0), and arcs up to PI stay inside atan's range
        float a = clamp((atan(vP.y, vP.x) - uStart) / uLen, 0.0, 1.0);
        if (uDir < 0.0) a = 1.0 - a;
        float r = clamp((length(vP) - uInner) / (1.0 - uInner), 0.0, 1.0);
        float behind = uProg - a;
        if (behind < 0.0) discard;
        // a sweep fades behind its head; an even arc (a travelling crescent) glows all along
        float trail = mix(exp(-behind * 5.0), 1.0, uEven);
        float edge = pow(r, 3.0) * 1.4 + r * 0.25;
        float tips = smoothstep(0.0, 0.08, a) * (1.0 - smoothstep(0.92, 1.0, a));
        float i = trail * edge * tips * uFade;
        gl_FragColor = vec4(mix(uColor, vec3(1.0), trail * r * 0.3) * i * 1.3, i);
      }`,
  }));
}

/** Ring segment of `arc` radians centred on local +Z after laying it flat, outer radius 1. */
function arcGeometry(arc: number, inner: number): THREE.BufferGeometry {
  // flat on the ground: local (x, y) maps to world (x, -z), so +Z is at angle -PI/2
  return new THREE.RingGeometry(inner, 1, 40, 1, -Math.PI / 2 - arc / 2, arc).rotateX(-Math.PI / 2);
}

export interface SlashOpts {
  /** centre on the ground and facing (radians, like Player.facing) */
  x: number; z: number; y?: number; facing: number;
  radius: number; arc: number; color: THREE.ColorRepresentation;
  /** +1 sweeps from the right side to the left, -1 the other way */
  dir?: number;
  /** seconds for the head to cross the arc, and to fade out afterwards */
  sweep?: number; fade?: number;
  inner?: number;
  /** tilt of the arc's plane: roll about the facing (PI/2 stands it upright, for an overhead chop),
   *  then pitch (negative raises the arc's middle) */
  roll?: number; pitch?: number;
}

/** A single sweep that plays out and removes itself. */
export function slashArc(o: SlashOpts): Effect {
  const inner = o.inner ?? 0.35, sweep = o.sweep ?? 0.12, fade = o.fade ?? 0.22;
  const geo = arcGeometry(o.arc, inner);
  const mat = slashMaterial(o.color);
  const u = mat.uniforms;
  u.uStart.value = -Math.PI / 2 - o.arc / 2; u.uLen.value = o.arc; u.uInner.value = inner; u.uDir.value = o.dir ?? 1;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.set(o.pitch ?? 0, 0, o.roll ?? 0);
  mesh.frustumCulled = false;
  const group = new THREE.Group();
  group.add(mesh);
  group.position.set(o.x, o.y ?? 1.0, o.z);
  group.rotation.y = o.facing;
  group.scale.setScalar(o.radius);
  G.scene.add(group);
  let t = 0;
  return addEffect({
    update(dt) {
      t += dt;
      u.uProg.value = Math.min(1.25, t / sweep);
      u.uFade.value = Math.max(0, 1 - Math.max(0, t - sweep) / fade);
      return t < sweep + fade;
    },
    dispose() { G.scene.remove(group); geo.dispose(); mat.dispose(); },
  });
}

/** A persistent arc the caller drives (spins, moves) through the returned mesh and uniforms; its
 *  head is at the +heading end (see SlashOpts.dir), or it glows evenly when `even`. */
export function slashMesh(arc: number, inner: number, color: THREE.ColorRepresentation, even = false): { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; dispose(): void } {
  const geo = arcGeometry(arc, inner);
  const mat = slashMaterial(color);
  const u = mat.uniforms;
  u.uStart.value = -Math.PI / 2 - arc / 2; u.uLen.value = arc; u.uInner.value = inner; u.uProg.value = 1; u.uEven.value = even ? 1 : 0;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, mat, dispose() { geo.dispose(); mat.dispose(); } };
}

/** Shortest angle between two headings. */
export const angleBetween = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
