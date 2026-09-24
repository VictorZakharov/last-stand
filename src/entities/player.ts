// The player character: input -> movement/skills, resources, damage, animation.
import * as THREE from 'three';
import { G } from '../state';
import { CLASSES } from '../data/classes/index';
import { buildModel } from './models/index';
import { SKILL_IMPLS } from '../combat/skills/index';
import type { ChannelSkill, SkillImpl } from '../combat/skills/types';
import { computeStats, isTwoHanded } from '../loot/items';
import { BLOCK, COOP } from '../data/balance';
import { SKILL_KEYS, loadLoadout, saveLoadout, defaultLoadout, usableWith, resolveFor, weaponStyle, type Loadout, type WeaponStyle } from '../loot/loadout';
import { groundHeight } from '../world/arena';
import { resolveWorld } from '../world/collision';
import { input, isDown } from '../core/input';
import { flashHurt, addShake, cameraYaw, lookFacing, viewMode, viewSettled } from '../core/renderer';

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

/** `replay`: a remote player's cast, shown for its pose and charge; its owner says when it fires */
interface CastState { skill: KnownSkill; t: number; dur: number; fireAt: number; fired: boolean; target: THREE.Vector3; replay?: boolean }
interface ChannelState { skill: KnownSkill; key: SkillKey; state: unknown; t: number }
/** A movement skill's dash: a fixed velocity that input can't steer, with a per-frame hook; `lift`
 *  makes it a jump of that peak height, and `anim` is the pose it plays. */
interface DashState { vx: number; vz: number; t: number; dur: number; lift: number; anim: CastAnim; step?(): void }
export interface DashOpts { lift?: number; anim?: CastAnim; step?(): void }

/** What the local player does that the other players' games replay (see net/session). */
export type PlayerAction =
  | { t: 'cast'; s: string; dur: number; x: number; z: number }
  | { t: 'fire'; s: string; x: number; z: number; px: number; pz: number; f: number }
  | { t: 'chs'; s: string; k: SkillKey }
  | { t: 'che' };
let actionSink: ((a: PlayerAction) => void) | null = null;
/** Co-op: where the local player's casts are reported. */
export function setActionSink(fn: ((a: PlayerAction) => void) | null): void { actionSink = fn; }

/** How a hit on a player turned out. It's worked out where the fight is simulated (solo, or the
 *  co-op host) and shown from this on every screen. */
export interface HitResult { taken: number; blocked: number; broke: boolean; absorbed: number }

/** A remote player as its owner last reported it (position, velocity, facing, aim), and when. */
export interface RemoteState { x: number; z: number; vx: number; vz: number; f: number; ax: number; az: number; at: number }

/** Out of a co-op run for the rest of it: banked, or dead for good. */
export type PlayerOut = 'banked' | 'dead' | null;

/** Reports each hit on a player to the co-op partners (set by net/sync on the host). */
let hitSink: ((p: Player, r: HitResult, from: THREE.Vector3 | null) => void) | null = null;
export function setHitSink(fn: typeof hitSink): void { hitSink = fn; }

export class Player {
  readonly cls: ClassDef;
  readonly model: Model;
  readonly obj = new THREE.Group();
  /** follows the cast point; every class has one, so switching class keeps the light count. A
   *  remote player has none: another light would change the count and recompile every shader */
  readonly staffLight: THREE.PointLight | null;
  /** played here (a co-op partner is remote: driven by what its own game reports) */
  readonly local: boolean;
  /** co-op: the player's place in the party (0 = the host), and its spawn point */
  slot = 0;
  readonly spawn = new THREE.Vector3(0, 0, 3);
  /** a remote player: its latest reported state */
  readonly remote: RemoteState = { x: 0, z: 3, vx: 0, vz: 0, f: Math.PI, ax: 0, az: 0, at: 0 };

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
  loadout!: Loadout;
  /** the weapon style the loadout belongs to */
  private style: WeaponStyle | null = null;
  /** remaining cooldown per skill id (shared by every key bound to it) */
  readonly cooldowns = new Map<string, number>();

