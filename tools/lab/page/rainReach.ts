// Hailfletch kept off the ranger and the foes striking at him (tools/lab `rainreach`; from the owner: "should not be
// possible to cast on himself or any foes currently attacking him... so adjust min cast distance"). One foe of every
// kind that strikes in melee (no boss) stands round him just inside the reach its blow lands from, held there and kept
// from striking, and the rain is held as the player holds it, aimed at his feet, at one of those foes, a few metres
// ahead, swung from behind him to ahead past his side, at the wall beyond him, and by touch (the skill's button held
// with no drag, which aims at the nearest foe, and dragged a little), in each view. Every frame the area's middle must
// stay as far from him as the foes' numbers need (their longest blow, the widest of them and the area's radius), and
// no arrow may strike a foe in reach. A foe out beyond them, the rain aimed on it, must be struck: the rain fell.
import * as THREE from 'three';
import { middleOf, type Fixture, type Frame, type Lab, type Report } from './lab';
import type { ViewMode } from '../../../src/core/renderer';
import type { Enemy } from '../../../src/entities/enemy';
import type { EnemyId } from '../../../src/data/enemies';
import type { EnemyDef, SkillDef } from '../../../src/types';
import { G } from '../../../src/state';
import { ENEMIES } from '../../../src/data/enemies';
import { HERO_RADIUS } from '../../../src/entities/player';
import { bindKnown, pressing, skillNamed, type BoundSkill } from './cast';
import { element, showTouchControls } from './touchStick';

export interface RainReachOptions {
  /** the views tried (all three by default) */
  views: ViewMode[];
  /** try the touch cases too (top-down, after the views) */
  touch: boolean;
  /** plant the fault the checks must catch: the skill's least distance taken to nothing */
  canary: boolean;
}

/** a melee blow lands on the hero within its `range`, his radius and this (m: enemyAI's `melee`, `meleeStrike`) */
const BLOW_SLACK = 0.3;
/** a falling arrow strikes a foe within its radius and this (m: arrowRain's `STRIKE`) */
const STRIKE = 0.3;
/** how far inside its reach each foe stands (m) */
const INSIDE = 0.05;
/** where he stands (x, z) and the way he faces (rad): off the dais, clear of props, the wall 10 m behind him */
const SPOT: [number, number] = [-11, -12];
const FACING = Math.PI / 2;
/** how far ahead the far foe stands, the rain aimed on it (m) */
const FAR = 13;
/** the far foe's kind: a wide one, struck by a few arrows of every shower */
const FAR_KIND: EnemyId = 'brute';
/** how long the key is held, and how long what's in the air is followed after (s) */
const HOLD = 5;
const AFTER = 2;
/** frames a foe has to rise */
const RISE_FRAMES = 120;
/** a foe's life: past every arrow */
const LIVING = 1e5;
/** the area's middle stays this far inside the arena's radius (m: arrowRain's `areaAt`) */
const WALL_IN = 1;
/** a touch drag up the screen, px (some 3 m of aim: ui/touch.ts `DRAG_PX_PER_M`) */
const DRAG_PX = 30;

const frameTime = (): number => window.__labClock.frame / 1000;

/** How a case aims: a point on the ground the mouse (and the close views' crosshair) is held on, by the share of the
 *  hold gone; or by touch. */
type Aim = { by: 'mouse'; at: (share: number) => THREE.Vector3 } | { by: 'touch'; drag: boolean };

/** A case: its name, how it aims, and whether its aim must come inside the least distance (or it measured nothing). */
interface Case {
  name: string;
  aim: Aim;
  inside: boolean;
  /** he stands facing the wall, its aim out at it */
  atWall?: boolean;
}

/** A foe held round the hero: its spot, and the arrows that struck it. */
interface Held {
  foe: Enemy;
  spot: THREE.Vector3;
  struck: number;
}

/** What a case measured. */
interface Measured {
  /** the area's middle at its nearest to him (m; Infinity: no area) */
  nearest: number;
  /** the game's aim at its nearest to him while the key was held (m) */
  aimed: number;
  /** the area's middle at its furthest past where the arena lets it go (m past its radius less a metre; 0: never) */
  outside: number;
  /** arrows that struck a foe in reach, and the far foe */
  inReach: number;
  far: number;
}

