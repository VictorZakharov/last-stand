// tools/lab cuts: how a cut through the eyes lands (lab eyes). Which part of its blade crosses the aim, the crosshair,
// as it lands (its tip's third, or its middle); how wide its striking part sweeps against the skill's arc, which it
// strikes every foe in; and how much of each held weapon is in the frame at rest. How the cuts of a row follow each
// other is page/cutRows.ts. (The owner: "current dual wield attack is like touching the enemy with the middle of the
// blade, lame"; "our attacks strike multiple targets, so that cannot appear to hit only one"; "for dual wield right
// hand looks fine, but left is mostly off screen".)
import * as THREE from 'three';
import type { Lab } from './lab';
import { armsLens } from './inFrame';
import { headOf, shareShown } from './heads';
import { isWeapon, SIDES_NAMED } from './strike';
import { strikingWay, unseenBy, type CutFrame, type Hand, type RestBlades } from './cutRows';

/** a cut lands with its tip's part: it crosses the aim at least this far from the hilt to the tip (its middle is
 *  0.5), and not beyond the tip */
const MEETS_LEAST = 0.6;
const MEETS_MOST = 1.05;
/** a cut sweeps at least this share of the skill's arc with its striking part (it strikes every foe in it) */
const SWEEP_LEAST = 0.6;
/** and a weapon with a head (page/heads.ts: a maul, an axe, a mace) shows at least this share of it at rest
 *  (Vermintide 2's hammer about three quarters, cut by the frame's right edge; the owner, of a maul showing 14%:
 *  "should be lowered to see more of its head") */
const HEAD_SHOWN_LEAST = 0.6;
/** the points along a weapon its share in the frame is counted at */
const ALONG_POINTS = 11;

const DEG = 180 / Math.PI;

/** The aim's line against a frame's blade, as the screen has it: how far the crosshair is off the blade's line
 *  (signed, the screen's units a metre ahead), and the share of the blade from the hilt to the tip nearest it (beyond
 *  0 to 1 off the blade). Null when the blade isn't ahead of the eyes. */
function aimAgainst(frame: CutFrame): { off: number; share: number } | null {
  const near = -frame.grip.z;
  const far = -frame.tip.z;
  if (near <= 0 || far <= 0) return null;
  const a = new THREE.Vector2(frame.grip.x / near, frame.grip.y / near);
  const b = new THREE.Vector2(frame.tip.x / far, frame.tip.y / far);
  const along = b.clone().sub(a);
  const length = along.length();
  if (length < 1e-6) return null;
  const off = (along.x * -a.y - along.y * -a.x) / length;
  const t = -a.dot(along) / (length * length);
  // (from the screen's share of the blade to its own: the far part of it is drawn smaller)
  const share = (t * near) / (far * (1 - t) + t * near);
  return { off, share };
}

/**
 * Where the blade crosses the aim among `frames` from `from` to `to` (indices): the share of the way from its hilt to
 * its tip at the crossing nearest `at`, and the frame it crossed after; null when it never crosses.
 */
export function aimCrossing(frames: CutFrame[], from: number, to: number, at: number):
  { share: number; frame: number } | null {
  let found: { share: number; frame: number; index: number } | null = null;
  for (let i = Math.max(0, from); i < Math.min(frames.length - 1, to + 1); i++) {
    const now = aimAgainst(frames[i]);
    const next = aimAgainst(frames[i + 1]);
    if (!now || !next || Math.sign(now.off) === Math.sign(next.off)) continue;
    const u = now.off / (now.off - next.off);
    const crossing = { share: now.share + (next.share - now.share) * u, frame: frames[i].frame, index: i };
    if (!found || Math.abs(i - at) < Math.abs(found.index - at)) found = crossing;
  }
  return found && { share: found.share, frame: found.frame };
}