  stats!: DerivedStats;
  /** what the character holds (from the equipped items) */
  gear: Gear = { weapon: null, twoHanded: false, shield: false, offWeapon: null };
  /** seconds until the shield can block again, and when it last did */
  blockCd = 0;
  /** game time until which a broken guard keeps the shield down and the character staggered:
   *  it can move but not attack, cast or raise the shield */
  guardBroken = -1;
  get staggered(): boolean { return this.guardBroken > G.time; }
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

  // co-op
  /** at 0 health (alive false) but waiting for a teammate: seconds left before bleeding out */
  downed = false;
  bleed = 0;
  /** 0..1: how far a teammate is with raising this downed player */
  revive = 0;
  /** out of the run for good (banked, or dead): watching the rest of it */
  out: PlayerOut = null;
  /** not in the arena with us (a partner in the lobby while we fight, or the other way round) */
  away = false;
  /** game time until which a raised player can't be hurt */
  guardUntil = -1;
  /** getting back up after a revive: seconds left of the rise */
  rising = 0;
  /** the pause menu is open in co-op (the game can't stop for one player): the character stands idle */
  idle = false;
  /** a remote player holds its revive key (reported with its state) */
  reviving = false;

  constructor(classId: string, equipped: Profile['equipped'], local = true) {
    this.cls = CLASSES[classId];
    this.local = local;
    this.sandbox = !local;   // a remote player's casts replay as its owner fires them: no costs here
    this.staffLight = local ? new THREE.PointLight(this.cls.aura.light, this.cls.aura.intensity, 6, 2) : null;
    this.model = buildModel(this.cls.model);
    this.obj.add(this.model.root);
    applyShadowDetail(this.obj);
    G.scene.add(this.obj, ...(this.staffLight ? [this.staffLight] : []), ...(this.model.worldObjects ?? []));

    for (const def of this.cls.skills) {
      const impl = SKILL_IMPLS[def.impl];
      if (!impl) throw new Error(`Missing skill impl "${def.impl}"`);
      this.known.set(def.impl, { def, impl });
    }
    this.recomputeStats(equipped);   // loads the loadout for the gear held
    this.reset();
  }

  /** Take the character out of the scene (switching class in the lobby). */
  dispose(): void {
    this.stopChannel();
    this.ward?.onEnd?.();
    G.scene.remove(this.obj, ...(this.staffLight ? [this.staffLight] : []), ...(this.model.worldObjects ?? []));
    this.model.dispose();
    this.staffLight?.dispose();
  }

  /** Bind a skill (or nothing) to a key and persist the loadout (of the weapon style held). */
  bind(key: SkillKey, skillId: string | null): void {
    const s = skillId !== null ? this.known.get(skillId) : null;
    if (skillId !== null && (!s || !this.usable(s.def))) return;   // not with the gear held
    if (this.channel?.key === key) this.stopChannel();
    this.loadout[key] = skillId;
    saveLoadout(this.cls, this.gear, this.loadout);
  }

  /** Back to the class's default bindings for the weapon style held. */
  resetLoadout(): void {
    if (this.channel) this.stopChannel();
    this.loadout = defaultLoadout(this.cls, this.gear);
    saveLoadout(this.cls, this.gear, this.loadout);
  }

  /** The weapon style the loadout belongs to (null: the class has one loadout). */
  get weaponStyle(): WeaponStyle | null { return this.style; }

  /** Whether the gear held allows a skill (some need a shield, some a two-handed weapon). */
  usable(def: SkillDef): boolean { return usableWith(def, this.gear); }

  /** The skill a key fires. A skill the gear doesn't allow gives way to its fallback for the gear held. */
  skillAt(key: SkillKey): KnownSkill | null {
    const id = this.loadout[key];
    const s = id ? this.known.get(id) ?? null : null;
    if (!s || this.usable(s.def)) return s;
    const alt = resolveFor(s.def, this.gear);
    return alt ? this.known.get(alt) ?? null : null;
  }

