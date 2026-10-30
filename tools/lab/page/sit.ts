// tools/lab `sit`: an idle hero's sit on a log or a stone (entities/sitting.ts, models/sit.ts), read from what's drawn.
// From the owner: "if there is a nearby log or not high stone ... and character is idle, they need to walk up to this
// prop and sit on it, should sit on the closest side", "when user presses any action, they should stand up first,
// then perform the action if user is still pressing it (do not queue)", "while seated, they should continue looking
// left/right like now"; a high seat sat on "up on it, feet hanging", a low stone with the feet on the floor. On each
// seat he stands 3 m off it idle until he has walked there and sat: on its side he stood on, his hips on its top, his
// feet down or hanging as its height has them, every joint within its range, glancing round; then he's asked to act,
// a tap and a key held, a step and an attack: up first each time, a tap left undone, a key held done once he's up.
// His skirts are followed as he sits, as `coat` follows them standing: from the owner, "on log cloth is jerking few
// times per sec"; and what he carries (`sitCarried.ts`: moved only in a hand, held as before once he's up) and his
// legs through his skirts (`sitCloth.ts`), with a film of the way down and up (`sitFilm.ts`). The canary raises his
// body off the seat as he sits, pushes what he holds out of his hand, turns it in his hand as he gets up, and reads
// a cloth point at his knee.
import type { SitState } from '../../../src/types';
import * as THREE from 'three';
import { G } from '../../../src/state';
import { groundHeight } from '../../../src/world/ground';
import { seatSpot, seatTopAt, type Seat } from '../../../src/world/seats';
import { SIT } from '../../../src/entities/sitting';
import { outlinedLook } from '../../../src/ui/overlay/outline';
import type { BiomeId } from '../../../src/data/biomes';
import type { Fixture, Lab, Pictured, Report, ViewName } from './lab';
import { ARM_LIMITS, bodyBreaches, grippingRanges, grippingSides } from './range';
import { ArmsPinned, describeStrain, pinnedCanary } from './armStrain';
import { cm as cmOf, follow, JERK_FROM, skirtsOf, type Followed } from './coat';
import { WeaponBody } from './weaponBody';
import { SEAT_CANARY_CAUGHT, seatCanary, WeaponSeat } from './weaponSeat';
import { bowOf } from './ranger';
import { armsInLegs } from './armsInLegs';
import { armsInBody } from './armsIn';
import { Carried, FIST_OPEN, heldApart, heldNow, IN_HAND_MOST, LOOSE_MOST, PALM_AT, SLID_MOST, turnHeld } from './sitCarried';
import { legsThrough, legsThroughCanary, THROUGH_FROM, type LegThrough } from './sitCloth';
import { SitFilm } from './sitFilm';
import { FRAMED_MOST, neckOnScreen, type Framed } from './sitFraming';

/** What `lab sit` takes. */
export interface SitOptions {
  /** the set-up's (`--gear`, `--weapon`, `--wear`, `--tune`): where he stands is the measure's */
  fixture?: Fixture;
  /** the seats tried, by name (all by default) */
  seats?: string[];
  /** list every frame his skirts jerked as he sat */
  frames?: boolean;
  /** list this carried piece frame by frame */
  trace?: string;
  canary?: boolean;
}

const RATE = 60;
/** frames E may take to set him off to sit or get him up, and the longest he may take to sit by it (s) */
const KEY_TAKES = 2;
/** how long the mouse is over a seat before E is first pressed, short of `SIT.look` (s), and how high over the floor
 *  a fire is pointed at (m) */
const KEY_EARLY = 1.5;
const FIRE_AIM = 0.4;
const SIT_KEY_MOST = 15;
const DEG = 180 / Math.PI;
/** how far off the seat he stands to begin with (m), and how long he has to have sat by (s) */
const START_OFF = 3;
/** clear of the props by this to begin with (m): a hero's radius and some */
const BODY = 0.6;
const SAT_BY = 16;
/** how long he sits for the reads (s) */
const SAT_FOR = 7;
/** his hips' pivot over the seat's top as drawn (m): any higher he sits on air, any lower in the seat */
const PIVOT_OVER: [number, number] = [0.06, 0.17];
/** an ankle this near the floor is down on it, this far over it hanging (m) */
const DOWN_WITHIN = 0.13;
const HANGS_FROM = 0.16;
/** how far a foot down may slide as he sits (m) */
const SLIDE_MOST = 0.03;
/** the head's turn from the chest that counts as a glance (degrees) */
const GLANCED = 15;
/** frames a key is pressed for a tap, frames he may take to begin getting up, and how long after he's up a tap's or a
 *  held key's doing is watched for (s) */
const TAP = 3;
const RISE_IN = 2;
const AFTER_UP = 1.2;
/** the room getting up is given over its own time (s, `riseMost`) */
const RISE_ROOM = 0.4;
/** how far he may move after a tap once he's up (m), and how far a held step takes him at least */
const STILL_AFTER = 0.05;
const WALKS_OFF = 0.6;
/** how far under the floor a piece of him may be drawn (m): a sole's rounding */
const UNDER_MOST = 0.03;
/** and how far over it a handle stood on its end on the floor may be drawn (m): from review, the mage's staff slid up
 *  past the floor stood on air, 18 cm on the log and 78 on the stone */
const STOOD_OVER = 0.03;

/** an empty hand's palm this far off his legs' surface rests on nothing (m): from review, an empty hand hung beside
 *  the knee, palm forward, touching nothing; the palm's middle down the hand from the wrist and onto its palm (rig
 *  units) */
const OFF_LEG = 0.06;
/** and this far into the bare leg is into it, through the clothes over it (m: the boots, trousers and robe drawn over
 *  the rig's capsules) */
const IN_LEG = 0.03;

/** how far a point of his skirts may wander as he sits still (m): his feet's slow swing and his breath move it a few
 *  centimetres; from the owner, "on log cloth is jerking few times per sec", the drape went round a knee one way and
 *  the other, and eased it would slide there and back (left: a point between his knees shifting 9 cm over half a
 *  second as his hands and breath move) */
const WANDER_MOST = 0.1;
/** how long after he's sat the wander is read from (s) */
const SETTLED = 1.5;

/** how far into his legs or trunk a forearm, a hand, a weapon or the bow may go (m: the bones' capsules, bare; the
 *  clothes over them, a hand resting on a thigh). From play: "ranger hands clipping through legs, in sitting pose near
 *  fire", "bow clipping through body in log sitting"; from review, a maul's haft through his hip sitting down */
const INTO_BODY = 0.03;
/** the views a moment he went into himself is pictured in, close on his hips, his skeleton drawn over him */
const DEEPEST_VIEWS: ViewName[] = ['right', 'front', 'left', 'above'];
/** where a close-up of him is framed: over his hips (m) and from how far (on his hips at 1.7, the coat filled it) */
const CLOSE = { up: 0.3, distance: 3.2 };
/** how much deeper (m) a moment goes in than the one pictured before it is pictured in its place */
const PICTURE_DEEPER = 0.01;
/** a fist let go of (a two-hander regripped as it's lowered) is pictured close on the hand as it opens and every so
 *  many frames after while it's open (the frames), at most so many times a sit, from so far (m) */
const OPEN_SHOTS = { every: 30, most: 4, distance: 1.2 };

/** by a fire, his body's way off the way to it at most (degrees): from review, he sat 30 to 45 off it */
const FACING_FIRE = 15;

/** the canary's raise of his body over the seat (m); its push of what he holds out of his hand, from how far and a
 *  frame further (m), over which frames he sits; its turn of it in his hand as he's up (rad) */
const CANARY_RAISE = 0.12;
const CANARY_PUSH = { from: 0.15, by: 0.01, frames: [60, 90] };
const CANARY_TURN = 0.5;
/** the canary's turn of what he holds in his hand, a little more each frame, sat (rad a frame, over which frames) */
const CANARY_TWIST = { by: 0.03, frames: [100, 130] };

