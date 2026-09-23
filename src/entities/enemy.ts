// Enemy entity: movement, status effects, actions, damage, death.
// Decision-making lives in enemyAI; visuals come from models/.
import * as THREE from 'three';
import { G } from '../state';
import { ENEMIES, HERO, SCALING, type EnemyId } from '../data/enemies';
import { buildModel } from './models/index';
import { groundHeight } from '../world/arena';
import { resolveWorld } from '../world/collision';
import { AI } from './enemyAI';
import { addAnchored, removeAnchored } from '../ui/floaters';
import { DamageMeter } from '../ui/damageMeter';
import { burst, debris, smokePuff, col, particles } from '../fx/particles';
import { flash } from '../fx/lights';
import { additive } from '../core/materials';
import { sfx } from '../core/audio';
import { emit } from '../events';
import { angleDamp, damp, pick, rand } from '../util';
import { applyShadowDetail } from '../core/quality';
import type { DamageType, EnemyDef, Model, XZ } from '../types';

const auraGeo = new THREE.RingGeometry(0.7, 1, 48).rotateX(-Math.PI / 2);

/** A timed action (attack, slam, ...) with events fired at fractions of its duration. */
interface EnemyAction {
  name: string;
  dur: number;
  t: number;
  events: { at: number; fn: () => void; done: boolean }[];
  cleanup: (() => void) | null;
}

export interface DamageInfo {
  type?: DamageType;
  crit?: boolean;
  knock?: number;
  from?: XZ;
  chill?: number;
  freeze?: number;
}

export class Enemy {
  readonly type: EnemyId;
  readonly def: EnemyDef;
  readonly hero: boolean;
  readonly boss: boolean;
  readonly name: string;
  readonly maxLife: number;
  life: number;
  readonly damage: number;
  readonly speed: number;
  readonly radius: number;
  readonly mass: number;
  readonly score: number;

  readonly pos: THREE.Vector3;
  readonly vel = new THREE.Vector3();
  readonly knock = new THREE.Vector3();
  /** desired velocity, set by the AI each frame */
  readonly desired = new THREE.Vector3();
  facing: number;
  targetFacing: number;
  alive = true;
  spawning = 0.9;
  invulnerable = true;
  /** attack cooldown */
  cd = rand(0.3, 1.2);
  action: EnemyAction | null = null;
  frozen = 0;
  frozenAt = 0;
  chill = 0;
  hitT = 0;
  deadT = -1;
  phase = Math.random() * 10;
  /** scratch space for the AI */
  brain: Record<string, number> = {};

  readonly model: Model;
  readonly height: number;
  readonly obj = new THREE.Group();
  aura: THREE.Mesh | null = null;
  auraMat: THREE.MeshBasicMaterial | null = null;
  auraColor: number | null = null;
  bar: HTMLElement | null = null;
  barFill: HTMLElement | null = null;
  /** training dummies meter damage instead of losing life */
  meter: DamageMeter | null = null;

  constructor(typeId: EnemyId, { wave = 1, hero = false, pos }: { wave?: number; hero?: boolean; pos: THREE.Vector3 }) {
    const def = ENEMIES[typeId];
    this.type = typeId;
    this.def = def;
    this.hero = hero;
    this.boss = !!def.boss;
    this.name = hero ? `${pick(HERO.prefixes)} ${def.name}` : def.name;
    this.maxLife = def.life * SCALING.life(wave) * (hero ? HERO.lifeMult : 1);
    this.life = this.maxLife;
    this.damage = def.damage * SCALING.damage(wave) * (hero ? HERO.damageMult : 1);
    this.speed = def.speed * SCALING.speed(wave) * rand(0.92, 1.08);
    this.radius = def.radius * (hero ? HERO.scale : 1);
    this.mass = this.radius * this.radius * (this.boss ? 10 : 1);
    this.score = def.score + (hero ? HERO.score : 0);

    this.pos = pos.clone();
    this.facing = this.targetFacing = Math.atan2(-pos.x, -pos.z);

    this.model = buildModel(def.model);
    this.height = this.model.height * (hero ? HERO.scale : 1);
    this.obj.name = typeId;   // names show up in the perf report
    this.obj.add(this.model.root);
    if (hero) this.model.root.scale.multiplyScalar(HERO.scale);
    applyShadowDetail(this.obj);
    if (hero || this.boss) {
      const c = this.boss ? 0x9a40ff : pick(HERO.auraColors);
      this.auraMat = additive(c, 1.6, 0.8);
      this.aura = new THREE.Mesh(auraGeo, this.auraMat);
      this.aura.scale.setScalar(this.radius * 1.6);
      this.aura.position.y = 0.05;
      this.obj.add(this.aura);
      this.auraColor = c;
    }
    this.obj.position.copy(this.pos);
    this.obj.position.y = -this.height;
    this.model.root.rotation.y = this.facing;
    G.scene.add(this.obj);

    if (def.dummy) this.meter = new DamageMeter(def.name, () => ({ x: this.pos.x, y: this.obj.position.y + this.height + 0.3, z: this.pos.z }));
    else if (!this.boss) this.createBar();
  }