  recomputeStats(equipped: Profile['equipped']): void {
    const prevLifePct = this.stats ? this.life / this.stats.maxLife : 1;
    this.stats = computeStats(this.cls.base, equipped);
    const weapon = equipped.weapon;
    const off = equipped.offhand;
    this.gear = {
      weapon: weapon?.base ?? null, twoHanded: isTwoHanded(weapon, this.cls),
      shield: (off?.stats.blockAmount ?? 0) > 0,   // shields are the off-hands that block
      offWeapon: off?.slot === 'weapon' ? off.base : null,
    };
    // each weapon style has its own loadout: switching style brings back the one left there
    const style = weaponStyle(this.cls, this.gear);
    if (!this.loadout || style !== this.style) {
      if (this.channel) this.stopChannel();
      this.style = style;
      this.loadout = loadLoadout(this.cls, this.gear);
    }
    this.model.setGear?.(this.gear);
    this.life = this.stats.maxLife * prevLifePct;
  }

  /** Stand at a spot facing a direction, as if always there (the cape settles in place). */
  place(pos: THREE.Vector3, facing: number): void {
    this.pos.set(pos.x, 0, pos.z);
    this.facing = facing;
    this.obj.position.set(pos.x, groundHeight(pos.x, pos.z), pos.z);
    this.model.root.rotation.y = facing;
    this.model.reset?.();
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
    this.downed = false;
    this.bleed = this.revive = this.rising = 0;
    this.out = null;
    this.guardUntil = -1;
    this.pos.copy(this.spawn);
    this.remote.x = this.spawn.x; this.remote.z = this.spawn.z;
    this.vel.set(0, 0, 0);
    this.model.kit.u.uDissolve.value = 0;
    this.show(!this.away);
    this.model.reset?.();
  }

  /** Show or hide the character, with what it keeps in the world (its cape). */
  show(v: boolean): void {
    this.obj.visible = v;
    for (const o of this.model.worldObjects ?? []) o.visible = v;
  }

  /** In the fight: standing, in the arena and still in the run (what enemies go for). */

  get active(): boolean { return this.alive && !this.away && !this.out; }
  /** Still in the run, standing or downed (not banked or dead for good). */
  get inRun(): boolean { return !this.away && !this.out; }

  get castPoint(): THREE.Vector3 {
    return this.viewHand() ?? (this.model.tip ?? this.model.root).getWorldPosition(new THREE.Vector3());
  }

  get palmPoint(): THREE.Vector3 {
    return this.viewHand() ?? (this.model.palm ?? this.model.root).getWorldPosition(new THREE.Vector3());
  }

  /** Seen through this hero's eyes, where a hand would be in view (right of and below the camera,
   *  ahead of it): the hidden body's hands are at the camera, so a beam would leave from the head. */
  private viewHand(): THREE.Vector3 | null {
    if (!this.local || viewMode() !== 'first' || !viewSettled()) return null;
    return new THREE.Vector3(0.28, -0.4, -0.65).applyMatrix4(G.camera.matrixWorld);
  }

  cooldownOf(def: SkillDef): number { return def.cooldown * (1 - this.stats.cdr / 100); }
  cooldownLeft(id: string): number { return this.cooldowns.get(id) ?? 0; }

