// Generic projectile system used by player skills and enemies.
import * as THREE from 'three';
import { G } from '../state';
import { particles, col, burst } from '../fx/particles';
import { flash, flashFree, release, type LightSlot } from '../fx/lights';
import type { Enemy } from '../entities/enemy';
import type { Player } from '../entities/player';
import { nearGlow } from '../core/materials';

const coreGeo = new THREE.SphereGeometry(1, 12, 8);
const matCache = new Map<string, THREE.Material>();
/** A hostile bolt's core is an orb: hot in the middle, fading to its rim, so up close it reads as glowing, not a flat disc. */
const orbShader = {
  vertexShader: /* glsl */`varying vec3 vN; varying vec3 vV;
    void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: /* glsl */`uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
    void main(){ float f = max(dot(normalize(vN), normalize(vV)), 0.0); gl_FragColor = vec4(uColor * (0.3 + 1.3 * f * f), 1.0); }`,
};
function coreMat(color: THREE.ColorRepresentation, intensity: number, orb: boolean): THREE.Material {
  const key = `${color}:${intensity}:${orb}`;
  let m = matCache.get(key);
  if (!m) {
    const c = new THREE.Color(color).multiplyScalar(intensity);
    m = orb ? nearGlow(new THREE.ShaderMaterial({ ...orbShader, uniforms: { uColor: { value: c } } })) : nearGlow(new THREE.MeshBasicMaterial({ color: c }));
    matCache.set(key, m);
  }
  return m;
}

/** Cores for the load-time warm-up: each kind shares its program (the colour is a uniform). */
export const coreSamples = (): THREE.Mesh[] => [false, true].map((orb) => new THREE.Mesh(coreGeo, coreMat(0xffffff, 4, orb)));

export interface TrailOpts { color: THREE.ColorRepresentation; colorEnd?: THREE.ColorRepresentation; intensity?: number; size?: number; rate?: number; life?: number }

export interface ProjectileOpts {
  pos: THREE.Vector3;
  /** normalized direction */
  dir: THREE.Vector3;
  speed: number;
  radius?: number;
  life?: number;
  /** hostile projectiles hit the players, friendly ones hit enemies */

  hostile?: boolean;
  color?: THREE.ColorRepresentation;
  size?: number;
  intensity?: number;
  /** attach a dynamic light of this intensity (0 = none); a hostile bolt's only takes a free light */
  glow?: number;
  trail?: TrailOpts;
  /** steering rate towards the nearest enemy in front (rad/s-ish) */
  homing?: number;
  ignore?: Set<Enemy>;
  onHit?(target: Enemy | Player, proj: Projectile): void;
  onExpire?(proj: Projectile): void;
}

const _to = new THREE.Vector3();

export class Projectile {
  readonly pos: THREE.Vector3;
  readonly vel: THREE.Vector3;
  readonly speed: number;
  readonly radius: number;
  life: number;
  readonly hostile: boolean;
  readonly homing: number;
  readonly ignore: Set<Enemy>;
  readonly onHit?: ProjectileOpts['onHit'];
  readonly onExpire?: ProjectileOpts['onExpire'];
  readonly trail?: TrailOpts;
  readonly color: THREE.ColorRepresentation;
  alive = true;
  trailAcc = 0;
  readonly mesh: THREE.Mesh;
  readonly light: LightSlot | null;

  constructor(o: ProjectileOpts) {
    this.pos = o.pos.clone();
    this.vel = o.dir.clone().multiplyScalar(o.speed);
    this.speed = o.speed;
    this.radius = o.radius ?? 0.3;
    this.life = o.life ?? 2;
    this.hostile = !!o.hostile;
    this.homing = o.homing ?? 0;
    this.ignore = o.ignore ?? new Set();
    this.onHit = o.onHit;
    this.onExpire = o.onExpire;
    this.trail = o.trail;
    this.color = o.color ?? 0xffffff;
    this.mesh = new THREE.Mesh(coreGeo, coreMat(this.color, o.intensity ?? 4, this.hostile));
    this.mesh.name = 'projectile';
    this.mesh.scale.setScalar(o.size ?? 0.12);
    this.mesh.position.copy(this.pos);
    G.scene.add(this.mesh);
    const lo = { color: this.color, intensity: o.glow, distance: 6, life: 1, hold: 99, follow: this.mesh };
    this.light = !o.glow ? null : this.hostile ? flashFree(lo) : flash(lo);
  }

  /** Advance; returns false once the projectile is gone. */
  update(dt: number): boolean {
    this.life -= dt;
    if (this.life <= 0) return this.expire();

    if (this.homing && !this.hostile) {
      const t = this.findTarget();
      if (t) {
        _to.set(t.pos.x - this.pos.x, 0, t.pos.z - this.pos.z).normalize().multiplyScalar(this.speed);
        this.vel.lerp(_to, Math.min(1, this.homing * dt));
        this.vel.setLength(this.speed);
      }
    }
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    // in first person a bolt aimed at the player flies at the lens: its glowing core would fill the view
    // for its last few frames
    this.mesh.visible = this.pos.distanceToSquared(G.camera.position) > 2.5 * 2.5;

    if (this.trail) {
      const tr = this.trail;
      this.trailAcc += dt * (tr.rate ?? 90);
      const c = col(tr.color, tr.intensity ?? 2.5), ce = col(tr.colorEnd ?? tr.color, 0.4);
      while (this.trailAcc >= 1) {
        this.trailAcc -= 1;
        const f = Math.random();
        particles.glow.spawn({
          x: this.pos.x - this.vel.x * dt * f, y: this.pos.y - this.vel.y * dt * f, z: this.pos.z - this.vel.z * dt * f,
          vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6, vz: (Math.random() - 0.5) * 0.6,
          life: tr.life ?? 0.35, size: tr.size ?? 0.3, sizeEnd: 0.02, color: c, colorEnd: ce, drag: 3,
        });
      }
    }

    // world collision
    if (Math.hypot(this.pos.x, this.pos.z) > 28) return this.expire();
    for (const o of G.arena.obstacles) {
      if ((this.pos.x - o.x) ** 2 + (this.pos.z - o.z) ** 2 < (o.r + this.radius * 0.5) ** 2) return this.expire();
    }

    // target collision
    if (this.hostile) {
      for (const p of G.players) {
        if (p.active && (p.pos.x - this.pos.x) ** 2 + (p.pos.z - this.pos.z) ** 2 < (p.radius + this.radius) ** 2) {
          this.onHit?.(p, this);
          return this.kill();
        }
      }
    } else {
      for (const e of G.enemies) {
        if (!e.alive || e.invulnerable || this.ignore.has(e)) continue;
        if ((e.pos.x - this.pos.x) ** 2 + (e.pos.z - this.pos.z) ** 2 < (e.radius + this.radius) ** 2) {
          this.onHit?.(e, this);
          return this.kill();
        }
      }
    }
    return true;
  }

  findTarget(): Enemy | null {
    let best: Enemy | null = null, bd = 49;
    const fwd = this.vel;
    for (const e of G.enemies) {
      if (!e.alive || this.ignore.has(e)) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
      const d = dx * dx + dz * dz;
      if (d < bd && dx * fwd.x + dz * fwd.z > 0) { bd = d; best = e; }
    }
    return best;
  }

  expire(): false {
    this.onExpire?.(this);
    burst(this.pos, { count: 6, color: this.color, speed: 2, life: 0.3, size: 0.2 });
    return this.kill();
  }

  kill(): false {
    this.alive = false;
    G.scene.remove(this.mesh);
    release(this.light);
    return false;
  }
}

export function spawnProjectile(opts: ProjectileOpts): Projectile {
  const p = new Projectile(opts);
  G.projectiles.push(p);
  return p;
}

export function updateProjectiles(dt: number): void {
  const list = G.projectiles;
  for (let i = list.length - 1; i >= 0; i--) {
    if (!list[i].update(dt)) list.splice(i, 1);
  }
}

export function clearProjectiles(): void {
  for (const p of G.projectiles) if (p.alive) p.kill();
  G.projectiles.length = 0;
}
