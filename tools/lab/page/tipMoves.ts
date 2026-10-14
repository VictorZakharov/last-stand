// The weapon's tip's moves a frame through a scenario (tools/lab `range`): its fastest between moves, where the pose
// eases back to the stance and a jump shows (Thunder Crescent's struck weapon was back at rest in a frame), and
// through them, each with how far the hand holding it moved then (as far: the arm or the body moved it; much less:
// the wrist turned it) and the joint that turned most on its own. Measured in the hero's own frame, so his walking
// and turning don't count.
import * as THREE from 'three';
import type { Lab } from './lab';

/** the joints between the hero's place and the weapon, whose own turns move it */
const CHAIN = ['body', 'hips', 'spine', 'chest', 'shoulderR', 'elbowR', 'handR'] as const;
/** a move of the tip between moves listed with `--frames` from this far a frame (m) */
const LISTED_FROM = 0.1;

/** How a frame moved the tip: how far (m), the frame, how far the hand moved (m), and the joint that turned most. */
interface Move {
  by: number;
  at: string;
  hand: number;
  joint: string;
  turned: number;
}

/** Where the tip and the hand holding it are, in the hero's own frame, and each joint's own turn. */
interface Places {
  tip: THREE.Vector3;
  hand: THREE.Vector3;
  turns: THREE.Quaternion[];
}

const still = (): Move => ({ by: 0, at: '', hand: 0, joint: '', turned: 0 });

/** The tip's fastest moves a frame, between moves and through them, and its large moves between them. */
export class TipMoves {
  private last: Places | null = null;
  private between = still();
  private through = still();
  /** the frames between moves where the tip moved `LISTED_FROM` or more, as words */
  readonly listed: string[] = [];

  /** `scenario`: the scenario's name, as its listed frames say it */
  constructor(private readonly scenario: string) {}

  /** Notes where the tip is this frame (`frame`: the frame as the report names it). */
  observe(lab: Lab, frame: string): void {
    const now = placesOf(lab);
    if (!now) return;
    if (this.last) {
      const move = moveBetween(this.last, now, frame);
      const moving = busy(lab);
      const line = `  ${this.scenario} frame ${frame}: the tip ${describeMove(move)}`;
      if (!moving && move.by >= LISTED_FROM) this.listed.push(line);
      if (moving && move.by > this.through.by) this.through = move;
      if (!moving && move.by > this.between.by) this.between = move;
    }
    this.last = now;
  }

  /** The fastest moves as words, or none if no tip was seen to move. */
  describe(): string {
    if (!this.between.at && !this.through.at) return '';
    const between = this.between.at ? `${describeMove(this.between)} a frame between moves` : '';
    const through = this.through.at ? `${describeMove(this.through)} through them` : '';
    return `fastest weapon tip ${[between, through].filter(Boolean).join(', ')}`;
  }
}

/** How the tip moved from `last` to `now`, in frame `at`. */
function moveBetween(last: Places, now: Places, at: string): Move {
  const by = now.tip.distanceTo(last.tip);
  const move: Move = { by, at, hand: now.hand.distanceTo(last.hand), joint: '', turned: 0 };
  now.turns.forEach((turn, i) => {
    const turned = turn.angleTo(last.turns[i]);
    if (turned <= move.turned) return;
    move.turned = turned;
    move.joint = CHAIN[i];
  });
  return move;
}

/** A move as words: how far, in which frame, the hand's move and the joint that turned most. */
function describeMove(move: Move): string {
  const cm = (metres: number) => `${(metres * 100).toFixed(1)} cm`;
  const joint = `${move.joint} turned ${THREE.MathUtils.radToDeg(move.turned).toFixed(0)}°`;
  return `${cm(move.by)} (frame ${move.at}, the hand ${cm(move.hand)}, ${joint})`;
}

/** The tip and the hand holding it (the grip in its fist), in the hero's own frame, and the turns of the joints that
 *  move it; none if he holds no weapon. */
function placesOf(lab: Lab): Places | null {
  const tip = lab.model.tip;
  const grip = tip?.parent;
  if (!tip || !grip) return null;
  const own = (object: THREE.Object3D) => lab.player.obj.worldToLocal(object.getWorldPosition(new THREE.Vector3()));
  const turns = CHAIN.map((name) => lab.joints[name].quaternion.clone());
  return { tip: own(tip), hand: own(grip), turns };
}

/** Whether the hero is under way with a move: casting, channelling or dashing. */
function busy(lab: Lab): boolean {
  const hero = lab.player;
  return Boolean(hero.casting || hero.channel || hero.dash);
}