  // --- input & skills -------------------------------------------------------------
  handleInput(dt: number): void {
    if (this.idle) {
      // the co-op pause menu: stand still and let go of any channel
      this.vel.x = damp(this.vel.x, 0, 14, dt);
      this.vel.z = damp(this.vel.z, 0, 14, dt);
      if (this.channel) this.stopChannel();
      return;
    }
    // movement is screen-relative: W is away from the camera, whatever its yaw
    let mx = 0, mz = 0;
    if (isDown('w') || isDown('arrowup')) mz -= 1;
    if (isDown('s') || isDown('arrowdown')) mz += 1;
    if (isDown('a') || isDown('arrowleft')) mx -= 1;
    if (isDown('d') || isDown('arrowright')) mx += 1;
    // the touch stick is analog: a small push walks
    if (!mx && !mz) { mx = input.stick.x; mz = input.stick.y; }
    const len = Math.hypot(mx, mz);
    let speed = this.stats.moveSpeed;
    if (this.casting) speed *= 0.45;
    if (this.channel) speed *= this.channel.skill.def.moveMult ?? 0.4;
    const yaw = cameraYaw(), cy = Math.cos(yaw), sy = Math.sin(yaw);
    const k = len ? speed * Math.min(1, len) / len : 0;
    const tx = (mx * cy + mz * sy) * k, tz = (mz * cy - mx * sy) * k;
    this.vel.x = damp(this.vel.x, tx, 14, dt);
    this.vel.z = damp(this.vel.z, tz, 14, dt);

    this.aim.copy(input.ground);

    // a channel ends when the key that started it is released
    if (this.channel && !isDown(this.channel.key)) this.stopChannel();
    if ((input.mouse.overUI && !input.touchMode) || this.dash || this.staggered) return;
    for (const key of SKILL_KEYS) {
      if (!isDown(key)) continue;
      const skill = this.skillAt(key);
      if (!skill) continue;
      if (skill.impl.channel) { if (!this.channel && !this.casting) this.startChannel(skill, key); }
      else this.tryCast(skill);
    }
  }

  tryCast(s: KnownSkill): boolean {
    if (this.casting || this.channel || this.dash || this.staggered || this.cooldownLeft(s.def.impl) > 0 || !this.alive) return false;
    if (!this.sandbox && this.energy < s.def.cost) { this.lowEnergy(); return false; }
    const dur = s.def.castTime / (1 + this.stats.castSpeed / 100);
    const target = this.aim.clone();
    if (dur <= 0) { this.fire(s, target); return true; }
    this.casting = { skill: s, t: 0, dur, fireAt: dur * (s.def.fireAt ?? 0.55), fired: false, target };
    this.faceTowards(target, true);
    actionSink?.({ t: 'cast', s: s.def.impl, dur, x: target.x, z: target.z });
    return true;
  }

  fire(s: KnownSkill, target: THREE.Vector3): void {
    if (s.impl.channel) return;
    // sandbox (lobby practice): no costs or cooldowns
    if (!this.sandbox) {
      this.energy -= s.def.cost;
      this.cooldowns.set(s.def.impl, this.cooldownOf(s.def));
    }
    if (this.local) actionSink?.({ t: 'fire', s: s.def.impl, x: target.x, z: target.z, px: this.pos.x, pz: this.pos.z, f: this.facing });
    s.impl.cast(this, s.def, target);
  }

  /** A remote player's action, replayed as its owner reported it. */
  replay(a: PlayerAction): void {
    if (a.t === 'che') { this.stopChannel(); return; }
    const s = this.known.get(a.s);
    if (!s || !this.alive) return;
    if (a.t === 'cast') {
      this.casting = { skill: s, t: 0, dur: a.dur, fireAt: a.dur * (s.def.fireAt ?? 0.55), fired: false, target: new THREE.Vector3(a.x, 0, a.z), replay: true };
    } else if (a.t === 'fire') {
      // from where it stood and the way it faced as it fired, so reach and aim match what its player saw
      this.pos.x = this.remote.x = a.px; this.pos.z = this.remote.z = a.pz;
      this.facing = a.f;
      if (this.casting) this.casting.fired = true;
      this.fire(s, new THREE.Vector3(a.x, 0, a.z));
    } else if (!this.channel) {
      this.channel = { skill: s, key: a.k, state: (s.impl as ChannelSkill).start(this, s.def), t: 0 };
    }
  }

  /** Rush along `dir` (normalized, on the ground) at `speed` for `dur` seconds; `step` runs every frame of it. */
  startDash(dir: THREE.Vector3, speed: number, dur: number, { lift = 0, anim = 'charge', step }: DashOpts = {}): void {
    this.dash = { vx: dir.x * speed, vz: dir.z * speed, t: 0, dur, lift, anim, step };
    this.facing = Math.atan2(dir.x, dir.z);
  }