/** The kinds of foe that strike in melee, bosses left out. */
function meleeKinds(): EnemyId[] {
  const kinds = Object.keys(ENEMIES) as EnemyId[];
  return kinds.filter((id) => !ENEMIES[id].boss && (ENEMIES[id].ai === 'melee' || ENEMIES[id].ai === 'slam'));
}

/** How far from the hero's middle a foe's blow lands (m). */
const reachOf = (def: EnemyDef): number => def.range + HERO_RADIUS + BLOW_SLACK;

/** How far from the hero the area's middle must stay so that no arrow strikes a foe of `kinds` in reach (m). */
function neededFor(kinds: EnemyId[], skill: SkillDef): number {
  const widest = Math.max(...kinds.map((id) => reachOf(ENEMIES[id]) + ENEMIES[id].radius + STRIKE));
  return widest + (skill.radius ?? 0);
}

/** The point `ahead` m before him and `aside` m to his left (as he faces, or facing `facing`). */
function before(ahead: number, aside = 0, facing = G.player.facing): THREE.Vector3 {
  const way = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
  const left = new THREE.Vector3(way.z, 0, -way.x);
  return G.player.pos.clone().setY(0).addScaledVector(way, ahead).addScaledVector(left, aside);
}

/** The ring's first foe, which a case aims at, as the case's set-up stood it. */
let firstFoe = new THREE.Vector3();

/** The cases aimed by the mouse (and the close views' crosshair). */
function mouseCases(): Case[] {
  const mouse = (at: (share: number) => THREE.Vector3): Aim => ({ by: 'mouse', at });
  return [
    { name: 'his feet', aim: mouse(() => before(0)), inside: true },
    { name: 'a foe in reach', aim: mouse(() => firstFoe.clone()), inside: true },
    { name: '4 m ahead', aim: mouse(() => before(4)), inside: true },
    { name: 'swung past him', aim: mouse((share) => before(-12 + 24 * share, 1)), inside: true },
    { name: 'the far foe', aim: mouse(() => before(FAR)), inside: false },
    { name: 'the wall', aim: mouse(() => before(10)), inside: false, atWall: true },
  ];
}

/** The touch cases: the button held without a drag, and dragged a little. */
const TOUCH_CASES: Case[] = [
  { name: 'touch, held', aim: { by: 'touch', drag: false }, inside: true },
  { name: 'touch, dragged', aim: { by: 'touch', drag: true }, inside: true },
];

/** A foe of `kind` risen at `spot`, standing as the training dummy does, the arrows that strike it counted. */
async function standFoe(lab: Lab, kind: EnemyId, spot: THREE.Vector3): Promise<Held> {
  const foe = lab.spawnFoe(kind, spot);
  Object.assign(foe, { def: { ...foe.def, ai: 'idle', evade: undefined } });
  const held: Held = { foe, spot: spot.clone(), struck: 0 };
  const takeDamage = foe.takeDamage.bind(foe);
  foe.takeDamage = (amount, info) => {
    held.struck++;
    return takeDamage(amount, info);
  };
  await lab.until(() => foe.spawning <= 0, RISE_FRAMES, `the ${kind} never rose`);
  return held;
}

/** Each melee kind stood round him just inside its reach, and the far foe ahead. */
async function standFoes(lab: Lab, kinds: EnemyId[]): Promise<{ ring: Held[]; far: Held }> {
  const ring: Held[] = [];
  for (const [i, kind] of kinds.entries()) {
    const turn = G.player.facing + (i / kinds.length) * Math.PI * 2;
    const reach = reachOf(ENEMIES[kind]) - INSIDE;
    const way = new THREE.Vector3(Math.sin(turn), 0, Math.cos(turn));
    const spot = G.player.pos.clone().setY(0).addScaledVector(way, reach);
    ring.push(await standFoe(lab, kind, spot));
  }
  // (ahead as he stands in most cases: facing the wall, it stands to his side)
  const far = await standFoe(lab, FAR_KIND, before(FAR, 0, FACING));
  return { ring, far };
}

/** The foes back on their spots, kept from striking and from dying, and the hero's energy full. */
function keepAll(held: Held[]): void {
  for (const each of held) {
    each.foe.pos.set(each.spot.x, each.foe.pos.y, each.spot.z);
    each.foe.cd = 99;
    each.foe.life = LIVING;
  }
  G.player.energy = G.player.stats.maxEnergy;
}

