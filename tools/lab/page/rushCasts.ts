// Skills cast with Bull Rush (tools/lab `rush`): one being cast as the charge is cast goes on through it and lands as
// it runs (Power Strike charged, the charge cast, the strike landed in its run), one held goes on through it (Steel
// Tempest spinning, the shield raised, the charge cast over them), one pressed as it runs is cast at once (a cleave,
// and Twin Fangs, whose lunge rides on the charge), and one pressed at its stop too. Each is followed frame by frame
// on a fresh set-up, dazed foes standing on the charge's line: whether each skill was cast as it was pressed, when the
// one looked at landed against the charge's run and what it struck, what the charge's own blows struck (every foe on
// its line, whatever was cast with it), whether a held skill was held through its run, the action the hero showed
// while a skill and the charge ran together (the skill's, not the charge's), his feet as he ran against the charge
// cast alone at the same point of it (the charge's strides under the skill, each foot where his hips have it in the
// charge's own: left to the legs stepping as he walks, they spread in a lunge as the body sped off; through the eyes,
// where the arms alone are drawn, unseen), and how far the charge took him. A combo whose skills the weapons held
// don't allow (Twin Fangs needs two, Raise Shield a shield) is left out.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import type { DashOpts, Player } from '../../../src/entities/player';
import type { ActionState, SkillKey } from '../../../src/types';
import { G } from '../../../src/state';
import * as renderer from '../../../src/core/renderer';
import { bindKnown, holdingAll, skillNamed } from './cast';
import { foeKind } from './death';
import { fixtureOf, waysOf, type RushOptions } from './rush';

/** What the canary plants in a cast: the skill hidden behind the charge as both run, the charge's legs dropped from
 *  under it (the legs left to step as he walks), its blows made harmless (the foes kept from harm as its dash steps),
 *  the skill held let go as the charge is pressed, or the charge cut short as the skill cast in it lands. */
type Plant = 'hidden' | 'legless' | 'harmless' | 'dropped' | 'short';

/** the words of the problem each plant makes, which its canary looks for */
const PLANT_MARKS: Record<Plant, string> = {
  hidden: 'shown instead',
  legless: 'own strides',
  harmless: 'foes on its line',
  dropped: 'let go',
  short: 'the charge covered',
};

/** A cast with the charge: the skill pressed first (its key held on until the charge is over where the combo `holds`
 *  it: a channel), the one pressed once `when` says (none: the charge alone), and the one whose landing is looked at:
 *  in the charge's run or anywhere, and striking a foe or not. */
interface Combo {
  name: string;
  first: string;
  then: string | null;
  when: (hero: Player) => boolean;
  holds: boolean;
  lands: string | null;
  inRun: boolean;
  strikes: boolean;
  plant: Plant | null;
}

/** the charge's skill */
const CHARGE = 'bullRush';
/** the charge's run: the hero going this many times his walk's speed in a dash */
const RUN_SPEED = 1.5;
/** Power Strike's charge-up this long from its blow as the charge is cast (s): about the charge's brace and half its
 *  run, so the blow lands in the run */
const LEAD = 0.35;
/** a held skill under way this long as the charge is cast over it (s): Steel Tempest up to its speed */
const SETTLED = 0.4;

const running = (hero: Player): boolean => {
  const speed = Math.hypot(hero.vel.x, hero.vel.z);
  return hero.dash !== null && speed > hero.stats.moveSpeed * RUN_SPEED;
};
const strikeDue = (hero: Player): boolean => {
  const cast = hero.casting;
  return cast !== null && cast.fireAt - cast.t <= LEAD;
};
const stopped = (hero: Player): boolean => hero.dash !== null && hero.dash.t >= hero.dash.dur;
const settled = (hero: Player): boolean => (hero.channel?.t ?? 0) >= SETTLED;

