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
- Things found and fixed on the way: the sole was assumed 7 cm under the ankle (`footShape` now measures each model's foot, skinned shins included), a foot pitched onto its toe or heel went through the floor (the pivot is lifted), the pelvis dropped without bound when a body lunged away from its feet (now capped, feet dragged), the guard for a body off the ground fired on the dais steps (now only far off, at spawn), stopping mid-stride snapped the swinging foot under the body (a timed step now starts from where the foot is, with its height, turn and pitch), and the stride at a sprint reached farther than the legs (`stepLength` capped at 1.05 m for a 0.9 m leg).

## Body lean and the warrior's hold

Planting the feet alone made the body look like it stood still while the legs reached: nothing leaned into the motion. `LegIK` now tips the whole body about the ground under it by 0.03 rad per m/s (at most 0.22 forward, 0.12 sideways, damped, off in first person), keeps the head level, and takes landings nearer under the body at a run. The warrior's own forward spine lean is reduced to match, its arm swing is halved (a carried weapon and shield hardly swing), and the arms ease back by most of the lean so the weapon and shield keep the angle they were held at. A stopped character re-steps to a neutral, feet-under-hips stance after a moment. The mage was left as it was.

## Not verified

- A phone or a weak GPU: only CPU time of the animation was measured, on a desktop. No LOD was added (the arena's crowd cost is small); if a low-end profile shows it, skip enemies beyond a distance and restart them under the hips when they come back (`reset()`).
- Side views of every enemy: the husk and both heroes were looked at frame by frame; the others only by the numbers above.
- Sprinting is very fast for the legs (6 m/s on 0.9 m legs): the steps are capped at 1.05 m, so the cadence at a sprint is high (about 6 steps a second).
- A hero's leg poses inside skills (the lunge of a slam, Bull Rush's wide stance) are now the feet's plant and the pelvis, not the FK pose; nothing looked broken, but each skill was not compared against `?ik=0`.

## Not in this PR (issue #115's remainder)

- Spine twist toward the aim and hands kept on weapon grips through turns (needs the arm solves to run after a spine change; `fistReach` already keeps a two-hander's lower grip today).
- Per-limb blend weights and joint limits beyond the knee's hinge (the head has yaw and pitch limits).
- Ground slope for enemies off the dais (the ground is flat there).