/** A seat tried: its name, its biome, how it's picked from the biome's, and whether its feet hang. */
interface SeatCase {
  name: string;
  biome: BiomeId;
  pick: (seats: readonly Seat[]) => Seat | undefined;
  hangs: boolean;
  /** the views he's pictured in, sat (the first two half way down too): by a fire, from its sides, as one ahead of
   *  him looks through the flames */
  views: ViewName[];
  /** what he's asked to do from it, in turn */
  asks: Ask[];
}

/** An ask: a step or an attack, tapped or held. */
interface Ask {
  what: 'step' | 'attack';
  held: boolean;
}

// (sat, in the game's own views too, and by a fire from ahead: seen from its sides and behind alone, his coat through
// his legs and the grass through him went unseen, "lots clipping near fire, how did you miss it ?")
const SEAT_VIEWS: ViewName[] = ['front', 'left', 'above', 'top', 'third'];
const FIRE_VIEWS: ViewName[] = ['right', 'back', 'above', 'front', 'top', 'third'];

const lengthOf = (s: Seat) => Math.hypot(s.bx - s.ax, s.bz - s.az);

const CASES: SeatCase[] = [
  {
    name: 'log', biome: 'forest', pick: (seats) => seats.find((s) => lengthOf(s) > 2), hangs: true,
    views: SEAT_VIEWS,
    asks: [{ what: 'step', held: false }, { what: 'attack', held: true }],
  },
  {
    name: 'stone', biome: 'forest', pick: lowestStone, hangs: false, views: SEAT_VIEWS,
    asks: [{ what: 'attack', held: false }, { what: 'step', held: true }],
  },
  {
    name: 'column', biome: 'crypt', pick: (seats) => seats.find((s) => lengthOf(s) > 2), hangs: true,
    views: SEAT_VIEWS,
    asks: [{ what: 'step', held: false }],
  },
  {
    name: 'fire', biome: 'forest', pick: (seats) => seats.find((s) => s.ground), hangs: false, views: FIRE_VIEWS,
    asks: [{ what: 'step', held: false }, { what: 'attack', held: true }],
  },
  {
    name: 'brazier', biome: 'crypt', pick: (seats) => seats.find((s) => s.ground), hangs: false, views: FIRE_VIEWS,
    asks: [{ what: 'step', held: false }],
  },
];

/** The forest's stone seat with the lowest top. */
function lowestStone(seats: readonly Seat[]): Seat | undefined {
  const stones = seats.filter((s) => lengthOf(s) < 1e-3 && !s.ground);
  const topOf = (s: Seat) => seatTopAt(s, s.ax + s.sit, s.az);
  return stones.sort((a, b) => topOf(a) - topOf(b))[0];
}

/** What the seats tried found, added to as they go. */
interface Out {
  text: string[];
  problems: string[];
  moments: Pictured[];
  /** the canary's reads of its own pieces: how far what it pushed went with no hand on it (m), and whether what it
   *  turned in his hand read as held otherwise (each on its own, so a real fault can't pass for it) */
  /** what each canary read; `gripped`: whether a palm gripped anything to turn, sat */
  canary?: { pushed: number; turned: boolean; twisted: number; gripped: boolean; pinned: boolean };
}

/** What's followed on a seat from its set-up until he's up again: what he carries, his legs through his skirts (the
 *  deepest, pictured), the film; and what he held before he sat. */
interface Watch {
  carried: Carried;
  /** the weapon in his hand and the bow against the seat */
  seat: WeaponSeat[];
  film: SitFilm;
  through: (LegThrough & { at: string }) | null;
  shown: number;
  /** his arms held at two or more of their joints' stops at once ("he would snap his arm") */
  pinned: ArmsPinned;
  /** a fist let go of: how many times it's been pictured, and the frames since it last was */
  open: { shots: number; since: number };
  before: ReturnType<typeof heldNow>;
  canary: boolean;
  moments: Pictured[];
}

/** One frame of a sit as drawn. */
interface Read {
  w: number;
  pivot: THREE.Vector3;
  ankles: [THREE.Vector3, THREE.Vector3];
  neck: number;
  /** each empty hand (holding nothing), its palm's gap to his legs (m) */
  palms: { side: string; gap: number }[];
  /** the way his hips face, as a world point 1 m ahead of their pivot */
  ahead: THREE.Vector3;
}

/** Runs `lab sit`. */
export async function sit(lab: Lab, options: SitOptions): Promise<Report> {
  const text: string[] = [`the ${lab.player.cls.id} sitting`];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  const cases = CASES.filter((c) => !options.seats?.length || options.seats.includes(c.name));
  const fixture = options.fixture ?? {};
  if (options.canary) return canaryOn(lab, cases[0], fixture, { text, problems, moments });
  for (const each of cases) await trySeat(lab, each, fixture, options, { text, problems, moments });
  return { text: text.join('\n'), problems, moments };
}

/** The canary on one seat: his body raised off it as he sits must be caught as sitting on air. */
async function canaryOn(lab: Lab, c: SeatCase, fixture: Fixture, out: Out): Promise<Report> {
  out.canary = { pushed: 0, turned: false, twisted: 0, gripped: false, pinned: false };
  await trySeat(lab, { ...c, asks: [{ what: 'step', held: false }] }, fixture, { canary: true }, out);
  out.canary.pinned = pinnedCanary(bodyBreaches(lab.joints).angles, ARM_LIMITS);
  const problems: string[] = [];
  const pushedTo = CANARY_PUSH.by * (CANARY_PUSH.frames[1] - CANARY_PUSH.frames[0]) / 2;
  const canaries = [
    {
      what: `his body raised ${CANARY_RAISE} m off the seat`,
      caught: out.problems.some((problem) => problem.includes('sat on air')),
    },
    {
      what: `what he holds pushed out of his hand (${cmOf(out.canary.pushed)} cm read with no hand on it)`,
      caught: out.canary.pushed >= pushedTo,
    },
    { what: 'what he holds turned in his hand as he gets up', caught: out.canary.turned },
    { what: 'his right arm held at its stops', caught: out.canary.pinned },
  ];
  // (sat with a two-hander, his palm rests on its pommel and grips nothing: nothing is in a hand to turn in it)
  if (out.canary.gripped) {
    canaries.push({
      what: `what he holds turned slowly in his hand, sat (${out.canary.twisted.toFixed(0)}° read)`,
      caught: out.canary.twisted > IN_HAND_MOST * 2,
    });
  } else out.text.push('  canary, what he holds turned slowly in his hand, sat: not run, nothing gripped sat');
  for (const canary of canaries) {
    out.text.push(`  canary, ${canary.what}: ${canary.caught ? 'caught' : 'MISSED'}`);
    if (!canary.caught) problems.push(`sit: the canary (${canary.what}) was missed`);
  }
  const seat = c.pick(G.arena.seats), weapon = lab.model.tip?.parent;
  if (seat && !seat.ground && weapon) {
    const read = seatCanary(seat, weapon, 0.15);
    const caught = read >= SEAT_CANARY_CAUGHT;
    out.text.push(`  canary, the weapon 15 cm into the seat: ${caught ? 'caught' : 'MISSED'} (${cmOf(read)} cm)`);
    if (!caught) problems.push('sit: the canary (the weapon in the seat) was missed');
  }
  const cloth = legsThroughCanary(lab.joints);
  out.text.push(`  canary, legs through the skirts: ${cloth}`);
  if (!cloth.startsWith('caught')) problems.push(`sit: the canary (a cloth point at the knee) was missed`);
  return { text: out.text.join('\n'), problems, moments: out.moments };
}