const COMBOS: Combo[] = [
  {
    name: 'the charge alone', first: CHARGE, then: null, when: () => false, holds: false,
    lands: null, inRun: false, strikes: false, plant: 'harmless',
  },
  {
    name: 'Power Strike charged, the charge cast over it', first: 'powerStrike', then: CHARGE, when: strikeDue,
    holds: false, lands: 'powerStrike', inRun: true, strikes: true, plant: 'hidden',
  },
  {
    name: 'a cleave in the charge', first: CHARGE, then: 'cleave', when: running, holds: false,
    lands: 'cleave', inRun: true, strikes: true, plant: 'legless',
  },
  {
    name: 'Power Strike charged in the charge', first: CHARGE, then: 'powerStrike', when: running, holds: false,
    lands: 'powerStrike', inRun: false, strikes: false, plant: null,
  },
  {
    name: 'Power Strike at the charge\'s stop', first: CHARGE, then: 'powerStrike', when: stopped, holds: false,
    lands: 'powerStrike', inRun: false, strikes: false, plant: null,
  },
  {
    name: 'the charge cast as Steel Tempest spins', first: 'tempest', then: CHARGE, when: settled, holds: true,
    lands: null, inRun: false, strikes: false, plant: 'dropped',
  },
  {
    name: 'the charge cast with the shield raised', first: 'raiseShield', then: CHARGE, when: settled, holds: true,
    lands: null, inRun: false, strikes: false, plant: null,
  },
  {
    name: 'Twin Fangs in the charge', first: CHARGE, then: 'twinFangs', when: running, holds: false,
    lands: 'twinFangs', inRun: true, strikes: true, plant: 'short',
  },
];

/** the foes standing on the charge's line (m ahead, m to his left), living past every blow */
const FOES: [number, number][] = [[4, 0], [6.5, 0.3]];
const LIVING = 1e5;
const RISE_FRAMES = 300;
const SETTLE = 10;
/** frames looked at from the first press, at most, and after both skills and the charge are done */
const MOST_FRAMES = 360;
const AFTER = 6;
/** how far the aim is ahead of the hero (m): the charge's whole range, carried along with him as a still mouse is */
const AIM_AHEAD = 9;
/** a foot this far from where the hips have it in the charge's own strides, at the same point of the charge, is off
 *  them (m): under a skill's crouch the knees bend to keep the feet on the floor, up to 12 cm off; a stride frozen
 *  by the pose's fade as a skill began or ended left a foot 39 to 45 cm off */
const STRIDE_OFF = 0.2;
/** the charge covering less than this share of its range fell short */
const COVERS = 0.95;

const metres = (value: number): string => `${value.toFixed(2)} m`;
const centimetres = (value: number): string => `${(value * 100).toFixed(0)} cm`;
const seconds = (value: number): string => `${value.toFixed(2)} s`;
const frameTime = (): number => window.__labClock.frame / 1000;

/** A skill of a cast followed: when it was pressed, when it was taken up (cast, begun casting or held) and when it
 *  landed (frames from the first press; -1: never), and the foes its blows struck and the damage they dealt. */
interface Followed {
  name: string;
  impl: string;
  pressedAt: number;
  takenAt: number;
  landedAt: number;
  struck: Set<Enemy>;
  dealt: number;
}

/** What the hooks on the hero see of a frame: which it is, the skill whose blows land now (the one firing, or the one
 *  whose dash steps: any other blow is the combo's other skill's, a channel's or a lunge's timed cuts) and the action
 *  shown. */
interface Watch {
  frame: number;
  striking: Followed | null;
  shown: ActionState | null;
}

/** One cast with the charge, as followed. */
interface Cast {
  combo: Combo;
  skills: Followed[];
  /** the frames of the charge's run (first, last; -1: never ran), how many, and how many of them the skill held was */
  runFrom: number;
  runTo: number;
  runFrames: number;
  heldIn: number;
  /** frames a skill and the charge ran together, and those the charge was shown in instead of the skill */
  together: number;
  hidden: number;
  /** each foot as he ran, where his hips have it (their own frame), by the frames into the charge */
  strides: Map<number, THREE.Vector3[]>;
  covered: number;
  range: number;
  planted: boolean;
  moment: Pictured | null;
}

