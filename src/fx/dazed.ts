// A dazed foe's stars: four small lights circling over its head, each leaving a short trail, fading as it comes to.
import { particles, col } from './particles';

/** how fast they go round (rad/s), how far out from the head's middle (m), the last seconds they fade over, and how many
 *  (each 22 cm across at first: at 13 cm they were dots from the top-down camera) */
const SPIN = 5.5, ORBIT = 0.42, FADE = 0.25, STARS = 4;

/** The stars over a head at `x`, `y`, `z` at time `t`, with `left` seconds of the daze to go. */
export function dazedStars(x: number, y: number, z: number, t: number, left: number): void {
  const k = Math.min(1, left / FADE);
  for (let i = 0; i < STARS; i++) {
    const a = t * SPIN + i * Math.PI * 2 / STARS;
    particles.glow.spawn({
      x: x + Math.cos(a) * ORBIT, y: y + Math.sin(a * 2) * 0.05, z: z + Math.sin(a) * ORBIT,
      life: 0.22, size: 0.22 * k, sizeEnd: 0, color: col(0xfff0a0, 2.4), colorEnd: col(0xff9a30, 0.3),
    });
  }
}
