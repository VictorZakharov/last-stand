// What the biomes carry from frame to frame (what's due of an emitter's next spawn, a gate's pulse, a light easing to
// the run's calm, a look easing to the view), where the lab
// can start it again (`restartPhases`) as it sets a run up (tools/lab/page/lab.ts), the particles they spawned cleared
// with it: kept from the jobs before, they spawned on other frames, and the random numbers drawn after them in each
// frame (the foes' among them) were others, so a cast set up on a page a check kept came out otherwise.

/** each phase, with what it starts from */
const phases: { phase: object; start: object }[] = [];

/** A phase starting from `start`'s values, and from them again at `restartPhases`. */
export function runPhase<T extends object>(start: T): T {
  return restartsAt({ ...start }, start);
}

/** `phase` (an object of the game's: a uniform's) put back to `start`'s values at `restartPhases`. */
export function restartsAt<T extends object>(phase: T, start: Partial<T>): T {
  phases.push({ phase, start });
  return phase;
}

/** Every phase back to its start. */
export function restartPhases(): void {
  for (const { phase, start } of phases) Object.assign(phase, start);
}
