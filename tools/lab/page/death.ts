// Each skill's kills as the player sees them fall (tools/lab `death`). Foes stand dazed where the skill strikes, and
// it is cast at them twice on fresh set-ups: once with each foe a hair from death (the hit's damage nearly all past
// its life, so it is thrown hard) and once with each holding just under what the first cast dealt it (killed with
// little to spare, so it drops). Every fallen body is followed frame by frame, as drawn, until it has dissolved:
// how hard it was thrown and which way against the blow (away from the hero, along a sword's swing), how far it flew
// and how high, how long it took to lie still and how low it lay, and anything a body can't do: a part of it under
// the floor, inside a prop or past the arena's wall, its pose off its points, a number gone NaN. A storm's kills must
// go round it. The shaders compiled meanwhile must be none.
import * as THREE from 'three';
import { screenArea, type Fixture, type Lab, type Pictured, type Report } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import type { EnemyId } from '../../../src/data/enemies';
import type { Fling } from '../../../src/combat/fling';
import type { Joints } from '../../../src/entities/models/rig';
import { G } from '../../../src/state';
import { BIOMES } from '../../../src/data/biomes';
import { groundHeight } from '../../../src/world/ground';
import { RAGDOLL_BONES, RAGDOLL_POINTS } from '../../../src/entities/ragdoll';
import { lateCompiles, programsCompiledInGame } from '../../../src/core/shaders';
import { holdFor, pressing, skillNamed, type BoundSkill } from './cast';

export interface DeathOptions {
  fixture: Fixture;
  /** the skills: their keys, behaviours or names (every one of the hero's that deals damage by default) */
  skills: string[];
  pictures: boolean;
  /** plant the faults the checks must catch: a body put under the floor for a frame, one thrown back at the hero */
  canary: boolean;
}

/** Where a skill's foes stand: `ahead` m before the hero, `across` m either side of that or `along` m apart down the
 *  way, or in a ring `round` m from him; and how many. */
interface Stand {
  count: number;
  ahead?: number;
  across?: number;
  along?: number;
  round?: number;
}

/** each skill's foes, by its behaviour, where it strikes */
const STANDS: Record<string, Stand> = {
  cleave: { count: 3, ahead: 1.6, across: 1 },
  twinFangs: { count: 3, ahead: 3.4, across: 0.8 },
  powerStrike: { count: 3, ahead: 2, across: 0.8 },
  crescent: { count: 3, ahead: 4, across: 1.4 },
  bullRush: { count: 3, ahead: 3.5, along: 1.3 },
  tempest: { count: 4, round: 1.7 },
  ironBellow: { count: 4, round: 2.5 },
  glacialNova: { count: 4, round: 3.2 },
  splinterBolt: { count: 3, ahead: 6, across: 1 },
  starfall: { count: 3, ahead: 8, across: 0.9 },
  voidLance: { count: 3, ahead: 3.5, along: 1.4 },
  maelstrom: { count: 3, ahead: 4.5, across: 1.2 },
  nockShot: { count: 1, ahead: 9 },
  fanShot: { count: 3, ahead: 8, across: 1.4 },
  piercingShot: { count: 3, ahead: 6, along: 1.4 },
  arrowRain: { count: 4, ahead: 9, across: 1.1 },
};
/** the skills whose kills go round the hero with the swing, which way it swings (+1 from his right to his left) */
const SWINGS = new Set(['cleave', 'twinFangs', 'tempest']);
/** the skills whose kills go round where they struck (a storm's), not away from the hero */
const WHIRLS = new Set(['maelstrom']);

/** where the hero stands and faces (deg) unless the fixture says: open ground, off the dais, the arena before him */
const SPOT: [number, number] = [-11, -12];
const FACING = 90;
/** frames looked at from the press, at most (a storm holds its kills up for its whole time) */
const MOST_FRAMES = 900;
/** frames before the press, for the cast's light to clear and the foes to settle */
const SETTLE = 10;
/** the foes risen in at most this many frames */
const RISE_FRAMES = 300;
/** the bare pass: each foe holds this share of what the first cast's killing hit dealt it */
const BARE_SHARE = 0.92;
/** what a body may do (m): a part of it this far under the floor or into a prop, its pose this far off its points,
 *  and a bone stretched or squashed by this share of its length */
