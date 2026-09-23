// The player character: input -> movement/skills, resources, damage, animation.
import * as THREE from 'three';
import { G } from '../state';
import { CLASSES } from '../data/classes/index';
import { buildModel } from './models/index';
import { SKILL_IMPLS } from '../combat/skills/index';
import type { ChannelSkill, SkillImpl } from '../combat/skills/types';
import { computeStats } from '../loot/items';
import { SKILL_KEYS, loadLoadout, saveLoadout, type Loadout } from '../loot/loadout';
import { groundHeight } from '../world/arena';
import { resolveWorld } from '../world/collision';
import { input, isDown } from '../core/input';
import { flashHurt, addShake } from '../core/renderer';
import { floatText } from '../ui/floaters';
import { particles, col } from '../fx/particles';
import { sfx } from '../core/audio';
import { emit } from '../events';
import { angleDamp, damp, rand } from '../util';
import { applyShadowDetail } from '../core/quality';
import type { ActionState, ClassDef, DamageType, DerivedStats, Model, Profile, SkillDef, SkillKey } from '../types';

/** A skill the class knows: its tuning data + behavior. Keyed by `def.impl`. */
export interface KnownSkill { def: SkillDef; impl: SkillImpl }

/** Damage absorption shield (see the Arcane Aegis skill). */
export interface Ward { amount: number; t: number; onHit?(absorbed: number): void; onEnd?(): void }

interface CastState { skill: KnownSkill; t: number; dur: number; fireAt: number; fired: boolean; target: THREE.Vector3 }
interface ChannelState { skill: KnownSkill; key: SkillKey; state: unknown }

export class Player {
  readonly cls: ClassDef;
  readonly model: Model;
  readonly obj = new THREE.Group();
  readonly staffLight = new THREE.PointLight(0x5dffa8, 3, 6, 2);

  readonly pos = new THREE.Vector3(0, 0, 3);
  readonly vel = new THREE.Vector3();
  readonly aim = new THREE.Vector3();
  readonly radius = 0.45;
  facing = Math.PI;
  phase = 0;
  /** true in the lobby: free casting, no costs, no cooldowns */
  sandbox = false;

  /** all skills of the class, by id */
  readonly known = new Map<string, KnownSkill>();
  /** key -> skill id; any skill may be bound to any (or several) keys */
  loadout: Loadout;
  /** remaining cooldown per skill id (shared by every key bound to it) */
  readonly cooldowns = new Map<string, number>();

  stats!: DerivedStats;
  life = 0;
  energy = 0;
  alive = true;
  deadT = -1;
  casting: CastState | null = null;
  channel: ChannelState | null = null;
  ward: Ward | null = null;
  hitT = 0;
  lastLowEnergy = 0;

  constructor(classId: string, equipped: Profile['equipped']) {
    this.cls = CLASSES[classId];
    this.model = buildModel(this.cls.model);
    this.obj.add(this.model.root);
    applyShadowDetail(this.obj);
    G.scene.add(this.obj, this.staffLight, ...(this.model.worldObjects ?? []));

    for (const def of this.cls.skills) {
      const impl = SKILL_IMPLS[def.impl];
      if (!impl) throw new Error(`Missing skill impl "${def.impl}"`);
      this.known.set(def.impl, { def, impl });
    }
    this.loadout = loadLoadout(this.cls);
    this.recomputeStats(equipped);
    this.reset();
  }

  /** Bind a skill (or nothing) to a key and persist the loadout. */
  bind(key: SkillKey, skillId: string | null): void {
    if (skillId !== null && !this.known.has(skillId)) return;
    if (this.channel?.key === key) this.stopChannel();
    this.loadout[key] = skillId;
    saveLoadout(this.cls, this.loadout);
  }

  skillAt(key: SkillKey): KnownSkill | null {
    const id = this.loadout[key];
    return id ? this.known.get(id) ?? null : null;
  }

  recomputeStats(equipped: Profile['equipped']): void {
    const prevLifePct = this.stats ? this.life / this.stats.maxLife : 1;
    this.stats = computeStats(this.cls.base, equipped);
    this.life = this.stats.maxLife * prevLifePct;
  }

  reset(): void {
    if (this.channel) this.stopChannel();
    this.ward?.onEnd?.();
    this.life = this.stats.maxLife;
    this.energy = this.stats.maxEnergy;
    this.alive = true;
    this.deadT = -1;
    this.casting = null;
    this.channel = null;
    this.ward = null;
    this.hitT = 0;
    this.lastLowEnergy = 0;
    this.cooldowns.clear();
    this.pos.set(0, 0, 3);
    this.vel.set(0, 0, 0);
    this.model.kit.u.uDissolve.value = 0;
    this.obj.visible = true;
    this.model.reset?.();
  }