/** The rain's area's middle now, if it's channelled. */
function areaMiddle(): THREE.Vector3 | null {
  const state = G.player.channel?.state as { center?: THREE.Vector3 } | undefined;
  return state?.center ?? null;
}

/** The frame's input aiming at `point`: the mouse over it, and in a close view the crosshair turned onto it. */
function aiming(point: THREE.Vector3, view: ViewMode): Frame {
  return view === 'top' ? { aim: point } : { aim: point, sight: point };
}

/** Whatever the hero is doing let go, and the foes' counts started again. */
function resetCase(held: Held[]): void {
  G.player.cooldowns.clear();
  for (const each of held) each.struck = 0;
}

/** One case: the rain held as it aims, then what's in the air followed down; its area and strikes measured. */
async function runCase(lab: Lab, skill: BoundSkill, view: ViewMode, each: Case, foes: Held[]): Promise<Measured> {
  const hero = G.player;
  resetCase(foes);
  const holdFrames = Math.round(HOLD / frameTime());
  const afterFrames = Math.round(AFTER / frameTime());
  const measured: Measured = { nearest: Infinity, aimed: Infinity, outside: 0, inReach: 0, far: 0 };
  const watch = (): void => {
    keepAll(foes);
    const middle = areaMiddle();
    if (!middle) return;
    measured.nearest = Math.min(measured.nearest, Math.hypot(middle.x - hero.pos.x, middle.z - hero.pos.z));
    measured.outside = Math.max(measured.outside, Math.hypot(middle.x, middle.z) - (G.arena.radius - WALL_IN));
  };
  const button = each.aim.by === 'touch' ? middleOf(element(`#touch-skills .tk-${skill.key}`)) : null;
  if (button) await lab.touchDown(button, 1);
  const dragged = each.aim.by === 'touch' && each.aim.drag;
  if (button && dragged) await lab.touchMove({ x: button.x, y: button.y - DRAG_PX }, 1);
  for (let frame = 0; frame < holdFrames; frame++) {
    const aim = each.aim;
    const input = aim.by === 'mouse' ? (): Frame => {
      const point = aim.at(frame / holdFrames);
      return { ...pressing(skill.key, point, true), ...aiming(point, view) };
    } : (): Frame => ({});
    await lab.step(1, input, watch);
    measured.aimed = Math.min(measured.aimed, Math.hypot(hero.aim.x - hero.pos.x, hero.aim.z - hero.pos.z));
  }
  if (button) await lab.touchUp(1);
  const rest = (): Frame => (each.aim.by === 'mouse' ? { aim: each.aim.at(1) } : {});
  await lab.step(afterFrames, rest, watch);
  const [far, ...ring] = foes;
  measured.far = far.struck;
  measured.inReach = ring.reduce((sum, one) => sum + one.struck, 0);
  return measured;
}

/** What a case is judged by: the melee kinds, the area's middle's distance their numbers need, and the skill's least
 *  distance (as set, before a canary's plant: an aim inside it is a case that measured something) (m). */
interface Bounds {
  kinds: EnemyId[];
  needed: number;
  least: number;
}

/** A case's line and its problems. */
function judge(label: string, each: Case, measured: Measured, bounds: Bounds): Report {
  const { needed, least } = bounds;
  const line = `${label}: aimed ${measured.aimed.toFixed(2)} m off at nearest, the area's middle `
    + `${measured.nearest.toFixed(2)} m off at nearest (needs ${needed.toFixed(2)}), `
    + `arrows striking foes in reach ${measured.inReach}, the far foe ${measured.far}`;
  const problems: string[] = [];
  if (measured.nearest === Infinity) problems.push(`${label}: no rain was channelled`);
  else if (measured.nearest < needed - 1e-3) {
    const came = measured.nearest.toFixed(2);
    problems.push(`${label}: the area came within ${came} m of him (needs ${needed.toFixed(2)})`);
  }
  if (measured.outside > 1e-3) {
    problems.push(`${label}: the area went ${measured.outside.toFixed(2)} m past the arena's edge`);
  }
  if (measured.inReach) problems.push(`${label}: ${measured.inReach} arrows struck foes in reach of him`);
  if (each.inside && measured.aimed >= least) {
    problems.push(`${label}: the aim never came within ${least.toFixed(2)} m (measured nothing)`);
  }
  if (each.name === 'the far foe' && !measured.far) {
    problems.push(`${label}: the far foe was never struck (no rain fell)`);
  }
  return { text: line, problems };
}