  startChannel(s: KnownSkill, key: SkillKey): void {
    if (!s.impl.channel) return;
    // a broken guard can't be raised again until the shield recovers
    if (this.staggered) return;
    if (!this.sandbox && this.energy < s.def.cost * 0.2) { this.lowEnergy(); return; }
    this.channel = { skill: s, key, state: s.impl.start(this, s.def), t: 0 };
    actionSink?.({ t: 'chs', s: s.def.impl, k: key });
  }

  stopChannel(): void {
    const ch = this.channel;
    if (!ch) return;
    this.channel = null;
    (ch.skill.impl as ChannelSkill).stop(this, ch.skill.def, ch.state);
    if (this.local) actionSink?.({ t: 'che' });
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
    if (!this.local) this.follow(dt);
    if (!this.alive) { this.updateDeath(dt); return; }
    if (!this.local) { this.updateRemote(dt, t); return; }

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
    const look = lookFacing();
    if (look !== null && !d) this.facing = look;
    else if (!this.casting && !this.channel && speed > 0.5) {
      this.facing = angleDamp(this.facing, Math.atan2(this.vel.x, this.vel.z), 14, dt);
    }

    // resources & cooldowns
    if (!this.channel) this.energy = Math.min(this.stats.maxEnergy, this.energy + this.stats.energyRegen * dt);
    for (const [id, cd] of this.cooldowns) this.cooldowns.set(id, Math.max(0, cd - dt));
    this.tickVitals(dt);
    this.animateBody(dt, t, speed);
  }

  /** Health regeneration, hit flash, block recovery and the ward's timer. */
  private tickVitals(dt: number): void {
    this.life = Math.min(this.stats.maxLife, this.life + this.stats.lifeRegen * dt);
    this.hitT = Math.max(0, this.hitT - dt * 4);
    this.blockCd = Math.max(0, this.blockCd - dt);
    this.rising = Math.max(0, this.rising - dt);
    if (this.ward) {
      this.ward.t -= dt;
      if (this.ward.t <= 0 || this.ward.amount <= 0) { this.ward.onEnd?.(); this.ward = null; }
    }
  }

  /**
   * A co-op partner: it glides to where its game last put it (carried on along its velocity for
   * the time since, to make up for the lag), and its casts and channels play out as reported.
   */
  private updateRemote(dt: number, t: number): void {
    const r = this.remote;
    if (this.casting) {
      const c = this.casting;
      c.t += dt;
      if (!c.fired && !c.skill.impl.channel) c.skill.impl.charging?.(this, c.skill.def, Math.min(1, c.t / c.fireAt), dt);
      if (c.t >= c.dur) this.casting = null;
    }
    if (this.channel) (this.channel.skill.impl as ChannelSkill).tick(this, this.channel.skill.def, dt, this.channel.state);
    const d = this.dash;
    if (d) {
      d.t += dt;
      d.step?.();
      if (d.t >= d.dur) this.dash = null;
    }
    this.tickVitals(dt);
    this.animateBody(dt, t, Math.hypot(r.vx, r.vz));
  }

  /** A remote player moves (and lies, when down) where its game reports it. */
  private follow(dt: number): void {
    const r = this.remote;
    const lead = this.alive ? Math.min(0.2, Math.max(0, (performance.now() - r.at) / 1000)) : 0;
    const tx = r.x + r.vx * lead, tz = r.z + r.vz * lead;
    // a jump (a respawn, a long stall) is taken at once rather than slid across the arena
    if (Math.hypot(tx - this.pos.x, tz - this.pos.z) > 4) { this.pos.x = tx; this.pos.z = tz; }
    this.pos.x = damp(this.pos.x, tx, 14, dt);
    this.pos.z = damp(this.pos.z, tz, 14, dt);
    if (!this.alive) return;
    this.vel.set(r.vx, 0, r.vz);
    this.facing = angleDamp(this.facing, r.f, 16, dt);
    this.aim.set(r.ax, 0, r.az);
  }

