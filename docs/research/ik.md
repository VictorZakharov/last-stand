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

## Measured (dev build, headless d3d11, mage unless stated)

Foot slide is the ankle's ground speed while it is within ~4 cm of the floor; hip height is above the ground.

| | FK (`?ik=0`) | IK |
| --- | --- | --- |
| hero run straight, slide mean / median / p90 (m/s) | 5.2 / 2.5 / 13.5 | 1.3 / 0.27 / 4.4 |
| hero run in a circle, slide mean (m/s) | 4.6 | 0.8 |
| hero standing still, slide | 0 | 0.04-0.06 |
| hero run, hip height min / max (m) | 0.98 / 1.06 | 0.84 / 1.03 |
| enemies chasing, slide mean (m/s) husk, brute, mossback, thornling | 1.7, 1.3, 1.8, 2.7 | 1.0, 1.1, 1.1, 1.2 |
| ankle below the ground on the dais steps, worst (m) | -0.061 (12 frames sunk) | +0.036 (1 frame under 5 cm) |

- Hero attacks and skills 1-4, standing and running (warrior): the pelvis stayed above 0.83 m and the feet on the floor; no NaN.
- Teleport, the three views, enemy deaths, and enemy spawns: finite poses, feet under the hips again at once; shader programs constant at 119; two-tab co-op (`?net=local`) without errors.
- **Crowd cost:** 40 enemies of six kinds, the models' `animate` summed per frame, medians of three interleaved rounds: 0.48 ms without, 0.71-0.74 ms with (leg IK, then head look-at): about +0.2-0.3 ms a frame for 40 foes, ~6 us each. The first version cost +1.5 ms: it updated the whole skeleton's matrices twice (`updateMatrixWorld(true)`, `getWorldPosition` chains); it now updates only the hip chain and lets the renderer do the rest.

## Not verified

- A phone or a weak GPU: only CPU time of the animation was measured, on a desktop. No LOD was added (the arena's crowd cost is small); if a low-end profile shows it, skip enemies beyond a distance and restart them under the hips when they come back (`reset()`).
- Side views of every enemy: the husk and both heroes were looked at frame by frame; the others only by the numbers above.
- Sprinting is very fast for the legs (6 m/s on 0.9 m legs): the pelvis drops ~15 cm at the fastest strides and the feet skate a little at landings (slide p90 4.4 m/s). A longer flight phase or a slightly slower cadence would tighten it.
- A hero's leg poses inside skills (the lunge of a slam, Bull Rush's wide stance) are now the feet's plant and the pelvis, not the FK pose; nothing looked broken, but each skill was not compared against `?ik=0`.

## Not in this PR (issue #115's remainder)

- Spine twist toward the aim and hands kept on weapon grips through turns (needs the arm solves to run after a spine change; `fistReach` already keeps a two-hander's lower grip today).
- Per-limb blend weights and joint limits beyond the knee's hinge (the head has yaw and pitch limits).
- Ground slope for enemies off the dais (the ground is flat there).
