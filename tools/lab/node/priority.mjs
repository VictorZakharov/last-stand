// The lab runs below normal priority (tools/lab): its browsers, Vite and workers take every core they're given, and
// at normal priority the lab's runs froze the owner's desktop for 10 to 20 s at a time, about a dozen times over one
// task (#283). It lowers itself as it starts; on Windows a process inherits its parent's priority class, so whatever
// it starts (the server, the browsers, their GPU and renderer processes) runs below normal with it.
import { constants, getPriority, setPriority } from 'node:os';

/** the priority the lab runs at (Windows: BELOW_NORMAL_PRIORITY_CLASS; elsewhere a nice of 10) */
export const LAB_PRIORITY = constants.priority.PRIORITY_BELOW_NORMAL;

/** The names of the priorities Node reads back, by value. */
const NAMES = new Map([
  [constants.priority.PRIORITY_LOW, 'low'],
  [constants.priority.PRIORITY_BELOW_NORMAL, 'below normal'],
  [constants.priority.PRIORITY_NORMAL, 'normal'],
  [constants.priority.PRIORITY_ABOVE_NORMAL, 'above normal'],
  [constants.priority.PRIORITY_HIGH, 'high'],
  [constants.priority.PRIORITY_HIGHEST, 'highest'],
]);

/** A priority as a line says it. */
export function priorityName(priority) {
  return NAMES.get(priority) ?? `nice ${priority}`;
}

/** This process's priority as a line says it. */
export function priorityNow() {
  return priorityName(getPriority());
}

/**
 * Process `pid` (this one by default) lowered to the lab's priority, if it runs any higher (one started lower is left
 * there); whether it was.
 */
export function lowerProcess(pid = 0) {
  try {
    // (a higher priority is a lower number: Windows' classes read back as these, and a nice the same way)
    if (getPriority(pid) >= LAB_PRIORITY) return false;
    setPriority(pid, LAB_PRIORITY);
    return true;
  } catch {
    // (left as it was where the system won't have it, or it's gone: the run goes on at the priority it has)
    return false;
  }
}

/** This process lowered to the lab's priority (`lowerProcess`); what it runs at after, as a line says it. */
export function lowerPriority() {
  lowerProcess();
  return priorityNow();
}
