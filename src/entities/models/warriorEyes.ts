// The warrior's moves through the eyes (models/warrior.ts), keyed in the view as a person sees his own swing: at each
// key the grip's place and the weapon's way in the camera's space (m: x right, y up, -z ahead; a two-hander's grip is
// the lower hand's, the upper further up the handle). Seen from the middle of its own arc a blade swung round the
// body points away from the eyes, a sliver, so each cut is keyed across the view instead: the hands drawn back to a
// shoulder, the blade over it out of the frame; a short load; the hands driving down across the view as the blade
// whips round over the top, broadside, through the middle as the cut lands; the follow-through low on the other side.
// Every move starts from rest, and one straight after another fades into it from where that one ended.
// Each hand stays within its arm's reach of its own shoulder (in the eyes' frame about (±0.23, -0.32, 0); an arm
// reaches 0.69, and the keys keep to 0.64), the upper hand of a two-hander 0.28 up the handle from the lower (0.26
// at the model's scale: left out, a follow-through was put 14 cm past the right arm's reach, and the lower grip came
// in against the belly). A
// two-hander's lower fist holds its handle only across it: about 50 degrees or more off the line from its shoulder
// (the handle run along the left forearm, that hand let go of it), so a two-handed move comes back to rest by its
// own keys, the blade raised on the way (faded back, it pointed straight ahead out of the lower fist halfway).
// (The swing was a wiper's sweep from one side: it wound slowly out to the left, stood there a third of a second,
// then swept up to the right and stopped upright; #224. Keyed with the hands up by the face and the trunk turning
// as in third person, the left shoulder came round in front of the eyes and its arm filled half the view.)
import { viewMove, type ViewMove } from '../viewModel';
import { SWING_KEY, type ViewSwing } from '../viewSwing';
import { tunable } from '../../core/tuning';

/**
 * The cuts through the eyes swung as a body swings them (viewSwing.ts `ViewSwing`: each in one plane, its flat that
 * plane's, so its edge leads; tuned live in a dev build, `--tune warriorSwings.oneFore=...`): a one-hander's forehand,
 * from high on the right down across to the left, and its backhand, from over the left shoulder down across to the
 * right, each round the right shoulder (in the eyes' frame (0.30, -0.40, -0.08)). (Keyed as the eyes saw a cut, the
 * blade held broadside to them, it whipped forward over the top flat first, its edge 40 degrees off the way it moved,
 * the forearm turned 55 degrees past its range; the owner: "it should strike according to physics... blade parallel
 * to strike direction")
 */