/** How wide the striking part swept across the eyes' view among `frames` from `from` to `to` (degrees, round them),
 *  in the hand holding it at `to` (with a weapon in each hand, the tip moved from one to the other between cuts and
 *  frozen arms read as sweeping 36 degrees). */
export function sweptOver(frames: CutFrame[], from: number, to: number): number {
  const hand = frames[Math.min(to, frames.length - 1)]?.hand;
  const yaws = frames.slice(from, to + 1).filter((frame) => frame.hand === hand).map((frame) => {
    const way = strikingWay(frame);
    return Math.atan2(way.x, -way.z) * DEG;
  });
  return yaws.length ? Math.max(...yaws) - Math.min(...yaws) : 0;
}

/** A strike's landing through the eyes: where its blade crossed the aim, and how much of the arc it swept. */
export interface Landing {
  meets: { share: number; frame: number } | null;
  swept: number;
  /** the skill's arc (degrees; null: it has none) */
  arc: number | null;
  /** how often its blow comes round, a spin's (turns a second; null: it isn't one) */
  turns: number | null;
}

/** A landing as words. */
export function describeLanding(landing: Landing): string {
  const meets = landing.meets
    ? `its blade crossed the aim ${(landing.meets.share * 100).toFixed(0)}% of the way from its hilt to its tip `
      + `(frame ${landing.meets.frame})`
    : 'its blade never crossed the aim';
  const arc = landing.arc === null ? '' : ` of the skill's ${landing.arc.toFixed(0)}° arc`;
  const turns = landing.turns === null
    ? ''
    : ` (a spin, round ${landing.turns.toFixed(1)} times a second: it strikes all round)`;
  return `${meets}${turns}; its striking part swept ${landing.swept.toFixed(0)}°${arc}`;
}

/** A landing's problems: met with its middle or not at all, short of the aim, or a narrow sweep. A spin's blow isn't
 *  asked to meet the aim: it strikes all round, and whether its passes may be seen through the eyes is the flashes'
 *  to say (lab cast: Steel Tempest's one-hander held across the view, 2.4 turns a second, lit the crypt's lower right
 *  3 times a second; held under the frame, it never crosses the aim). */
export function landingProblems(landing: Landing, weapon: string): string[] {
  const problems = landing.turns === null ? aimProblems(landing.meets, weapon) : [];
  if (landing.arc !== null && landing.swept < landing.arc * SWEEP_LEAST) {
    problems.push(`the ${weapon}'s blow sweeps ${landing.swept.toFixed(0)}° of the skill's ${landing.arc.toFixed(0)}°`
      + ` arc (at least ${SWEEP_LEAST * 100}%: it strikes every foe in it)`);
  }
  return problems;
}

/** Where a cut met the aim, as problems: not at all, with its middle, or short of it. */
function aimProblems(meets: Landing['meets'], weapon: string): string[] {
  if (!meets) return [`the ${weapon}'s blade never crosses the aim through its blow`];
  if (meets.share < MEETS_LEAST) {
    return [`the ${weapon} meets the aim with its blade's inner part, ${(meets.share * 100).toFixed(0)}% of `
      + `the way to its tip (at least ${MEETS_LEAST * 100}%: a cut lands with its tip's part)`];
  }
  if (meets.share > MEETS_MOST) {
    const out = (meets.share * 100).toFixed(0);
    return [`the ${weapon}'s tip falls short of the aim: it passed ${out}% of its length out`];
  }
  return [];
}

/** A held weapon's share of the frame at rest. */
export interface InView {
  hand: Hand;
  weapon: string;
  share: number;
  /** how long its part in the frame looks: from where it comes in to where it ends or leaves, on the screen, a share of
   *  the frame's height (a blade pointing away from the eyes is a sliver however much of it is in the frame) */
  length: number;
  /** how much of its head the frame shows (page/heads.ts), its head's points, the world's, and whether it has one (a
   *  blade has a point) */
  head: number;
  headAt: THREE.Vector3[];
  headed: boolean;
}

