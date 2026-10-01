# Full-body IK: what is in, how it was measured, what is left

Follow-up to the skinning research (`skinning.md`) and issue #115. Everything is procedural.

## What this PR does

- **Legs (`models/ik.ts`, `LegIK`)** for both heroes and every walking enemy (brute, husk, imp, mossback, sporecaller, thornling, barkhulk/thornheart/colossus; the witch floats and has no walk).
  - The walk cycle (`walkCycle`) swings the legs as rotations, so every foot skated over the floor. `LegIK` runs at the end of `animate` and takes the legs over: a planted foot is held at a world spot while the body moves over it; a swinging foot arcs from where it left to where it will land, predicted from the body's speed and timed by the cycle's phase.
  - The gait's rate follows the ground covered (`gaitRate`: a step per half cycle, its length from the speed and the leg length), instead of a fixed 2.1 rad per metre, so strides match the ground at walk and run, and a big enemy takes long slow steps.
  - A standing character re-steps (a timed step, 0.2-0.4 s) when its feet fall too far from under it or it turns; a moving one re-steps when a foot is left far behind.
  - The pelvis drops when a foot would be out of reach (damped, quick down, slow up); each leg is two-bone IK (`reachArm`, hinge -1); the ankle lies level on `groundHeight` (dais steps), with heel and toe pitch through the stance and swing.
  - Blended over the pose by a smoothed weight; nothing while dying; off the ground (an enemy rising at spawn) it stays out and restarts under the hips.
- **Head look-at (`LookAt`)**: neck and head turn (40 / 60) and nod onto the nearest foe (heroes, within 12 m) or the target (enemies), within what a neck allows, eased, and back ahead when the point is behind the shoulders. Not through the eyes (the camera rides the head). It reads only the body's position and facing.
- `?ik=0` restores the old legs and gait for A/B.

Co-op needs nothing: each game computes the legs from the motion it replays (a copy's phase already came from its own velocity), so there is no protocol change.

## Measured (dev build, headless d3d11)

Foot slide is the ankle's ground speed while it is within ~4 cm of the floor (a foot pitched on its toe is lifted by the pivot, so fewer frames count as contact than with the walk cycle's legs: compare the medians and the lowest-vertex rows more than the means). Hip height is above the ground.