/** The cast's skills, pressed in turn, landed and struck as the hero's `fire` lands them. */
function skillsOf(combo: Combo): Followed[] {
  const names = [combo.first, ...(combo.then ? [combo.then] : [])];
  return names.map((wanted) => {
    bindKnown(wanted);
    const skill = skillNamed(wanted);
    const name = skill.def.name;
    return { name, impl: skill.def.impl, pressedAt: -1, takenAt: -1, landedAt: -1, struck: new Set<Enemy>(), dealt: 0 };
  });
}

/** Whether the hero can cast each of `combo`'s skills with the weapons he holds. */
function castable(hero: Player, combo: Combo): boolean {
  const names = [combo.first, ...(combo.then ? [combo.then] : [])];
  const usable = [...hero.known.values()].filter((known) => hero.usable(known.def));
  return names.every((name) => usable.some((known) => known.def.impl === name));
}

/** The hero's dazed foes on the line before him (the lobby's training dummies, with `dummies`). */
async function foesBefore(lab: Lab, at: THREE.Vector3, facing: number, dummies: boolean): Promise<Enemy[]> {
  const { forward, left } = waysOf(facing);
  const foes = FOES.map(([ahead, across]) => {
    const spot = at.clone().addScaledVector(forward, ahead).addScaledVector(left, across);
    return lab.spawnFoe(dummies ? 'dummy' : foeKind(), spot);
  });
  await lab.until(() => foes.every((foe) => foe.spawning <= 0), RISE_FRAMES, 'the foes never rose');
  for (const foe of foes) {
    foe.dazed = 999;
    foe.life = LIVING;
  }
  return foes;
}

/** Whether `skill` has been taken up: being cast or held, or landed. */
function taken(hero: Player, skill: Followed): boolean {
  if (skill.landedAt >= 0) return true;
  return hero.casting?.skill.def.impl === skill.impl || hero.channel?.skill.def.impl === skill.impl;
}

/** The action of the skill under way, if one is (being cast, held, or a dash riding on the hero's), as his pose names
 *  it. */
function underWay(hero: Player): string | null {
  if (hero.casting) return hero.casting.skill.impl.anim || 'cast';
  if (hero.channel) return hero.channel.skill.impl.anim || 'channel';
  return hero.dash?.ride?.anim ?? null;
}

/** The canary's plant on the action the hero shows, as both a skill and the charge run. */
function plantOn(plant: Plant | null, hero: Player, action: ActionState | null): ActionState | null {
  const dash = hero.dash;
  if (!action || !dash || !underWay(hero)) return action;
  if (plant === 'hidden') return { name: 'charge', t: Math.min(1, dash.t / (dash.dur + dash.hold)) };
  if (plant !== 'legless') return action;
  const legless = { ...action };
  delete legless.under;
  return legless;
}

/** `run` with `skill`'s blows the ones landing, as they were after. */
function strikingAs(watch: Watch, skill: Followed | null, run: () => void): void {
  const was = watch.striking;
  watch.striking = skill;
  try {
    run();
  } finally {
    watch.striking = was;
  }
}

/** `run` with `foes` kept from harm. */
function spared(foes: Enemy[], run: () => void): void {
  const kept = foes.filter((foe) => !foe.invulnerable);
  for (const foe of kept) foe.invulnerable = true;
  try {
    run();
  } finally {
    for (const foe of kept) foe.invulnerable = false;
  }
}

/** The hero's feet where his hips have them (in their own frame: the legs' pose, whichever way the hips turn). */
function feetOf(hero: Player): THREE.Vector3[] {
  const joints = hero.model.joints;
  if (!joints) return [];
  return [joints.ankleL, joints.ankleR].map((ankle) => {
    const at = ankle.getWorldPosition(new THREE.Vector3());
    return joints.hips.worldToLocal(at);
  });
}

/** How far `cast`'s feet were off the charge's own strides (`alone`'s) at the same points of it: the furthest (m),
 *  which foot and how far into the charge (s), and over how many frames of the run. */