  createBar(): void {
    const el = document.createElement('div');
    el.className = 'ebar' + (this.hero ? ' hero' : '');
    el.innerHTML = (this.hero ? `<div class="ename">${this.name}</div>` : '') + '<div class="etrack"><div class="efill"></div></div>';
    this.barFill = el.querySelector<HTMLElement>('.efill');
    this.bar = addAnchored(el, () => (this.alive && !this.spawning && (this.hero || this.life < this.maxLife)
      ? { x: this.pos.x, y: this.obj.position.y + this.height + 0.35, z: this.pos.z } : null));
  }

  // --- actions ---------------------------------------------------------------
  /** Start a timed action; `events` are [fraction of duration, callback]. */
  startAction(name: string, dur: number, events: [number, () => void][] = [], cleanup: (() => void) | null = null): void {
    this.action = { name, dur, t: 0, events: events.map(([at, fn]) => ({ at: at * dur, fn, done: false })), cleanup };
  }

  cancelAction(): void {
    this.action?.cleanup?.();
    this.action = null;
  }

  tickAction(dt: number): void {
    const a = this.action;
    if (!a) return;
    a.t += dt;
    for (const ev of a.events) if (!ev.done && a.t >= ev.at) { ev.done = true; ev.fn(); if (!this.alive) return; }
    if (this.action === a && a.t >= a.dur) this.action = null;
  }

  // --- helpers used by AI ----------------------------------------------------------
  toPlayer(): { dx: number; dz: number; dist: number } {
    const p = G.player.pos;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    return { dx, dz, dist: Math.hypot(dx, dz) };
  }

  faceTo(x: number, z: number): void { this.targetFacing = Math.atan2(x - this.pos.x, z - this.pos.z); }