/** A seat tried: sat on, read, and got up from by each of its asks. */
async function trySeat(lab: Lab, c: SeatCase, fixture: Fixture, options: SitOptions, out: Out): Promise<void> {
  if (G.arena.biome !== c.biome) G.arena.setBiome(c.biome);
  const seat = c.pick(G.arena.seats);
  if (!seat) {
    out.problems.push(`sit: the ${c.biome} has no ${c.name} to sit on`);
    return;
  }
  const { at, facing } = startOff(seat);
  await lab.setup({ ...fixture, at, facing });
  const standing = neckOnScreen(lab);
  lab.player.sits = true;
  const spot = seatSpot(seat, at[0], at[1], lab.player.radius);
  if (!spot) {
    out.problems.push(`sit: the ${c.name} has no spot to sit on from ${at.map((v) => v.toFixed(1))}`);
    return;
  }
  const label = `${c.name} (top ${seatTopAt(seat, spot.x, spot.z).toFixed(2)} m)`;
  const watch: Watch = {
    carried: new Carried(lab, options.trace), film: new SitFilm(c.name, [c.views[0], 'third']), through: null,
    seat: [new WeaponSeat(seat, (each) => each.model.tip?.parent), new WeaponSeat(seat, bowApart)],
    shown: 0, pinned: new ArmsPinned(c.name, ARM_LIMITS), open: { shots: 0, since: OPEN_SHOTS.every },
    before: heldNow(lab), canary: !!options.canary, moments: [],
  };
  const sat = await untilSat(lab, label, c.views.slice(0, 2), out, watch);
  watch.film.end('down');
  if (!sat) return;
  const side = (lab.player.pos.x - spot.x) ** 2 + (lab.player.pos.z - spot.z) ** 2;
  if (side > 0.05 ** 2) out.problems.push(`sit: on the ${c.name} he sat ${Math.sqrt(side).toFixed(2)} m off its spot`);
  out.moments.push(lab.picture(`${c.name}: sat`, c.views));
  if (seat.ground) out.moments.push(fromBeyond(lab, c.name));
  const under = deepestUnder(lab);
  if (under.depth > UNDER_MOST) {
    out.problems.push(`sit: on the ${c.name}, his ${under.name} ${(under.depth * 100).toFixed(0)} cm under the floor`);
  }
  const stood = highestStood(lab);
  if (stood && stood.over > STOOD_OVER) {
    const over = (stood.over * 100).toFixed(0);
    out.problems.push(`sit: on the ${c.name}, his ${stood.name} stood ${over} cm over the floor`);
  }
  const reads = await readSat(lab, options, c.name, out, watch);
  judgeSat(c, label, reads, seat, out);
  judgeFraming(c.name, standing, neckOnScreen(lab), out);
  for (const ask of c.asks) {
    await askOf(lab, c, ask, out, watch);
    watch.film.end('up');
  }
  judgeWatch(c.name, watch, out);
  for (const line of watch.carried.traced) out.text.push(`    ${line}`);
  await sitKey(lab, c, seat, out);
}

/** Whether `done` comes true within `frames` frames, stepped one at a time until it does. */
async function within(lab: Lab, done: () => boolean, frames: number): Promise<boolean> {
  for (let frame = 0; frame < frames; frame++) {
    if (done()) return true;
    await lab.step(1);
  }
  return done();
}

/** The point of a seat the mouse is put over: its middle, on its top (a fire's a little over the floor). */
function seatMiddle(seat: Seat): THREE.Vector3 {
  const x = (seat.ax + seat.bx) / 2, z = (seat.az + seat.bz) / 2;
  const y = seat.ground ? groundHeight(x, z) + FIRE_AIM : seatTopAt(seat, x, z);
  return new THREE.Vector3(x, y, z);
}

/** Whether the seat is outlined white round its first target. */
function seatLit(seat: Seat): boolean {
  const look = outlinedLook();
  return !!look && look.root === seat.outline[0]?.root && look.color === 0xffffff;
}

/** E sits him on the seat the mouse rests on and gets him up: "E sits only when pointed at a sittable object for
 *  more than 2 sec", "it should highlight the object with outline ... but white". The mouse over it a while short of
 *  that: no outline, and E does nothing; over it past that: outlined, pictured, and E sets him off at once, with no
 *  idle wait; sat, E gets him up. */
async function sitKey(lab: Lab, c: SeatCase, seat: Seat, out: Out): Promise<void> {
  const { player } = lab, name = c.name;
  await lab.until(() => !player.casting && !player.channel && !player.sitting.pose, 5 * RATE, 'he was still busy');
  // (the mouse left over it from here to the next set-up, which puts it back ahead of him)
  lab.aim = seatMiddle(seat);
  await lab.step(Math.round(KEY_EARLY * RATE));
  if (seatLit(seat)) out.problems.push(`sit: the ${name} was outlined after ${KEY_EARLY} s pointed at`);
  await lab.step(1, () => ({ keys: ['e'] }));
  await lab.step(KEY_TAKES);
  if (player.sitting.walking || player.sitting.placed) {
    out.problems.push(`sit: by the ${name}, E set him off to sit after ${KEY_EARLY} s pointed at`);
    return;
  }
  const lit = await within(lab, () => seatLit(seat), Math.round((SIT.look - KEY_EARLY) * RATE) + KEY_TAKES);
  if (!lit) {
    out.problems.push(`sit: the ${name} wasn't outlined white after ${SIT.look} s pointed at`);
    return;
  }
  out.moments.push(await lab.screen(`${name}: pointed at, outlined`));
  await lab.step(1, () => ({ keys: ['e'] }));
  const going = await within(lab, () => player.sitting.walking || player.sitting.placed, KEY_TAKES);
  if (!going) {
    out.problems.push(`sit: by the ${name}, E pressed pointed at it didn't set him off to sit`);
    return;
  }
  if (outlinedLook()) out.problems.push(`sit: the ${name} still outlined as he set off to sit on it`);
  const sat = await lab.until(() => satWhole(player.sitting.pose), SIT_KEY_MOST * RATE, `sat after E by the ${name}`);
  const left = sitLeft(player.sitting.pose);
  await lab.step(1, () => ({ keys: ['e'] }));
  await lab.step(KEY_TAKES);
  const rising = sitLeft(player.sitting.pose) < left;
  if (!rising) out.problems.push(`sit: by the ${name}, E pressed sat didn't get him up`);
  out.text.push(`    E: sat in ${(sat / RATE).toFixed(1)} s, ${rising ? 'and up again by it' : 'never up again by it'}`);
}

/** The over-the-shoulder camera zoomed in all the way: his neck as high on the screen sat as standing. */
function judgeFraming(name: string, standing: Framed, sat: Framed, out: Out): void {
  const off = sat.onScreen - standing.onScreen;
  const said = (f: Framed) => `${f.onScreen.toFixed(2)} (neck ${f.neck.toFixed(2)} m, camera ${f.camera.toFixed(2)} m)`;
  out.text.push(`    zoomed in over his shoulder, his neck on the screen sat ${said(sat)}, standing ${said(standing)}`);
  if (Math.abs(off) > FRAMED_MOST) {
    const way = off < 0 ? 'over' : 'under';
    out.problems.push(`sit: on the ${name}, zoomed in over his shoulder, the camera frames him `
      + `${Math.abs(off).toFixed(2)} of the screen's half height ${way} where it frames him standing`);
  }
}