/** Whether `object` and everything it hangs from is shown. */
function shown(object: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false;
  }
  return true;
}

/** Each weapon the hero holds, seen, under each hand (none on a game that names no weapons' striking sides: any
 *  named joint would read as one). */
function weaponsHeld(lab: Lab): { hand: Hand; weapon: THREE.Object3D }[] {
  const found: { hand: Hand; weapon: THREE.Object3D }[] = [];
  if (!SIDES_NAMED) return found;
  for (const [hand, joint] of [['right', lab.joints.handR], ['left', lab.joints.handL]] as const) {
    joint.traverse((child) => {
      if (isWeapon(child) && shown(child)) found.push({ hand, weapon: child });
    });
  }
  return found;
}

/** How far along its length a hand's weapon runs from its grip, back to its butt and on to its far end (m, the
 *  world's: negative behind the grip), as `weaponsInView` counts it; null with none in that hand. */
export function weaponSpan(lab: Lab, hand: Hand): { from: number; to: number } | null {
  lab.model.root.updateWorldMatrix(true, true);
  const held = weaponsHeld(lab).find((one) => one.hand === hand);
  if (!held) return null;
  const { weapon } = held;
  const box = ownBox(weapon);
  const middle = box.getCenter(new THREE.Vector3());
  const grip = weapon.parent!.getWorldPosition(new THREE.Vector3());
  const axis = new THREE.Vector3(0, 1, 0).transformDirection(weapon.matrixWorld);
  const along = (y: number) => weapon.localToWorld(new THREE.Vector3(middle.x, y, middle.z)).sub(grip).dot(axis);
  return { from: along(box.min.y), to: along(box.max.y) };
}

/** A weapon's meshes' box in its own frame. */
function ownBox(weapon: THREE.Object3D): THREE.Box3 {
  weapon.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  const toOwn = weapon.matrixWorld.clone().invert();
  weapon.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    // (once a geometry: a weapon's never change, and read again every frame through the eyes it was a tenth of a job)
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(toOwn.clone().multiply(mesh.matrixWorld)));
  });
  return box;
}

/** Each held weapon's blade now (its grip's place to the far end of its meshes, in the eyes' space: `eyes` the camera
 *  they see through), by the hand holding it, as a frame before any cast. */
export function restBlades(lab: Lab, eyes: THREE.Camera): RestBlades {
  lab.model.root.updateWorldMatrix(true, true);
  const blades: RestBlades = {};
  for (const { hand, weapon } of weaponsHeld(lab)) {
    const box = ownBox(weapon);
    const middle = box.getCenter(new THREE.Vector3());
    const end = weapon.localToWorld(new THREE.Vector3(middle.x, box.max.y, middle.z));
    const grip = weapon.parent!.getWorldPosition(new THREE.Vector3());
    blades[hand] = {
      grip: eyes.worldToLocal(grip), tip: eyes.worldToLocal(end), hand, side: null, inCast: false, frame: -1,
    };
  }
  return blades;
}

/** Where a point of the world is in the frame as the arms are drawn (their own lens, if they have one): on the screen,
 *  in frame heights from its middle, and whether it's in the frame. */
function onScreen(world: THREE.Vector3): { at: THREE.Vector2; in: boolean } {
  const lens = armsLens();
  const ahead = lens.worldToLocal(world.clone()).z < 0;
  const ndc = world.clone().project(lens);
  const at = new THREE.Vector2((ndc.x * lens.aspect) / 2, ndc.y / 2);
  return { at, in: ahead && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 };
}

/** Points along a weapon (the world's, from its butt to its far end) as the frame shows them: the share in it, and how
 *  long its part in it looks (`InView`). */
export function seenAlong(points: THREE.Vector3[]): { share: number; length: number } {
  const shown = points.map(onScreen).filter((point) => point.in);
  if (!shown.length) return { share: 0, length: 0 };
  return { share: shown.length / points.length, length: shown[0].at.distanceTo(shown[shown.length - 1].at) };
}

