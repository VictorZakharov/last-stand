// The warrior's moves through the eyes (models/warrior.ts), each a swing as a person swings their own (viewSwing.ts):
// the arm and the weapon laid out in a plane through the shoulder and the aim, keyed by the striking part's way in it,
// the grip's reach, the wrist's bend, the elbow's drop and the forearm's roll (`warriorSwings`, tuned live with the
// lab's `--tune warriorSwings.<field>=...`), so the edge over the knuckles leads and the striking part, a blade's tip's
// third, lands on the crosshair as the skill fires. Seen from the middle of its own arc a blade swung round the body
// points away from the eyes, a sliver, so each cut crosses the view as a person sees their own: wound up by a
// shoulder, over and down across the middle through the aim, followed through low on the other side, out of the
// frame. A two-hander's guard is a swing's key too, its right hand the upper one on the handle and the left following
// on the lower grip, and every move with it is swung from the guard, its plane turned from the guard's into its own,
// and keyed back to it from where it ends. Each hand stays within its arm's reach of its own shoulder (in the eyes'
// frame about (±0.23, -0.32, 0); an arm reaches 0.69), and a two-hander's lower fist holds its handle only across it,
// about 50 degrees or more off the line from its shoulder (run along the left forearm, that hand let go of it).
// (The swing was a wiper's sweep from one side: it wound slowly out to the left, stood there a third of a second,
// then swept up to the right and stopped upright; #224. Keyed with the hands up by the face and the trunk turning as
// in third person, the left shoulder came round in front of the eyes and its arm filled half the view. Keyed by the
// grip's place and the weapon's way in the camera's space, each axis a curve of its own, the blades left their planes
// between keys and led with their flats, and the forearms flipped at their ranges' ends, the blades jumping a metre
// and more in a frame; #252.)
import { SWING_KEY, type ViewSwing } from '../viewSwing';
import { tunable } from '../../core/tuning';

/**
 * The cuts through the eyes swung as a body swings them (viewSwing.ts `ViewSwing`: each in one plane, its flat that
 * plane's, so its edge leads; tuned live in a dev build, `--tune warriorSwings.oneFore=...`): a one-hander's forehand,
 * from high on the right down across to the left, and its backhand, from over the left shoulder down across to the
 * right, an X, each in a plane through the right shoulder (in the eyes' frame (0.30, -0.40, -0.08)) carried round the
 * spine by the trunk's turn. (Keyed as the eyes saw a cut, the
 * blade held broadside to them, it whipped forward over the top flat first, its edge 40 degrees off the way it moved,
 * the forearm turned 55 degrees past its range; the owner: "it should strike according to physics... blade parallel
 * to strike direction")
 */