const SWINGS = tunable('warriorSwings', {
  // (the forehand: wound up over the right shoulder, down to the left through the aim, on low to the left, then up
  // into a guard there, the forearm rolling the blade up ahead, as it waits for the next cut; each key its share, the
  // striking part's way, the grip's reach, the wrist's bend, the elbow's drop, the forearm's roll. Its speed spread
  // over the blow and carried on after it: in a share of its own, a dual wielder's quicker cut, 18 frames to a sword
  // and shield's 25, stopped dead 50 ms after its blow and swept 67 degrees of the skill's 126; ended where the
  // follow-through took it, none of the blade was in the frame as it waited; waiting ahead of the hand unrolled, it
  // pointed away from the eyes, a third of it in the frame looking a quarter of the frame's height long)
  oneForePlane: [0.22, -0.3, -0.22, 210],
  oneFore: [
    0, 45, 0.46, 0, 30, 0,
    0.2, 100, 0.44, -12, 60, 0,
    0.36, 145, 0.44, -10, 70, 0,
    0.44, 105, 0.48, -10, 70, 0,
    0.5, 50, 0.56, -5, 70, 0,
    0.56, 0, 0.64, -15, 70, 0,
    0.62, -22, 0.66, -20, 75, 0,
    0.68, -30, 0.65, -15, 75, 0,
    0.76, -28, 0.62, -8, 70, -15,
    0.88, -21, 0.58, -15, 70, -40,
  ],
  // (the backhand, straight after it: from where the forehand left the blade low on the left, turned over by the
  // forearm as it winds up there, rising to the right through the aim, on to the right and up into a guard there;
  // the elbow let up into the plane as it comes in to the blow: up in it at once, an axe's and a mace's shoulder
  // turned 15 degrees past its range; wound up from the rolled guard 2 cm further out, a mace's shoulder was raised a
  // degree past what its plane allows)
  oneBackPlane: [0.22, -0.3, -0.22, 20],
  oneBack: [
    0, 140, 0.64, -22, 88, 200,
    0.18, 135, 0.62, -10, 85, 100,
    0.36, 128, 0.56, -5, 20, 0,
    0.44, 100, 0.56, 0, 18, 0,
    0.5, 52, 0.58, 0, 8, 0,
    0.56, 0, 0.64, -15, 0, 0,
    0.62, -22, 0.66, -20, 0, 0,
    0.68, -34, 0.67, -18, 0, 0,
    0.76, -33, 0.64, -10, 5, 0,
    0.88, -26, 0.6, -5, 10, 0,
  ],
  // (a two-hander's, its right hand the upper one on the handle, the left following on the lower grip: its guard at
  // rest, one key in an upright plane, the blade up before the right shoulder; its forehand from there, its backhand
  // from where the forehand left the blade)
  twoRestPlane: [0.22, -0.3, -0.22, 285],
  twoRest: [0, 30, 0.52, 0, 0, 40],
  // (and a two-hander with a head, an axe or a maul: its head held lower and leaning out to the right, as Vermintide
  // 2's hammer is, all of it seen; its plane through the same shoulder, crossing the view at `twoRestHeadTurn`, the
  // fists where a blade's are. Held as a blade is, its striking part where a blade's is, a shorter weapon stood
  // upright and its head was out of the frame but for its lower edge, 14% of it; the owner: "two handed maul should be
  // lowered to see more of its head". Fitted to the hammer's line, the fists came up to the shoulder, the elbow 19
  // degrees past its range)
  twoRestHeadTurn: [270],
  twoRestHead: [0, 15, 0.52, 0, 0, 40],
  // (driven by the trunk, as a body swings a heavy weapon: the arm's own sweep a short one, in a plane the arms hold
  // it in within their ranges, carried round the spine by the trunk's turn (`twoTurn`), from 29 degrees to the right
  // to 40 to the left: drawn back by the right shoulder over a quarter of the cut, its speed built over a ninth of a
  // second into the blow at the aim and dying away over a fifth after it, carried on 77 degrees to the left and out
  // of the frame there, across 79% of the frame's width at 27 degrees off level, its blow's point at 15 m/s. Swung
  // round the right shoulder alone in the plane its blade crossed the view in, it cut down to the middle of the view,
  // 67 degrees off level across 17% of its width, turned 2000 degrees a second and stopped dead in 67 ms, and the
  // forearms then rolled it up into a guard on the left; flattened so, the right shoulder turned 150 to 180 degrees
  // past its range whatever its elbow did. The owner: "first slice should be wider, its currently down towards the
  // middle of the screen, then it lifts up to left", "we need to preserve momentum of the weapon", "it should not be
  // jerky, it should feel heavy")
  twoForePlane: [0.22, -0.3, -0.22, 208],
  twoFore: [
    0, 50, 0.5, 0, 0, 40,
    0.12, 55, 0.42, -5, 20, 10,
    0.25, 60, 0.36, -10, 30, 0,
    0.36, 50, 0.4, -15, 30, 0,
    0.46, 28, 0.5, -25, 40, 0,
    0.56, 0, 0.62, -30, 45, 0,
    0.64, -14, 0.62, -30, 55, 0,
    0.72, -22, 0.6, -30, 55, 0,
    0.8, -26, 0.58, -30, 55, 0,
    0.9, -28, 0.56, -30, 55, 0,
    1, -28, 0.56, -30, 55, 0,
  ],
  // (and in a row after its backhand: taken on from where the backhand left the blade low on the right, out of the
  // frame, its plane turned from the backhand's into the forehand's as it comes up into the forehand's wind-up there
  // (`twoRowTurn`), the forearm rolling a little on the way (unrolled, the lower wrist went 16 degrees past its
  // range), and on as the forehand from rest)
  twoForeRow: [
    0, -28, 0.56, -30, 0, 0,
    0.17, 15, 0.46, -20, 0, 17,
    0.34, 60, 0.36, -10, 30, 0,
    0.4, 50, 0.4, -15, 30, 0,
    0.48, 28, 0.5, -25, 40, 0,
    0.56, 0, 0.62, -30, 45, 0,
    0.64, -14, 0.62, -30, 55, 0,
    0.72, -22, 0.6, -30, 55, 0,
    0.8, -26, 0.58, -30, 55, 0,
    0.9, -28, 0.56, -30, 55, 0,
    1, -28, 0.56, -30, 55, 0,
  ],
  // (its backhand, straight after it: taken on from where the forehand left the blade low on the left, out of the
  // frame, its plane turned from the forehand's into its own as the blade rises up the left of the frame and over
  // the left shoulder (`twoRowTurn`), then cut down across the view to the right, the forehand's mirror image, and
  // carried on out of the frame there: an X, both cuts downwards. Run back along the forehand's way, up from the
  // left through the aim to the right, the owner: "you cannot just reverse the direction"; faded from the forehand's
  // end into its wind-up, the grip went straight, the fist turned on its own and the right wrist bent 26 degrees past
  // its range; wound up over the shoulder with the blade behind it, it cut 140 degrees to the aim in a sixth of a
  // second, 42 m/s. Its lower hand lets go of the handle out of the frame: up to the left, the handle's lower end
  // goes out to the right, 16 cm past the left hand's reach)
  twoBackPlane: [0.22, -0.3, -0.22, 330],
  twoBack: [
    0, -28, 0.56, -30, 55, 0,
    0.34, 55, 0.4, 0, 0, 0,
    0.42, 40, 0.45, -10, 0, 0,
    0.49, 22, 0.52, -20, 0, 0,
    0.56, 0, 0.62, -30, 0, 0,
    0.64, -14, 0.62, -30, 0, 0,
    0.72, -22, 0.6, -30, 0, 0,
    0.8, -26, 0.58, -30, 0, 0,
    0.9, -28, 0.56, -30, 0, 0,
    1, -28, 0.56, -30, 0, 0,
  ],
  // (and back from where each left it to the guard, its plane turned from the cut's into the guard's: `twoOutTurn`)
  // (each begun at the cut's last key, the guard's own last: `backTo`)
  twoOutFore: [0, -28, 0.56, -30, 55, 0],
  twoOutBack: [0, -28, 0.56, -30, 0, 0],
  /** how far the fist holds a one-hander's handle diagonally across its palm through a cut (degrees, as a hand holds
   *  a sword: hands.ts `SLANT` at most) */
  cutSlant: 25,
  /** the share of a cut its striking part reaches the aim at (Rending Cleave fires then) */
  cutHit: 0.56,
  /** a one-handed cut's trunk turn (rad): wound back from it, and turned into it, from and to which shares of the cut
   *  (the arm keeps within a shoulder's reach of the chest as it crosses the body: the trunk leads the arm into the
   *  blow) */
  cutTurn: [0.35, 0.7, 0.38, 0.6],
  /** a two-handed cut's, which carries the whole swing round the spine (rad, as `cutTurn`; eased in and out, as a
   *  heavy weapon's weight turns a body), and the share one in a row turns from */
  twoTurn: [0.5, 0.7, 0.33, 0.95, 0.25],
  /** the shares of a two-hander's cut in a row its plane turns over, from the last cut's into its own
   *  (`ViewSwing.from`) */
  twoRowTurn: [0, 0.34],
  /** and of its way back to its guard, from the cut's into the guard's */
  twoOutTurn: [0, 1],
}, {
  oneFore: SWING_KEY, oneBack: SWING_KEY, twoRest: SWING_KEY, twoRestHead: SWING_KEY, twoFore: SWING_KEY,
  twoForeRow: SWING_KEY, twoBack: SWING_KEY, twoOutFore: SWING_KEY, twoOutBack: SWING_KEY,
});
export const CUT_TURN: readonly number[] = SWINGS.cutTurn;
export const TWO_CUT_TURN: readonly number[] = SWINGS.twoTurn;
export const ONE_FORE_CUT: ViewSwing = {
  plane: SWINGS.oneForePlane, keys: SWINGS.oneFore,
  get slant() { return SWINGS.cutSlant; },
  get hit() { return SWINGS.cutHit; },
};
export const ONE_BACK_CUT: ViewSwing = {
  plane: SWINGS.oneBackPlane, keys: SWINGS.oneBack,
  get slant() { return SWINGS.cutSlant; },
  get hit() { return SWINGS.cutHit; },
};
export const TWO_REST: ViewSwing = {
  plane: SWINGS.twoRestPlane, keys: SWINGS.twoRest,
  get slant() { return SWINGS.cutSlant; },
  hit: 0,
};
export const TWO_REST_HEAD: ViewSwing = {
  get plane() { return [...SWINGS.twoRestPlane.slice(0, 3), SWINGS.twoRestHeadTurn[0]]; },
  keys: SWINGS.twoRestHead,
  get slant() { return SWINGS.cutSlant; },
  hit: 0,
};
/** the two-handers with a head, which rest as `TWO_REST_HEAD` (models/warrior.ts names them); the others are blades */
const HEADED = new Set(['Greataxe', 'Maul']);
/** the guard a two-hander rests in, by its name */
export const twoRestOf = (weapon: string): ViewSwing => (HEADED.has(weapon) ? TWO_REST_HEAD : TWO_REST);
export const TWO_FORE_CUT: ViewSwing = {
  plane: SWINGS.twoForePlane, keys: SWINGS.twoFore,
  get slant() { return SWINGS.cutSlant; },
  get hit() { return SWINGS.cutHit; },
};
export const TWO_FORE_ROW: ViewSwing = {
  plane: SWINGS.twoForePlane, keys: SWINGS.twoForeRow,
  get slant() { return SWINGS.cutSlant; },
  get hit() { return SWINGS.cutHit; },
  get from() { return TWO_BACK_CUT; },
  turning: SWINGS.twoRowTurn,
};
export const TWO_BACK_CUT: ViewSwing = {
  plane: SWINGS.twoBackPlane, keys: SWINGS.twoBack,
  get slant() { return SWINGS.cutSlant; },
  get hit() { return SWINGS.cutHit; },
  from: TWO_FORE_CUT,
  turning: SWINGS.twoRowTurn,
};
/** A two-hander's way back to `rest` from where a cut (`from`) left it: `start`, the cut's last key, then the guard's
 *  at its end, its plane turned from the cut's into the guard's. */