  get castPoint(): THREE.Vector3 {
    return (this.model.tip ?? this.model.root).getWorldPosition(new THREE.Vector3());
  }

  get palmPoint(): THREE.Vector3 {
    return (this.model.palm ?? this.model.root).getWorldPosition(new THREE.Vector3());
  }

  cooldownOf(def: SkillDef): number { return def.cooldown * (1 - this.stats.cdr / 100); }
  cooldownLeft(id: string): number { return this.cooldowns.get(id) ?? 0; }

  // --- input & skills -------------------------------------------------------------
  handleInput(dt: number): void {
    // movement: camera looks toward -Z, so W is -Z
    let mx = 0, mz = 0;
    if (isDown('w') || isDown('arrowup')) mz -= 1;
    if (isDown('s') || isDown('arrowdown')) mz += 1;
    if (isDown('a') || isDown('arrowleft')) mx -= 1;
    if (isDown('d') || isDown('arrowright')) mx += 1;
    const len = Math.hypot(mx, mz);
    let speed = this.stats.moveSpeed;
    if (this.casting) speed *= 0.45;
    if (this.channel) speed *= this.channel.skill.def.moveMult ?? 0.4;
    const tx = len ? (mx / len) * speed : 0, tz = len ? (mz / len) * speed : 0;
    this.vel.x = damp(this.vel.x, tx, 14, dt);
    this.vel.z = damp(this.vel.z, tz, 14, dt);

    this.aim.copy(input.ground);

    // a channel ends when the key that started it is released
    if (this.channel && !isDown(this.channel.key)) this.stopChannel();
    if (input.mouse.overUI) return;
    for (const key of SKILL_KEYS) {
      if (!isDown(key)) continue;
      const skill = this.skillAt(key);
      if (!skill) continue;
      if (skill.impl.channel) { if (!this.channel && !this.casting) this.startChannel(skill, key); }
      else this.tryCast(skill);
    }
  }

  tryCast(s: KnownSkill): boolean {
    if (this.casting || this.channel || this.cooldownLeft(s.def.impl) > 0 || !this.alive) return false;
    if (!this.sandbox && this.energy < s.def.cost) { this.lowEnergy(); return false; }
    const dur = s.def.castTime / (1 + this.stats.castSpeed / 100);
    const target = this.aim.clone();
    if (dur <= 0) { this.fire(s, target); return true; }
    this.casting = { skill: s, t: 0, dur, fireAt: dur * 0.55, fired: false, target };
    this.faceTowards(target, true);
    return true;
  }

  fire(s: KnownSkill, target: THREE.Vector3): void {
    if (s.impl.channel) return;
    // sandbox (lobby practice): no costs or cooldowns
    if (!this.sandbox) {
      this.energy -= s.def.cost;
      this.cooldowns.set(s.def.impl, this.cooldownOf(s.def));
    }
    s.impl.cast(this, s.def, target);
  }

  startChannel(s: KnownSkill, key: SkillKey): void {
    if (!s.impl.channel) return;
    if (!this.sandbox && this.energy < s.def.cost * 0.2) { this.lowEnergy(); return; }
    this.channel = { skill: s, key, state: s.impl.start(this, s.def) };
  }

  stopChannel(): void {
    const ch = this.channel;
    if (!ch) return;
    this.channel = null;
    (ch.skill.impl as ChannelSkill).stop(this, ch.skill.def, ch.state);
  }

  lowEnergy(): void {
    if (G.time - this.lastLowEnergy < 1.2) return;
    this.lastLowEnergy = G.time;
    floatText(this.pos.x, 2.6, this.pos.z, 'Not enough energy', 'info', '#62d0ff');
  }

  faceTowards(p: THREE.Vector3, instant = false): void {
    const a = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    this.facing = instant ? a : angleDamp(this.facing, a, 18, G.dt);
  }