const UNDER_MOST = 0.04;
const PROP_MOST = 0.06;
const POSE_MOST = 0.1;
const STRETCH_MOST = 0.08;
/** fallen, its hips lie at most this share of their height standing (a frozen body shatters before it lies) */
const LYING_MOST = 0.6;
/** a storm's kill goes round it: its path at least this many times its way from where it fell to where it lay */
const WHIRL_PATH = 2;
/** the moments pictured after the first kill (s), and the last once every body lies still */
const PICTURE_AT = [0.15, 0.5];
const PICTURE_MARGIN = 120;

/** A fallen body followed from its fall: what was thrown, where it fell and lay, how it went. */
interface Fallen {
  foe: Enemy;
  /** the killing hit's damage, and the life it took it from */
  dealt: number;
  /** frames from the press to the fall, and the throw */
  fellAt: number;
  fling: Fling;
  from: THREE.Vector3;
  /** the way it was going over the first frames after its fall (m/s, along the ground) */
  early: THREE.Vector3;
  standingHips: number;
  path: number;
  highest: number;
  restAt: number;
  lay: THREE.Vector3;
  layHips: number;
  under: Worst;
  inProp: Worst;
  poseOff: Worst;
  stretch: Worst;
  /** each bone's length at the fall (m) */
  bones: number[];
  outside: boolean;
  broken: boolean;
}

/** The worst of a measure over a body's frames: how much, where on it and when after the fall (s). */
interface Worst {
  amount: number;
  part: string;
  at: number;
}

const noWorst = (): Worst => ({ amount: 0, part: '', at: 0 });
const metres = (value: number): string => `${value.toFixed(2)} m`;
const centimetres = (value: number): string => `${(value * 100).toFixed(0)} cm`;
const seconds = (value: number): string => `${value.toFixed(2)} s`;
const percentOf = (share: number): string => `${(share * 100).toFixed(0)}%`;
const frameTime = (): number => window.__labClock.frame / 1000;
const flat = (from: THREE.Vector3, to: THREE.Vector3): number => Math.hypot(to.x - from.x, to.z - from.z);

/** The kind of foe the skills are cast at: the biome's commonest in its third wave. */
function foeKind(): EnemyId {
  const pool = BIOMES[G.arena.biome].pool(3).slice().sort((a, b) => b[1] - a[1]);
  return pool[0][0];
}

/** Where `stand` puts its foes round a hero at `at` facing `facing` (rad), and where the skill is aimed. */
function placesFor(stand: Stand, at: THREE.Vector3, facing: number): { spots: THREE.Vector3[]; aim: THREE.Vector3 } {
  const forward = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
  const left = new THREE.Vector3(Math.cos(facing), 0, -Math.sin(facing));
  const spots: THREE.Vector3[] = [];
  for (let i = 0; i < stand.count; i++) {
    const middle = stand.count > 1 ? i / (stand.count - 1) - 0.5 : 0;
    if (stand.round !== undefined) {
      const way = facing + (i / stand.count) * Math.PI * 2;
      spots.push(at.clone().add(new THREE.Vector3(Math.sin(way), 0, Math.cos(way)).multiplyScalar(stand.round)));
      continue;
    }
    const ahead = (stand.ahead ?? 4) + (stand.along ?? 0) * i;
    // (down a line, each a little to one side and the other: a body thrown on lands clear of the next)
    const aside = stand.along !== undefined ? (i % 2 ? 0.35 : -0.35) : middle * 2 * (stand.across ?? 0);
    spots.push(at.clone().addScaledVector(forward, ahead).addScaledVector(left, aside));
  }
  const aimAhead = stand.round !== undefined ? 3 : (stand.ahead ?? 4) + ((stand.along ?? 0) * (stand.count - 1)) / 2;
  return { spots, aim: at.clone().addScaledVector(forward, aimAhead) };
}

/** The foes risen at `spots`, standing dazed (still, thinking of nothing), each holding `lives[i]` of its life. */
async function foesAt(lab: Lab, spots: THREE.Vector3[], lives: number[]): Promise<Enemy[]> {
  const kind = foeKind();
  const foes = spots.map((spot) => lab.spawnFoe(kind, spot));
  await lab.until(() => foes.every((foe) => foe.spawning <= 0), RISE_FRAMES, 'the foes never rose');
  foes.forEach((foe, i) => {
    foe.dazed = 999;
    foe.life = lives[i];
  });
  return foes;
}