  private animateBody(dt: number, t: number, speed: number): void {

    const fwd = Math.sin(this.facing) * this.vel.x + Math.cos(this.facing) * this.vel.z;
    const side = Math.cos(this.facing) * this.vel.x - Math.sin(this.facing) * this.vel.z;
    this.phase += dt * speed * 2.1 * (fwd < -0.5 ? -1 : 1);
    let action: ActionState | null = null;
    if (this.staggered) action = { name: 'stagger', t: 1 - (this.guardBroken - G.time) / BLOCK.guardBreak };
    else if (this.dash) action = { name: this.dash.anim ?? 'charge', t: Math.min(1, this.dash.t / this.dash.dur) };
    else if (this.casting) action = { name: this.casting.skill.impl.anim || 'cast', t: this.casting.t / this.casting.dur };
    // a channel's t ramps 0 -> 1 over its first 0.2 s (the pose settling in), then holds
    else if (this.channel) action = { name: this.channel.skill.impl.anim || 'channel', t: Math.min(1, (this.channel.t += dt) / 0.2) };
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
    // a raised player gets up the way it went down, in reverse
    const dead = this.deadT >= 0 ? Math.min(1, this.deadT / 1.0) : this.rising > 0 ? this.rising / RISE : -1;
    this.model.animate({
      t, dt, phase: this.phase, move, moveDir: dir, lean, action,
      hit: this.hitT, blockHit: Math.max(0, 1 - (G.time - this.lastBlock) / 0.25), dead,
      charge: this.channel ? 1 : this.casting ? this.casting.t / this.casting.dur : 0,
      velocity: this.vel,
    });
    this.model.kit.u.uHit.value = this.hitT * 0.5;
    // the model shows its cape as it animates: a hidden character keeps it hidden
    if (!this.obj.visible) for (const o of this.model.worldObjects ?? []) o.visible = false;
    if (this.staffLight) {

      this.staffLight.position.copy(this.castPoint);
      const glow = this.cls.aura.intensity;
      this.staffLight.intensity = glow * (1 + (this.channel ? 2 : 0) + Math.sin(t * 6) * 0.13);
    }
  }

  heal(amount: number, silent = false): void {
    if (!this.alive) return;
    const before = this.life;
    this.life = Math.min(this.stats.maxLife, this.life + amount);
    if (!silent && this.life - before >= 1) floatText(this.pos.x, 2.4, this.pos.z, `+${Math.round(this.life - before)}`, 'heal', '#6dff7a');
  }

  /** Apply already-mitigated damage (see combat/damage hurtPlayer). Returns damage taken. */
  takeDamage(amount: number, _type: DamageType, from: THREE.Vector3 | null): number {
    if (!this.alive || G.time < this.guardUntil) return 0;
    const r = this.resolveHit(amount, from);
    this.showHit(r);
    hitSink?.(this, r, from);
    if (this.life <= 0) this.die();
    return r.taken;
  }

  /** Work out a hit: the shield's block, then the ward, then health. */
  private resolveHit(amount: number, from: THREE.Vector3 | null): HitResult {
    const r: HitResult = { taken: 0, blocked: 0, broke: false, absorbed: 0 };
    const s = this.stats;
    // shield block: a chance per hit (then a short recovery), or every frontal hit while the shield is raised
    if (this.gear.shield && s.blockAmount > 0) {
      const raised = this.channel?.skill.def.block ?? 0;
      const front = !from || angleOff(Math.atan2(from.x - this.pos.x, from.z - this.pos.z), this.facing) < BLOCK.arc;
      let absorb = 0;
      if (raised && front) absorb = s.blockAmount * raised;
      else if (this.blockCd <= 0 && Math.random() * 100 < s.block) { absorb = s.blockAmount; this.blockCd = BLOCK.recovery; }
      if (absorb > 0) {
        r.blocked = Math.min(amount, absorb);
        // more than a raised shield can hold: the guard breaks, the rest gets through
        r.broke = raised > 0 && amount > absorb;
        amount -= r.blocked;
      }
    }
    if (amount > 0 && this.ward) {
      r.absorbed = Math.min(this.ward.amount, amount);
      this.ward.amount -= r.absorbed;
      amount -= r.absorbed;
    }
    r.taken = amount;
    this.life -= amount;
    return r;
  }