/** A frame of what's followed: what he carries, his legs through his skirts (the deepest pictured as it deepens). */
function watchFrame(lab: Lab, name: string, frame: string, watch: Watch, skirts: Followed[]): void {
  watch.carried.observe(frame);
  const strain = watch.pinned.observe(bodyBreaches(lab.joints).angles, grippingRanges(lab), frame);
  if (strain) watch.moments.push(closeUp(lab, `${name}: ${describeStrain(strain)} (${frame})`, DEEPEST_VIEWS, false));
  for (const piece of watch.seat) piece.observe(lab, frame);
  pictureOpenFist(lab, name, frame, watch);
  const through = legsThrough(lab.joints, skirts);
  if (!through || through.depth <= THROUGH_FROM) return;
  if (!watch.through || through.depth > watch.through.depth) watch.through = { ...through, at: frame };
  if (through.depth < watch.shown + PICTURE_DEEPER) return;
  watch.shown = through.depth;
  const label = `${name}: his ${through.leg} ${cmOf(through.depth)} cm through his ${through.skirt} (${frame})`;
  watch.moments.push(closeUp(lab, label, DEEPEST_VIEWS, false));
}

/** A fist let go of round its handle (curled under `FIST_OPEN`), as a two-hander is regripped, pictured close on
 *  the hand as it opens and every `OPEN_SHOTS.every` frames while it's open: the blade swung round in a closed fist
 *  read as magic, so the regrip must be seen to be one. */
function pictureOpenFist(lab: Lab, name: string, frame: string, watch: Watch): void {
  const open = lab.model.fists?.find((fist) => fist.curl < FIST_OPEN);
  const shots = watch.open;
  shots.since = open ? shots.since + 1 : OPEN_SHOTS.every;
  if (!open || shots.since < OPEN_SHOTS.every || shots.shots >= OPEN_SHOTS.most) return;
  shots.since = 0;
  shots.shots++;
  const hand = open.hand === 'left' ? lab.joints.handL : lab.joints.handR;
  const at = hand.getWorldPosition(new THREE.Vector3());
  const curled = THREE.MathUtils.radToDeg(open.curl).toFixed(0);
  const label = `${name}: his ${open.hand} fist let go of, curled ${curled}° (${frame}), what stands round him hidden`;
  const hides = (part: string) => FIRE_PARTS.includes(part) || PLANTS.test(part) || AROUND.test(part);
  const options = { at, distance: OPEN_SHOTS.distance, look: 'lit' as const };
  watch.moments.push(withHidden(hides, () => lab.picture(label, DEEPEST_VIEWS, [], options)));
}

/** What's followed judged once he's up again: what he carries moved with no hand on it or jumping, his legs
 *  through his skirts, and the film. */
function judgeWatch(name: string, watch: Watch, out: Out): void {
  for (const piece of watch.seat) if (piece.depth > 0) out.problems.push(`sit: by the ${name}, ${piece.describe()}`);
  for (const found of watch.carried.findings()) {
    if (found.loose > LOOSE_MOST) {
      out.problems.push(`sit: by the ${name}, his ${found.name} moved ${cmOf(found.loose)} cm with no hand on it `
        + `(${found.looseFrames} frames: ${found.looseAt})`);
    }
    if (found.jump) {
      out.problems.push(`sit: by the ${name}, his ${found.name} ${found.jump.by} in a frame (${found.jump.at})`);
    }
    const turned = found.turnedInHand, slid = found.slidInHand;
    if (turned && turned.by > IN_HAND_MOST) {
      out.problems.push(`sit: by the ${name}, his ${found.name} turned ${turned.by.toFixed(0)}° in his hand `
        + `(from ${turned.from} to ${turned.to})`);
    }
    if (slid && slid.by > SLID_MOST) {
      out.problems.push(`sit: by the ${name}, his ${found.name} slid ${cmOf(slid.by)} cm through his hand `
        + `(from ${slid.from} to ${slid.to})`);
    }
    const jump = found.jump ? `, ${found.jump.by} in a frame` : '';
    const turnedBy = turned ? `, turned ${turned.by.toFixed(0)}°` : '';
    const inHand = turned || slid ? `${turnedBy}, slid ${cmOf(slid?.by ?? 0)} cm in his hand at most` : '';
    out.text.push(`    his ${found.name}: ${cmOf(found.loose)} cm with no hand on it${jump}${inHand}`);
  }
  const pinned = watch.pinned.describe();
  if (pinned) out.problems.push(`sit: by the ${name}, ${pinned} (the stops: ${watch.pinned.tally()})`);
  const through = watch.through;
  if (through) {
    out.problems.push(`sit: by the ${name}, his ${through.leg} ${cmOf(through.depth)} cm through his ${through.skirt} `
      + `(${through.at})`);
  }
  out.moments.push(...watch.moments.splice(0), ...watch.film.moments());
}

/** what of a fire hides him from ahead, hidden for `fromBeyond` (the brazier includes its stepped plinth) */
const FIRE_PARTS = ['flames', 'bonfire logs', 'bonfire stones', 'brazier'];
/** where `fromBeyond` frames him: his knees' height over his hips' place, from this far ahead (m) */
const BEYOND = { up: 0.15, distance: 2.6 };

/** the plants round a seat, hidden for a close-up of his limbs (a tuft of grass before the camera hid his arms) */
const PLANTS = /^(grass \d|ferns|weeds)$/;
/** what of the biome stands round him to hide for a close-up of him (a boulder filled the picture from his left) */
const AROUND = /^(boulders|standing stone|thicket.*|stump|column)$/;

/** `take` done with the biome's parts `hides` names hidden, shown again after. */
function withHidden<T>(hides: (name: string) => boolean, take: () => T): T {
  const hidden: THREE.Object3D[] = [];
  G.arena.groupOf(G.arena.biome).traverse((object) => {
    if (hides(object.name) && object.visible) hidden.push(object);
  });
  for (const each of hidden) each.visible = false;
  try {
    return take();
  } finally {
    for (const each of hidden) each.visible = true;
  }
}

/**
 * Him pictured close in `views`, framed on his lap, with the fire, the plants and the rocks round him hidden (they
 * stood between him and the camera), and `bare`, his skirts too and his skeleton drawn over him.
 */
function closeUp(lab: Lab, label: string, views: ViewName[], bare: boolean): Pictured {
  const at = lab.joints.hips.getWorldPosition(new THREE.Vector3());
  at.y += CLOSE.up;
  const hides = (part: string) => FIRE_PARTS.includes(part) || PLANTS.test(part) || AROUND.test(part);
  const skirts = bare ? skirtsOf(lab.model.root).map((skirt) => skirt.mesh) : [];
  for (const skirt of skirts) skirt.visible = false;
  const options = { at, distance: CLOSE.distance, look: bare ? 'bones' as const : 'lit' as const };
  const said = bare ? 'his skirts and what stands round him hidden' : 'what stands round him hidden';
  try {
    return withHidden(hides, () => lab.picture(`${label}, ${said}`, views, [], options));
  } finally {
    for (const skirt of skirts) skirt.visible = true;
  }
}

/** Him sat by a fire pictured from ahead, the fire hidden: the player's camera sees him so from across it, and the
 *  lab's view ahead through it saw nothing of his legs. */
function fromBeyond(lab: Lab, name: string): Pictured {
  const at = lab.joints.hips.getWorldPosition(new THREE.Vector3());
  at.y += BEYOND.up;
  const label = `${name}: sat, from ahead (the fire hidden)`;
  return withHidden((part) => FIRE_PARTS.includes(part), () => {
    return lab.picture(label, ['front'], [], { at, distance: BEYOND.distance });
  });
}

const _box = new THREE.Box3();

/** The piece of him drawn deepest under the floor (a staff's foot as he sits low), and how deep (m), less what it
 *  says it's stuck in (a greatsword stood point down, `userData.stuckIn` on it or over it). */
function deepestUnder(lab: Lab): { name: string; depth: number } {
  lab.model.root.updateMatrixWorld(true);
  let deepest = { name: 'nothing', depth: 0 };
  lab.model.root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !shown(mesh) || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
    _box.setFromObject(mesh, true);
    const mid = _box.getCenter(new THREE.Vector3());
    const depth = groundHeight(mid.x, mid.z) - _box.min.y - stuckIn(mesh);
    if (depth > deepest.depth) deepest = { name: nameOf(mesh, lab.joints), depth };
  });
  return deepest;
}

