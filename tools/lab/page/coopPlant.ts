// A canary's fault planted in Play together where the engine draws it (`plantInCoop` in src/ui/coopSheet.ts: rules
// laid over the dialog's own sheet): a style planted on the page reaches nothing the engine draws. A tree that draws
// the dialog on the page (an A/B's older side) has no such sheet, and its canaries plant the page's styles.
import type { Sheet } from '../../../src/ui/kit/sheet';

/** what a tree's Play together sheet gives the lab, where it has one */
interface CoopSheet {
  plantInCoop?(rules: Sheet): (() => void) | null;
}

/** the dialog's sheet, in a tree that has it (found by its path: an older tree's has none, and a named import of it
 *  would stop the lab's page loading there) */
const COOP_SHEETS = Object.values(import.meta.glob<CoopSheet>('../../../src/ui/coopSheet.ts', { eager: true }));

/** Whether the engine draws Play together in this tree. */
export const coopDrawnByEngine = (): boolean => !!COOP_SHEETS[0]?.plantInCoop
  && !!document.getElementById('coop')?.classList.contains('kit-mirror');

/** `rules` planted in the drawn dialog until the call it returns takes them out; null where the engine doesn't draw
 *  it (the canary then plants the page's style). */
export function plantInCoop(rules: Sheet): (() => void) | null {
  if (!coopDrawnByEngine()) return null;
  return COOP_SHEETS[0]?.plantInCoop?.(rules) ?? null;
}
