// The player character: input -> movement/skills, resources, damage, animation.
import * as THREE from 'three';
import { G } from '../state';
import { CLASSES } from '../data/classes/index';
import { buildModel } from './models/index';
import { SKILL_IMPLS } from '../combat/skills/index';
import type { ChannelSkill, SkillImpl } from '../combat/skills/types';
import { computeStats, isTwoHanded } from '../loot/items';
import { BLOCK } from '../data/balance';
import { SKILL_KEYS, loadLoadout, saveLoadout, type Loadout } from '../loot/loadout';
import { groundHeight } from '../world/arena';
import { resolveWorld } from '../world/collision';
import { input, isDown } from '../core/input';
import { flashHurt, addShake, cameraYaw } from '../core/renderer';
import { floatText } from '../ui/floaters';
import { particles, col } from '../fx/particles';
import { sfx } from '../core/audio';
import { emit } from '../events';
import { angleDamp, damp, rand } from '../util';
import { applyShadowDetail } from '../core/quality';
import type { ActionState, CastAnim, ClassDef, DamageType, DerivedStats, Gear, Model, Profile, SkillDef, SkillKey } from '../types';

/** A skill the class knows: its tuning data + behavior. Keyed by `def.impl`. */
export interface KnownSkill { def: SkillDef; impl: SkillImpl }

/** Damage absorption shield (see the Arcane Aegis skill). */
export interface Ward { amount: number; t: number; onHit?(absorbed: number): void; onEnd?(): void }

/** Absolute difference between two headings. */
const angleOff = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

interface CastState { skill: KnownSkill; t: number; dur: number; fireAt: number; fired: boolean; target: THREE.Vector3 }
interface ChannelState { skill: KnownSkill; key: SkillKey; state: unknown }
/** A movement skill's dash: a fixed velocity that input can't steer, with a per-frame hook; `lift`
 *  makes it a jump of that peak height, and `anim` is the pose it plays. */
interface DashState { vx: number; vz: number; t: number; dur: number; lift: number; anim: CastAnim; step?(): void }
export interface DashOpts { lift?: number; anim?: CastAnim; step?(): void }

export class Player {
  readonly cls: ClassDef;
  readonly model: Model;
  readonly obj = new THREE.Group();
  /** follows the cast point; every class has one, so switching class keeps the light count */
  readonly staffLight: THREE.PointLight;

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
  /** what the character holds (from the equipped items) */
  gear: Gear = { weapon: null, twoHanded: false, shield: false };
  /** seconds until the shield can block again, and when it last did */
  blockCd = 0;
  /** game time until which a broken guard keeps the shield down */
  guardBroken = -1;
  lastBlock = -99;
  life = 0;
  energy = 0;
  alive = true;
  deadT = -1;
  casting: CastState | null = null;
  channel: ChannelState | null = null;
  dash: DashState | null = null;
  ward: Ward | null = null;
  hitT = 0;
  lastLowEnergy = 0;