function backTo(rest: ViewSwing, from: ViewSwing, start: readonly number[]): ViewSwing {
  return {
    get plane() { return rest.plane; },
    get keys() { return [...start, 1, ...rest.keys.slice(1, SWING_KEY)]; },
    get slant() { return SWINGS.cutSlant; },
    hit: 1,
    from,
    turning: SWINGS.twoOutTurn,
  };
}
/** each guard's ways back to it, from where the forehand left the weapon and where the backhand did */
export const TWO_OUTS = new Map([TWO_REST, TWO_REST_HEAD].map((rest) => [rest, {
  fore: backTo(rest, TWO_FORE_CUT, SWINGS.twoOutFore),
  back: backTo(rest, TWO_BACK_CUT, SWINGS.twoOutBack),
}]));
/** the swings by their names in `warriorSwings` (the lab's `swing` keys a pose in one) */
export const SWINGS_NAMED: Readonly<Record<string, ViewSwing>> = {
  oneFore: ONE_FORE_CUT, oneBack: ONE_BACK_CUT, twoRest: TWO_REST, twoRestHead: TWO_REST_HEAD, twoFore: TWO_FORE_CUT,
  twoForeRow: TWO_FORE_ROW, twoBack: TWO_BACK_CUT, twoOutFore: TWO_OUTS.get(TWO_REST)!.fore,
  twoOutBack: TWO_OUTS.get(TWO_REST)!.back,
};