/** Each foe's hits counted as they land: the last one's damage, the killing hit's once it's dead. */
function countHits(foes: Enemy[]): number[] {
  const last = foes.map(() => 0);
  foes.forEach((foe, i) => {
    const takeDamage = foe.takeDamage.bind(foe);
    foe.takeDamage = (amount, info) => {
      if (foe.alive) last[i] = amount;
      return takeDamage(amount, info);
    };
  });
  return last;
}

/** A body's points as drawn: each joint's place in the world (the head's middle, above its joint) and its size. */
function drawnPoint(joints: Joints, name: (typeof RAGDOLL_POINTS)[number], out: THREE.Vector3): THREE.Vector3 {
  joints[name].getWorldPosition(out);
  if (name !== 'head') return out;
  const scale = joints.head.getWorldScale(new THREE.Vector3()).x;
  const up = new THREE.Vector3(0, joints.P.headR * scale, 0).applyQuaternion(joints.head.getWorldQuaternion(new THREE.Quaternion()));
  return out.add(up);
}

/** The worst `worst` and this frame's `amount` of a part, kept if it's worse. */
function worse(worst: Worst, amount: number, part: string, at: number): void {
  if (amount <= worst.amount) return;
  worst.amount = amount;
  worst.part = part;
  worst.at = at;
}

/** How deep a point of size `radius` at `point` is in a prop (m; 0 out of every one). */
function depthInProps(point: THREE.Vector3, radius: number): number {
  let deepest = 0;
  for (const prop of G.arena.obstacles) {
    const reach = prop.r + radius - Math.hypot(point.x - prop.x, point.z - prop.z);
    const below = groundHeight(prop.x, prop.z) + prop.h - (point.y - radius);
    if (reach > 0 && below > 0) deepest = Math.max(deepest, Math.min(reach, below));
  }
  return deepest;
}

/** A fallen body measured as drawn this frame, `since` s after its fall. */
function measureBody(body: Fallen, since: number): void {
  const corpse = body.foe.corpse;
  const ragdoll = corpse?.ragdoll;
  const joints = body.foe.model.joints;
  if (!ragdoll || !joints) return;
  const at = new THREE.Vector3();
  const point = new THREE.Vector3();
  RAGDOLL_BONES.forEach(([from, to], i) => {
    const length = ragdoll.point(RAGDOLL_POINTS.indexOf(from), at).distanceTo(ragdoll.point(RAGDOLL_POINTS.indexOf(to), point));
    body.bones[i] ??= length;
    worse(body.stretch, Math.abs(length / body.bones[i] - 1), `${from} to ${to}`, since);
  });
  RAGDOLL_POINTS.forEach((name, i) => {
    drawnPoint(joints, name, at);
    if (![at.x, at.y, at.z].every(Number.isFinite)) body.broken = true;
    const radius = ragdoll.radius(i);
    worse(body.under, groundHeight(at.x, at.z) + radius - at.y - UNDER_MOST / 2, name, since);
    worse(body.inProp, depthInProps(at, radius), name, since);
    worse(body.poseOff, at.distanceTo(ragdoll.point(i, point)), name, since);
  });
  const hips = joints.hips.getWorldPosition(at);
  body.highest = Math.max(body.highest, hips.y - groundHeight(hips.x, hips.z));
  if (Math.hypot(hips.x, hips.z) > G.arena.radius + 0.05) body.outside = true;
}

/** One cast at the foes, followed until every body has dissolved: the bodies, each foe's killing hit (0 for one left
 *  standing), and the moments pictured. */
interface Cast {
  bodies: Fallen[];
  killedBy: number[];
  /** the foes left alive */
  standing: number;
  moments: Pictured[];
  canary: { under: boolean; back: boolean };
  /** which way the hero's swing went as the first body fell (+1 from his right to his left) */
  swing: number;
}

/** A body followed from the frame it fell (`frame` from the press). */
function fallen(foe: Enemy, dealt: number, frame: number): Fallen {
  const joints = foe.model.joints;
  const hips = joints ? joints.hips.getWorldPosition(new THREE.Vector3()) : foe.pos.clone();
  return {
    foe, dealt, fellAt: frame, fling: foe.fling!, from: foe.pos.clone(), early: new THREE.Vector3(),
    standingHips: hips.y - groundHeight(hips.x, hips.z), path: 0, highest: 0, restAt: -1,
    lay: new THREE.Vector3(), layHips: 0, under: noWorst(), inProp: noWorst(), poseOff: noWorst(), stretch: noWorst(),
    bones: [], outside: false, broken: false,
  };
}

