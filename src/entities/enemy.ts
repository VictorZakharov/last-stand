// Enemy entity: movement, status effects, actions, damage, death.
// Decision-making lives in enemyAI; visuals come from models/.
import * as THREE from 'three';
import { gaitRate, legLength, type LegIK } from './models/ik';
import { G } from '../state';
import { ENEMIES, HERO, SCALING, type EnemyId } from '../data/enemies';
import { buildModel } from './models/index';
import { reachOf, type Reach } from './models/hulls';
import { groundHeight } from '../world/arena';
import { resolveWorld } from '../world/collision';
import { AI, lured } from './enemyAI';
import { lures, type Lure } from '../combat/lures';
import { anchorLabel, removeLabel } from '../ui/floaters';
import { ORDER, type Label } from '../ui/overlay/layer';
import { barArt, barStep, FOE_BAR, FOE_NAME, HERO_FOE_BAR } from '../ui/overlay/bars';
import { DamageMeter } from '../ui/damageMeter';
import { burst, debris, smokePuff, col, particles } from '../fx/particles';
import { flash } from '../fx/lights';
import { dazedStars } from '../fx/dazed';
import { additive } from '../core/materials';
import { sfx } from '../core/audio';
import { emit } from '../events';
import { angleDamp, damp, hitFlash, pick, rand } from '../util';
import { applyShadowDetail, qualityLevel } from '../core/quality';
import { Corpse } from './corpse';
import { flingOf, type Blow, type Fling } from '../combat/fling';
import { QUALITY } from '../data/quality';
import type { DamageType, EnemyDef, Model, XZ } from '../types';
import type { Player } from './player';

const _lookFrom = new THREE.Vector3(), _lookAt = new THREE.Vector3();
// the view's frustum, taken once a frame: an enemy out of it skips the leg IK
const _frustum = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere();
let _frustumAt = -1;
function inView(x: number, y: number, z: number, r: number): boolean {
  if (_frustumAt !== G.time) {
    _frustumAt = G.time;
    _frustum.setFromProjectionMatrix(_pm.multiplyMatrices(G.camera.projectionMatrix, G.camera.matrixWorldInverse));
  }
  return _frustum.intersectsSphere(_sph.set(_sph.center.set(x, y, z), r));
}
import { nearestPlayer } from '../net/role';
import { LookAt } from './models/ik';
import { joinCrowd, leaveCrowd } from './models/crowd';

const auraGeo = new THREE.RingGeometry(0.7, 1, 48).rotateX(-Math.PI / 2);

/** how long a spawned foe takes to rise out of the floor (s), invulnerable and still */
export const RISE_TIME = 0.9;

/** A timed action (attack, slam, ...) with events fired at fractions of its duration. */
export interface EnemyAction {
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
  /** the player whose hit it is (the kill, and the loot, go to them) */
  by?: Player;
  /** how the blow drives what it kills (combat/fling.ts) */
  blow?: Blow;
  /** the throw a kill gives, worked out already (a co-op guest's kill, as its game threw the body) */
  fling?: Fling;
}

/** A co-op guest's copy: where the host's reports have it at the moment shown (net/timeline), the way it goes and faces. */
export interface EnemyNet { x: number; z: number; vx: number; vz: number; f: number }

export interface EnemyOpts {
  wave?: number;
  hero?: boolean;
  pos: THREE.Vector3;
  /** co-op: extra life for a party (host), or the host's own numbers for a guest's copy */
  lifeMult?: number;
  id?: number;
  name?: string;
  maxLife?: number;
}

