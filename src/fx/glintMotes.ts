// Motes of light drawn in onto a drawn arrow's head (combat/skills/ranger.ts `drawGlint`): specks spiralling in from
// round it and fading into the head, more of them as the bow is drawn, held at full until it's loosed. One quad faces
// the camera from the arrowhead (a child of the model's `arrowHead`, so it rides the arrow in every view) and its
// fragment shader places the motes, each with a short trail. Its reach is as far as the motes come from in the world,
// and never more than a share of the view's height: the world's particles fade within 3.5 m of the camera
// (fx/particles.ts), so through the eyes, the arrowhead under a metre off, nothing of them showed. Nothing gathers at
// the head itself: a star of light there read as a bright spark, and was too bright in every view.
import * as THREE from 'three';
import { addEffect } from './effects';
import type { Player } from '../entities/player';

/** (a deep gold: paler, tone mapping washed it to white) */
const COLOR = 0xffc45a;
/** how far round the head the motes come from: in the world (m), and at most as a share of the view's height */
const REACH = 0.8, REACH_SHARE = 0.03;
/** the motes, how bright each is at its brightest (under the bloom's threshold: brighter, they bloomed into soft white
 *  blobs), how wide (a share of the view's height: the same few pixels in every view), and how long a streak each
 *  leaves behind it (a share of its way in) */
const MOTES = 18, BRIGHT = 1.4, DOT = 0.002, TRAIL = 0.12;
/** how fast it comes as the draw nears full and goes as it's loosed (a share a second): eased, never switched */
const RISE = 6, FALL = 7;
/** how far towards the camera it's drawn, so the bow's limb and the hand round the arrow don't cut it (m) */
const LIFT = 0.06;

const quad = new THREE.PlaneGeometry(2, 2);
quad.userData.shared = true;

function motesMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uStrength: { value: 0 }, uDensity: { value: 0 }, uTime: { value: 0 }, uColor: { value: new THREE.Color(COLOR) },
    },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      varying vec2 vAt; varying float vDot;
      void main(){
        vAt = position.xy;
        vec4 centre = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float depth = max(-centre.z, 0.05);
        centre.xyz *= 1.0 - ${LIFT.toFixed(3)} / max(length(centre.xyz), ${(LIFT * 2).toFixed(3)});
        // (the view's height at that depth is 2 depth / projectionMatrix[1][1])
        float tall = 2.0 * depth / projectionMatrix[1][1];
        float reach = min(${REACH.toFixed(3)}, ${REACH_SHARE.toFixed(3)} * tall);
        vDot = ${DOT.toFixed(4)} * tall / reach;
        centre.xy += position.xy * reach;
        gl_Position = projectionMatrix * centre;
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vAt; varying float vDot; uniform float uStrength, uDensity, uTime; uniform vec3 uColor;
      float moteHash(float n){ return fract(sin(n * 12.9898) * 43758.5453); }
      // (where a mote is, its life of its way in: spiralling in from the edge, faster as it nears the head)
      vec2 moteAt(float life, float start, float turn){
        float r = 0.08 + 0.84 * pow(1.0 - clamp(life, 0.0, 1.0), 1.4);
        float ang = start + life * turn;
        return vec2(cos(ang), sin(ang)) * r;
      }
      void main(){
        float light = 0.0;
        for (int i = 0; i < ${MOTES}; i++) {
          float fi = float(i);
          // (more motes as the bow is drawn: the next one comes in as the draw passes its share)
          float on = clamp(uDensity * ${MOTES.toFixed(1)} - fi, 0.0, 1.0);
          if (on <= 0.0) continue;
          float speed = 0.8 + 0.6 * moteHash(fi + 1.0), phase = moteHash(fi + 31.0);
          float start = moteHash(fi + 57.0) * 6.2831853, turn = 1.8 + 1.2 * moteHash(fi + 83.0);
          // the mote and the streak it leaves, brightest at the mote and fading back along its way
          float life = fract(uTime * speed + phase);
          vec2 head = moteAt(life, start, turn), tail = moteAt(life - ${TRAIL.toFixed(2)}, start, turn);
          vec2 along = head - tail;
          float u = clamp(dot(vAt - tail, along) / max(dot(along, along), 1e-6), 0.0, 1.0);
          float d = length(vAt - tail - along * u);
          // (in from nothing at the edge, and gone into the head as it reaches it)
          float fade = smoothstep(0.0, 0.25, life) * (1.0 - smoothstep(0.6, 0.9, life));
          light += exp(-d * d / (vDot * vDot)) * (0.15 + 0.85 * u * u) * fade * on;
        }
        float k = light * ${BRIGHT.toFixed(2)} * uStrength;
        gl_FragColor = vec4(uColor * k, k);
      }`,
  });
}

/** One of each of its materials, for the warm-up (core/shaders.ts). */
export function warmGlintMotes(): THREE.Mesh[] {
  return [new THREE.Mesh(quad, motesMaterial())];
}

/** A hero's motes: shown while asked for each frame, eased out once they aren't. */
class Motes {
  readonly mesh = new THREE.Mesh(quad, motesMaterial());
  strength = 0;
  private density = 0;
  private wanted = false;
  private time = 0;

  constructor() {
    // (by its name a measure finds it, to draw the frame without it: tools/lab `draw`)
    this.mesh.name = 'glintMotes';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }

  /** Shown this frame on `on` (the arrowhead), `density` of the motes (0 to 1). */
  want(on: THREE.Object3D, density: number): void {
    if (this.mesh.parent !== on) on.add(this.mesh);
    this.density = density;
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
    u.uDensity.value = this.density;
    u.uTime.value = this.time;
    this.mesh.visible = this.strength > 0;
    return this.strength > 0 || goal > 0;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.material.dispose();
  }
}

const motes = new WeakMap<Player, Motes>();

/** `player`'s motes shown this frame on its arrowhead, `density` of them (none for a model without one). */
export function glintMotes(player: Player, density: number): void {
  const head = player.model.arrowHead;
  if (!head) return;
  let shown = motes.get(player);
  if (!shown) {
    const made = new Motes();
    motes.set(player, made);
    addEffect({
      update: (dt) => made.step(dt),
      dispose: () => {
        made.dispose();
        if (motes.get(player) === made) motes.delete(player);
      },
    });
    shown = made;
  }
  shown.want(head, density);
}

/** How strongly `player`'s motes show this frame (0 to 1, 0 with none): what a measure reads (tools/lab `draw`). */
export function glintShown(player: Player): number {
  const shown = motes.get(player);
  return shown?.mesh.visible ? shown.strength : 0;
}