/** a two-hander at rest through the eyes, in a middle guard: the fists low on the right of the crosshair (the lower
 *  one just under the frame, as at a person's belly), the point forward and up, the whole weapon in the frame and its
 *  head seen. (Up to the right, the blade ran out of the frame's top and the wrists bent over; on the shoulder, as in
 *  third person, nothing of it was seen; upright before the hands, the right forearm stood up the view and covered
 *  the crosshair) */
export const TWO_REST_AT: [number, number, number] = [0.18, -0.34, -0.37];
export const TWO_REST_DIR: [number, number, number] = [-0.05, 0.6, -0.8];

/** a two-handed forehand, from the right shoulder down across to the left hip: wound up by 0.3 of the cast to the
 *  right shoulder (the fists at the chest's height by the frame's right edge, the blade back over the shoulder out of
 *  the frame), tipped further back by 0.42, coming over at 0.5 with the hands still low, across the middle as the cut
 *  lands (0.55) and along the bottom out to the left by 0.68, where it follows through ahead and low, still seen; then
 *  raised on the left and back to rest. (Wound up to a high guard, and coming over upright, the upper hand rose to the
 *  eyes' height and its forearm stood up the view: the elbow seen to rise as the blow began) */
export const TWO_FORE: ViewMove = viewMove([
  [0, TWO_REST_AT, TWO_REST_DIR],
  [0.3, [0.2, -0.33, -0.42], [0.15, 0.8, 0.55]],
  [0.42, [0.22, -0.31, -0.38], [0.25, 0.7, 0.65]],
  [0.5, [0.16, -0.35, -0.46], [0.15, 0.9, -0.4]],
  [0.55, [0.12, -0.28, -0.38], [-0.6, 0.5, -0.62]],
  [0.6, [0.04, -0.3, -0.34], [-0.88, 0.05, -0.47]],
  [0.68, [0.1, -0.26, -0.32], [-0.7, -0.3, -0.65]],
  [0.76, [0.06, -0.26, -0.31], [-0.65, -0.35, -0.67]],
  [0.88, [0.07, -0.38, -0.39], [-0.25, 0.85, -0.45]],
  [1, TWO_REST_AT, TWO_REST_DIR],
]);