/** Of what's stood on its end on the floor as he sits (`userData.stoodOn`: the mage's staff, slid up through his fist
 *  out of the floor), the one drawn highest over it, and how high its lowest point is (m). */
function highestStood(lab: Lab): { name: string; over: number } | null {
  lab.model.root.updateMatrixWorld(true);
  let highest: { name: string; over: number } | null = null;
  lab.model.root.traverse((object) => {
    if (!object.userData.stoodOn || !shown(object)) return;
    _box.setFromObject(object, true);
    const mid = _box.getCenter(new THREE.Vector3());
    const over = _box.min.y - groundHeight(mid.x, mid.z);
    if (!highest || over > highest.over) highest = { name: nameOf(object, lab.joints), over };
  });
  return highest;
}

/** How deep `object` is meant to be in the floor (m): a weapon stood on its point, as the model says. */
function stuckIn(object: THREE.Object3D): number {
  for (let at: THREE.Object3D | null = object; at; at = at.parent) {
    const depth = at.userData.stuckIn as number | undefined;
    if (depth) return depth;
  }
  return 0;
}

/** Whether `object` is drawn: it and everything over it shown (a weapon not held is hidden by its group). */
function shown(object: THREE.Object3D): boolean {
  for (let at: THREE.Object3D | null = object; at; at = at.parent) if (!at.visible) return false;
  return true;
}

/** A piece's name, or the nearest named object over it, or the joint it hangs from. */
function nameOf(piece: THREE.Object3D, joints: Lab['joints']): string {
  const jointNames = new Map(Object.entries(joints).map(([name, joint]) => [joint, name]));
  for (let at: THREE.Object3D | null = piece; at; at = at.parent) {
    if (at.name) return at.name;
    const joint = jointNames.get(at as never);
    if (joint) return `piece on the ${joint}`;
  }
  return 'unnamed piece';
}

/** Where he stands to begin with: `START_OFF` off the seat's middle, on the first side and turn round it clear of
 *  every prop by a body's width (the arena's middle side first), facing it. */
function startOff(seat: Seat): { at: [number, number]; facing: number } {
  const mx = (seat.ax + seat.bx) / 2, mz = (seat.az + seat.bz) / 2;
  const lx = seat.bx - seat.ax, lz = seat.bz - seat.az, len = Math.hypot(lx, lz);
  const inward = Math.atan2(-mx, -mz);
  // (a log's sides straight across it first, then slanting off them; a stone's all round from the arena's middle)
  const across = len > 1e-3 ? Math.atan2(-lz, lx) : inward;
  const sideFirst = Math.cos(across - inward) >= 0 ? across : across + Math.PI;
  for (const turn of [0, Math.PI, 0.5, -0.5, Math.PI + 0.5, Math.PI - 0.5]) {
    const way = sideFirst + turn;
    const x = mx + Math.sin(way) * START_OFF, z = mz + Math.cos(way) * START_OFF;
    if (clear(x, z)) return { at: [x, z], facing: Math.atan2(mx - x, mz - z) };
  }
  throw new Error('lab: no clear floor round the seat to stand on');
}

/** Whether a hero stands at (`x`, `z`) clear of every prop by a body's width, and of the wall. */
function clear(x: number, z: number): boolean {
  if (G.arena.wall.roomOut(x, z, BODY) <= 0) return false;
  return G.arena.obstacles.every((o) => Math.hypot(x - o.x, z - o.z) > o.r + BODY);
}

/** A joint past its range, and how far down he was. */
interface Breached {
  by: number;
  name: string;
  w: number;
}

const pastOf = (b: Breached) => `${b.name} ${b.by.toFixed(0)}° past its range`;

/** Frames until he's sat, as he stands idle; whether he did. */
async function untilSat(lab: Lab, label: string, views: ViewName[], out: Out, watch: Watch,
  collisionMoments = out.moments): Promise<boolean> {
  const sitting = lab.player.sitting;
  const skirts = skirtsOf(lab.model.root);
  let walked = false, half = false;
  // (the worst joint past its range sitting down, and standing idle before it: said, not the sit's; and the weapon in
  // his hand through his legs or trunk as he sets it down: from review, a maul's haft through his hip by a fire)
  const worst: (Breached | null)[] = [null, null];
  const into = new IntoBody(label, true);
  for (let f = 0; f < SAT_BY * RATE; f++) {
    await lab.step(1);
    walked ||= sitting.walking;
    const w = sitting.pose?.w ?? 0;
    const stage = stageOf(sitting.pose);
    // (the joints past their ranges on the way down, with how far down he was)
    const past = sitting.walking ? undefined : bodyBreaches(lab.joints, grippingSides(lab)).found[0];
    const at = w > 0 ? 0 : 1;
    if (past && (!worst[at] || past.by > worst[at].by)) worst[at] = { by: past.by, name: past.name, w };
    if (sitting.pose) into.observe(lab, `${f}, ${(w * 100).toFixed(0)}% down${stage}`);
    const said = `frame ${f}, ${(w * 100).toFixed(1)}% down${stage}${sitting.walking ? ', walking' : ''}`;
    watchFrame(lab, label, said, watch, skirts);
    watch.film.take(lab, w, 'down', moving(sitting.pose), shortStage(sitting.pose));
    if (!half && w >= 0.5) {
      half = true;
      out.moments.push(lab.picture(`${label}: half way down`, views));
    }
    if (satWhole(sitting.pose)) {
      out.text.push(`  ${label}: sat after ${(f / RATE).toFixed(1)} s${walked ? ', walking there' : ''}`);
      const [down, stood] = worst;
      if (down) {
        out.problems.push(`sit: by the ${label}, sitting down, ${pastOf(down)} ${(down.w * 100).toFixed(0)}% down`);
      }
      if (stood) out.text.push(`    standing idle before it (not the sit's): ${pastOf(stood)}`);
      for (const said of into.problems()) out.problems.push(`sit: by the ${label}, sitting down, ${said}`);
      if (into.moment) collisionMoments.push(into.moment);
      return true;
    }
  }
  out.problems.push(`sit: idle ${SAT_BY} s by the ${label}, he never sat${walked ? '' : ' (never walked there)'}`);
  return false;
}