function offStrides(cast: Cast, alone: Cast): { off: number; foot: string; at: number; frames: number } {
  const worst = { off: 0, foot: '', at: 0, frames: 0 };
  for (const [into, feet] of cast.strides) {
    const own = alone.strides.get(into);
    if (!own || own.length !== feet.length) continue;
    worst.frames++;
    feet.forEach((foot, i) => {
      const off = foot.distanceTo(own[i]);
      if (off <= worst.off) return;
      worst.off = off;
      worst.foot = i === 0 ? 'left' : 'right';
      worst.at = into * frameTime();
    });
  }
  return worst;
}

/** The hooks on the hero for a cast, taken off again by the function returned: what each skill's blows strike (the
 *  foes struck as it fires, as its dash steps, or as any other blow lands, the combo's other skill's), with the
 *  canary's harmless plant none of the charge's, and the action he shows, as the model is told it (with the canary,
 *  its plant). */
function hookOn(hero: Player, cast: Cast, watch: Watch, foes: Enemy[], canary: boolean): () => void {
  const { skills, combo } = cast;
  const other = skills.find((one) => one.impl !== CHARGE) ?? null;
  for (const foe of foes) {
    const takeDamage = foe.takeDamage.bind(foe);
    foe.takeDamage = (amount, info) => {
      const by = watch.striking ?? other;
      by?.struck.add(foe);
      if (by) by.dealt += amount;
      return takeDamage(amount, info);
    };
  }
  const fire = hero.fire.bind(hero);
  hero.fire = (skill, target, power) => {
    const followed = skills.find((one) => one.impl === skill.def.impl) ?? null;
    if (followed && followed.landedAt < 0) followed.landedAt = watch.frame;
    strikingAs(watch, followed, () => fire(skill, target, power));
  };
  const harmless = canary && combo.plant === 'harmless';
  const startDash = hero.startDash.bind(hero);
  hero.startDash = (dir, speed, dur, opts: DashOpts = {}) => {
    const owner = watch.striking;
    const step = opts.step;
    const stepping = () => {
      cast.planted ||= harmless;
      spared(harmless ? foes : [], () => strikingAs(watch, owner, () => step?.()));
    };
    startDash(dir, speed, dur, { ...opts, step: step && owner ? stepping : step });
  };
  const pose = hero.pose.bind(hero);
  hero.pose = (dt, t, move, dir, lean, action) => {
    watch.shown = canary ? plantOn(combo.plant, hero, action) : action;
    cast.planted ||= watch.shown !== action;
    pose(dt, t, move, dir, lean, watch.shown);
  };
  return () => {
    for (const name of ['fire', 'startDash', 'pose']) Reflect.deleteProperty(hero, name);
  };
}

/** `combo` cast on a fresh set-up, followed until its skills and the charge are done. */
async function castWith(lab: Lab, options: RushOptions, combo: Combo): Promise<Cast> {
  G.arena.restoreProps();
  const fixture = fixtureOf(options);
  await lab.setup(fixture);
  const hero = G.player;
  const skills = skillsOf(combo);
  hero.cooldowns.clear();
  hero.energy = hero.stats.maxEnergy;
  const facing = fixture.facing ?? hero.facing;
  const { forward } = waysOf(facing);
  const foes = await foesBefore(lab, hero.pos, facing, Boolean(options.dummies));
  const start = hero.pos.clone();
  const charge = skillNamed(CHARGE).def;
  const aim = () => hero.pos.clone().addScaledVector(forward, AIM_AHEAD);
  const cast: Cast = {
    combo, skills, runFrom: -1, runTo: -1, runFrames: 0, heldIn: 0, together: 0, hidden: 0, strides: new Map(),
    covered: 0, range: charge.range ?? 0, planted: false, moment: null,
  };
  const watch: Watch = { frame: 0, striking: null, shown: null };
  // (the hooks go with the next set-up's hero, the foes with the next set-up)
  const unhook = hookOn(hero, cast, watch, foes, options.canary);
  try {
    await lab.step(SETTLE, () => ({ aim: aim(), sight: aim() }));
    await follow(lab, cast, { aim, watch, pictures: options.pictures, canary: options.canary });
  } finally {
    unhook();
  }
  cast.covered = Math.hypot(hero.pos.x - start.x, hero.pos.z - start.z);
  return cast;
}