/** its backhand, from over the left shoulder down across to the right: the right forearm lies level across the chest
 *  to hold the blade up there, as a body holds it, so the fists are wound up low, that forearm crossing the bottom of
 *  the view (at the eyes' height it crossed the middle); following through with the lower fist before the left
 *  shoulder, its forearm coming straight ahead to the handle across it (left of the middle, the forearm still pointed
 *  the blade's way and the hand let go). (Wound down to the left hip to rise across the view, the right arm reached
 *  behind the body, the shoulder 45 degrees past its range) */
export const TWO_BACK: ViewMove = viewMove([
  [0, TWO_REST_AT, TWO_REST_DIR],
  [0.3, [-0.06, -0.33, -0.44], [-0.3, 0.75, 0.55]],
  [0.42, [-0.1, -0.32, -0.42], [-0.35, 0.65, 0.68]],
  [0.5, [-0.06, -0.35, -0.46], [-0.15, 0.9, -0.4]],
  [0.55, [-0.12, -0.3, -0.38], [0.5, 0.7, -0.5]],
  [0.6, [-0.18, -0.32, -0.38], [0.88, 0.1, -0.47]],
  [0.68, [-0.22, -0.36, -0.38], [0.9, 0.05, -0.42]],
  [0.76, [-0.2, -0.35, -0.4], [0.85, 0.15, -0.48]],
  [1, TWO_REST_AT, TWO_REST_DIR],
]);

/** a one-handed forehand, the right hand's: raised high on the right, the blade up, then as the two-hander's, the
 *  follow-through held where it's seen (as low as the two-hander's, the blade was out of the frame for a quarter of a
 *  second; drawn back by the face, it filled the view) */
export const ONE_FORE: ViewMove = viewMove([
  [0, [0.24, -0.26, -0.44], [0.25, 0.9, -0.35]],
  [0.3, [0.26, -0.12, -0.4], [0.1, 0.97, 0.2]],
  [0.42, [0.28, -0.1, -0.38], [0.2, 0.9, 0.38]],
  [0.5, [0.24, -0.1, -0.44], [0.2, 0.95, -0.25]],
  [0.55, [0.14, -0.18, -0.46], [-0.6, 0.5, -0.62]],
  [0.6, [0.02, -0.22, -0.44], [-0.88, 0.05, -0.47]],
  [0.68, [-0.06, -0.22, -0.42], [-0.85, -0.2, -0.5]],
  [0.85, [-0.06, -0.22, -0.42], [-0.8, -0.3, -0.5]],
]);

/** the right hand's backhand: raised across the body only as far as the left shoulder's front (further was past the
 *  arm's reach), then down across to the right */
export const ONE_BACK: ViewMove = viewMove([
  [0, [0.24, -0.26, -0.44], [0.25, 0.9, -0.35]],
  [0.3, [-0.08, -0.14, -0.42], [-0.1, 0.97, 0.2]],
  [0.42, [-0.1, -0.12, -0.4], [-0.2, 0.9, 0.38]],
  [0.5, [-0.06, -0.12, -0.44], [-0.2, 0.95, -0.25]],
  [0.55, [0.02, -0.2, -0.46], [0.6, 0.5, -0.62]],
  [0.6, [0.14, -0.22, -0.44], [0.88, 0.05, -0.47]],
  [0.68, [0.22, -0.22, -0.42], [0.85, -0.2, -0.5]],
  [0.85, [0.22, -0.22, -0.42], [0.8, -0.3, -0.5]],
]);