let nextId = 1;

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
  spawning = RISE_TIME;
  invulnerable = true;
  /** attack cooldown */
  cd = rand(0.3, 1.2);
  action: EnemyAction | null = null;
  frozen = 0;
  frozenAt = 0;
  chill = 0;
  /** seconds left dazed (`daze`): standing, thinking of nothing, stars circling over its head */
  dazed = 0;
  hitT = 0;
  flashAt = -1;
  deadT = -1;
  phase = Math.random() * 10;
  /** scratch space for the AI */
  brain: Record<string, number> = {};
  /** the same enemy in every co-op game */
  readonly id: number;
  /** the player it goes for (the nearest in the fight, kept a while) */
  target: Player | null = null;
  /** the last player to hit it */
  killer: Player | null = null;
  /** drawn off its target by a lure (combat/lures.ts) until the lure's time is up: it goes for that instead */
  lure: Lure | null = null;
  /** the marks on it (a ranger's Quarry Mark): each the extra share of damage it takes from the players' hits, the largest counting */
  readonly marks: number[] = [];
  /** a co-op guest's copy: driven by the host's reports, not by its own AI */
  net: EnemyNet | null = null;
  /** co-op: the extra life a party's foes get (a boss's summons get it too) */
  readonly lifeMult: number;
  /** run when it's dazed (a slam's telegraph going with the slam it drops) */
  readonly onDazed: (() => void)[] = [];
  /** run when it dies (a slam's telegraph going with it) */
  readonly onDeath: (() => void)[] = [];
  /** how its kill threw it, and its body from then (entities/corpse.ts) */
  fling: Fling | null = null;
  corpse: Corpse | null = null;

  readonly model: Model;
  /** the head turning to its target (models/ik.ts) */
  private look: LookAt | null = null;
  readonly height: number;
  /** how far its body reaches, drawn (models/hulls.ts): where the aim looks for it */
  readonly reach: Reach;
  /** how high over its feet what's shown over its head goes (m): over its crown (a boss's stands 1.8 times its
   *  height, and a mark over its height was inside it, hidden by its body) */
  get overHead(): number { return Math.max(this.height, this.reach.crown); }
  readonly obj = new THREE.Group();
  aura: THREE.Mesh | null = null;
  auraMat: THREE.MeshBasicMaterial | null = null;
  auraColor: number | null = null;
  bar: Label | null = null;
  /** the fill the bar was last painted with (`barStep`) */
  private barShown = -1;
  /** training dummies meter damage instead of losing life */
  meter: DamageMeter | null = null;

  constructor(typeId: EnemyId, { wave = 1, hero = false, pos, lifeMult = 1, id, name, maxLife }: EnemyOpts) {
    const def = ENEMIES[typeId];
    this.type = typeId;
    this.def = def;
    this.hero = hero;
    this.boss = !!def.boss;
    this.id = id ?? nextId++;
    this.lifeMult = lifeMult;
    this.name = name ?? (hero ? `${pick(HERO.prefixes)} ${def.name}` : def.name);
    this.maxLife = maxLife ?? def.life * SCALING.life(wave) * (hero ? HERO.lifeMult : 1) * lifeMult;
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
    this.reach = reachOf(this.model.root);
    applyShadowDetail(this.obj);
    joinCrowd(this);
    if (hero || this.boss) {
      const c = this.boss ? def.accent ?? 0x9a40ff : pick(HERO.auraColors);
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
    this.bar = anchorLabel(ORDER.bar, () => (this.alive && !this.spawning && (this.hero || this.life < this.maxLife)
      ? { x: this.pos.x, y: this.obj.position.y + this.height + 0.35, z: this.pos.z } : null));
    this.barShown = -1;
  }

  /** The bar painted again when its fill has moved (a hero foe's gold and wider, with its name over it). */
  private paintBar(): void {
    if (!this.bar) return;
    const look = this.hero ? { ...HERO_FOE_BAR, name: this.name, nameStyle: FOE_NAME } : FOE_BAR, share = this.life / this.maxLife;
    const step = barStep(look, share);
    if (step === this.barShown) return;
    this.barShown = step;
    this.bar.show(barArt(look, share));
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

  /** Dazed for `s` seconds (less for a foe that resists freezing, a boss): it drops what it was doing and stands there,
   *  thinking of nothing, until it comes to. A player's skill dazes through `dazeEnemy` (combat/damage), as it hits. */
  daze(s: number): void {
    if (!this.alive || this.spawning > 0 || this.def.dummy) return;
    this.dazed = Math.max(this.dazed, s * (1 - (this.def.freezeResist || 0)));
    if (!this.net) this.cancelAction();
    for (const drop of this.onDazed.splice(0)) drop();
  }

  tickAction(dt: number): void {
    const a = this.action;
    if (!a) return;
    a.t += dt;
    for (const ev of a.events) if (!ev.done && a.t >= ev.at) { ev.done = true; ev.fn(); if (!this.alive) return; }
    if (this.action === a && a.t >= a.dur) this.action = null;
  }

  // --- helpers used by AI ----------------------------------------------------------
  /** Where the target is, from here (the AI only runs while it has one). */
  toPlayer(): { dx: number; dz: number; dist: number } {
    const p = this.target?.pos ?? this.pos;
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
      const k = 1 - this.spawning / RISE_TIME;
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
    const frozen = this.frozen > 0, dazed = this.dazed > 0;
    if (frozen) this.frozen = Math.max(0, this.frozen - dt);
    if (dazed) this.dazed = Math.max(0, this.dazed - dt);

    this.desired.set(0, 0, 0);
    this.targetFacing = this.facing;
    if (this.net) return this.updateCopy(dt, t, frozen);
    if (this.lure && (this.lure.until <= t || !lures.includes(this.lure))) this.lure = null;
    if (!frozen && !dazed && this.pickTarget()) {
      if (this.lure) lured(this, this.lure);
      else AI[this.def.ai](this, dt);
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
    this.stepPhase(dt);
    // frozen enemies hold their pose: animate with the time they were frozen at
    this.animate(frozen ? 0 : dt, frozen ? this.frozenAt : t, Math.min(1, speedK));
    if (!frozen) this.frozenAt = t;
    return this.updateLooks(dt, t, frozen);
  }

  /** Go for the nearest player in the fight, switching only to one clearly nearer (no dithering between two). */
  private pickTarget(): Player | null {
    const t = this.target, near = nearestPlayer(this.pos.x, this.pos.z);
    const d = (p: Player) => Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    if (!t || !t.active || (near && near !== t && d(near) < d(t) * 0.7)) this.target = near;
    return this.target;
  }

  /**
   * A co-op guest's copy: it is where the host's reports have it at the moment shown (read between
   * them, net/timeline), plays the action the host reports, and never thinks for itself.
   */
  private updateCopy(dt: number, t: number, frozen: boolean): boolean {
    const n = this.net!;
    this.pos.x = n.x;
    this.pos.z = n.z;
    this.vel.set(n.vx, 0, n.vz);
    this.facing = n.f;
    const a = this.action;
    if (a) { a.t += dt; if (a.t >= a.dur) this.action = null; }
    this.stepPhase(dt);
    this.animate(frozen ? 0 : dt, frozen ? this.frozenAt : t, Math.min(1, Math.hypot(this.vel.x, this.vel.z) / this.speed));
    if (!frozen) this.frozenAt = t;
    return this.updateLooks(dt, t, frozen);
  }

  private updateLooks(dt: number, t: number, frozen: boolean): boolean {
    this.model.kit.u.uFrozen.value = damp(this.model.kit.u.uFrozen.value, frozen ? 1 : this.chill > 0 ? 0.35 : 0, 10, dt);
    this.model.kit.u.uHit.value = this.hitT;
    if (this.dazed > 0) dazedStars(this.pos.x, this.obj.position.y + this.overHead + 0.25, this.pos.z, t, this.dazed);
    this.paintBar();
    this.meter?.update();
    if (this.aura && this.auraMat) { this.aura.rotation.y += dt; this.auraMat.opacity = 0.5 + Math.sin(t * 4) * 0.2; }
    return true;
  }

  /** The walk cycle moved on by the frame (setting off from standing, it starts with the first stride: `LegIK.setOff`). */
  private stepPhase(dt: number): void {
    const legs = this.model.joints?.root.userData.legs as LegIK | undefined;
    this.phase = (legs?.setOff(this.phase) ?? this.phase) + dt * this.gait() * (legs?.cadence ?? 1);
  }

  /** how far the walk cycle's phase turns this frame per second: a step per half cycle, its length by the speed and the legs (models/ik.ts), scaled by the enemy's own gait */
  private gait(): number {
    const speed = Math.hypot(this.vel.x, this.vel.z);
    return speed * gaitRate(speed, legLength(this.model)) * (this.def.gait ?? 2.3) / 2.3;
  }

  animate(dt: number, t: number, move: number): void {
    this.obj.position.x = this.pos.x;
    this.obj.position.z = this.pos.z;
    if (!this.spawning) this.obj.position.y = damp(this.obj.position.y, groundHeight(this.pos.x, this.pos.z), 12, G.dt);
    this.model.root.rotation.y = this.facing;
    // the leg IK only where its feet are seen: in view and (on Low) near the player
    const legs = this.model.joints?.root.userData.legs as LegIK | undefined;
    if (legs) {
      const h = this.height, me = G.player, range = QUALITY[qualityLevel()].ikRange;
      legs.active = inView(this.pos.x, this.obj.position.y + h * 0.5, this.pos.z, h)
        && (range === Infinity || !me || (me.pos.x - this.pos.x) ** 2 + (me.pos.z - this.pos.z) ** 2 < range * range);
    }
    this.model.animate({
      t, dt, phase: this.phase, move,
      // (from the data, so a co-op guest's copy has it too)
      action: this.action ? { name: this.action.name, t: Math.min(1, this.action.t / this.action.dur), hit: this.def.windup / Math.max(0.01, this.def.windup + this.def.recover) } : null,
      hit: this.hitT, dead: this.deadT >= 0 ? Math.min(1, this.deadT / 0.8) : -1,
    });
    this.lookAtTarget(dt);
  }

  /** the head follows its target (the players in the fight, for a co-op guest's copy too) */
  private lookAtTarget(dt: number): void {
    const j = this.model.joints;
    if (!j || this.def.dummy) return;
    const look = this.look ??= new LookAt(j);
    const p = this.deadT >= 0 || this.spawning ? null : this.target ?? nearestPlayer(this.pos.x, this.pos.z), l = this.lure;
    _lookFrom.set(this.pos.x, this.obj.position.y, this.pos.z);
    if (l && p) _lookAt.set(l.pos.x, groundHeight(l.pos.x, l.pos.z) + 1.5, l.pos.z);
    else if (p) _lookAt.set(p.pos.x, p.obj.position.y + 1.5, p.pos.z);
    look.update(dt, _lookFrom, this.facing, p ? _lookAt : null);
  }

  takeDamage(amount: number, info: DamageInfo = {}): number {
    if (!this.alive) return 0;
    const before = this.life;
    if (!this.meter) this.life -= amount;
    hitFlash(this, G.time);
    if (info.by) this.killer = info.by;
    if (info.chill) this.chill = Math.max(this.chill, info.chill);
    if (info.freeze) this.frozen = Math.max(this.frozen, info.freeze * (1 - (this.def.freezeResist || 0)));
    // (a killing blow throws the body by its fling alone: its knock on top threw a charge's kills twice as far)
    if (info.knock && info.from && (this.life > 0 || this.meter)) {
      const k = info.knock * (1 - (this.def.knockbackResist || 0));
      const dx = this.pos.x - info.from.x, dz = this.pos.z - info.from.z, d = Math.hypot(dx, dz) || 1;
      this.knock.x += (dx / d) * k; this.knock.z += (dz / d) * k;
    }
    if (this.meter) {
      this.meter.record(amount);
      debris({ x: this.pos.x, y: this.height * 0.6, z: this.pos.z }, { count: 3, color: 0xc9a54e, speed: 3, size: 0.07, life: 0.7 });
    } else if (this.life <= 0) {
      this.die(info.fling ?? flingOf(this, amount - before, info.type ?? 'physical', this.frozen > 0, info.from ?? info.by?.pos, info.blow));
    }
    return amount;
  }

  /** Killed: its body thrown by `fling` (a co-op guest's copy told of a kill elsewhere has none: it drops). */
  die(fling: Fling = flingOf(this, 0, 'physical', this.frozen > 0)): void {
    this.alive = false;
    this.life = 0;
    this.deadT = 0;
    this.cancelAction();
    for (const fn of this.onDeath.splice(0)) fn();

    removeLabel(this.bar);
    this.bar = null;
    const c = this.auraColor ?? 0x7dffd0;
    const center = new THREE.Vector3(this.pos.x, this.height * 0.5, this.pos.z);
    burst(center, { count: this.boss ? 120 : 26, color: c, speed: this.boss ? 9 : 5, up: 3, life: 0.9, size: 0.3 });
    smokePuff(this.pos, { count: this.boss ? 20 : 5, size: this.radius * 1.5, sizeEnd: this.radius * 3 });
    if (this.boss) flash({ color: this.def.accent ?? 0xb070ff, intensity: 80, distance: 20, life: 1.2, pos: center });
    sfx.enemyDie();
    this.fling = fling;
    this.corpse = new Corpse(this, fling);
    emit('enemyKilled', this);
  }

  /** Its body falling, lying and dissolving (entities/corpse.ts); false once it's gone. */
  updateDeath(dt: number): boolean {
    this.deadT += dt;
    return this.corpse!.update(dt);
  }

  /** whether its body casts a shadow (models/crowd.ts): not as it dissolves */
  get castsShadow(): boolean { return !this.corpse?.fading; }

  dispose(): void {
    leaveCrowd(this);
    this.corpse?.dispose();
    removeLabel(this.bar);
    this.bar = null;
    this.meter?.dispose();
    G.scene.remove(this.obj);
    // model geometry is built per enemy; free it (the aura ring is shared)
    // shared geometry (models/shapes.ts Sculpt) belongs to every enemy of the kind
    this.obj.traverse((o) => { const g = (o as THREE.Mesh).geometry; if (g && g !== auraGeo && !g.userData.shared) g.dispose(); });
    this.obj.traverse((o) => { const m = o as THREE.SkinnedMesh; if (m.isSkinnedMesh) { m.skeleton.dispose(); (m.material as THREE.Material).dispose(); } });   // (skinned meshes own a copy of their material)
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