  constructor(classId: string, equipped: Profile['equipped']) {
    this.cls = CLASSES[classId];
    this.staffLight = new THREE.PointLight(this.cls.aura.light, this.cls.aura.intensity, 6, 2);
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

  /** Take the character out of the scene (switching class in the lobby). */
  dispose(): void {
    this.stopChannel();
    this.ward?.onEnd?.();
    G.scene.remove(this.obj, this.staffLight, ...(this.model.worldObjects ?? []));
    this.model.dispose();
    this.staffLight.dispose();
  }

  /** Bind a skill (or nothing) to a key and persist the loadout. */
  bind(key: SkillKey, skillId: string | null): void {
    if (skillId !== null && !this.known.has(skillId)) return;
    if (this.channel?.key === key) this.stopChannel();
    this.loadout[key] = skillId;
    saveLoadout(this.cls, this.loadout);
  }

  /** The skill a key fires. A skill that needs a shield gives way to its fallback for the weapon held. */
  skillAt(key: SkillKey): KnownSkill | null {
    const id = this.loadout[key];
    const s = id ? this.known.get(id) ?? null : null;
    if (s?.def.needs === 'shield' && !this.gear.shield) {
      const alt = this.gear.twoHanded ? s.def.fallback?.twoHanded : s.def.fallback?.oneHanded;
      return alt ? this.known.get(alt) ?? null : null;
    }
    return s;
  }

  recomputeStats(equipped: Profile['equipped']): void {
    const prevLifePct = this.stats ? this.life / this.stats.maxLife : 1;
    this.stats = computeStats(this.cls.base, equipped);
    const weapon = equipped.weapon;
    this.gear = { weapon: weapon?.base ?? null, twoHanded: isTwoHanded(weapon, this.cls), shield: (equipped.offhand?.stats.blockAmount ?? 0) > 0 };   // shields are the off-hands that block
    this.model.setGear?.(this.gear);
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
    this.dash = null;
    this.ward = null;
    this.hitT = 0;
    this.blockCd = 0;
    this.guardBroken = -1;
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
    // movement is screen-relative: W is away from the camera, whatever its yaw
    let mx = 0, mz = 0;
    if (isDown('w') || isDown('arrowup')) mz -= 1;
    if (isDown('s') || isDown('arrowdown')) mz += 1;
    if (isDown('a') || isDown('arrowleft')) mx -= 1;
    if (isDown('d') || isDown('arrowright')) mx += 1;
    const len = Math.hypot(mx, mz);
    let speed = this.stats.moveSpeed;
    if (this.casting) speed *= 0.45;
    if (this.channel) speed *= this.channel.skill.def.moveMult ?? 0.4;
    const yaw = cameraYaw(), cy = Math.cos(yaw), sy = Math.sin(yaw);
    const k = len ? speed / len : 0;
    const tx = (mx * cy + mz * sy) * k, tz = (mz * cy - mx * sy) * k;
    this.vel.x = damp(this.vel.x, tx, 14, dt);
    this.vel.z = damp(this.vel.z, tz, 14, dt);

    this.aim.copy(input.ground);

    // a channel ends when the key that started it is released
    if (this.channel && !isDown(this.channel.key)) this.stopChannel();
    if (input.mouse.overUI || this.dash) return;
    for (const key of SKILL_KEYS) {
      if (!isDown(key)) continue;
      const skill = this.skillAt(key);
      if (!skill) continue;
      if (skill.impl.channel) { if (!this.channel && !this.casting) this.startChannel(skill, key); }
      else this.tryCast(skill);
    }
  }

  tryCast(s: KnownSkill): boolean {
    if (this.casting || this.channel || this.dash || this.cooldownLeft(s.def.impl) > 0 || !this.alive) return false;
    if (!this.sandbox && this.energy < s.def.cost) { this.lowEnergy(); return false; }
    const dur = s.def.castTime / (1 + this.stats.castSpeed / 100);
    const target = this.aim.clone();
    if (dur <= 0) { this.fire(s, target); return true; }
    this.casting = { skill: s, t: 0, dur, fireAt: dur * (s.def.fireAt ?? 0.55), fired: false, target };
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

  /** Rush along `dir` (normalized, on the ground) at `speed` for `dur` seconds; `step` runs every frame of it. */
  startDash(dir: THREE.Vector3, speed: number, dur: number, { lift = 0, anim = 'charge', step }: DashOpts = {}): void {
    this.dash = { vx: dir.x * speed, vz: dir.z * speed, t: 0, dur, lift, anim, step };
    this.facing = Math.atan2(dir.x, dir.z);
  }

  startChannel(s: KnownSkill, key: SkillKey): void {
    if (!s.impl.channel) return;
    // a broken guard can't be raised again until the shield recovers
    if (s.def.block && this.guardBroken > G.time) return;
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
      const impl = c.skill.impl;
      if (!c.fired && !impl.channel) impl.charging?.(this, c.skill.def, c.t / c.fireAt, dt);
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
    const d = this.dash;
    if (d) { this.vel.set(d.vx, 0, d.vz); d.t += dt; }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    resolveWorld(this.pos, this.radius);
    if (d) {
      d.step?.();
      if (d.t >= d.dur) { this.dash = null; this.vel.multiplyScalar(this.stats.moveSpeed / Math.max(1e-3, Math.hypot(d.vx, d.vz))); }
    }
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (!this.casting && !this.channel && speed > 0.5) {
      this.facing = angleDamp(this.facing, Math.atan2(this.vel.x, this.vel.z), 14, dt);
    }

    // resources & cooldowns
    this.life = Math.min(this.stats.maxLife, this.life + this.stats.lifeRegen * dt);
    if (!this.channel) this.energy = Math.min(this.stats.maxEnergy, this.energy + this.stats.energyRegen * dt);
    for (const [id, cd] of this.cooldowns) this.cooldowns.set(id, Math.max(0, cd - dt));
    this.hitT = Math.max(0, this.hitT - dt * 4);
    this.blockCd = Math.max(0, this.blockCd - dt);
    if (this.ward) {
      this.ward.t -= dt;
      if (this.ward.t <= 0 || this.ward.amount <= 0) { this.ward.onEnd?.(); this.ward = null; }
    }

    // animation
    const fwd = Math.sin(this.facing) * this.vel.x + Math.cos(this.facing) * this.vel.z;
    const side = Math.cos(this.facing) * this.vel.x - Math.sin(this.facing) * this.vel.z;
    this.phase += dt * speed * 2.1 * (fwd < -0.5 ? -1 : 1);
    let action: ActionState | null = null;
    if (this.dash) action = { name: this.dash.anim ?? 'charge', t: Math.min(1, this.dash.t / this.dash.dur) };
    else if (this.casting) action = { name: this.casting.skill.impl.anim || 'cast', t: this.casting.t / this.casting.dur };
    else if (this.channel) action = { name: this.channel.skill.impl.anim || 'channel', t: 0.5 };
    this.pose(dt, t, Math.min(1, speed / this.stats.moveSpeed), 1, side / this.stats.moveSpeed, action);

    // ambient motes around the offhand (the mage's arcana)
    const motes = this.cls.aura.motes;
    if (motes && Math.random() < dt * 20) {
      const p = this.palmPoint;
      particles.glow.spawn({
        x: p.x + rand(-0.08, 0.08), y: p.y + rand(-0.05, 0.08), z: p.z + rand(-0.08, 0.08), vy: rand(0.2, 0.6),
        life: rand(0.4, 0.8), size: rand(0.06, 0.14), sizeEnd: 0, color: col(motes[0], 2.5), colorEnd: col(motes[1], 0.5),
      });
    }
  }

  pose(dt: number, t: number, move: number, dir: number, lean: number, action: ActionState | null): void {
    this.obj.position.set(this.pos.x, damp(this.obj.position.y, groundHeight(this.pos.x, this.pos.z), 14, dt), this.pos.z);
    this.model.root.rotation.y = this.facing;
    // a jumping dash lifts the model along a parabola
    const d = this.dash, k = d ? Math.min(1, d.t / d.dur) : 0;
    this.model.root.position.y = d ? d.lift * 4 * k * (1 - k) : 0;
    this.model.animate({
      t, dt, phase: this.phase, move, moveDir: dir, lean, action,
      hit: this.hitT, dead: this.deadT >= 0 ? Math.min(1, this.deadT / 1.0) : -1,
      charge: this.channel ? 1 : this.casting ? this.casting.t / this.casting.dur : 0,
      velocity: this.vel,
    });
    this.model.kit.u.uHit.value = this.hitT * 0.5;
    this.staffLight.position.copy(this.castPoint);
    const glow = this.cls.aura.intensity;
    this.staffLight.intensity = glow * (1 + (this.channel ? 2 : 0) + Math.sin(t * 6) * 0.13);
  }

  heal(amount: number, silent = false): void {
    if (!this.alive) return;
    const before = this.life;
    this.life = Math.min(this.stats.maxLife, this.life + amount);
    if (!silent && this.life - before >= 1) floatText(this.pos.x, 2.4, this.pos.z, `+${Math.round(this.life - before)}`, 'heal', '#6dff7a');
  }

  /** Apply already-mitigated damage (see combat/damage hurtPlayer). Returns damage taken. */
  takeDamage(amount: number, _type: DamageType, from: THREE.Vector3 | null): number {
    if (!this.alive) return 0;
    amount = this.tryBlock(amount, from);
    if (amount <= 0) return 0;
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

  /** Shield block: a chance per hit (then a short recovery), or every frontal hit while the shield is raised. */
  tryBlock(amount: number, from: THREE.Vector3 | null): number {
    const s = this.stats;
    if (!this.gear.shield || s.blockAmount <= 0) return amount;
    const raised = this.channel?.skill.def.block ?? 0;
    const front = !from || angleOff(Math.atan2(from.x - this.pos.x, from.z - this.pos.z), this.facing) < BLOCK.arc;
    let absorb: number;
    if (raised && front) absorb = s.blockAmount * raised;
    else if (this.blockCd <= 0 && Math.random() * 100 < s.block) { absorb = s.blockAmount; this.blockCd = BLOCK.recovery; }
    else return amount;
    const blocked = Math.min(amount, absorb);
    this.lastBlock = G.time;
    const p = this.palmPoint;
    if (raised && amount > absorb) {
      // more than a raised shield can hold: the guard breaks, the rest gets through
      this.guardBroken = G.time + BLOCK.guardBreak;
      this.blockCd = BLOCK.guardBreak;
      this.stopChannel();
      floatText(this.pos.x, 2.7, this.pos.z, 'Guard broken', 'info', '#ff8a50');
      addShake(0.25);
    } else floatText(this.pos.x, 2.5, this.pos.z, `Block ${Math.round(blocked)}`, 'info', '#ffd9a0');
    for (let i = 0; i < 8; i++) {
      particles.glow.spawn({ x: p.x, y: p.y, z: p.z, vx: rand(-4, 4), vy: rand(0, 4), vz: rand(-4, 4), life: rand(0.2, 0.35), size: rand(0.04, 0.09), sizeEnd: 0,
        color: col(0xffe0a0, 2), colorEnd: col(0xff5010, 0.4), gravity: 12 });
    }
    sfx.clang();
    return amount - blocked;
  }

  die(): void {
    this.life = 0;
    this.alive = false;
    this.deadT = 0;
    this.stopChannel();
    this.casting = null;
    this.dash = null;
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
