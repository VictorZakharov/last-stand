// A star of light on a drawn arrow's head while the bow is held at full draw (combat/skills/ranger.ts `drawGlint`):
// a bright core, four long rays and four short ones, turning slowly, on a quad that faces the camera from the
// arrowhead (a child of the model's `arrowHead`, so it rides the arrow in every view). It's the same share of the
// view's height however far off it is: the glint's particles are a few pixels from the top-down view and fade out
// within 3.5 m of the camera (fx/particles.ts), so through the eyes, the arrowhead under a metre off, nothing of them
// showed. Sized on the screen, it's never larger there than a glint, so it isn't dimmed up close as nearGlow() dims
// an effect: like the aim laser, it can't fill the view.
import * as THREE from 'three';
import { addEffect } from './effects';
import type { Player } from '../entities/player';

const COLOR = 0xffe2a0;
/** its width, a share of the view's height, and how bright its core is */
const SIZE = 0.075, CORE = 2.4;
/** how fast it comes as the draw reaches full and goes as it's loosed (a share a second): eased, never switched */
const RISE = 9, FALL = 7;
/** how far towards the camera it's drawn, so the bow's limb and the hand round the arrow don't cut it (m) */
const LIFT = 0.06;

const quad = new THREE.PlaneGeometry(1, 1);
quad.userData.shared = true;

function flareMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uStrength: { value: 0 }, uTime: { value: 0 }, uColor: { value: new THREE.Color(COLOR) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      varying vec2 vAt;
      void main(){
        vAt = position.xy * 2.0;
        vec4 centre = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float depth = max(-centre.z, 0.05);
        centre.xyz *= 1.0 - ${LIFT.toFixed(3)} / max(length(centre.xyz), ${(LIFT * 2).toFixed(3)});
        // (the view's height at that depth is 2 depth / projectionMatrix[1][1]: its width a share of it)
        centre.xy += position.xy * ${SIZE.toFixed(3)} * 2.0 * depth / projectionMatrix[1][1];
        gl_Position = projectionMatrix * centre;
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vAt; uniform float uStrength, uTime; uniform vec3 uColor;
      void main(){
        float r = length(vAt);
        float turn = uTime * 0.5;
        vec2 q = mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * vAt;
        vec2 d = vec2(q.x + q.y, q.x - q.y) * 0.7071;
        float core = exp(-r * r * 60.0) * ${CORE.toFixed(2)} + exp(-r * r * 9.0) * 0.35;
        float rays = (exp(-abs(q.x) * 70.0) + exp(-abs(q.y) * 70.0)) * (1.0 - smoothstep(0.0, 1.0, r));
        float spikes = (exp(-abs(d.x) * 90.0) + exp(-abs(d.y) * 90.0)) * (1.0 - smoothstep(0.0, 0.5, r)) * 0.6;
        // (a slow shimmer, a little over once a second and a fifth deep: a glint, never a flash)
        float shimmer = 0.9 + 0.1 * sin(uTime * 7.0);
        float k = (core + rays + spikes) * uStrength * shimmer;
        gl_FragColor = vec4(uColor * k, k);
      }`,
  });
}

/** One of each of its materials, for the warm-up (core/shaders.ts). */
export function warmGlintFlare(): THREE.Mesh[] {
  return [new THREE.Mesh(quad, flareMaterial())];
}

/** A hero's flare: shown while asked for each frame, eased out once it isn't. */
class Flare {
  readonly mesh = new THREE.Mesh(quad, flareMaterial());
  private strength = 0;
  private wanted = false;
  private time = 0;

  constructor() {
    // (by its name a measure finds it, to draw the frame without it: tools/lab `draw`)
    this.mesh.name = 'glintFlare';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }

  /** Shown this frame, on `on` (the arrowhead). */
  want(on: THREE.Object3D): void {
    if (this.mesh.parent !== on) on.add(this.mesh);
    this.wanted = true;
  }

  /** A frame: eased towards shown or gone; false once gone. */
  step(dt: number): boolean {
    this.time += dt;
    const goal = this.wanted ? 1 : 0;
    const rate = this.wanted ? RISE : FALL;
    this.strength += Math.sign(goal - this.strength) * Math.min(Math.abs(goal - this.strength), rate * dt);
    this.wanted = false;
    const u = this.mesh.material.uniforms;
    u.uStrength.value = this.strength * this.strength * (3 - 2 * this.strength);
    u.uTime.value = this.time;
    this.mesh.visible = this.strength > 0;
    return this.strength > 0 || goal > 0;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.material.dispose();
  }
}

const flares = new WeakMap<Player, Flare>();

/** `player`'s flare shown this frame on its arrowhead (none for a model without one), eased in if it wasn't. */
export function glintFlare(player: Player): void {
  const head = player.model.arrowHead;
  if (!head) return;
  let flare = flares.get(player);
  if (!flare) {
    const made = new Flare();
    flares.set(player, made);
    addEffect({
      update: (dt) => made.step(dt),
      dispose: () => {
        made.dispose();
        if (flares.get(player) === made) flares.delete(player);
      },
    });
    flare = made;
  }
  flare.want(head);
}