/** the frames over which a body's way after its fall is read */
const EARLY_FRAMES = 6;

/** What a pass plants and pictures, and its name in the pictures' labels. */
interface PassPlan {
  canary: boolean;
  pictures: boolean;
  label: string;
}

/** The skill cast at `foes` and every body followed until it has dissolved. */
async function castAt(lab: Lab, skill: BoundSkill, foes: Enemy[], aim: THREE.Vector3, plan: PassPlan): Promise<Cast> {
  const dealt = countHits(foes);
  const bodies = new Map<Enemy, Fallen>();
  const last = new Map<Enemy, THREE.Vector3>();
  const moments: Pictured[] = [];
  const canary = { under: false, back: false };
  const holdFrames = Math.max(1, Math.round(holdFor(skill.def) / frameTime()));
  const pictureFrames = PICTURE_AT.map((at) => Math.round(at / frameTime()));
  let firstFall = -1;
  let pictured = 0;
  let swing = 1;
  await lab.step(SETTLE, () => ({ aim }));
  for (let frame = 0; frame < MOST_FRAMES; frame++) {
    await lab.step(1, () => pressing(skill.key, aim, frame < holdFrames));
    for (const [i, foe] of foes.entries()) {
      if (foe.alive || bodies.has(foe) || !foe.fling) continue;
      const body = fallen(foe, dealt[i], frame);
      bodies.set(foe, body);
      if (plan.canary && !canary.back && foe.corpse?.ragdoll) {
        // (planted: the first body thrown back at the hero, twice as hard as the blow threw it away)
        canary.back = true;
        foe.corpse.ragdoll.throw(-3 * body.fling.vx, 0, -3 * body.fling.vz, body.fling.at);
      }
    }
    if (firstFall < 0 && bodies.size) {
      firstFall = frame;
      swing = G.player.model.swing ?? 1;
    }
    for (const body of bodies.values()) {
      if (!G.enemies.includes(body.foe)) continue;
      const since = (frame - body.fellAt) * frameTime();
      plantUnder(plan.canary, body, canary, since);
      followBody(body, last, frame);
      measureBody(body, since);
    }
    if (plan.pictures && bodies.size && pictureDue(bodies, firstFall, frame, pictured, pictureFrames)) {
      const when = pictured < PICTURE_AT.length ? `${seconds(PICTURE_AT[pictured])} after the first fall` : 'lying still';
      moments.push(await pictureBodies(lab, [...bodies.values()], `${plan.label}, ${when}`));
      pictured++;
    }
    const gone = foes.every((foe) => !G.enemies.includes(foe));
    const standing = foes.filter((foe) => foe.alive).length;
    if (gone || (frame > holdFrames + 240 && standing === foes.length)) break;
  }
  const killedBy = foes.map((foe, i) => (bodies.has(foe) ? dealt[i] : 0));
  const standing = foes.filter((foe) => foe.alive).length;
  return { bodies: [...bodies.values()], killedBy, standing, moments, canary, swing };
}

/** Whether a picture is due this frame: at each of `frames` after the first fall, then once every body lies still. */
function pictureDue(bodies: Map<Enemy, Fallen>, firstFall: number, frame: number, pictured: number, frames: number[]): boolean {
  if (pictured < frames.length) return frame - firstFall === frames[pictured];
  if (pictured > frames.length) return false;
  return [...bodies.values()].every((body) => body.restAt >= 0 || !G.enemies.includes(body.foe));
}

/** With the canary, the first body put a metre under the floor for a frame, a quarter of a second after its fall. */
function plantUnder(on: boolean, body: Fallen, canary: { under: boolean }, since: number): void {
  if (!on || canary.under || since < 0.25) return;
  canary.under = true;
  body.foe.obj.position.y -= 1;
  body.foe.obj.updateMatrixWorld(true);
}