/** His sit read for `SAT_FOR` s (the canary raising his body as he sits). */
async function readSat(lab: Lab, options: SitOptions, name: string, out: Out, watch: Watch): Promise<Read[]> {
  const j = lab.joints, canary = !!options.canary;
  let worst: { by: number; name: string; neck: number } | null = null;
  let frames = 0;
  const skirts = skirtsOf(lab.model.root);
  const into = new IntoBody(name, true);
  const spans = skirts.map((skirt) => new Spans(skirt.last.length));
  // (the canary's push and its turn read on their own, from just before each)
  const pushing = canary ? new Carried(lab) : null;
  const twisting = canary ? new Carried(lab) : null;
  let frame = 0;
  const reads = await lab.step(SAT_FOR * RATE, undefined, () => {
    if (canary) j.body.position.y += CANARY_RAISE / j.root.scale.x;
    const pushed = canary ? pushOutOfHand(lab, frame) : null;
    const twisted = canary ? twistInHand(lab, frame) : null;
    if (twisted && out.canary) out.canary.gripped = true;
    const read = readNow(lab);
    into.observe(lab, `${frame}`);
    watchFrame(lab, name, `sat, frame ${frame}`, watch, skirts);
    if (pushing && frame >= CANARY_PUSH.frames[0] - 1 && frame < CANARY_PUSH.frames[1]) {
      pushing.observe(`${frame}`);
      if (frame === CANARY_PUSH.frames[1] - 1 && out.canary) {
        out.canary.pushed = Math.max(0, ...pushing.findings().map((found) => found.loose));
      }
    }
    if (twisting && frame >= CANARY_TWIST.frames[0] - 1 && frame < CANARY_TWIST.frames[1]) {
      twisting.observe(`${frame}`);
      if (frame === CANARY_TWIST.frames[1] - 1 && out.canary) {
        out.canary.twisted = Math.max(0, ...twisting.findings().map((found) => found.turnedInHand?.by ?? 0));
      }
    }
    twisted?.();
    pushed?.();
    // (the first two frames fill each point's last two places)
    for (const skirt of skirts) follow(skirt, frame, frame >= 2, !!options.frames, j);
    // (once the cloth has settled where he sat: eased, it comes to rest over the first second)
    if (frame >= SETTLED * RATE) skirts.forEach((skirt, i) => spans[i].add(skirt.last));
    frame++;
    const past = bodyBreaches(j, grippingSides(lab)).found[0];
    if (past) frames++;
    if (past && (!worst || past.by > worst.by)) worst = { by: past.by, name: past.name, neck: read.neck };
    if (canary) j.body.position.y -= CANARY_RAISE / j.root.scale.x;
    return read;
  });
  for (const said of into.problems()) out.problems.push(`sit: on the ${name}, ${said}`);
  if (into.moment) out.moments.push(into.moment);
  out.moments.push(closeUp(lab, `${name}: sat, close`, DEEPEST_VIEWS, false));
  skirts.forEach((skirt, i) => {
    const { most, at } = spans[i].widest();
    out.text.push(`    his ${skirt.name}: a point wandered ${cmOf(most)} cm at most (point ${at})`);
    // (a hood turns with his glance, lagging it: its wander is its own)
    if (skirt.geometry.name !== 'hood' && most > WANDER_MOST) {
      out.problems.push(`sit: on the ${name} his ${skirt.name} wandered ${cmOf(most)} cm`);
    }
  });
  for (const skirt of skirts) {
    if (!skirt.frames) continue;
    out.problems.push(`sit: on the ${name} his ${skirt.name} jerked over ${cmOf(JERK_FROM)} cm on ${skirt.frames} `
      + `frames, the worst ${cmOf(skirt.worst)} cm (${skirt.worstAt})`);
    out.text.push(...skirt.listed);
  }
  const found = worst as { by: number; name: string; neck: number } | null;
  if (found) {
    out.problems.push(`sit: on the ${name}, ${found.name} ${found.by.toFixed(0)}° past its range (${frames} frames; `
      + `the head ${found.neck.toFixed(0)}° from the chest then)`);
  }
  return reads;
}

/** The ranger's bow, unless it's the main hand's grip `WeaponBody` reads already. */
function bowApart(lab: Lab): THREE.Object3D | null {
  const bow = bowOf(lab)?.group;
  const grip = lab.model.tip?.parent;
  if (!bow || (grip && bow.getObjectById(grip.id))) return null;
  return bow;
}

/** What of him goes into his legs or trunk over frames: the weapon in his hand, the bow, and each forearm and hand. */
class IntoBody {
  private readonly name: string;
  private readonly views: ViewName[];
  private readonly pieces: WeaponBody[];
  private arms: { depth: number; what: string } | null = null;
  private armFrames = 0;
  /** the moment it went deepest past `INTO_BODY`, pictured with his skeleton over it */
  private shown: { depth: number; moment: Pictured } | null = null;

  /** `pictured`: whether the deepest moment is pictured */
  constructor(name: string, pictured = false) {
    this.name = name;
    this.views = pictured ? DEEPEST_VIEWS : [];
    this.pieces = [new WeaponBody(name), new WeaponBody(name, bowApart)];
  }

  observe(lab: Lab, frame: string): void {
    for (const piece of this.pieces) piece.observe(lab, frame);
    const legs = armsInLegs(lab.joints).map((arm) => ({ ...arm, part: arm.leg }));
    const trunk = armsInBody(lab.joints).map((arm) => ({ ...arm, part: arm.solid }));
    const deepest = [...legs, ...trunk].sort((a, b) => b.depth - a.depth)[0];
    if (deepest && deepest.depth > INTO_BODY) {
      this.armFrames++;
      if (!this.arms || deepest.depth > this.arms.depth) {
        const what = `his ${deepest.side === 'L' ? 'left' : 'right'} ${deepest.limb} `
          + `${(deepest.depth * 100).toFixed(1)} cm into the ${deepest.part} (frame ${frame})`;
        this.arms = { depth: deepest.depth, what };
      }
    }
    this.pictureIfDeeper(lab, frame);
  }

  /**
   * The moment pictured again when it has gone a centimetre deeper than the one pictured: a number alone said how
   * deep, not which way the arm or the weapon went in, and a fix tried blind took a minute a round (the floor pose).
   */
  private pictureIfDeeper(lab: Lab, frame: string): void {
    if (this.views.length === 0) return;
    const depth = Math.max(this.arms?.depth ?? 0, ...this.pieces.map((piece) => piece.depth));
    if (depth <= INTO_BODY || depth < (this.shown?.depth ?? 0) + PICTURE_DEEPER) return;
    const label = `${this.name}: deepest into him, ${cmOf(depth)} cm (frame ${frame})`;
    // (his skirts off: they hid where the arm met the leg)
    this.shown = { depth, moment: closeUp(lab, label, this.views, true) };
  }

  /** What went in further than `INTO_BODY`, as words. */
  problems(): string[] {
    const said = this.pieces.filter((piece) => piece.depth > INTO_BODY).map((piece) => piece.describe());
    if (this.arms) said.push(`${this.arms.what}, on ${this.armFrames} frames`);
    return said;
  }

  /** the deepest moment past `INTO_BODY`, pictured, if it went in */
  get moment(): Pictured | null {
    return this.shown?.moment ?? null;
  }
}

/** Each point's least and most x, y and z over the frames added. */
class Spans {
  private readonly low: Float32Array;
  private readonly high: Float32Array;

  constructor(size: number) {
    this.low = new Float32Array(size).fill(Infinity);
    this.high = new Float32Array(size).fill(-Infinity);
  }

  add(points: Float32Array): void {
    for (let i = 0; i < points.length; i++) {
      this.low[i] = Math.min(this.low[i], points[i]);
      this.high[i] = Math.max(this.high[i], points[i]);
    }
  }

  /** The point whose box of places is widest across, and how wide (m). */
  widest(): { most: number; at: number } {
    let most = 0;
    let at = 0;
    for (let i = 0; i < this.low.length; i += 3) {
      const across = Math.hypot(this.high[i] - this.low[i], this.high[i + 1] - this.low[i + 1],
        this.high[i + 2] - this.low[i + 2]);
      if (across > most) {
        most = across;
        at = i / 3;
      }
    }
    return { most, at };
  }
}

const _q = new THREE.Quaternion(), _r = new THREE.Quaternion(), _f = new THREE.Vector3();

/** This frame as drawn: the thighs' pivot, the ankles, the head's turn from the chest. */
function readNow(lab: Lab): Read {
  const j = lab.joints;
  j.root.updateMatrixWorld(true);
  const pivot = j.thighL.getWorldPosition(new THREE.Vector3()).add(j.thighR.getWorldPosition(new THREE.Vector3()));
  const ankles: [THREE.Vector3, THREE.Vector3] = [
    j.ankleL.getWorldPosition(new THREE.Vector3()), j.ankleR.getWorldPosition(new THREE.Vector3()),
  ];
  j.chest.getWorldQuaternion(_q).invert();
  j.head.getWorldQuaternion(_r);
  _f.set(0, 0, 1).applyQuaternion(_q.multiply(_r));
  const neck = Math.atan2(_f.x, _f.z) * DEG;
  pivot.multiplyScalar(0.5);
  const ahead = j.hips.localToWorld(new THREE.Vector3(0, 0, 1)).sub(j.hips.getWorldPosition(new THREE.Vector3()));
  ahead.setY(0).normalize().add(pivot);
  return { w: lab.player.sitting.pose?.w ?? 0, pivot, ankles, neck, palms: emptyPalms(lab), ahead };
}