/** How a cast is followed: the aim carried along with the hero, the hooks' watch, whether the moment the looked-at
 *  skill lands is pictured, and whether the canary plants its fault. */
interface Following {
  aim: () => THREE.Vector3;
  watch: Watch;
  pictures: boolean;
  canary: boolean;
}

/** A cast's frames: its skills pressed (and held) and taken up, the charge's run, the action shown and the feet. */
async function follow(lab: Lab, cast: Cast, { aim, watch, pictures, canary }: Following): Promise<void> {
  const hero = G.player;
  const [first, then] = cast.skills;
  const looked = cast.skills.find((one) => one.impl === cast.combo.lands);
  // (a held skill is over once taken up: it never lands)
  const over = (skill: Followed) => skill.landedAt >= 0 || (cast.combo.holds && skill.takenAt >= 0);
  let doneFor = 0;
  for (let frame = 0; frame < MOST_FRAMES; frame++) {
    watch.frame = frame;
    watch.shown = null;
    const press = pressFor(hero, cast, frame);
    if (press) press.pressedAt = frame;
    const keys = keysOf(hero, cast, press, canary);
    await lab.step(1, () => holdingAll(keys, aim()));
    for (const skill of cast.skills) {
      if (skill.pressedAt >= 0 && skill.takenAt < 0 && taken(hero, skill)) skill.takenAt = frame;
    }
    if (canary) cutShort(hero, cast, frame);
    lookAt(hero, cast, frame, watch.shown);
    if (pictures && !cast.moment && looked?.landedAt === frame) cast.moment = await picture(lab, cast, looked);
    // (done once the charge and every cast are over, the first skill landed and the second pressed)
    const waiting = !over(first) || (then !== undefined && then.pressedAt < 0);
    doneFor = hero.dash || hero.casting || hero.channel || waiting ? 0 : doneFor + 1;
    if (doneFor >= AFTER) break;
  }
}

/** The moment `skill` lands: the game's view as the player sees it, and the hero close from his left (his legs under
 *  the skill's arms as the charge runs). */
async function picture(lab: Lab, cast: Cast, skill: Followed): Promise<Pictured> {
  const label = `${cast.combo.name}, as ${skill.name} lands`;
  const seen = await lab.screen(label);
  return { label, tiles: [...seen.tiles, ...lab.capture(['left'])], notes: [] };
}

/** The skill to press this frame, if one is due: the first at once, the second once its combo says. */
function pressFor(hero: Player, cast: Cast, frame: number): Followed | null {
  const [first, then] = cast.skills;
  if (frame === 0) return first;
  if (!then || then.pressedAt >= 0 || first.takenAt < 0) return null;
  return cast.combo.when(hero) ? then : null;
}

/** The keys held this frame: the skill pressed, and the first held on where the combo holds it, until the charge is
 *  cast and over (with the canary's plant, let go as the charge is pressed). */
function keysOf(hero: Player, cast: Cast, press: Followed | null, canary: boolean): SkillKey[] {
  const keys = press ? [skillNamed(press.impl).key] : [];
  const [first, then] = cast.skills;
  if (!cast.combo.holds || !then) return keys;
  const done = then.landedAt >= 0 && hero.dash === null;
  const dropped = canary && cast.combo.plant === 'dropped' && then.pressedAt >= 0;
  cast.planted ||= dropped;
  if (done || dropped) return keys;
  return [...new Set([...keys, skillNamed(first.impl).key])];
}

/** The canary's short plant: the charge cut short as the skill cast in it lands (its dash put out of the way, as the
 *  skill's own put in its place would). */