/** A body's way over its first frames, its path along the ground, and when and where it lay still. */
function followBody(body: Fallen, last: Map<Enemy, THREE.Vector3>, frame: number): void {
  const joints = body.foe.model.joints;
  const corpse = body.foe.corpse;
  if (!joints || !corpse?.ragdoll) return;
  const hips = joints.hips.getWorldPosition(new THREE.Vector3());
  const before = last.get(body.foe);
  if (before) body.path += flat(before, hips);
  last.set(body.foe, hips);
  if (frame - body.fellAt === EARLY_FRAMES) {
    body.early.set(hips.x - body.from.x, 0, hips.z - body.from.z).divideScalar(EARLY_FRAMES * frameTime());
  }
  if (body.restAt >= 0 || !corpse.ragdoll.asleep) return;
  body.restAt = (frame - body.fellAt) * frameTime();
  body.lay.copy(hips);
  body.layHips = hips.y - groundHeight(hips.x, hips.z);
}

/** The bodies pictured: the game's view as the player sees it, clipped round them and the hero, and close from the
 *  hero's left and from behind him, framed on where they fell and where they are. */
async function pictureBodies(lab: Lab, bodies: Fallen[], label: string): Promise<Pictured> {
  const points = bodies.flatMap((body) => [body.from.clone(), body.foe.obj.position.clone().setY(1)]);
  points.push(G.player.pos.clone());
  const seen = await lab.screen(label, [], screenArea(points, PICTURE_MARGIN));
  const middle = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(points.length);
  const spread = Math.max(...points.map((point) => flat(point, middle)));
  middle.y = 0.6;
  const close = lab.capture(['left', 'back'], { at: middle, distance: Math.max(6, spread * 3) });
  return { label, tiles: [...seen.tiles, ...close], notes: [] };
}

/** The skill's casts, both passes. */
interface SkillRun {
  skill: BoundSkill;
  hard: Cast;
  bare: Cast;
}

/** The fixture with the command's own spot and facing where it doesn't say. */
function fixtureOf(options: DeathOptions): Fixture {
  const facing = options.fixture.facing ?? (FACING * Math.PI) / 180;
  return { ...options.fixture, at: options.fixture.at ?? SPOT, facing };
}

/** A pass's cast and the skill it was. */
interface Pass {
  skill: BoundSkill;
  cast: Cast;
}

/** The skill cast at foes holding `lives` (1 where it says none), on a fresh set-up. */
async function onePass(lab: Lab, options: DeathOptions, wanted: string, lives: number[], hard: boolean): Promise<Pass> {
  G.arena.restoreProps();
  await lab.setup(fixtureOf(options));
  const hero = G.player;
  const skill = skillNamed(wanted);
  const stand = STANDS[skill.def.impl] ?? { count: 3, ahead: 5, across: 1 };
  hero.cooldowns.clear();
  hero.energy = hero.stats.maxEnergy;
  const { spots, aim } = placesFor(stand, hero.pos, hero.facing);
  const foes = await foesAt(lab, spots, spots.map((_, i) => lives[i] ?? 1));
  const label = `${skill.def.name}, ${hard ? 'a hair from death' : 'with little to spare'}`;
  const plan = { canary: options.canary && hard, pictures: options.pictures && hard, label };
  const cast = await castAt(lab, skill, foes, aim, plan);
  return { skill, cast };
}

/** The hero's skills that deal damage, by their behaviours. */
function damagingSkills(): string[] {
  const impls: string[] = [];
  for (const key of ['mouse0', 'mouse2', '1', '2', '3', '4'] as const) {
    const def = G.player.skillAt(key)?.def;
    if (def && STANDS[def.impl] && !impls.includes(def.impl)) impls.push(def.impl);
  }
  return impls;
}