/** The hero set up in `view` at `at` facing `facing`, the rain bound, its foes stood round him. */
async function setUp(lab: Lab, view: ViewMode, at: [number, number], facing: number, kinds: EnemyId[]) {
  const fixture: Fixture = { at, facing, view };
  await lab.setup(fixture);
  bindKnown('arrowRain');
  const skill = skillNamed('arrowRain');
  const { ring, far } = await standFoes(lab, kinds);
  return { skill, foes: [far, ...ring] };
}

/** Each of `cases` in `view`, each from a set-up of its own. */
async function measureCases(lab: Lab, view: ViewMode, cases: Case[], bounds: Bounds): Promise<Report> {
  const lines: string[] = [];
  const problems: string[] = [];
  // (facing the wall: straight out from the arena's middle through his spot)
  const outward = Math.atan2(SPOT[0], SPOT[1]);
  for (const each of cases) {
    G.arena.restoreProps();
    const { skill, foes } = await setUp(lab, view, SPOT, each.atWall ? outward : FACING, bounds.kinds);
    firstFoe = foes[1].spot.clone();
    if (each.aim.by === 'touch') await showTouchControls(lab);
    const measured = await runCase(lab, skill, view, each, foes);
    const judged = judge(`${view}, ${each.name}`, each, measured, bounds);
    lines.push(judged.text, ...judged.problems.map((problem) => `  ! ${problem}`));
    problems.push(...judged.problems);
  }
  return { text: lines.join('\n'), problems };
}

/** Every def of the hero's rain (a skill's def may be copied per key), for the canary's plant. */
function rainDefs(): SkillDef[] {
  return [...G.player.known.values()].map((known) => known.def).filter((def) => def.impl === 'arrowRain');
}

/** `lab rainreach`: the rain aimed at and round the ranger in every view, its area kept off him and his foes. */
export async function rainReach(lab: Lab, options: RainReachOptions): Promise<Report> {
  if (G.player.cls.id !== 'ranger') throw new Error('lab: rainreach needs --class ranger');
  const kinds = meleeKinds();
  const def = rainDefs()[0];
  if (!def) throw new Error('lab: rainreach: the ranger has no Hailfletch');
  const needed = neededFor(kinds, def);
  const lines = [`melee kinds: ${kinds.join(', ')}; the area's middle needs ${needed.toFixed(2)} m `
    + `(the skill's least ${def.minRange ?? 'unset'})`];
  const problems: string[] = [];
  if ((def.minRange ?? 0) < needed) {
    problems.push(`the skill's least distance ${def.minRange ?? 'unset'} is under ${needed.toFixed(2)}`);
  }
  const bounds: Bounds = { kinds, needed, least: def.minRange ?? needed };
  const kept = rainDefs().map((each) => ({ def: each, minRange: each.minRange }));
  if (options.canary) for (const each of kept) each.def.minRange = 0;
  // (touch last, top-down: the touch controls stay up once shown)
  const runs: [ViewMode, Case[]][] = options.views.map((view) => [view, mouseCases()]);
  if (options.touch) runs.push(['top', TOUCH_CASES]);
  try {
    for (const [view, cases] of runs) {
      const measured = await measureCases(lab, view, cases, bounds);
      lines.push(measured.text);
      problems.push(...measured.problems);
    }
  } finally {
    for (const each of kept) each.def.minRange = each.minRange;
  }
  if (!options.canary) return { text: lines.join('\n'), problems };
  const near = problems.some((problem) => problem.includes('came within'));
  const struck = problems.some((problem) => problem.includes('struck foes in reach'));
  const said = (caught: boolean): string => (caught ? 'caught' : 'missed');
  lines.push(`canary: the area on him ${said(near)}, foes in reach struck ${said(struck)}`);
  const missed = [
    ...(near ? [] : ['the canary\'s area brought down on him went unseen']),
    ...(struck ? [] : ['the canary\'s arrows on the foes in reach went unseen']),
  ];
  return { text: lines.join('\n'), problems: missed };
}