| | FK (`?ik=0`) | IK |
| --- | --- | --- |
| mage run straight, slide mean / p90 (m/s) | 5.2 / 13.5 | 0.5 / 2.2 |
| mage run in a circle, slide mean (m/s) | 4.6 | 0.13 |
| standing still, slide (m/s) | 0 | 0.04-0.06 |
| hero run, hip height min (m) | 0.98 | 0.88 (mage), 0.94 (warrior) |
| enemies chasing, slide mean (m/s) husk, brute, mossback, thornling | 1.8, 1.4, 1.5, 3.1 | 0.5, 0.4, 0.3, 0.7 |
| lowest vertex of the feet, walking on flat ground (m) | -0.06 hero, -0.26 brute, -0.21 mossback, -0.18 thornling | 0 to -0.01 for both heroes and every enemy tried |
| the same while enemies attack (brute slam etc.) | up to -0.26 (the slam's crouch drives the feet into the floor) | 0 |
| ankle below the ground on the dais steps, worst (m) | -0.061 (12 frames sunk) | +0.07 |

- Hero attacks and skills 1-4, standing and running: hips stay within ~0.1-0.15 m of the walk cycle's; no NaN. A lunge or lean thrown at the body drags the planted feet sideways (they follow, up to 0.7 of the leg's reach) instead of sinking the pelvis.
- Teleport, the three views, enemy deaths and spawns: finite poses, feet under the hips again at once; shader programs constant at 119; two-tab co-op (`?net=local`) without errors.
- **Crowd cost:** 40 enemies of six kinds, the models' `animate` summed per frame, medians of three interleaved rounds: 0.44 ms without, 0.60 ms with leg IK and head look-at: about +0.15-0.3 ms a frame for 40 foes. The first version cost +1.5 ms because it updated the whole skeleton's matrices twice; it now updates only the hip chain.
- Things found and fixed on the way: the sole was assumed 7 cm under the ankle (`footShape` now measures each model's foot, skinned shins included), a foot pitched onto its toe or heel went through the floor (the pivot is lifted), the pelvis dropped without bound when a body lunged away from its feet (now capped, feet dragged), the guard for a body off the ground fired on the dais steps (now only far off, at spawn), stopping mid-stride snapped the swinging foot under the body (a timed step now starts from where the foot is, with its height, turn and pitch), and the stride at a sprint reached farther than the legs (`stepLength` capped, now at 0.85 m for a 0.9 m leg).

## Body lean and the warrior's hold

Planting the feet alone made the body look like it stood still while the legs reached: nothing leaned into the motion. `LegIK` now tips the whole body about the ground under it by 0.03 rad per m/s (at most 0.22 forward, 0.12 sideways, damped, off in first person), keeps the head level, and takes landings nearer under the body at a run. The warrior's own forward spine lean is reduced to match, its arm swing is halved (a carried weapon and shield hardly swing), and the arms ease back by most of the lean so the weapon and shield keep the angle they were held at. A stopped character re-steps to a neutral, feet-under-hips stance after a moment. The mage was left as it was.

## Direction changes (found by playing it)

Turning while running gave squatting, splayed poses in the warrior (the mage's robe hid most of it). Measured with `turns.mjs` (a run with w/a/s/d changes, per-frame pelvis drop, foot spacing, foot yaw), and fixed:

- **Feet stayed turned across the leg.** A planted foot kept the world yaw it landed with while the body turned (up to 1.6 rad off). A planted foot now pivots with the body (`YAW_MAX` 0.5 rad).
- **The gait's speed collapsed through a reversal.** It came from the length of a smoothed velocity vector, which passes through zero when the direction flips; it is now a smoothed scalar, with the direction falling back to the latest velocity.
- **A foot left behind by a turn stayed there.** The re-step threshold at a run fell from 0.85 to 0.45 of the leg, may start while the other foot swings, and takes a swing's duration and ease-out (`Foot.fast`) instead of a standing step's 0.25-0.5 s ease-in, which the body outran.
- **A foot too far out squatted the pelvis.** Feet are dragged in to what the leg reaches with the pelvis dropped by about 0.1 of the leg, instead of letting the pelvis sink by up to 0.2.

Warrior's largest pelvis drop through the sequence: 0.19 m to 0.08 m; hip height minimum 0.78 to 0.92. The mage's remaining 0.18 m is the sprint's own foot lift (its hip minimum, above).

The mage's bell sleeves rode up the forearm when the arm swung faster than the cloth followed (a turn with the lean), baring the hand (hem 0.08 of the way along the forearm at worst, against 0.46 with the walk cycle's legs). Each row's slide up the forearm from where the animation holds it is now capped (`SLIP` in `sleeve.ts`); the hem stays at 0.9 or more.

Also looked at now: the warrior with a two-hander and with two one-handers, running and turning from the side (the weapons keep their angle, the lower grip stays in the left hand).

## The warrior still crouched at a run (second look)

A side view of the warrior at a run read as a squat even with the pelvis no longer dropping (hips 0.97-1.06 m on flat ground, frame rate made no difference: 0.95 at 55 ms frames). What the numbers showed:

- **The rest pose stands with bent knees.** Hip to ankle is 0.955 of the leg (a third of a radian of knee), so every frame started from a sitting stance. The pelvis is now lifted by `RISE` (3 cm) and held where the legs reach (`lmax` 0.98).
- Off the dais the two steps down (0.35 m in 0.7 m) still fold the knees for a moment (hips 0.91 m above the ground under them); the body's height follows the ground with a rate of 14, so a step is taken in about a tenth of a second.

Playing it still read as wrong (a lunge, "running on one leg", a slow lunge on stopping), so it was measured against a runner instead of judged by the pelvis. `rec.mjs` records the joints of a scenario (run, stop, start, turn, tap), `stick.py` draws them as stick figures (side and front, in the body's frame), `film.mjs` films the model from any angle over a plain floor, `gait.py` computes a runner's numbers. What that showed at 6.2 m/s (the one speed a keyboard gives):

| | before | a human at 5-6 m/s |
| --- | --- | --- |
| steps per second | 7 | 3.2-3.8 (4.5+ sprinting) |
| flight, share of the time | 47 % | 20-40 % |
| foot behind the hip at lift-off (m) | 0.20 | 0.35-0.55 |
| hip lowest | in flight (inverted) | as the foot takes the weight, highest in flight |
| body sideways over the stance foot | none | 3-7 cm |

Seven steps a second with both legs on one line read from the side as one pumping leg. Now: the step follows the speed like a runner's (`stepLength`: at most 1.5 leg lengths, 4.4 steps a second at 6.2 m/s), the contact is longer (duty down to 0.31, contact 0.14 s, flight 36 %), a planted foot creeps along at a run by `SLIP` (0.3) of the body's speed (with none the feet run out of reach and re-step twice a stride; `?slip=` to compare), the landing offset is capped at 0.38 of the leg, the body is lowest as a foot takes the weight (`walkCycle`: the bob flips with the speed, halved at a run) and shifts 2 cm over the foot it stands on, and the forward lean is 0.045 rad per m/s (at most 0.3). Measured: flight 36 %, contact 0.14 s, foot ahead at touchdown 0.29 m and behind at lift-off 0.28 m, bounce 7-8 cm, lean 17-21 degrees, peak swing knee 93 degrees, peak hip flexion 66. A stop no longer holds a lunge: both feet re-step together (the second when the first is a fifth of the way through), and the body's speed eases in and out (`handleInput`: rate 9 up, 12 down, where it was 14 both ways).

### Walking while attacking (the invisible chair)

Casting slows the body to 0.45 of the run (channels 0.4), about 2.8 m/s, and the first version of the runner's gait looked wrong there: the body sat as if on a chair, a tuck of both knees with the pelvis low between the feet. `rec.mjs warrior atk` (mouse held, W held) showed why: both feet were in a timed re-step at once (`tt`), which the swing logic itself caused. A foot whose stance had run too long re-stepped, and the other foot, seeing a re-step in progress, was converted to a timed one as well (`anyTimed`). Both left the ground together and the body dropped between them. Fixed in `LegIK`:

- **A re-step no longer takes the other foot's swing with it.** A swinging foot keeps swinging, and a foot whose window opens while the other re-steps waits at a walk (`duty > 0.45`) and goes at a run, where being in the air for a moment is right.
- **Duty falls faster with the speed** (`0.6 - 0.2 * (speed - 1.5)`, from 0.75 - 0.13 * speed) so the stance's travel at 2-3 m/s stays inside what the legs reach, and the moving re-step threshold rose from 0.45 to 0.55 of the leg, so a foot is not sent on before it is well behind.
- Both feet are timed at once only after stopping (measured: the frames with both timed all have the body's speed at 0, when the two re-step to a neutral stance).

Measured after the change, warrior and mage, steady 6.2 m/s run: warrior 4.0 steps a second (mage 4.4), contact 0.15 s, flight 33 % (36), foot ahead at touchdown 0.30 m and behind at lift-off 0.27 m, bounce 7 cm (6), lean 17 degrees (21), peak swing knee 94, peak hip flexion 66; stop, start, tap and turn recordings have no double re-step while moving and the same hip heights (warrior 0.92 to 1.08 m through a run of direction changes, mage 0.92 to 1.05); attacking while walking, 0.98 m at the lowest with the feet alternating. Filmed from the side, both diagonals, in front and behind: a walk.

Turns on open ground: largest pelvis drop 0.11 m (0.09 before this pass), hips 0.95 m at the lowest (0.95), feet up to 1.1 m apart in the body's frame while it turns (0.86). Foot slide in the straight run (`slide.mjs`): warrior 0.83 to 0.79 m/s, mage 0.55 to 0.89. Crowd of 40: 0.62 ms with IK against 0.37 without.

## The squat was in the swing, not the pelvis (third look)

Played in the third-person view (a warrior with two swords, running sideways to the camera), the warrior still ran in a deep squat: knees flexed all the way round, both feet passing under an upright torso, no flight to speak of. The pelvis-height and foot-offset numbers above had passed it (hips 0.97-1.04 m against 1.06 standing), which is why two rounds of tuning by those numbers missed it. Comparing the joint angles over the gait cycle with a runner's (hip and knee flexion against the phase from touchdown) showed what the eye saw:

| phase of the cycle, from touchdown (%) | 0 | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 | 100 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hip flexion, a runner | 35 | 28 | 12 | -5 | -14 | -6 | 18 | 40 | 52 | 50 | 38 |
| hip flexion, before | 32 | 25 | 11 | 5 | 28 | 51 | 63 | 63 | 51 | 40 | 36 |
| hip flexion, now | 34 | 27 | 13 | -3 | -5 | 14 | 42 | 64 | 62 | 44 | 35 |
| knee flexion, a runner | 20 | 40 | 38 | 30 | 35 | 60 | 95 | 105 | 80 | 45 | 22 |
| knee flexion, before | 35 | 44 | 42 | 49 | 77 | 88 | 80 | 61 | 37 | 21 | 29 |
| knee flexion, now | 30 | 46 | 53 | 53 | 67 | 97 | 110 | 97 | 69 | 31 | 17 |

(A runner's figures are approximate published curves for about 5 m/s; the contact ends nearer 30 % than 40 % at 6 m/s, so the swing's peaks come a little earlier here.) The hip never extended (+6 degrees at toe-off against about -14: the thigh stayed in front of the pelvis all the way round, a seated posture) and the swing knee peaked at 50 % of the cycle instead of 70 %, so the foot was pulled up early and hung ahead of the body. Two causes:

- **The swing was eased in the world frame.** The foot was moved from where it left to where it would land with an ease-out, so its speed relative to the ground started at zero while the hip was moving at 6 m/s: it either trailed far behind the hip or, with the ease-out that hid that, rushed ahead of it, reached the landing early, then hung. A swing is now drawn in the hip's frame (`LegIK.update`, the `f.state === 'swing'` block): a cubic Hermite from where the foot left (relative to the hip) to `half` ahead, its tangents the stance's backward stroke (`STROKE_OUT` 0.5 at lift-off, `STROKE_IN` 0.8 at landing), so the foot leaves with the ground's motion, passes under the hip, reaches ahead and paws back as it lands (never skids), which is also what a runner's foot does.
- **The stance was too short for the speed.** With a planted-foot creep of 0.3 of the body's speed the foot ended 0.27 m behind the hip. The creep is real (the ankle rolls forward over the contact point as the foot goes from heel to toe) but its share is about 0.2, with the heel coming up at the end of the stance (toe pitch 0.6 rad over the last 40 % of the stance at a run). The stride is longer (`stepLength` at most 1.65 legs, 3.9-4.3 steps a second at 6.2 m/s) and the landing offset up to 0.4 of the leg. The foot now lands 0.36 m ahead and leaves 0.36 m behind (0.30 / 0.27 before).
- At a run the swing foot lifts higher (up to 1.5x) and later in the swing, so the heel comes up under the seat.
- The share of the cycle on the ground now falls as `0.62 - 0.19 * (speed - 1.5)`, so a jog at 2.8 m/s (casting or attacking slows the body to 0.45 of the run) has 24 % flight and a 0.22 s contact, not a run's third.

Measured now (warrior with two swords; the mage's numbers agree to within a few degrees): steady 6.2 m/s run: contact 0.15 s, flight 36 %, foot ahead at touchdown 0.36 m and behind at lift-off 0.36 m, peak swing knee 113 degrees, peak hip flexion 67, bounce 6-7 cm, lean 18 degrees, pelvis 1.00-1.04 m in the run and 0.99 m at the lowest through starts, stops and taps. Unchanged: no double re-step while moving in any of the run, start, stop, tap, turn and attack recordings of either hero; largest pelvis drop through the direction changes 0.10 m (warrior) and 0.11 m (mage); crowd of 40 at 0.58 ms with IK against 0.37 ms without; shader programs constant at 119. A random-play harness (third person, WASD and mouse-look flicks, obstacles and frame-time hitches, two swords) finds no frame with the hips under 0.94 m off the dais steps. Filmed in the game's third-person camera and from a strict side view: a stride with the rear leg extended, the heel up under the seat and the front leg reaching, where the last version was a squat-walk.

## Follow-up IK: turning the pelvis to the way it goes, and holding the hands

Two of the items left on #115, done here because a leg that is right under a trunk that is wrong still reads as wrong.

- **The pelvis turns towards the way the body travels, the chest stays on the aim** (`LegIK`, `twist`, `TWIST`). While a hero casts or attacks the body faces the aim (`faceTowards`), but the player keeps moving where the keys say: in the attack recording it travels 45-100 degrees to its facing. The legs stepped along the direction of travel under a pelvis that faced the aim, so the feet crossed each other (60 of 154 frames with the left foot on the right of the right one, worst 0.6 m across). Now the hips turn by the angle between the way the body travels and the way it faces (at most 1.15 rad, only at a speed, eased in and out, easing back to zero from 2 rad round to a full backpedal, so a reversal does not flip it) and the spine and chest turn back by the same amount between them, so the chest does not move; the feet plant and step in the pelvis's frame (`pyaw`), and the knees point where the pelvis faces. Measured: crossed frames 60 to 0 (worst separation +4 cm), the chest twisted about 60 degrees from the pelvis while the body goes 45-100 degrees off its aim, and through the run of direction changes the twist stays under 0.45 rad with no step larger than 0.2 rad a frame. Off in first person (legs not seen; the view already faces the look direction) and at a standstill. Enemies get it too (an enemy backing away from its target, or turning).
- **The wrists keep the blades' angle through the lean and the dip** (`LegIK.captureArms` / `holdArms`, called around `update` in the two hero models). The leg IK tips the body into its stride and lowers the pelvis, which turned the carried weapon and shield with it; the warrior compensated by easing its shoulders back by 0.6-0.7 of the lean, an approximation that also changed with the pose. Now each hand's world turn is read after the pose is complete and each wrist turns back to it after the body has been moved: a weapon or shield keeps its angle (checked with a sword and shield, two swords and the mage's staff at a run) and any move the pose itself made is untouched, since only what the leg IK did to the body is undone. **The hands' positions are not held**: a first version also pinned them in the world (two-bone IK on each arm) and the trunk then leaned onto its own hands, folding the elbows to a mean 119 degrees (peak 167) with the hands up at the shoulder, "arms tucked up and tense" in play; letting the arms follow the body gives a mean 71 degrees (63-87) with the hands between the hip and the chest, in a runner's range. Not through the eyes.
- **The warrior's arms pump at a run** (`ARM_SWING`, `WRIST` in `warrior.ts`, `WalkOpts.armL` in `walkCycle`): the carried weapons had all but frozen the arms (a swing of 0.1 rad). A one-hander's arm swings 0.4 rad against the legs, a shield arm 0.24, a two-hander's arms 0.12 (its left hand is on the grip); the wrist turns back 0.8 of the swing so the blades stay at their angle instead of wagging.

Cost: heroes only, one more world-matrix pass and two quaternion products a frame; the crowd figure above (enemies) is 0.59 ms with IK against 0.36 without. Regression as before: no double re-step while moving in any recording, largest pelvis drop through the direction changes 0.10 m (warrior) and 0.11 m (mage), all enemies sane, feet never below the floor, shader programs constant at 119, first-person and the three views finite. Random play with attacks (`fuzz.mjs`, third person, two swords, obstacles, frame-time hitches) finds no frame under 0.93 m for the hips.

## Skills under the leg IK (#115, continued)

Every warrior skill was filmed side on in slow motion with the IK and with `?ik=0`, standing and running, with each weapon style (two swords, sword and shield, two-hander), and the mage's skills standing; `.tmp/skills.mjs` scales the page's clock so a 0.3 s lunge spreads over a dozen frames.

- **The dashes knelt.** Twin Fangs' lunge and Bull Rush move the body at up to 26 m/s for a fraction of a second: planted feet were left behind, dragged after the hips and stepped at a cadence for that speed, so the warrior went through the lunge and the charge on its knees, where the pose has a lunge and a sprinter's stride. A pose can now own the legs: `LegIK.update`'s `weight` (0 the pose's legs, 1 the IK's) also fades the lean, the pelvis twist, the pelvis rise and drop, and while the pose owns the legs (weight under a half) the feet are restarted each frame where the pose has them, and once more on the frame it gives them back, so the gait picks up from the pose's stance with no shuffle and no dip (the pelvis stays at 1.06-1.07 m after a rush; before, it sank to 0.97 m while both feet re-stepped from 0.5 m apart). `start()` plants the feet at the ankles, where the pose put them, not under the hips. The warrior passes `1 - legOwn`: the lunge and the charge own the legs until the dash is over. A dash's walk cycle turns at a sprint's cadence, not the dash's speed (`Player.animateBody`).
- **The shield guard lost its stance.** Raise Shield's pose steps the left foot forward and the right back with its heel up; the IK planted both under the hips. Standing, the guard now owns the legs (the same stance as `?ik=0`, to the centimetre); moving with the guard up, the IK walks (no double re-steps).
- The cleave, Power Strike (one-handed and two-handed), Steel Tempest, Thunder Crescent, the war cry and the mage's spells look the same with and without the IK apart from planted feet.

**The chest turns to what the head looks at** (`LookAt`): the turn is shared 20 / 30 / 50 between the chest, the neck and the head (it was the neck and head only), so a glance at a foe to the side starts at the shoulders. On the heroes it runs inside `animate` before the leg IK and the cloth (`AnimState.look`): the chest turn moves the arms, and run after the sleeves and the cape had stepped, the cloth would trail the arms by a frame. Enemies still look after `animate` (no cloth).

**Hip range** (`.tmp/limits.mjs`, random third-person play with every attack and skill, two seeds, 2,500 frames each): hip flexion up to 96-113 degrees, extension to -27 to -31, abduction to 35-38, adduction to 35-36, knee flexion up to 141. A man's ranges are about 120 flexion, 20-30 extension, 45 abduction, 30 adduction; the extension and adduction peaks are single frames at a sprint's push-off and in a sharp turn. No hip limits were added.

## Not verified

- A phone or a weak GPU: only CPU time of the animation was measured, on a desktop. No LOD was added (the arena's crowd cost is small); if a low-end profile shows it, skip enemies beyond a distance and restart them under the hips when they come back (`reset()`).
- Side views of every enemy: the husk and both heroes were looked at frame by frame; the others only by the numbers above (with the direction-change fixes their slide and hip numbers are unchanged).
- Walking while attacking travels at 45-100 degrees to the way the body faces (it faces the aim). The feet land along the direction of travel, so in that case they cross in the body's frame; there is no sidestep gait (strafing was left out on purpose: it only shows in first person, where the legs are not drawn). It films as a walk from every angle tried, but a sideways-travelling body at a walk was judged by eye and by the joint recordings, not against a sidestep's numbers.
- Sprinting is very fast for the legs (6 m/s on 0.9 m legs): this is a sprint's stride (about 4 steps a second, at the top of a runner's 3.2-3.8), and only the warrior and the mage were measured against a runner's curves, the enemies only by the earlier slide and height numbers (their swing is the hip-frame one too now).
- Skills were compared with `?ik=0` side on only (see "Skills under the leg IK"); the enemies' attack poses were not.

## Not in this PR (issue #115's remainder)

- Per-limb blend weights: one weight blends both legs over the pose (a pose owns both or neither).
- Joint limits beyond the knee's hinge, the foot's turn from the pelvis (`YAW_MAX`), the pelvis's from the chest (`TWIST`) and the head's yaw and pitch: no hip abduction or ankle limits.
- Ground slope for enemies off the dais (the ground is flat there).