/** `lab death`: each skill's kills followed as they fall; a problem for each thing a body did that a body can't. */
export async function death(lab: Lab, options: DeathOptions): Promise<Report> {
  await lab.setup(fixtureOf(options));
  const wanted = options.skills.length ? options.skills : damagingSkills();
  const compiledBefore = programsCompiledInGame();
  const lateBefore = lateCompiles.length;
  const lines: string[] = [`${G.player.cls.id}, ${foeKind()}s, ${G.arena.biome}`];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  let canaries: Canaries = { under: false, back: false, underCaught: false, backCaught: false };
  for (const name of wanted) {
    const hard = await onePass(lab, options, name, [], true);
    const lives = hard.cast.killedBy.map((dealt) => Math.max(1, dealt * BARE_SHARE));
    const bare = await onePass(lab, options, name, lives, false);
    const run: SkillRun = { skill: hard.skill, hard: hard.cast, bare: bare.cast };
    const judged = judge(run, options.canary);
    lines.push(...judged.lines);
    problems.push(...judged.problems);
    moments.push(...hard.cast.moments);
    if (options.canary) canaries = mergeCanary(canaries, hard.cast, judged);
  }
  const compiled = programsCompiledInGame() - compiledBefore;
  lines.push(`shaders compiled meanwhile: ${compiled}`);
  for (const late of lateCompiles.slice(lateBefore)) lines.push(`  ${late}`);
  if (compiled > 0) problems.push(`${compiled} shaders compiled as the bodies fell`);
  if (!options.canary) return { text: lines.join('\n'), problems, moments };
  return canaryReport(lines, canaries, moments);
}

/** What the canary's plants came to, over the skills so far. */
interface Canaries {
  under: boolean;
  back: boolean;
  underCaught: boolean;
  backCaught: boolean;
}

/** The canary's plants so far, with a skill's. */
function mergeCanary(was: Canaries, cast: Cast, judged: Judged): Canaries {
  return {
    under: was.under || cast.canary.under,
    back: was.back || cast.canary.back,
    underCaught: was.underCaught || judged.caughtUnder,
    backCaught: was.backCaught || judged.caughtBack,
  };
}

/** With the canary, its plants caught or missed: missed ones are the problems (what the checks caught isn't). */
function canaryReport(lines: string[], canaries: Canaries, moments: Pictured[]): Report {
  const missed: string[] = [];
  if (!canaries.under) missed.push('the canary never put a body under the floor');
  else if (!canaries.underCaught) missed.push('the canary\'s body under the floor went unseen');
  if (!canaries.back) missed.push('the canary never threw a body back');
  else if (!canaries.backCaught) missed.push('the canary\'s body thrown back at the hero went unseen');
  lines.push(`canary: under the floor ${canaries.underCaught ? 'caught' : 'missed'}, `
    + `thrown back ${canaries.backCaught ? 'caught' : 'missed'}`);
  return { text: lines.join('\n'), problems: missed, moments };
}

/** A skill's lines and problems, and whether it caught the canary's plants. */
interface Judged {
  lines: string[];
  problems: string[];
  caughtUnder: boolean;
  caughtBack: boolean;
}

const speedOf = (fling: Fling): number => Math.hypot(fling.vx, fling.vy, fling.vz);
const mean = (values: number[]): number => (values.length ? values.reduce((sum, each) => sum + each, 0) / values.length : 0);
const range = (values: number[], shown: (value: number) => string): string => (values.length
  ? `${shown(mean(values))} (${shown(Math.min(...values))} to ${shown(Math.max(...values))})` : 'none');

/** The pass's bodies as a line: how hard each was thrown, how far it flew and how high, when it lay still. */
function passLine(name: string, cast: Cast): string {
  const bodies = cast.bodies;
  const thrown = range(bodies.map((body) => speedOf(body.fling)), (speed) => `${speed.toFixed(1)} m/s`);
  const flew = range(bodies.map((body) => flat(body.from, body.restAt >= 0 ? body.lay : body.from)), metres);
  const high = range(bodies.map((body) => body.highest), metres);
  const rest = bodies.filter((body) => body.restAt >= 0).map((body) => body.restAt);
  const styles = [...new Set(bodies.map((body) => body.fling.style))].join(', ');
  return `  ${name}: ${bodies.length} fell (${styles}), ${cast.standing} left standing; thrown ${thrown}, flew ${flew}, `
    + `its hips up to ${high}, still after ${range(rest, seconds)} (${rest.length} of ${bodies.length})`;
}

/** Whether the body went the way its blow drove it: away from the hero (round the storm for a storm's), along the
 *  swing for a sword's. */
function wayProblems(run: SkillRun, cast: Cast, body: Fallen): string[] {
  const impl = run.skill.def.impl;
  const hero = G.player.pos;
  const out = new THREE.Vector3(body.from.x - hero.x, 0, body.from.z - hero.z).normalize();
  const way = body.early;
  if (way.length() < 0.3 || WHIRLS.has(impl)) return [];
  const problems: string[] = [];
  if (way.dot(out) <= 0) problems.push(`a body went back towards the hero (${way.length().toFixed(1)} m/s)`);
  if (SWINGS.has(impl)) {
    const round = way.x * out.z - way.z * out.x;
    if (Math.sign(round) !== Math.sign(cast.swing)) problems.push('a body went against the swing');
  }
  return problems;
}

