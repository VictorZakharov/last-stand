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

## Not verified

- A phone or a weak GPU: only CPU time of the animation was measured, on a desktop. No LOD was added (the arena's crowd cost is small); if a low-end profile shows it, skip enemies beyond a distance and restart them under the hips when they come back (`reset()`).
- Side views of every enemy: the husk and both heroes were looked at frame by frame; the others only by the numbers above (with the direction-change fixes their slide and hip numbers are unchanged).
- Walking while attacking travels at 45-100 degrees to the way the body faces (it faces the aim). The feet land along the direction of travel, so in that case they cross in the body's frame; there is no sidestep gait (strafing was left out on purpose: it only shows in first person, where the legs are not drawn). It films as a walk from every angle tried, but a sideways-travelling body at a walk was judged by eye and by the joint recordings, not against a sidestep's numbers.
- Sprinting is very fast for the legs (6 m/s on 0.9 m legs): this is a sprint's stride (4.4 steps a second, above a runner's 3.2-3.8), and only the warrior and the mage were measured against a runner's numbers, the enemies only by the earlier slide and height numbers.
- A hero's leg poses inside skills (the lunge of a slam, Bull Rush's wide stance) are now the feet's plant and the pelvis, not the FK pose; nothing looked broken, but each skill was not compared against `?ik=0`.

## Not in this PR (issue #115's remainder)

- Spine twist toward the aim and hands kept on weapon grips through turns (needs the arm solves to run after a spine change; `fistReach` already keeps a two-hander's lower grip today).
- Per-limb blend weights and joint limits beyond the knee's hinge (the head has yaw and pitch limits).
- Ground slope for enemies off the dais (the ground is flat there).