function cutShort(hero: Player, cast: Cast, frame: number): void {
  const [, then] = cast.skills;
  if (cast.combo.plant !== 'short' || !then || then.landedAt !== frame || !hero.dash) return;
  hero.dash = null;
  cast.planted = true;
}

/** A frame's run (and whether the skill held was held in it), action and feet. */
function lookAt(hero: Player, cast: Cast, frame: number, shown: ActionState | null): void {
  const dash = hero.dash;
  if (dash && running(hero)) {
    if (cast.runFrom < 0) cast.runFrom = frame;
    cast.runTo = frame;
    cast.runFrames++;
    if (cast.combo.holds && hero.channel?.skill.def.impl === cast.skills[0].impl) cast.heldIn++;
    cast.strides.set(Math.round(dash.t / frameTime()), feetOf(hero));
  }
  const under = underWay(hero);
  if (!dash || !under) return;
  cast.together++;
  if (shown?.name !== under) cast.hidden++;
}

/** A cast's skill's line: pressed, taken up, landed. */
function skillLine(skill: Followed): string {
  const time = (frame: number) => seconds(frame * frameTime());
  const pressed = `${skill.name} pressed at ${time(skill.pressedAt)}`;
  if (skill.pressedAt < 0) return `${skill.name} never pressed`;
  const takenUp = skill.takenAt < 0 ? 'never cast' : skill.takenAt === skill.pressedAt ? 'cast at once'
    : `cast at ${time(skill.takenAt)}`;
  const landed = skill.landedAt < 0 ? 'never landed' : `landed at ${time(skill.landedAt)}`;
  return `${pressed}, ${takenUp}, ${landed}`;
}

/** Where the looked-at skill landed against the charge's run, as words and its problem. */
function landingOf(cast: Cast): { line: string; problems: string[] } {
  const { combo } = cast;
  const skill = cast.skills.find((one) => one.impl === combo.lands);
  if (!skill) return { line: '', problems: [] };
  const name = `${combo.name}: ${skill.name}`;
  if (skill.landedAt < 0) return { line: `${skill.name} never landed`, problems: [`${name} never landed`] };
  const struck = `striking ${skill.struck.size} of ${FOES.length} foes`;
  const problems: string[] = [];
  if (combo.strikes && skill.struck.size === 0) problems.push(`${name} struck nothing`);
  if (cast.runFrom < 0) return { line: `${skill.name} landed, ${struck}; the charge never ran`, problems };
  const run = (cast.runTo - cast.runFrom + 1) * frameTime();
  const into = (skill.landedAt - cast.runFrom) * frameTime();
  const after = (skill.landedAt - cast.runTo) * frameTime();
  const when = into < 0 ? `${seconds(-into)} before the charge's run of ${seconds(run)}`
    : after > 0 ? `${seconds(after)} after the charge's run of ${seconds(run)}`
      : `${seconds(into)} into the charge's run of ${seconds(run)}`;
  if (combo.inRun && (into < 0 || after > 0)) problems.push(`${name} landed ${when}`);
  return { line: `${skill.name} landed ${when}, ${struck}`, problems };
}

/** What the charge's own blows struck (every foe on its line), and what a skill held through it did, as words and
 *  their problems. */
function blowsOf(cast: Cast): { lines: string[]; problems: string[] } {
  const { combo } = cast;
  const lines: string[] = [];
  const problems: string[] = [];
  const charge = cast.skills.find((skill) => skill.impl === CHARGE);
  if (charge) {
    const blows = `the charge striking ${charge.struck.size} of ${FOES.length} foes on its line`;
    lines.push(`${blows} (${charge.dealt.toFixed(0)} damage)`);
    if (charge.struck.size < FOES.length) problems.push(`${combo.name}: ${blows}`);
  }
  if (!combo.holds) return { lines, problems };
  const [first] = cast.skills;
  const run = `the ${cast.runFrames} frames of the charge's run`;
  lines.push(`${first.name} held ${cast.heldIn} of ${run}, striking ${first.struck.size} of ${FOES.length} foes`);
  const lost = cast.runFrames - cast.heldIn;
  if (lost > 0) problems.push(`${combo.name}: ${first.name} let go for ${lost} of ${run}`);
  return { lines, problems };
}