const SWINGS = tunable('warriorSwings', {
  // (a one-hander's forehand, as a two-hander's and a dual wielder's, driven by the trunk (`cutTurn`): from high on
  // the right down across to the left, carried on out of the frame there; each key its share, the striking part's
  // way, the grip's reach, the wrist's bend, the elbow's drop, the forearm's roll. Swung round the right shoulder
  // alone, it cut down to a guard rolled up on the left, and its backhand ran back the way it came, up from the left
  // through the aim; the owner, of a two-hander's cut so: "you cannot just reverse the direction")
  oneForePlane: [0.22, -0.3, -0.22, 208],
  oneFore: [
    0, 50, 0.5, 0, 0, 40,
    0.12, 55, 0.42, -5, 20, 10,
    0.25, 60, 0.36, -10, 30, 0,
    0.34, 54, 0.38, -12, 30, 0,
    0.42, 40, 0.44, -18, 35, 0,
    0.5, 20, 0.54, -25, 40, 0,
    0.56, 0, 0.62, -30, 45, 0,
    0.64, -14, 0.62, -30, 55, 0,
    0.72, -22, 0.6, -30, 55, 0,
    0.8, -26, 0.58, -30, 55, 0,
    0.9, -28, 0.56, -30, 55, 0,
    1, -28, 0.56, -30, 55, 0,
  ],
  // (and in a row after its backhand: taken on from where the backhand left the blade low on the right, its plane
  // turned from the backhand's into its own as it comes up into the wind-up (`rowTurn`), then on as from rest)
  oneForeRow: [
    0, -28, 0.56, -30, 0, 0,
    0.17, 15, 0.46, -20, 0, 17,
    0.34, 50, 0.38, -10, 30, 0,
    0.4, 44, 0.41, -12, 30, 0,
    0.46, 32, 0.47, -18, 35, 0,
    0.51, 17, 0.54, -25, 40, 0,
    0.56, 0, 0.62, -30, 45, 0,
    0.64, -14, 0.62, -30, 55, 0,
    0.72, -22, 0.6, -30, 55, 0,
    0.8, -26, 0.58, -30, 55, 0,
    0.9, -28, 0.56, -30, 55, 0,
    1, -28, 0.56, -30, 55, 0,
  ],
  // (its backhand, straight after it: an X with the forehand, as a two-hander's, from where the forehand left the
  // blade up the left of the frame over the left shoulder, then down across the view to the right and on out of the
  // frame there)
  oneBackPlane: [0.22, -0.3, -0.22, 330],
  oneBack: [
    0, -28, 0.56, -30, 55, 0,
    0.15, 10, 0.48, -15, 25, 0,
    0.3, 45, 0.42, 0, 0, 0,
    0.37, 41, 0.44, -5, 0, 0,
    0.44, 30, 0.48, -12, 0, 0,
    0.5, 17, 0.54, -20, 0, 0,
    0.56, 0, 0.62, -30, 0, 0,
    0.64, -14, 0.62, -30, 0, 0,
    0.72, -22, 0.6, -30, 0, 0,
    0.8, -26, 0.58, -30, 0, 0,
    0.9, -28, 0.56, -30, 0, 0,
    1, -28, 0.56, -30, 0, 0,
  ],
  // (and back from where it left the blade to where a forehand from rest starts, its plane turned from the backhand's
  // into the forehand's (`outTurn`), the rest faded in from there. Faded straight to rest, the forearm turned the
  // other way round and flipped the blade in a frame, 75 m/s)
  oneOutBack: [0, -28, 0.56, -30, 0, 0],
  // (a two-hander's, its right hand the upper one on the handle, the left following on the lower grip: its guard at
  // rest, one key in an upright plane, the blade up before the right shoulder, the whole weapon in the frame; its
  // forehand from there, its backhand from where the forehand left the blade. Up to the right, the blade ran out of
  // the frame's top and the wrists bent over; on the shoulder, as in third person, nothing of it was seen; upright
  // before the hands, the right forearm stood up the view and covered the crosshair)
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
  // (and held through Steel Tempest's spin, as the guard is, one key, carried round as the body turns (models/warrior.ts
  // `carryRound`): about where the forehand leaves the blade, low on the left and out of the frame, in its plane,
  // which holds the turn's way, so an edge leads (every two-hander strikes with either: a blade's two edges, a
  // greataxe's two bits, a maul's two faces), both hands on the handle. Held low on the right, where the backhand
  // leaves it, the lower grip was 9 to 18 cm past the left arm's reach and that hand let go of it the whole spin
  // (#198); a little further round there, a maul's head came round into the view's bottom once a turn, 2 flashes a
  // second in the forest. Held in its guard, upright at the right, its
  // flat led the turn, 51 degrees off its edge; placed by the grip's place and the weapon's way, the right wrist was 50
  // degrees past its range; held out to the right in a plane crossing the view the other way (150 degrees), both
  // fists came round into the view's bottom once a turn, a flash each time (as the one-hander's held across the view,
  // `spinOn`); #252)
  twoSpinPlane: [0.22, -0.3, -0.22, 208],
  twoSpin: [0, -35, 0.56, -30, 55, 0],
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
  // frame, its first key the backhand's last (`TWO_FORE_ROW`), its plane turned from the backhand's into the
  // forehand's as it comes up into the forehand's wind-up there (`rowTurn`), the forearm rolling a little on the way
  // (unrolled, the lower wrist went 16 degrees past its range), and on as the forehand from rest)
  twoForeRow: [
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
  // frame, its first key the forehand's last (`TWO_BACK_CUT`), its plane turned from the forehand's into its own as
  // the blade rises up the left of the frame and over the left shoulder (`rowTurn`), then cut down across the view to
  // the right and carried on out of the frame there: an X, both cuts downwards. The forehand's mirror image, the
  // hands swapped: the right hand still the upper one, so the hands turn about the left shoulder and its plane runs
  // through that one, the forehand's mirrored (`holds`: the right arm reaches the grip from its own shoulder, its
  // forearm crossed over the left at the wind-up, as a longsword is cut from the left). Its end reaches further out
  // than the mirror's own, the hands low on the right well ahead of the body. Run back along the forehand's way, up
  // from the left through the aim to the right, the owner: "you cannot just reverse the direction"; faded from the
  // forehand's end into its wind-up, the grip went straight, the fist turned on its own and the right wrist bent 26
  // degrees past its range; wound up over the shoulder with the blade behind it, it cut 140 degrees to the aim in a
  // sixth of a second, 42 m/s. Swung by the right arm about its own shoulder, the hands far to the right, its lower
  // grip was 0.92 to 1.01 m from the left shoulder, 26 cm past that arm's reach, and the left hand let go of it for
  // the whole cut, "one handed with two handed weapon" (#198); no plane through that shoulder holds both hands and
  // still reads as a backhand. Laid out by the left arm on the lower grip, it was held cross-handed, the right wrist
  // pinned at its range's end; at the mirror's own end, reaching 0.56, the left forearm went 4 to 12 cm into the belly
  // and that hand let go. Its handle rolled 4 degrees through the blow: unrolled, the maul's right forearm turned 2
  // past its range in the frame)
  twoBackPlane: [-0.22, -0.3, -0.22, 332],
  // (and back to the guard from where it left the blade, low on the right (`TWO_OUTS`): the hands drawn in before the
  // right hip midway, the blade turned up, then on into the guard. Straight from the backhand's end to the guard, the
  // lower grip within the left arm's reach at both, it went 13 cm past it between them and the left hand let go)
  twoBackOut: [0.5, 30, 0.45, -15, 27.5, 20],
  twoBack: [
    0.34, 60, 0.36, -10, 30, 0,
    0.4, 50, 0.4, -15, 30, 0,
    0.48, 28, 0.5, -25, 40, -4,
    0.56, 0, 0.62, -30, 45, -4,
    0.64, -14, 0.66, -30, 55, 0,
    0.72, -18, 0.72, -30, 55, 0,
    0.8, -22, 0.74, -30, 55, 0,
    0.9, -24, 0.75, -30, 55, 0,
    1, -24, 0.75, -30, 55, 0,
  ],
  // (a dual wielder's cut, each hand's in turn, the left's the right's mirror image: wide across the view, both ways
  // in a row, as a two-hander's, driven by the trunk the same way (`dualTurn`), from high on its own side down
  // across to the other and carried on out of the frame there. Each hand chopping its own forehand from its own
  // rest, a cut crossed 30% of the frame's width, 44 degrees off level, turned 3000 degrees a second and stopped dead
  // in 67 ms; the owner: "change dual wield attack to do similar swipes from both directions, similar to two handed
  // weapon". Built more gently than the two-hander's and carried on to the cut's very end: in a third of its time,
  // its speed jumped 42% in a frame into the blow and died away in 100 ms)
  dualPlane: [0.22, -0.3, -0.22, 208],
  dual: [
    0, 50, 0.5, 0, 0, 40,
    0.12, 55, 0.42, -5, 20, 10,
    0.25, 60, 0.36, -10, 30, 0,
    0.34, 54, 0.38, -12, 30, 0,
    0.42, 40, 0.44, -18, 35, 0,
    0.5, 20, 0.54, -25, 40, 0,
    0.56, 0, 0.62, -30, 45, 0,
    0.64, -14, 0.62, -30, 55, 0,
    0.72, -25, 0.6, -30, 55, 0,
    0.8, -33, 0.58, -30, 55, 0,
    0.9, -40, 0.56, -30, 55, 0,
    1, -48, 0.55, -30, 55, 0,
  ],
  // (Power Strike with one hand, the left's its mirror image (two blades): an overhead blow in a plane through the
  // right shoulder, near upright across the view, driven down by the arm, the trunk upright: its shoulder further
  // back than a cut's, which the trunk's turn brings forward (from there, the arm reached only 30 cm to a blow below
  // the face, and the wrist would have bent 120 degrees). Raised by 0.3 of the cast, the fist in the top right of the
  // view and the blade back over the head, the elbow out to the side; drawn further back as the charge gathers to
  // 0.8; over the top and down through the aim at 0.9, where the skill fires, the arm at its full reach, its tip's
  // third on the crosshair; and on down under the frame, held there after the cast. Raised over the head, nothing of
  // it was seen through the charge. Keyed by the grip's place and the weapon's way, the hand dropped 30 cm while the
  // wrist turned the blade 180 degrees: the forearm's turn and the wrist stood at their ranges' ends through the blow,
  // and the blade jumped 117 and 189 cm in a frame, its flat leading; #252)
  onePowerPlane: [0.25, -0.35, -0.05, 258],
  onePower: [
    0, 60, 0.6, -20, 0, 40,
    0.3, 111, 0.54, 2, 40, 0,
    0.8, 116, 0.55, 8, 40, 0,
    0.86, 70, 0.64, -20, 20, 0,
    0.9, 0, 0.76, -30, 0, 0,
    0.95, -22, 0.76, -30, 0, 0,
    1, -30, 0.76, -30, 0, 0,
  ],
  // (Power Strike with a two-hander, its right hand the upper one, the left following on the lower grip: from its
  // guard, raised to the top right as the one-hander's is by 0.3 of the cast, drawn back as the charge gathers to 0.8,
  // over and down through the aim at 0.9, where the skill fires, and on down under the frame, its plane turned from the
  // guard's over the lift (`powerTurn`), the forearm rolled a little while it's held up (unrolled, a greataxe's and a
  // maul's lower wrist went 11 degrees past its range through the charge). Keyed by the lower grip's place and the
  // weapon's way, its flat to the eyes, it led the blow 85 degrees off its edge and stopped dead in 33 ms; #252)
  twoPowerPlane: [0.22, -0.3, -0.22, 262],
  twoPower: [
    0.3, 111, 0.5, 2, 40, 10,
    0.8, 116, 0.52, 8, 40, 10,
    0.86, 70, 0.6, -20, 20, 0,
    0.9, 0, 0.7, -30, 0, 0,
    0.95, -22, 0.7, -30, 0, 0,
    1, -30, 0.7, -30, 0, 0,
  ],
  // (Thunder Crescent's, driven into the ground: raised as Power Strike's is by 0.27 of the cast, a moment at the top,
  // then over and down through the aim at 0.49 and on into the floor ahead as the skill fires, 0.55 (`smiteLand`),
  // out of the frame under it, and held there through the rest of the cast; its plane turned from the guard's over
  // the lift (`smiteTurn`). Brought down from 0.42 as the third person's is, its blow's point moved 85 m/s, twice
  // Power Strike's. Keyed by the lower grip's place and the weapon's way, the hands filled the view as it was raised,
  // the blow came down in a frame led by its flat, 81 degrees off its edge, the right wrist went 105 degrees past its
  // range, and it came back up broadside across the view; #252)
  twoSmitePlane: [0.22, -0.3, -0.22, 262],
  twoSmite: [
    0.27, 111, 0.5, 2, 40, 10,
    0.33, 116, 0.52, 8, 40, 10,
    0.42, 70, 0.6, -20, 20, 0,
    0.49, 0, 0.7, -30, 0, 0,
  ],
  /** the share of Thunder Crescent's cast its blow crosses the aim at, on its way down into the floor */
  smiteHit: 0.49,
  /** and where it lands, its lowest point at the floor (on the arena's floor, the dais's top under it: unseen, out of
   *  the frame under it), held there to the end of the cast: a blade's, and a headed weapon's further down (shorter to
   *  its lowest point: landed as a blade does, a greataxe stopped 12 cm over the floor and a maul 17) */
  smiteLand: [0.55, -53, 0.75, -30, 0, 0],
  smiteLandHead: [0.55, -59, 0.75, -30, 0, 0],
  /** and back to the guard from the floor (`TWO_SMITES`): the hands drawn in towards the belly midway, the weapon
   *  still low, then raised into the guard. Straight from the floor to the guard, the arms stayed out as it came up
   *  level, and a greatsword's lower grip went 7.7 cm past the left arm's reach between them, as far as the game holds
   *  it before letting go */
  smiteOut: [0.45, -20, 0.55, -20, 0, 15],
  /** how far the fist holds a one-hander's handle diagonally across its palm through a cut (degrees, as a hand holds
   *  a sword: hands.ts `SLANT` at most) */
  cutSlant: 25,
  /** the share of a cut its striking part reaches the aim at (Rending Cleave fires then) */
  cutHit: 0.56,
  /** a one-handed cut's trunk turn, which carries the whole swing round the spine (rad): wound back from it, and
   *  turned into it, from and to which shares of the cut (eased in and out, as a weapon's weight turns a body), and
   *  the share one in a row turns from */
  cutTurn: [0.5, 0.7, 0.33, 0.95, 0.25],
  /** a two-handed cut's (as `cutTurn`) */
  twoTurn: [0.5, 0.7, 0.33, 0.95, 0.25],
  /** a dual wielder's cut's (as `twoTurn`) */
  dualTurn: [0.5, 0.7, 0.33, 0.95, 0.25],
  /** the shares of a cut in a row its plane turns over, from the last cut's into its own (`ViewSwing.from`; a
   *  two-hander's, a one-hander's) */
  rowTurn: [0, 0.34],
  /** and of a way back to a guard, from the cut's into the guard's */
  outTurn: [0, 1],
  /** and of the ways from a guard into Steel Tempest's hold and back to it (`TWO_SPINS`): sooner in, later out, as
   *  the one way back the other (over the whole of each, a headed guard's lower wrist went 4 to 11 degrees past its
   *  range midway) */
  spinTurn: [0, 0.6],
  spinBackTurn: [0.4, 1],
  /** and of a two-hander's Power Strike from its guard into its own (`TWO_POWERS`), and Thunder Crescent's
   *  (`TWO_SMITES`) */
  powerTurn: [0, 0.25],
  smiteTurn: [0, 0.3],
}, {
  oneFore: SWING_KEY, oneForeRow: SWING_KEY, oneBack: SWING_KEY, oneOutBack: SWING_KEY, twoRest: SWING_KEY,
  twoRestHead: SWING_KEY, twoFore: SWING_KEY, twoForeRow: SWING_KEY, twoBack: SWING_KEY, twoBackOut: SWING_KEY,
  dual: SWING_KEY,
  onePower: SWING_KEY, twoSpin: SWING_KEY,
  twoPower: SWING_KEY, twoSmite: SWING_KEY, smiteLand: SWING_KEY, smiteLandHead: SWING_KEY, smiteOut: SWING_KEY,
});
export const CUT_TURN: readonly number[] = SWINGS.cutTurn;
export const TWO_CUT_TURN: readonly number[] = SWINGS.twoTurn;
export const DUAL_CUT_TURN: readonly number[] = SWINGS.dualTurn;
export const ONE_FORE_CUT: ViewSwing = {
  plane: SWINGS.oneForePlane, keys: SWINGS.oneFore,
  get slant() { return SWINGS.cutSlant; },
  get hit() { return SWINGS.cutHit; },
};
export const ONE_FORE_ROW: ViewSwing = {
  plane: SWINGS.oneForePlane, keys: SWINGS.oneForeRow,
  get slant() { return SWINGS.cutSlant; },
  get hit() { return SWINGS.cutHit; },
  get from() { return ONE_BACK_CUT; },
  turning: SWINGS.rowTurn,
};
export const ONE_BACK_CUT: ViewSwing = {
  plane: SWINGS.oneBackPlane, keys: SWINGS.oneBack,
  get slant() { return SWINGS.cutSlant; },
  get hit() { return SWINGS.cutHit; },
  from: ONE_FORE_CUT,
  turning: SWINGS.rowTurn,
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
/** a two-hander held through Steel Tempest's spin (`twoSpin`) */
export const TWO_SPIN: ViewSwing = {
  plane: SWINGS.twoSpinPlane, keys: SWINGS.twoSpin,
  get slant() { return SWINGS.cutSlant; },
  hit: 0,
};
export const DUAL_CUT: ViewSwing = {
  plane: SWINGS.dualPlane, keys: SWINGS.dual,
  get slant() { return SWINGS.cutSlant; },
  get hit() { return SWINGS.cutHit; },
};
/** Power Strike with one hand (`onePower`), its blow at the aim as the skill fires, 0.9 of its cast */
export const ONE_POWER: ViewSwing = {
  plane: SWINGS.onePowerPlane, keys: SWINGS.onePower,
  get slant() { return SWINGS.cutSlant; },
  hit: 0.9,
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
/** A swing's last key as the first of one taken on from its end (its numbers after its share, at share 0). */
const endOf = (keys: readonly number[]): number[] => [0, ...keys.slice(1 - SWING_KEY)];
export const TWO_FORE_ROW: ViewSwing = {
  plane: SWINGS.twoForePlane,
  get keys() { return [...endOf(SWINGS.twoBack), ...SWINGS.twoForeRow]; },
  get slant() { return SWINGS.cutSlant; },
  get hit() { return SWINGS.cutHit; },
  get from() { return TWO_BACK_CUT; },
  turning: SWINGS.rowTurn,
};
export const TWO_BACK_CUT: ViewSwing = {
  plane: SWINGS.twoBackPlane,
  get keys() { return [...endOf(SWINGS.twoFore), ...SWINGS.twoBack]; },
  get slant() { return SWINGS.cutSlant; },
  get hit() { return SWINGS.cutHit; },
  from: TWO_FORE_CUT,
  turning: SWINGS.rowTurn,
  holds: true,
};
/** A way back to `rest` (a two-hander's guard, or a forehand whose start a one-hander's rest fades in from) from where
 *  a cut (`from`) left it: `start`, the cut's last key, then the guard's first at its end, its plane turned from the
 *  cut's into the guard's over `turning`'s shares of it. */
function backTo(
  rest: ViewSwing, from: ViewSwing, start: readonly number[] | (() => readonly number[]),
  turning: readonly number[] = SWINGS.outTurn,
): ViewSwing {
  return {
    get plane() { return rest.plane; },
    get keys() { return [...(typeof start === 'function' ? start() : start), 1, ...rest.keys.slice(1, SWING_KEY)]; },
    get slant() { return SWINGS.cutSlant; },
    hit: 1,
    from,
    turning,
  };
}
/** each guard's ways back to it, from where the forehand left the weapon and where the backhand did, each begun at
 *  its cut's last key (each was a copy of it, and a backhand whose end changed left its way back starting where it no
 *  longer ended) */
export const TWO_OUTS = new Map([TWO_REST, TWO_REST_HEAD].map((rest) => [rest, {
  fore: backTo(rest, TWO_FORE_CUT, () => endOf(SWINGS.twoFore)),
  back: backTo(rest, TWO_BACK_CUT, () => [...endOf(SWINGS.twoBack), ...SWINGS.twoBackOut]),
}]));
/** a one-hander's way back after its backhand */
export const ONE_BACK_OUT: ViewSwing = backTo(ONE_FORE_CUT, ONE_BACK_CUT, SWINGS.oneOutBack);
/** A two-hander's way from `guard` into its hold through Steel Tempest's spin (`TWO_SPIN`), over the spin's first
 *  moments (models/warrior.ts `SPIN_INTO`): the guard's key, then the hold's, the guard's plane turned into the hold's,
 *  as a way back to a guard turns (`backTo`). (Faded between them, the grip and the weapon's way blended apart from
 *  the arm, the right wrist went 10 to 18 degrees past its range, whatever the hold's key; and out of the spin, 22.) */
function spinFrom(guard: ViewSwing): ViewSwing {
  return {
    get plane() { return TWO_SPIN.plane; },
    get keys() { return [...guard.keys.slice(0, SWING_KEY), 1, ...TWO_SPIN.keys.slice(1, SWING_KEY)]; },
    get slant() { return SWINGS.cutSlant; },
    hit: 0,
    from: guard,
    turning: SWINGS.spinTurn,
  };
}
/** each guard's way into the spin's hold, and back to it from there once the spin is over */
export const TWO_SPINS = new Map([TWO_REST, TWO_REST_HEAD].map((guard) => [guard, {
  into: spinFrom(guard),
  out: backTo(guard, TWO_SPIN, SWINGS.twoSpin, SWINGS.spinBackTurn),
}]));
/** Power Strike with a two-hander from `guard` (`twoPower`, after the guard's own key), its blow at the aim as the
 *  skill fires, 0.9 of its cast */
function powerFrom(guard: ViewSwing): ViewSwing {
  return {
    get plane() { return SWINGS.twoPowerPlane; },
    get keys() { return [...guard.keys.slice(0, SWING_KEY), ...SWINGS.twoPower]; },
    get slant() { return SWINGS.cutSlant; },
    hit: 0.9,
    from: guard,
    turning: SWINGS.powerTurn,
  };
}
/** each guard's Power Strike, and the way back to it from where the blow left the weapon */
export const TWO_POWERS = new Map([TWO_REST, TWO_REST_HEAD].map((guard) => {
  const blow = powerFrom(guard);
  const ended = () => [0, ...SWINGS.twoPower.slice(1 - SWING_KEY)];
  return [guard, { blow, back: backTo(guard, blow, ended) }];
}));
/** Thunder Crescent with a two-hander from `guard` (`twoSmite`, after the guard's own key), its blow down through the
 *  aim and into the floor ahead as the skill fires, landing as `land` keys it, and held there */
function smiteFrom(guard: ViewSwing, land: () => readonly number[]): ViewSwing {
  return {
    get plane() { return SWINGS.twoSmitePlane; },
    get keys() { return [...guard.keys.slice(0, SWING_KEY), ...SWINGS.twoSmite, ...land(), 1, ...land().slice(1)]; },
    get slant() { return SWINGS.cutSlant; },
    get hit() { return SWINGS.smiteHit; },
    from: guard,
    turning: SWINGS.smiteTurn,
  };
}
/** each guard's Thunder Crescent, and the way back to it from the floor */
export const TWO_SMITES = new Map([TWO_REST, TWO_REST_HEAD].map((guard) => {
  const land = () => (guard === TWO_REST_HEAD ? SWINGS.smiteLandHead : SWINGS.smiteLand);
  const blow = smiteFrom(guard, land);
  return [guard, { blow, back: backTo(guard, blow, () => [0, ...land().slice(1), ...SWINGS.smiteOut]) }];
}));
/** the swings by their names in `warriorSwings` (the lab's `swing` keys a pose in one) */
export const SWINGS_NAMED: Readonly<Record<string, ViewSwing>> = {
  oneFore: ONE_FORE_CUT, oneForeRow: ONE_FORE_ROW, oneBack: ONE_BACK_CUT, oneOutBack: ONE_BACK_OUT, twoRest: TWO_REST,
  twoRestHead: TWO_REST_HEAD, twoFore: TWO_FORE_CUT, twoForeRow: TWO_FORE_ROW, twoBack: TWO_BACK_CUT,
  twoOutFore: TWO_OUTS.get(TWO_REST)!.fore, twoOutBack: TWO_OUTS.get(TWO_REST)!.back, dual: DUAL_CUT,
  onePower: ONE_POWER, twoSpin: TWO_SPIN, twoSpinIn: TWO_SPINS.get(TWO_REST)!.into,
  twoSpinOut: TWO_SPINS.get(TWO_REST)!.out,
  twoPower: TWO_POWERS.get(TWO_REST)!.blow, twoPowerBack: TWO_POWERS.get(TWO_REST)!.back,
  twoSmite: TWO_SMITES.get(TWO_REST)!.blow, twoSmiteBack: TWO_SMITES.get(TWO_REST)!.back,
  // (and those from the guard of a two-hander with a head, a greataxe's and a maul's)
  twoOutForeHead: TWO_OUTS.get(TWO_REST_HEAD)!.fore, twoOutBackHead: TWO_OUTS.get(TWO_REST_HEAD)!.back,
  twoSpinInHead: TWO_SPINS.get(TWO_REST_HEAD)!.into, twoSpinOutHead: TWO_SPINS.get(TWO_REST_HEAD)!.out,
  twoPowerHead: TWO_POWERS.get(TWO_REST_HEAD)!.blow, twoPowerBackHead: TWO_POWERS.get(TWO_REST_HEAD)!.back,
  twoSmiteHead: TWO_SMITES.get(TWO_REST_HEAD)!.blow, twoSmiteBackHead: TWO_SMITES.get(TWO_REST_HEAD)!.back,
};