/** Each empty hand, its palm's gap to his legs. */
function emptyPalms(lab: Lab): { side: string; gap: number }[] {
  const sides = [{ side: 'L', hand: lab.joints.handL }, { side: 'R', hand: lab.joints.handR }];
  return sides
    .filter(({ hand }) => !holdsSomething(hand))
    .map(({ side, hand }) => ({ side, gap: legGap(lab.joints, hand.localToWorld(_f.copy(PALM_AT))) }));
}

/** Whether `hand` holds something: a piece shown under it that isn't skinned (the hand's own is). A weapon stood up
 *  is still under it, his palm on its top; the mage's staff and the ranger's bow are held without a `fists` entry. */
function holdsSomething(hand: THREE.Object3D): boolean {
  let holds = false;
  hand.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && !(mesh as THREE.SkinnedMesh).isSkinnedMesh && shown(mesh)) holds = true;
  });
  return holds;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _line = new THREE.Line3(), _near = new THREE.Vector3();

/** How far `point` is off the nearest of his thighs' and shins' surfaces (m: the rig's capsules, bare of clothing). */
function legGap(j: Lab['joints'], point: THREE.Vector3): number {
  const P = j.P, k = j.root.scale.x;
  const bones = [
    { from: j.thighL, length: P.thighL, radius: P.thighR }, { from: j.thighR, length: P.thighL, radius: P.thighR },
    { from: j.kneeL, length: P.shinL, radius: P.shinR }, { from: j.kneeR, length: P.shinL, radius: P.shinR },
  ];
  const gaps = bones.map(({ from, length, radius }) => {
    _line.set(from.localToWorld(_a.set(0, 0, 0)), from.localToWorld(_b.set(0, -length, 0)));
    return _line.closestPointToPoint(point, true, _near).distanceTo(point) - radius * k;
  });
  return Math.min(...gaps);
}

/** The sit judged: the hips on the seat, the feet down or hanging and still, the head glancing. */
function judgeSat(c: SeatCase, label: string, reads: Read[], seat: Seat, out: Out): void {
  const overs = reads.map((r) => r.pivot.y - seatTopAt(seat, r.pivot.x, r.pivot.z));
  const lowest = Math.min(...overs), highest = Math.max(...overs);
  if (lowest < PIVOT_OVER[0]) out.problems.push(`sit: on the ${c.name} his hips sank into it (${lowest.toFixed(2)} m)`);
  if (highest > PIVOT_OVER[1]) out.problems.push(`sit: on the ${c.name} his hips sat on air (${highest.toFixed(2)} m)`);
  const heights = reads.map((r) => r.ankles.map((a) => a.y - groundHeight(a.x, a.z)));
  const most = Math.max(...heights.flat()), least = Math.min(...heights.flat());
  const hanging = least > HANGS_FROM, down = most < DOWN_WITHIN;
  const feet = hanging ? 'hanging' : down ? 'on the floor' : 'neither down nor hanging';
  if (c.hangs && !hanging) out.problems.push(`sit: on the ${c.name} his feet are ${feet}, not hanging`);
  if (!c.hangs && !down) out.problems.push(`sit: on the ${c.name} his feet are ${feet}, not on the floor`);
  const slid = down ? Math.max(...[0, 1].map((i) => slideOf(reads.map((r) => r.ankles[i])))) : 0;
  if (slid > SLIDE_MOST) out.problems.push(`sit: on the ${c.name} a foot slid ${(slid * 100).toFixed(0)} cm`);
  const fire = seat.ground ? judgeFacing(c, seat, reads, out) : '';
  const glance = Math.max(...reads.map((r) => Math.abs(r.neck)));
  if (glance < GLANCED) out.problems.push(`sit: on the ${c.name} he never glanced round (${glance.toFixed(0)}°)`);
  out.text.push(`  ${label}: hips ${lowest.toFixed(2)} to ${highest.toFixed(2)} m over its top, feet ${feet} `
    + `(${least.toFixed(2)} to ${most.toFixed(2)} m)${down ? `, slid ${(slid * 100).toFixed(1)} cm` : ''}, `
    + `${fire}glanced ${glance.toFixed(0)}°, ${judgeHands(c, reads, out)}`);
}

/** His empty hands judged on his legs, each frame he sits; what's said of them. */
function judgeHands(c: SeatCase, reads: Read[], out: Out): string {
  const gaps = reads.flatMap((r) => r.palms.map((p) => p.gap));
  const off = Math.max(0, ...gaps), into = Math.min(off, ...gaps);
  const cm = (m: number) => (m * 100).toFixed(0);
  if (into < -IN_LEG) out.problems.push(`sit: on the ${c.name} an empty hand is in his leg (${cm(-into)} cm)`);
  if (off > OFF_LEG) {
    out.problems.push(`sit: on the ${c.name} an empty hand rests on nothing (${cm(off)} cm off his legs)`);
  }
  const empty = [...new Set(reads.flatMap((r) => r.palms.map((p) => p.side)))].join('') || 'none';
  return `empty hands (${empty}) ${cm(into)} to ${cm(off)} cm off his legs`;
}

/** By a fire, his way to it judged; what's said of it. */
function judgeFacing(c: SeatCase, seat: Seat, reads: Read[], out: Out): string {
  const facing = fireOff(seat, reads);
  if (facing > FACING_FIRE) out.problems.push(`sit: by the ${c.name} he faces ${facing.toFixed(0)}° off the fire`);
  return `${facing.toFixed(0)}° off the fire, `;
}

/** The most his hips face off the way to the fire (degrees, over the floor). */
function fireOff(seat: Seat, reads: Read[]): number {
  const offs = reads.map((read) => {
    const ahead = Math.atan2(read.ahead.x - read.pivot.x, read.ahead.z - read.pivot.z);
    const toFire = Math.atan2(seat.ax - read.pivot.x, seat.az - read.pivot.z);
    return Math.abs(Math.atan2(Math.sin(ahead - toFire), Math.cos(ahead - toFire))) * DEG;
  });
  return Math.max(...offs);
}

/** How far a point's path strays from where it began (m, over the floor). */
function slideOf(path: THREE.Vector3[]): number {
  return Math.max(...path.map((p) => Math.hypot(p.x - path[0].x, p.z - path[0].z)));
}

/** One frame of an ask: how far he's sat (`w`, his body; `left`, the whole sit, his hands' stages too: 0 up), where
 *  he is, whether he casts. */
interface AskRead {
  w: number;
  left: number;
  at: THREE.Vector3;
  cast: boolean;
}

/** Whether he's sat with all of it done: his body down and his hands' part after it (`SitState.after`). */
function satWhole(pose: SitState | null): boolean {
  return !!pose && pose.w >= 1 && pose.after >= 1;
}

/** Whether his body or his hands are on their way (between their ends) this frame. */
function moving(pose: SitState | null): boolean {
  const left = sitLeft(pose);
  return left > 0 && left < 3;
}

/** His hands' stage as a film frame's label puts it (`before` 40%: `, h40`; `after`: `, s40`), none at their ends. */
function shortStage(pose: SitState | null): string {
  if (!pose) return '';
  if (pose.before < 1) return `, h${(pose.before * 100).toFixed(0)}`;
  if (pose.after > 0 && pose.after < 1) return `, s${(pose.after * 100).toFixed(0)}`;
  return '';
}

