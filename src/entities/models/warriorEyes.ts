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
import { viewMove, type ViewMove, type ViewSwing } from '../viewModel';
import { tunable } from '../../core/tuning';

/**
 * The cuts through the eyes swung as a body swings them (viewModel.ts `ViewSwing`: each in one plane, its flat that
 * plane's, so its edge leads; tuned live in a dev build, `--tune warriorSwings.oneFore=...`): a one-hander's forehand,
 * from high on the right down across to the left, and its backhand, from over the left shoulder down across to the
 * right, each round the right shoulder (in the eyes' frame (0.30, -0.40, -0.08)). (Keyed as the eyes saw a cut, the
 * blade held broadside to them, it whipped forward over the top flat first, its edge 40 degrees off the way it moved,
 * the forearm turned 55 degrees past its range; the owner: "it should strike according to physics... blade parallel
 * to strike direction")
 */
const SWINGS = tunable('warriorSwings', {
  oneForePlane: [0.22, -0.3, -0.22, -0.45, 0.1, -0.89, 0.6, 0.75, 0.25],
  oneFore: [
    0, 0, 0.5, 33,
    0.28, 60, 0.45, 60,
    0.36, 63, 0.44, 64,
    0.44, 48, 0.48, 55,
    0.5, 25, 0.57, 30,
    0.56, 0, 0.64, 0,
    0.62, -15, 0.64, -5,
    0.72, -22, 0.62, -5,
    0.85, -22, 0.62, -5,
  ],
  oneBackPlane: [0.18, -0.32, -0.18, 0.15, 0.05, -0.99, -0.9, 0.33, -0.25],
  oneBack: [
    0, 5, 0.52, 33,
    0.28, 85, 0.55, 40,
    0.36, 88, 0.54, 45,
    0.44, 65, 0.52, 45,
    0.5, 35, 0.58, 25,
    0.56, 0, 0.64, 0,
    0.62, -15, 0.64, -5,
    0.72, -22, 0.62, -5,
    0.85, -22, 0.62, -5,
  ],
});
export const ONE_FORE_CUT: ViewSwing = { plane: SWINGS.oneForePlane, keys: SWINGS.oneFore };
export const ONE_BACK_CUT: ViewSwing = { plane: SWINGS.oneBackPlane, keys: SWINGS.oneBack };

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