  // --- update -----------------------------------------------------------------------
  update(dt: number): void {
    const t = G.time;
    if (!this.alive) { this.updateDeath(dt); return; }

    this.handleInput(dt);

    // cast progress
    if (this.casting) {
      const c = this.casting;
      c.t += dt;
      this.faceTowards(c.target);
      if (!c.fired && c.t >= c.fireAt) { c.fired = true; this.fire(c.skill, this.aim.clone()); }
      if (c.t >= c.dur) this.casting = null;
    }
    if (this.channel) {
      const ch = this.channel;
      const cost = this.sandbox ? 0 : ch.skill.def.cost * dt;
      if (this.energy < cost) { this.lowEnergy(); this.stopChannel(); }
      else {
        this.energy -= cost;
        this.faceTowards(this.aim);
        (ch.skill.impl as ChannelSkill).tick(this, ch.skill.def, dt, ch.state);
      }
    }

    // movement
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    resolveWorld(this.pos, this.radius);
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (!this.casting && !this.channel && speed > 0.5) {
      this.facing = angleDamp(this.facing, Math.atan2(this.vel.x, this.vel.z), 14, dt);
    }

    // resources & cooldowns
    this.life = Math.min(this.stats.maxLife, this.life + this.stats.lifeRegen * dt);
    if (!this.channel) this.energy = Math.min(this.stats.maxEnergy, this.energy + this.stats.energyRegen * dt);
    for (const [id, cd] of this.cooldowns) this.cooldowns.set(id, Math.max(0, cd - dt));
    this.hitT = Math.max(0, this.hitT - dt * 4);
    if (this.ward) {
      this.ward.t -= dt;
      if (this.ward.t <= 0 || this.ward.amount <= 0) { this.ward.onEnd?.(); this.ward = null; }
    }

    // animation
    const fwd = Math.sin(this.facing) * this.vel.x + Math.cos(this.facing) * this.vel.z;
    const side = Math.cos(this.facing) * this.vel.x - Math.sin(this.facing) * this.vel.z;
    this.phase += dt * speed * 2.1 * (fwd < -0.5 ? -1 : 1);
    let action: ActionState | null = null;
    if (this.casting) action = { name: this.casting.skill.impl.anim || 'cast', t: this.casting.t / this.casting.dur };
    else if (this.channel) action = { name: 'channel', t: 0.5 };
    this.pose(dt, t, Math.min(1, speed / this.stats.moveSpeed), 1, side / this.stats.moveSpeed, action);

    // ambient arcane motes around the offhand
    if (Math.random() < dt * 20) {
      const p = this.palmPoint;
      particles.glow.spawn({
        x: p.x + rand(-0.08, 0.08), y: p.y + rand(-0.05, 0.08), z: p.z + rand(-0.08, 0.08), vy: rand(0.2, 0.6),
        life: rand(0.4, 0.8), size: rand(0.06, 0.14), sizeEnd: 0, color: col(0x5dffa8, 2.5), colorEnd: col(0x1060ff, 0.5),
      });
    }
  }

  pose(dt: number, t: number, move: number, dir: number, lean: number, action: ActionState | null): void {
    this.obj.position.set(this.pos.x, damp(this.obj.position.y, groundHeight(this.pos.x, this.pos.z), 14, dt), this.pos.z);
    this.model.root.rotation.y = this.facing;
    this.model.animate({
      t, dt, phase: this.phase, move, moveDir: dir, lean, action,
      hit: this.hitT, dead: this.deadT >= 0 ? Math.min(1, this.deadT / 1.0) : -1,
      charge: this.channel ? 1 : this.casting ? this.casting.t / this.casting.dur : 0,
      velocity: this.vel,
    });
    this.model.kit.u.uHit.value = this.hitT * 0.5;
    this.staffLight.position.copy(this.castPoint);
    this.staffLight.intensity = 3 + (this.channel ? 6 : 0) + Math.sin(t * 6) * 0.4;
  }

  heal(amount: number, silent = false): void {
    if (!this.alive) return;
    const before = this.life;
    this.life = Math.min(this.stats.maxLife, this.life + amount);
    if (!silent && this.life - before >= 1) floatText(this.pos.x, 2.4, this.pos.z, `+${Math.round(this.life - before)}`, 'heal', '#6dff7a');
  }

  /** Apply already-mitigated damage (see combat/damage hurtPlayer). Returns damage taken. */
  takeDamage(amount: number, _type: DamageType, _from: THREE.Vector3 | null): number {
    if (!this.alive) return 0;
    if (this.ward) {
      const absorbed = Math.min(this.ward.amount, amount);
      this.ward.amount -= absorbed;
      amount -= absorbed;
      this.ward.onHit?.(absorbed);
      if (amount <= 0) return 0;
    }
    this.life -= amount;
    this.hitT = 1;
    flashHurt(Math.min(0.7, (amount / this.stats.maxLife) * 4));
    addShake(Math.min(0.35, (amount / this.stats.maxLife) * 2));
    floatText(this.pos.x, 2.3, this.pos.z, Math.round(amount), 'player', '#ff4a3a');
    sfx.hurt();
    emit('playerHurt', amount);
    if (this.life <= 0) this.die();
    return amount;
  }

  die(): void {
    this.life = 0;
    this.alive = false;
    this.deadT = 0;
    this.stopChannel();
    this.casting = null;
    this.ward?.onEnd?.();
    this.ward = null;
    sfx.death();
    emit('playerDied');
  }

  updateDeath(dt: number): void {
    this.deadT += dt;
    this.pose(dt, G.time, 0, 1, 0, null);
    this.model.kit.u.uDissolve.value = Math.min(0.85, Math.max(0, (this.deadT - 1.2) / 3));
  }
}