/** How much of the sit there is to undo: his body's share down and his hands' stages (0 up, 3 sat with all done). */
function sitLeft(pose: SitState | null): number {
  return pose ? pose.before + pose.w + pose.after : 0;
}

/** Which of his hands' stages the sit is in, as words after its share down (none while his body moves). */
function stageOf(pose: SitState | null): string {
  if (!pose) return '';
  if (pose.before < 1) return `, his hands ${(pose.before * 100).toFixed(0)}% ready`;
  if (pose.w >= 1 && pose.after > 0 && pose.after < 1) return `, his hands ${(pose.after * 100).toFixed(0)}% done sat`;
  return '';
}

/** He's asked to act from the seat (sat again first if he's up): up before anything, then only a held key's done. */
async function askOf(lab: Lab, c: SeatCase, ask: Ask, out: Out, watch: Watch): Promise<void> {
  const player = lab.player;
  const sat = satWhole(player.sitting.pose);
  const again = { ...out, moments: [] };
  // The ordinary repeat pictures stay out of the report, but a new collision needs its own close-up.
  if (!sat && !(await untilSat(lab, `${c.name} again`, c.views.slice(0, 2), again, watch, out.moments))) return;
  const skirts = skirtsOf(lab.model.root);
  const ahead = new THREE.Vector3(Math.sin(player.facing), 0, Math.cos(player.facing));
  const aim = player.pos.clone().addScaledVector(ahead, 4);
  const input = ask.what === 'step' ? { keys: ['w'] } : { m0: true, aim };
  const most = riseMost(lab, c);
  const frames = Math.round((most + AFTER_UP) * RATE);
  const reads = await lab.step(frames, (f) => (ask.held || f < TAP ? input : { aim }), (frame): AskRead => {
    const w = player.sitting.pose?.w ?? 0;
    // (the way up is followed until he acts: a held attack swings what he holds as it means to)
    const stage = stageOf(player.sitting.pose);
    const at = `${(w * 100).toFixed(0)}% down${stage}, getting up (${ask.what} tapped, frame ${frame})`;
    if (!ask.held) watchFrame(lab, c.name, at, watch, skirts);
    watch.film.take(lab, w, 'up', moving(player.sitting.pose), shortStage(player.sitting.pose));
    const left = sitLeft(player.sitting.pose);
    return { w, left, at: player.pos.clone(), cast: Boolean(player.casting || player.channel) };
  });
  const what = `the ${c.name}, ${ask.held ? 'held' : 'tapped'} ${ask.what}`;
  judgeAsk(what, ask, reads, out, most);
  if (!ask.held) judgeHeldAgain(lab, what, watch, out);
}

/** What he held before he sat, held as it was once he's up again (the canary turns it in his hand, read against
 *  how he holds it now). */
function judgeHeldAgain(lab: Lab, what: string, watch: Watch, out: Out): void {
  const now = heldNow(lab);
  if (watch.canary && out.canary) {
    const turned = turnHeld(lab, CANARY_TURN);
    out.canary.turned = !!turned && heldApart(now, heldNow(lab)).length > 0;
    turned?.();
  }
  const apart = heldApart(watch.before, now);
  for (const piece of apart) {
    const how = piece.gone ? 'no longer in his hand'
      : `${cmOf(piece.off)} cm off and ${piece.turned.toFixed(0)}° turned from how he held it`;
    out.problems.push(`sit: ${what}, his ${piece.name} ${how} once he was up`);
  }
}

/** The canary: on `CANARY_TWIST`'s frames, what he holds turned in his hand a little further each frame (and back
 *  after the frame's reads, by what's returned). */
function twistInHand(lab: Lab, frame: number): (() => void) | null {
  const [from, to] = CANARY_TWIST.frames;
  if (frame < from || frame >= to) return null;
  return turnHeld(lab, CANARY_TWIST.by * (frame - from + 1));
}

/** The canary: on `CANARY_PUSH`'s frames, the first piece he holds pushed out of his hand a little further each
 *  frame (and back after the frame's reads, by what's returned). */
function pushOutOfHand(lab: Lab, frame: number): (() => void) | null {
  const [from, to] = CANARY_PUSH.frames;
  if (frame < from || frame >= to) return null;
  const palm = lab.joints.handR.localToWorld(PALM_AT.clone());
  let mesh: THREE.Mesh | undefined;
  lab.model.root.traverse((object) => {
    const each = object as THREE.Mesh;
    if (mesh || !each.isMesh || (each as THREE.SkinnedMesh).isSkinnedMesh || !shown(each)) return;
    if (_box.setFromObject(each, true).distanceToPoint(palm) < 0.06) mesh = each;
  });
  if (!mesh || !mesh.parent) return null;
  const pushed = mesh;
  const scale = pushed.parent!.getWorldScale(new THREE.Vector3()).x;
  const by = (CANARY_PUSH.from + CANARY_PUSH.by * (frame - from)) / scale;
  const origin = pushed.parent!.getWorldPosition(new THREE.Vector3());
  const way = pushed.parent!.worldToLocal(origin.clone().add(new THREE.Vector3(1, 0, 0)));
  way.normalize().multiplyScalar(by);
  pushed.position.add(way);
  pushed.updateMatrixWorld(true);
  return () => {
    pushed.position.sub(way);
    pushed.updateMatrixWorld(true);
  };
}

/** The longest getting up may take (s): his hands' stage sat undone, then his body up (`SIT.up`) and his hands'
 *  stage standing undone from `SIT.handsFrom` of the way, whichever ends last, with `RISE_ROOM` to spare. (The owner
 *  chose the whole slow reverse when a key gets him up: a greatsword out of the ground, then up, then onto his
 *  shoulder, about 2.3 s; with nothing in his hands, 0.8 s) */
function riseMost(lab: Lab, c: SeatCase): number {
  const hands = lab.player.sitHands(!!c.pick(G.arena.seats)?.ground);
  const [before, after] = SIT.handsUp;
  const body = Math.max(SIT.up, SIT.up * (1 - SIT.handsFrom) + hands.before * before);
  return hands.after * after + body + RISE_ROOM;
}

/** An ask judged: getting up at once, nothing done until he's up, a tap left undone, a held key done. */
function judgeAsk(what: string, ask: Ask, reads: AskRead[], out: Out, most: number): void {
  const rising = reads.slice(0, RISE_IN + 1).some((r, i) => i > 0 && r.left < reads[i - 1].left);
  const up = reads.findIndex((r) => r.left <= 0);
  const castSat = reads.slice(0, Math.max(0, up)).some((r) => r.cast);
  const after = up < 0 ? [] : reads.slice(up);
  const moved = after.length ? Math.max(...after.map((r) => r.at.distanceTo(after[0].at))) : 0;
  const cast = after.some((r) => r.cast);
  const problems: string[] = [];
  if (!rising) problems.push(`sit: ${what}, he didn't begin getting up within ${RISE_IN} frames`);
  if (up < 0 || up / RATE > most) problems.push(`sit: ${what}, he wasn't up after ${most.toFixed(2)} s`);
  if (castSat) problems.push(`sit: ${what}, he attacked before he was up`);
  if (!ask.held && (cast || moved > STILL_AFTER)) {
    problems.push(`sit: ${what}, the tap was done once he was up (queued)`);
  }
  if (ask.held && ask.what === 'step' && moved < WALKS_OFF) problems.push(`sit: ${what}, he never walked off once up`);
  if (ask.held && ask.what === 'attack' && !cast) problems.push(`sit: ${what}, he never attacked once up`);
  out.problems.push(...problems);
  const upAt = up < 0 ? 'never up' : `up in ${(up / RATE).toFixed(2)} s`;
  out.text.push(`  ${what}: ${upAt}, then moved ${moved.toFixed(2)} m${cast ? ', attacked' : ''}`);
}