/** A held weapon's share of the frame along its length, and how long it looks (`InView`'s). */
export type AlongView = Pick<InView, 'hand' | 'weapon' | 'share' | 'length'>;

/** Each held weapon in the frame now, along its length alone: `ALONG_POINTS` points along it (its own +Y, through the
 *  middle of its box) as the frame shows them. The hero's world matrices must be up to date. */
export function weaponsAlong(lab: Lab): (AlongView & { held: THREE.Object3D })[] {
  return weaponsHeld(lab).map(({ hand, weapon }) => {
    const box = ownBox(weapon);
    const middle = box.getCenter(new THREE.Vector3());
    const points = Array.from({ length: ALONG_POINTS }, (_, i) => {
      const y = box.min.y + ((box.max.y - box.min.y) * i) / (ALONG_POINTS - 1);
      return weapon.localToWorld(new THREE.Vector3(middle.x, y, middle.z));
    });
    return { hand, weapon: weapon.name, ...seenAlong(points), held: weapon };
  });
}

/** Each held weapon in the frame now: along its length (`weaponsAlong`) and how much of its head is shown (its head
 *  read off its meshes' points: a third of a job through the eyes when every frame read it, for nothing). */
export function weaponsInView(lab: Lab): InView[] {
  lab.model.root.updateWorldMatrix(true, true);
  return weaponsAlong(lab).map(({ held, ...along }) => {
    const { points: headAt, headed } = headOf(held);
    const head = shareShown(headAt, armsLens());
    return { ...along, head, headAt, headed };
  });
}

/** the hero's tip may be this share of its weapon's length off the far end of its meshes */
const TIP_OFF_MOST = 0.1;

/**
 * Whether the hero's tip (`Model.tip`: the measures take it for the weapon's far end, and a blade's share from its
 * hilt by it) is at the far end of the weapon it's on, as a problem if it isn't: the weapon's name and how far off it
 * is (a share of its length). None when no weapon is held.
 */
export function tipAtEnd(lab: Lab): string[] {
  const tip = lab.model.tip;
  const weapon = SIDES_NAMED ? tip?.parent?.children.find((child) => child.visible && isWeapon(child)) : undefined;
  if (!tip || !weapon) return [];
  const box = ownBox(weapon);
  const at = weapon.worldToLocal(tip.getWorldPosition(new THREE.Vector3()));
  const off = Math.abs(at.y - box.max.y) / (box.max.y - box.min.y);
  if (off <= TIP_OFF_MOST) return [];
  return [`the hero's tip is ${(off * 100).toFixed(0)}% of the ${weapon.name}'s length off its far end (at most `
    + `${TIP_OFF_MOST * 100}%): where its blade crosses the aim is measured along a wrong length`];
}

/** The weapons at rest as words, and each one too little seen (`unseenBy`) as a problem. */
export function restInView(views: InView[]): { line: string; problems: string[] } {
  const words = views.map((view) => `the ${view.hand} ${view.weapon} ${(view.share * 100).toFixed(0)}%, looking `
    + `${(view.length * 100).toFixed(0)}% of its height long, ${(view.head * 100).toFixed(0)}% of its `
    + `${view.headed ? 'head' : 'point'} shown`);
  const problems = views.flatMap((view) => {
    const unseen = unseenBy(view.share, view.length);
    return unseen ? [`at rest the ${view.hand} hand's ${view.weapon} is ${unseen}`] : [];
  });
  for (const view of views.filter((one) => one.headed && one.head < HEAD_SHOWN_LEAST)) {
    problems.push(`at rest the ${view.hand} hand's ${view.weapon} shows ${(view.head * 100).toFixed(0)}% of its head `
      + `(at least ${HEAD_SHOWN_LEAST * 100}%)`);
  }
  return { line: `at rest, in the frame along their length: ${words.join(', ') || 'no weapon held'}`, problems };
}
