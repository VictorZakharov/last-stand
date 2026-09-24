// Circle-vs-world collision: static obstacles and the arena boundary.
import { G } from '../state';

export function resolveWorld(pos: { x: number; z: number }, radius: number): void {
  for (const o of G.arena.obstacles) {
    const dx = pos.x - o.x, dz = pos.z - o.z;
    const min = o.r + radius;
    const d2 = dx * dx + dz * dz;
    if (d2 < min * min && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      pos.x = o.x + (dx / d) * min;
      pos.z = o.z + (dz / d) * min;
    }
  }
  const R = G.arena.radius - radius;
  const r = Math.hypot(pos.x, pos.z);
  if (r > R) { pos.x *= R / r; pos.z *= R / r; }
}

/** Push overlapping enemies apart (and away from the players). */
export function separateEnemies(): void {
  const list = G.enemies;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a.alive || a.spawning) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (!b.alive || b.spawning) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const min = a.radius + b.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (min - d) * 0.5;
        const wa = b.mass / (a.mass + b.mass), wb = 1 - wa;
        a.pos.x -= (dx / d) * push * wa * 2; a.pos.z -= (dz / d) * push * wa * 2;
        b.pos.x += (dx / d) * push * wb * 2; b.pos.z += (dz / d) * push * wb * 2;
      }
    }
    for (const p of G.players) {
      if (!p.active) continue;
      const dx = a.pos.x - p.pos.x, dz = a.pos.z - p.pos.z;
      const min = a.radius + p.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        if (a.def.dummy) {
          // training dummies are planted: the player slides around them (a partner is moved by its own game)
          if (!p.local) continue;
          p.pos.x = a.pos.x - (dx / d) * min;
          p.pos.z = a.pos.z - (dz / d) * min;

        } else {
          // enemies yield the overlap so the player isn't shoved around
          a.pos.x = p.pos.x + (dx / d) * min;
          a.pos.z = p.pos.z + (dz / d) * min;
        }
      }
    }
  }
}