  inFront(x: number, z: number, arc = 1.2): boolean {
    const a = Math.atan2(x - this.pos.x, z - this.pos.z);
    const d = Math.abs(((a - this.facing + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI);
    return d < arc;
  }

  // --- update ------------------------------------------------------------------
  /** Returns false when the enemy has finished dying and can be removed. */
  update(dt: number): boolean {
    const t = G.time;
    if (this.deadT >= 0) return this.updateDeath(dt);

    if (this.spawning > 0) {
      this.spawning = Math.max(0, this.spawning - dt);
      const k = 1 - this.spawning / 0.9;
      this.obj.position.y = -this.height * (1 - k) ** 2;
      if (Math.random() < 0.6) particles.glow.spawn({
        x: this.pos.x + rand(-0.6, 0.6), y: 0.1, z: this.pos.z + rand(-0.6, 0.6), vy: rand(1, 3),
        life: 0.6, size: 0.4, sizeEnd: 0.05, color: col(0xb050ff, 2.5), colorEnd: col(0x400080, 0.5),
      });
      if (this.spawning === 0) this.invulnerable = false;
      this.animate(dt, t, 0);
      return true;
    }

    this.hitT = Math.max(0, this.hitT - dt * 4);
    this.chill = Math.max(0, this.chill - dt);
    const frozen = this.frozen > 0;
    if (frozen) this.frozen = Math.max(0, this.frozen - dt);

    this.desired.set(0, 0, 0);
    this.targetFacing = this.facing;
    if (!frozen && G.player.alive) {
      AI[this.def.ai](this, dt);
      this.tickAction(dt);
      this.cd -= dt;
    }

    const slow = this.chill > 0 ? 0.6 : 1;
    const accel = frozen ? 0 : 10;
    this.vel.x = damp(this.vel.x, this.desired.x * slow, accel, dt);
    this.vel.z = damp(this.vel.z, this.desired.z * slow, accel, dt);
    if (frozen) this.vel.set(0, 0, 0);
    this.pos.x += (this.vel.x + this.knock.x) * dt;
    this.pos.z += (this.vel.z + this.knock.z) * dt;
    this.knock.multiplyScalar(Math.exp(-dt * 6));
    resolveWorld(this.pos, this.radius);

    if (!frozen) this.facing = angleDamp(this.facing, this.targetFacing, this.action ? 6 : 9, dt);
    const speedK = Math.hypot(this.vel.x, this.vel.z) / this.speed;
    this.phase += dt * Math.hypot(this.vel.x, this.vel.z) * (this.def.model === 'imp' ? 3.2 : 2.3) / Math.max(0.6, this.height * 0.5);
    // frozen enemies hold their pose: animate with the time they were frozen at
    this.animate(frozen ? 0 : dt, frozen ? this.frozenAt : t, Math.min(1, speedK));
    if (!frozen) this.frozenAt = t;

    this.model.kit.u.uFrozen.value = damp(this.model.kit.u.uFrozen.value, frozen ? 1 : this.chill > 0 ? 0.35 : 0, 10, dt);
    this.model.kit.u.uHit.value = this.hitT;
    if (this.barFill) this.barFill.style.width = `${(this.life / this.maxLife) * 100}%`;
    this.meter?.update();
    if (this.aura && this.auraMat) { this.aura.rotation.y += dt; this.auraMat.opacity = 0.5 + Math.sin(t * 4) * 0.2; }
    return true;
  }

  animate(dt: number, t: number, move: number): void {
    this.obj.position.x = this.pos.x;
    this.obj.position.z = this.pos.z;
    if (!this.spawning) this.obj.position.y = damp(this.obj.position.y, groundHeight(this.pos.x, this.pos.z), 12, G.dt);
    this.model.root.rotation.y = this.facing;
    this.model.animate({
      t, dt, phase: this.phase, move,
      action: this.action ? { name: this.action.name, t: Math.min(1, this.action.t / this.action.dur) } : null,
      hit: this.hitT, dead: this.deadT >= 0 ? Math.min(1, this.deadT / 0.8) : -1,
    });
  }

  takeDamage(amount: number, info: DamageInfo = {}): number {
    if (!this.alive) return 0;
    if (!this.meter) this.life -= amount;
    this.hitT = 1;
    if (info.chill) this.chill = Math.max(this.chill, info.chill);
    if (info.freeze) this.frozen = Math.max(this.frozen, info.freeze * (1 - (this.def.freezeResist || 0)));
    if (info.knock && info.from) {
      const k = info.knock * (1 - (this.def.knockbackResist || 0));
      const dx = this.pos.x - info.from.x, dz = this.pos.z - info.from.z, d = Math.hypot(dx, dz) || 1;
      this.knock.x += (dx / d) * k; this.knock.z += (dz / d) * k;
    }
    if (this.meter) {
      this.meter.record(amount);
      debris({ x: this.pos.x, y: this.height * 0.6, z: this.pos.z }, { count: 3, color: 0xc9a54e, speed: 3, size: 0.07, life: 0.7 });
    } else if (this.life <= 0) this.die();
    return amount;
  }

  die(): void {
    this.alive = false;
    this.life = 0;
    this.deadT = 0;
    this.cancelAction();
    removeAnchored(this.bar);
    const c = this.auraColor ?? 0x7dffd0;
    const center = new THREE.Vector3(this.pos.x, this.height * 0.5, this.pos.z);
    burst(center, { count: this.boss ? 120 : 26, color: c, speed: this.boss ? 9 : 5, up: 3, life: 0.9, size: 0.3 });
    smokePuff(this.pos, { count: this.boss ? 20 : 5, size: this.radius * 1.5, sizeEnd: this.radius * 3 });
    if (this.boss) flash({ color: 0xb070ff, intensity: 80, distance: 20, life: 1.2, pos: center });
    sfx.enemyDie();
    this.model.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = false; });
    emit('enemyKilled', this);
  }

  updateDeath(dt: number): boolean {
    this.deadT += dt;
    this.animate(dt, G.time, 0);
    const k = Math.max(0, (this.deadT - 0.5) / 1.1);
    this.model.kit.u.uDissolve.value = Math.min(1, k);
    this.model.kit.u.uHit.value = 0;
    if (this.auraMat) this.auraMat.opacity = Math.max(0, 0.6 - this.deadT);
    if (k > 0 && k < 1 && Math.random() < 0.5) {
      particles.glow.spawn({
        x: this.pos.x + rand(-0.4, 0.4) * this.radius * 2, y: rand(0.1, this.height * 0.4), z: this.pos.z + rand(-0.4, 0.4) * this.radius * 2,
        vy: rand(0.5, 1.5), life: 0.8, size: 0.15, sizeEnd: 0, color: col(this.model.kit.u.uEdge.value.getHex(), 1.2),
      });
    }
    return k < 1;
  }

  dispose(): void {
    removeAnchored(this.bar);
    this.meter?.dispose();
    G.scene.remove(this.obj);
    // model geometry is built per enemy; free it (the aura ring is shared)
    this.obj.traverse((o) => { const g = (o as THREE.Mesh).geometry; if (g && g !== auraGeo) g.dispose(); });
    this.model.dispose();
    this.auraMat?.dispose();
  }
}

export function updateEnemies(dt: number): void {
  const list = G.enemies;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (!e.update(dt)) { e.dispose(); list.splice(i, 1); }
  }
}

export function clearEnemies(): void {
  for (const e of G.enemies) e.dispose();
  G.enemies.length = 0;
}