  /** A co-op partner's hit, as the host worked it out: its effects here, and its feedback. */
  applyHit(r: HitResult): void {
    if (this.ward && r.absorbed) this.ward.amount -= r.absorbed;
    this.life = Math.max(0, this.life - r.taken);
    this.showHit(r);
  }

  /** The feedback of a hit: sparks off a block, the ward flaring, the number, the screen's flinch. */
  private showHit(r: HitResult): void {
    if (r.blocked > 0) {
      this.lastBlock = G.time;
      const p = this.palmPoint;
      if (r.broke) {
        this.guardBroken = G.time + BLOCK.guardBreak;
        this.blockCd = BLOCK.guardBreak;
        this.stopChannel();
        this.casting = null;
        floatText(this.pos.x, 2.7, this.pos.z, 'Guard broken', 'info', '#ff8a50');
        if (this.local) addShake(0.25);
      } else floatText(this.pos.x, 2.5, this.pos.z, `Block ${Math.round(r.blocked)}`, 'info', '#ffd9a0');
      for (let i = 0; i < 8; i++) {
        particles.glow.spawn({ x: p.x, y: p.y, z: p.z, vx: rand(-4, 4), vy: rand(0, 4), vz: rand(-4, 4), life: rand(0.2, 0.35), size: rand(0.04, 0.09), sizeEnd: 0,
          color: col(0xffe0a0, 2), colorEnd: col(0xff5010, 0.4), gravity: 12 });
      }
      sfx.clang();
    }
    if (r.absorbed > 0) this.ward?.onHit?.(r.absorbed);
    if (r.taken <= 0) return;
    this.hitT = 1;
    floatText(this.pos.x, 2.3, this.pos.z, Math.round(r.taken), 'player', this.local ? '#ff4a3a' : '#ff9a80');
    if (!this.local) return;
    flashHurt(Math.min(0.7, (r.taken / this.stats.maxLife) * 4));
    addShake(Math.min(0.35, (r.taken / this.stats.maxLife) * 2));
    sfx.hurt();
    emit('playerHurt', r.taken);
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
    emit('playerDied', this);
  }

  /** Co-op: fallen but not gone, until a teammate raises it or it bleeds out. */
  goDown(): void {
    this.downed = true;
    this.bleed = COOP.bleedOut;
    this.revive = 0;
  }

  /** Dead for good: a downed player that bled out starts to fade from here. */
  bleedOut(): void {
    this.downed = false;
    this.deadT = Math.min(this.deadT, 1.2);
  }

  /** Raised by a teammate: back on its feet with some health, untouchable for a moment. */
  raise(lifeK = COOP.reviveLife): void {
    this.downed = false;
    this.alive = true;
    this.deadT = -1;
    this.revive = 0;
    this.rising = RISE;
    this.life = this.stats.maxLife * lifeK;
    this.guardUntil = G.time + COOP.reviveGuard;
    this.model.kit.u.uDissolve.value = 0;
    const p = this.pos;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(0.2, 0.9);
      particles.glow.spawn({
        x: p.x + Math.cos(a) * r, y: rand(0, 0.4), z: p.z + Math.sin(a) * r, vy: rand(2, 4.5),
        life: rand(0.5, 0.9), size: rand(0.08, 0.2), sizeEnd: 0, color: col(0xfff0c0, 2.5), colorEnd: col(0xffa040, 0.4), drag: 1.5,
      });
    }
    sfx.potion();
  }

  updateDeath(dt: number): void {
    this.deadT += dt;
    if (this.downed) this.bleed = Math.max(0, this.bleed - dt);
    this.hitT = Math.max(0, this.hitT - dt * 4);
    this.pose(dt, G.time, 0, 1, 0, null);
    // a downed player lies there whole; the dead fade
    this.model.kit.u.uDissolve.value = this.downed ? 0 : Math.min(0.85, Math.max(0, (this.deadT - 1.2) / 3));
  }
}

/** seconds to get back up after a revive */
const RISE = 0.6;