/** A cast's lines and problems, its feet against the charge's own (`alone`'s) where his legs are seen. */
function judge(cast: Cast, alone: Cast, legsSeen: boolean): { lines: string[]; problems: string[] } {
  const { combo } = cast;
  const lines = [`  ${combo.name}:`, ...cast.skills.map((skill) => `    ${skillLine(skill)}`)];
  const problems: string[] = [];
  for (const skill of cast.skills) {
    if (skill.pressedAt >= 0 && skill.takenAt !== skill.pressedAt) {
      problems.push(`${combo.name}: ${skill.name} not cast as it was pressed`);
    }
  }
  const landing = landingOf(cast);
  if (landing.line) lines.push(`    ${landing.line}`);
  problems.push(...landing.problems);
  const blows = blowsOf(cast);
  lines.push(...blows.lines.map((line) => `    ${line}`));
  problems.push(...blows.problems);
  if (cast.together > 0) {
    const shown = cast.together - cast.hidden;
    lines.push(`    a skill and the charge together ${cast.together} frames, the skill shown in ${shown}`);
    if (cast.hidden > 0) problems.push(`${combo.name}: the charge shown instead of the skill ${cast.hidden} frames`);
  }
  if (cast !== alone && !legsSeen) lines.push('    his legs unseen through the eyes (the arms alone drawn)');
  if (cast !== alone && legsSeen) {
    const { off, foot, at, frames } = offStrides(cast, alone);
    const worst = foot ? ` (the ${foot}, ${seconds(at)} into it)` : '';
    const over = `over ${frames} frames of its run`;
    const feet = `feet at most ${centimetres(off)} off the charge's own strides${worst}, ${over}`;
    lines.push(`    ${feet}`);
    if (off > STRIDE_OFF || frames === 0) problems.push(`${combo.name}: ${feet}`);
  }
  lines.push(`    the charge covering ${metres(cast.covered)} of ${metres(cast.range)}`);
  if (cast.covered < cast.range * COVERS) {
    problems.push(`${combo.name}: the charge covered ${metres(cast.covered)} of its ${metres(cast.range)}`);
  }
  for (const problem of problems) lines.push(`    ! ${problem}`);
  return { lines, problems };
}

/** The casts with the charge: their lines, problems and moments; with the canary, its plants and whether each was
 *  caught (the plant's combo showing the problem it makes). */
export async function castsWithRush(lab: Lab, options: RushOptions): Promise<{
  lines: string[]; problems: string[]; moments: Pictured[]; canary: string[];
}> {
  const lines = ['  skills cast with the charge:'];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  const canary: string[] = [];
  let alone: Cast | null = null;
  const legsSeen = renderer.viewMode() !== 'first';
  for (const each of COMBOS) {
    if (!castable(G.player, each)) {
      lines.push(`    ${each.name}: not with the weapons held this way`);
      continue;
    }
    // (the legs' canary planted only where they are seen)
    const combo = legsSeen || each.plant !== 'legless' ? each : { ...each, plant: null };
    const cast = await castWith(lab, options, combo);
    alone ??= cast;
    const judged = judge(cast, alone, legsSeen);
    lines.push(...judged.lines.map((line) => `  ${line}`));
    if (cast.moment) moments.push(cast.moment);
    if (!options.canary) problems.push(...judged.problems);
    if (!options.canary || !combo.plant) continue;
    const caught = judged.problems.some((problem) => problem.includes(PLANT_MARKS[combo.plant!]));
    if (!cast.planted) canary.push(`the canary never planted ${combo.plant} in ${combo.name}`);
    else if (!caught) canary.push(`the canary's ${combo.plant} in ${combo.name} went unseen`);
    lines.push(`    canary: ${combo.plant} in ${combo.name} ${cast.planted && caught ? 'caught' : 'missed'}`);
  }
  return { lines, problems, moments, canary };
}