/** where an overhead blow ends, the blade driven down ahead of the feet (a two-hander's, a one-hander's): its keys end
 *  there, and after the cast it's held there a moment (models/warrior.ts `chopTail`), low in the view, the blade
 *  ahead and down. (Driven steeply down, a two-hander was out of the frame from the blow to the end of the hold, and
 *  the lower hand's joints went 20 degrees past and let go; with its lower grip by the chest, the left arm ran 15 cm
 *  into the body) */
export const TWO_DOWN_AT: [number, number, number] = [0.08, -0.22, -0.33];
export const TWO_DOWN_DIR: [number, number, number] = [0.05, -0.38, -0.92];
export const ONE_DOWN_AT: [number, number, number] = [0.1, -0.3, -0.46];
export const ONE_DOWN_DIR: [number, number, number] = [-0.12, -0.3, -0.95];

/** Power Strike with a two-hander: raised high by 0.3 of its cast, the lower fist seen in the top half of the view and
 *  the blade back over the head out of the frame (raised straight overhead, the hands left the view and the upper
 *  arms loomed past the eyes); drawn further back as the charge gathers, to 0.8; then over the top and down through
 *  the view, the blade driven down by 0.9, where the skill fires (it stood upright on the right for a second and a
 *  half, then tipped to point ahead after the skill had fired) */
export const POWER_TWO: ViewMove = viewMove([
  [0, TWO_REST_AT, TWO_REST_DIR],
  [0.3, [0.12, -0.06, -0.36], [0.15, 0.8, 0.58]],
  [0.8, [0.14, -0.03, -0.33], [0.12, 0.72, 0.68]],
  [0.86, [0.1, -0.2, -0.32], [-0.05, 0.85, -0.52]],
  [0.9, TWO_DOWN_AT, TWO_DOWN_DIR],
]);

/** Thunder Crescent: as Power Strike's, quicker, with no charge: raised by 0.3, loaded to 0.4, over the top at 0.48
 *  and driven down by 0.55, where it fires, and held there */
export const SMITE_TWO: ViewMove = viewMove([
  [0, TWO_REST_AT, TWO_REST_DIR],
  [0.3, [0.12, -0.06, -0.36], [0.15, 0.8, 0.58]],
  [0.4, [0.14, -0.03, -0.33], [0.12, 0.72, 0.68]],
  [0.48, [0.1, -0.2, -0.32], [-0.05, 0.85, -0.52]],
  [0.55, TWO_DOWN_AT, TWO_DOWN_DIR],
]);

/** a two-hander back to rest from where an overhead blow ended, over the hold after it: the blade raised on the way
 *  (faded straight back, it pointed ahead out of the lower fist halfway, and the hand let go) */
export const RECOVER_TWO: ViewMove = viewMove([
  [0, TWO_DOWN_AT, TWO_DOWN_DIR],
  [0.5, [0.06, -0.32, -0.42], [-0.2, 0.85, -0.45]],
  [1, TWO_REST_AT, TWO_REST_DIR],
]);

/** Power Strike with one hand (the left hand's mirrors it, two blades): as the two-hander's */
export const POWER_ONE: ViewMove = viewMove([
  [0, [0.24, -0.26, -0.44], [0.25, 0.9, -0.35]],
  [0.3, [0.2, -0.04, -0.36], [0.1, 0.8, 0.59]],
  [0.8, [0.22, -0.01, -0.33], [0.08, 0.72, 0.69]],
  [0.86, [0.16, -0.14, -0.44], [-0.05, 0.85, -0.52]],
  [0.9, ONE_DOWN_AT, ONE_DOWN_DIR],
]);

/** how far the blade's flat is turned to face the eyes through a cut: from the load, through the blow, off as it
 *  follows through (shares of the cast) */
export const CUT_FLAT = [0.36, 0.48, 0.7, 0.85];

/** how much of the trunk's turn through a swing shows through the eyes, which stay on the aim: in full, the far
 *  shoulder came round in front of them */
export const EYES_TURN = 0.3;
