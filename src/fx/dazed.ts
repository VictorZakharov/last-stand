// A dazed foe's stars: three small stars floating round over its head, fading as it comes to. Plain stars, drawn as
// they are and not as lights: four glows each leaving a trail made a bright ring over every dazed foe (a crowd dazed
// at once was a field of them). Drawn each frame from where they are then, one draw for every dazed foe.
import {
  Color, DynamicDrawUsage, Geometry, InstancedAttribute, LookMaterial, Sphere, Vec3, World,
} from '../engine/api/index.ts';
import { G } from '../state';
import { pointScale } from '../core/renderer';
import { particleQuads } from './particleNodes';

/** how fast they go round (rad/s), how far out from the head's middle (m), how far they rise and fall (m), the last
 *  seconds they fade over, how many, and how big each is (m: smaller, they were dots from the top-down camera) */
const SPIN = 1.8, ORBIT = 0.42, BOB = 0.06, FADE = 0.25, STARS = 3, SIZE = 0.26;
/** the most stars drawn in a frame: a crowd of dazed foes */
const MOST = STARS * 160;

const pos = new Float32Array(MOST * 3), size = new Float32Array(MOST), alpha = new Float32Array(MOST);
// (an instance's, a quad each)
const attrs = [
  new InstancedAttribute(pos, 3).setUsage(DynamicDrawUsage),
  new InstancedAttribute(size, 1).setUsage(DynamicDrawUsage),
  new InstancedAttribute(alpha, 1).setUsage(DynamicDrawUsage),
];
const geo = new Geometry();
geo.setAttribute('position', attrs[0]);
geo.setAttribute('aSize', attrs[1]);
geo.setAttribute('aAlpha', attrs[2]);
geo.boundingSphere = new Sphere(new Vec3(), 1e4);
// (a five-pointed star, a darker rim so it reads on a pale floor too: the engine's sprites draw it, engine/sprites.ts)
const mat = new LookMaterial({
  uniforms: { uScale: { value: 400 }, uFill: { value: new Color(0xffe27a) }, uRim: { value: new Color(0xc07818) } },
  transparent: true, depthWrite: false,
});
/** the stars as instanced quads (an instance a star), which the engine leaves to its sprites by their name */
const points = particleQuads({ aCenter: attrs[0], aSize: attrs[1], aAlpha: attrs[2] }, mat);
points.name = 'dazed stars';
points.frustumCulled = false;
points.renderOrder = 10;
/** the stars set this frame */
let count = 0;

/** The stars over a head at `x`, `y`, `z` at time `t`, with `left` seconds of the daze to go. */
export function dazedStars(x: number, y: number, z: number, t: number, left: number): void {
  const k = Math.min(1, left / FADE);
  for (let i = 0; i < STARS && count < MOST; i++, count++) {
    const a = t * SPIN + i * Math.PI * 2 / STARS;
    pos[count * 3] = x + Math.cos(a) * ORBIT;
    pos[count * 3 + 1] = y + Math.sin(t * 2.2 + i * 2.1) * BOB;
    pos[count * 3 + 2] = z + Math.sin(a) * ORBIT;
    size[count] = SIZE * (0.6 + 0.4 * k);
    alpha[count] = k;
  }
}

/** The stars as this frame draws them (each its place, size and how much of it is seen) and their colour: for a
 *  renderer that draws them itself (the Rust engine's sprites, `engine/bridge.ts`). */
export function dazedDrawn(): { pos: Float32Array; size: Float32Array; alpha: Float32Array; count: number; fill: Color } {
  const drawn = geo.drawRange.count;
  return { pos, size, alpha, count: Number.isFinite(drawn) ? drawn : 0, fill: mat.uniforms.uFill.value };
}

/** The dazed foes' stars, drawn among the particles (`fx/particles.ts`): put in the scene, drawn as each frame set
 *  them, and none. */
export const dazedField = {
  init(scene: World): void {
    scene.add(points);
  },
  /** this frame's stars drawn, the next frame's set afresh */
  update(): void {
    geo.setDrawRange(0, count);
    points.geometry.instanceCount = count;
    // (not drawn while there are none, a draw call of nothing; shown through the boot's warm-up, which runs no update)
    points.visible = count > 0;
    if (count) for (const a of attrs) { a.clearUpdateRanges(); a.addUpdateRange(0, count * a.itemSize); a.needsUpdate = true; }
    mat.uniforms.uScale.value = pointScale();
    count = 0;
  },
  clear(): void {
    count = 0;
    geo.setDrawRange(0, 0);
    points.geometry.instanceCount = 0;
  },
};
