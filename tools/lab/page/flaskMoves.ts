// The healing draught's flask and the arm that lifts it, frame by frame through a cast (tools/lab `range`): the
// elbow's fastest move a frame and the flask's fastest turn. The drink's arm is solved afresh each frame for the
// flask's place on its way from the hip to the lips, so an elbow that changes side on the way (tucked behind the body
// at the hip, out to the side at the lips) or a fist that turns over on the neck shows here as a jump, where every
// joint's angle reads within its range on both frames (#464). Measured in the hero's own frame.
import { Mat4, Maths, Vec3 } from './sceneApi.ts';
import type { Lab } from './lab';

/** a frame is listed with `--frames` from this far a move of the elbow (m) or this far a turn of the flask (rad) */
const ELBOW_LISTED = 0.06;
const TURN_LISTED = Maths.degToRad(12);
/** the canary moves the elbow this far in a frame (m): it must then be the fastest, by at least `CANARY_CAUGHT` */
const CANARY_MOVE = 0.3;
const CANARY_CAUGHT = 0.25;

/** Where the elbow of the flask's arm is and the way the flask's neck points, in the hero's own frame. */
interface Places {
  elbow: Vec3;
  neck: Vec3;
}

/** The fastest of a kind of move: how far (m, or rad), and the frame. */
interface Fastest {
  by: number;
  at: string;
}

/** The elbow's fastest move and the flask's fastest turn a frame while the flask is out. */
export class FlaskMoves {
  private last: Places | null = null;
  private elbow: Fastest = { by: 0, at: '' };
  private turn: Fastest = { by: 0, at: '' };
  private frames = 0;
  /** the frames the elbow moved `ELBOW_LISTED` or the flask turned `TURN_LISTED` or more, as words */
  readonly listed: string[] = [];

  /** `scenario`: the scenario's name, as its listed frames say it */
  constructor(private readonly scenario: string) {}

  /** Notes where the elbow and the flask are this frame (`frame`: the frame as the report names it). */
  observe(lab: Lab, frame: string): void {
    const now = placesOf(lab);
    if (now && this.last) this.note(this.last, now, frame);
    if (now) this.frames++;
    this.last = now;
  }

  /** The fastest moves as words, or none if no flask was out. */
  describe(): string {
    if (this.frames < 2) return '';
    const elbow = `its arm's elbow at most ${(this.elbow.by * 100).toFixed(1)} cm a frame (frame ${this.elbow.at})`;
    const turned = Maths.radToDeg(this.turn.by).toFixed(0);
    return `the flask out on ${this.frames} frames: ${elbow}, the flask turned at most ${turned}° (frame ${this.turn.at})`;
  }

  /** The canary: the elbow moved `CANARY_MOVE` between two frames must read as the fastest move. False if it wasn't,
   *  or if no flask was out to plant it on. */
  canary(): boolean {
    if (!this.last) return false;
    const planted = new FlaskMoves(this.scenario);
    const moved = { elbow: this.last.elbow.clone().setX(this.last.elbow.x + CANARY_MOVE), neck: this.last.neck };
    planted.note(this.last, moved, 'canary');
    return planted.elbow.by >= CANARY_CAUGHT;
  }

  /** Keeps the move from `last` to `now` if it's the fastest, and lists it if it's far. */
  private note(last: Places, now: Places, frame: string): void {
    const moved = now.elbow.distanceTo(last.elbow);
    const turned = now.neck.angleTo(last.neck);
    if (moved > this.elbow.by) this.elbow = { by: moved, at: frame };
    if (turned > this.turn.by) this.turn = { by: turned, at: frame };
    if (moved < ELBOW_LISTED && turned < TURN_LISTED) return;
    const degrees = Maths.radToDeg(turned).toFixed(0);
    const line = `the flask's arm's elbow ${(moved * 100).toFixed(1)} cm, the flask turned ${degrees}°`;
    this.listed.push(`  ${this.scenario} frame ${frame}: ${line}`);
  }
}

/** The elbow of the arm whose hand holds the flask and the way its neck points, in the hero's own frame; none while
 *  no flask is out. */
function placesOf(lab: Lab): Places | null {
  const flask = lab.model.root.getObjectByName('flask');
  const elbow = flask?.parent?.parent;
  if (!flask || !flask.visible || !elbow) return null;
  const hero = lab.player.obj;
  hero.updateWorldMatrix(true, true);
  const own = new Mat4().copy(hero.matrixWorld).invert();
  const neck = new Vec3(0, 1, 0).transformDirection(flask.matrixWorld).transformDirection(own);
  return { elbow: elbow.getWorldPosition(new Vec3()).applyMatrix4(own), neck };
}