/** Whether the storm's body went round it: its path well over its way from where it fell, and up. */
function whirlProblems(run: SkillRun, body: Fallen): string[] {
  if (!WHIRLS.has(run.skill.def.impl)) return [];
  const straight = flat(body.from, body.restAt >= 0 ? body.lay : body.foe.obj.position);
  if (body.path >= WHIRL_PATH * Math.max(1, straight) && body.highest > 1) return [];
  return [`a body the storm killed didn't go round it (its path ${metres(body.path)}, up to ${metres(body.highest)})`];
}

/** What a body did that a body can't, as problems. */
function bodyProblems(body: Fallen): string[] {
  const problems: string[] = [];
  const at = (worst: Worst) => `the ${worst.part}, ${seconds(worst.at)} after its fall`;
  if (body.broken) problems.push('a body\'s place went NaN');
  const under = body.under.amount + UNDER_MOST / 2;
  if (under > UNDER_MOST) problems.push(`a body ${centimetres(under)} under the floor (${at(body.under)})`);
  const into = body.inProp.amount;
  if (into > PROP_MOST) problems.push(`a body ${centimetres(into)} into a prop (${at(body.inProp)})`);
  const off = body.poseOff.amount;
  if (off > POSE_MOST) problems.push(`a body posed ${centimetres(off)} off its points (${at(body.poseOff)})`);
  const stretched = body.stretch.amount;
  if (stretched > STRETCH_MOST) problems.push(`a bone stretched ${percentOf(stretched)} (${at(body.stretch)})`);
  if (body.outside) problems.push('a body past the arena\'s wall');
  const shattered = body.fling.style === 'frozen';
  if (!shattered && body.restAt >= 0 && body.layHips > body.standingHips * LYING_MOST) {
    problems.push(`a body lay with its hips ${metres(body.layHips)} up (standing, ${metres(body.standingHips)})`);
  }
  return problems;
}

/** A skill's two passes judged: its lines, and a problem for each thing its bodies did that they mustn't. */
function judge(run: SkillRun, canary: boolean): Judged {
  const { skill, hard, bare } = run;
  const name = `${skill.def.name} (${skill.key})`;
  const lines = [name, passLine('a hair from death', hard), passLine('with little to spare', bare)];
  const all = [...hard.bodies, ...bare.bodies];
  const worstUnder = Math.max(0, ...all.map((body) => body.under.amount + UNDER_MOST / 2));
  const worstPose = Math.max(0, ...all.map((body) => body.poseOff.amount));
  const worstStretch = Math.max(0, ...all.map((body) => body.stretch.amount));
  lines.push(`  at the worst: under the floor ${centimetres(worstUnder)}, the pose off its points ${centimetres(worstPose)}, `
    + `a bone stretched ${percentOf(worstStretch)}`);
  const found = new Set<string>();
  if (!hard.bodies.length) found.add('nothing fell');
  for (const cast of [hard, bare]) {
    for (const body of cast.bodies) {
      const each = [...bodyProblems(body), ...wayProblems(run, cast, body), ...whirlProblems(run, body)];
      for (const problem of each) found.add(problem);
    }
  }
  const hardThrow = mean(hard.bodies.map((body) => speedOf(body.fling)));
  const bareThrow = mean(bare.bodies.map((body) => speedOf(body.fling)));
  if (hard.bodies.length && bare.bodies.length && bareThrow >= hardThrow) {
    const speeds = `${bareThrow.toFixed(1)} m/s against ${hardThrow.toFixed(1)}`;
    found.add(`killed with little to spare, they were thrown as hard (${speeds})`);
  }
  const problems = [...found].map((problem) => `${skill.def.name}: ${problem}`);
  for (const problem of found) lines.push(`  ! ${problem}`);
  const caughtUnder = canary && [...found].some((problem) => problem.includes('under the floor'));
  const caughtBack = canary && [...found].some((problem) => problem.includes('back towards the hero'));
  return { lines, problems: canary ? [] : problems, caughtUnder, caughtBack };
}
