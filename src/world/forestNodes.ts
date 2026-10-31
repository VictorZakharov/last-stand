// The forest's floor and grass on WebGPU (core/webgpu.ts): forest.ts's GLSL hooks as TSL nodes, set on its plain
// materials (three copies them onto the node material it makes of each). The moss tinted over the floor in world
// space, and the grass's tufts swaying in the wind. Not yet ported: the floor's relief (core/parallax.ts).
import { tsl } from '../core/webgpu';

// (untyped: TSL's types don't follow its conversions across these calls yet)
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

/** forest.ts's `mossH`: a hash of a point on the floor, 0 to 1 */
function mossHash(p: N): N {
  const { dot, fract, sin, vec2 } = tsl as any;
  return fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
}

/** forest.ts's `mossN`: value noise over the floor */
function mossNoise(p: N): N {
  const { floor, fract, mix, vec2 } = tsl as any;
  const i = floor(p);
  const f0 = fract(p);
  const f = f0.mul(f0).mul(f0.mul(-2).add(3));
  const at = (x: number, y: number): N => mossHash(i.add(vec2(x, y)));
  return mix(mix(at(0, 0), at(1, 0), f.x), mix(at(0, 1), at(1, 1), f.x), f.y);
}

/** The floor's colour with large moss patches over it, as `mossyGround` tints it. */
export function mossColorNode(): N {
  const { Fn, materialColor, mix, positionWorld, smoothstep, vec3 } = tsl as any;
  return Fn(() => {
    const xz = positionWorld.xz;
    const patches = mossNoise(xz.mul(0.11)).mul(0.6)
      .add(mossNoise(xz.mul(0.37).add(7)).mul(0.3))
      .add(mossNoise(xz.mul(1.3)).mul(0.1));
    const moss = smoothstep(0.4, 0.7, patches);
    const tint = vec3(0.045, 0.09, 0.025).mul(mossNoise(xz.mul(3.1)).mul(0.6).add(0.7));
    return mix(materialColor, tint, moss.mul(0.75));
  })();
}

/** How the grass sways (`windInGrass`'s numbers): its rate, and how far a tuft's top moves. */
export interface Sway { rate: number; reach: number }

/** A tuft's points swayed by the wind at `time` (a uniform node), more the higher up the tuft, each tuft out of
 *  step with its neighbours by where it stands. Three places an instance before this node, so where it stands is
 *  read as the point's offset from the tuft's own (close enough for a phase). */
export function grassWindNode(time: N, { rate, reach }: Sway): N {
  const { Fn, positionGeometry, positionLocal, sin, vec2, vec3 } = tsl as any;
  return Fn(() => {
    const tuftAt = positionLocal.xz.sub(positionGeometry.xz);
    const height = positionGeometry.y;
    const bend = height.mul(height).mul(4);
    const gust = sin(time.mul(rate).add(tuftAt.x.mul(0.35)).add(tuftAt.y.mul(0.22))).mul(0.75)
      .add(sin(time.mul(rate * 2.3).add(tuftAt.x.mul(0.9)).sub(tuftAt.y.mul(0.6))).mul(0.25));
    const push = vec2(0.8, 0.6).mul(gust.mul(reach).mul(bend));
    return positionLocal.add(vec3(push.x, 0, push.y));
  })();
}
