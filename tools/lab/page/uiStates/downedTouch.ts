// `lab ui`'s `downedTouch` state (`../uiKit.ts` `Steps`): the `downed` state on touch, the revive button held in place
// of the prompt and the watching bar's keys left out (`../uiDowned.ts`).
import { closeDowned, downedCanary, downedChecked, openDowned, plantDowned } from '../uiDowned';
import { touchMode } from '../uiTouch';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 528,
  inRun: true,
  async open(lab) {
    await touchMode(lab);
    await openDowned(lab, true);
  },
  close: closeDowned,
  check(canary) {
    if (canary) plantDowned();
    return downedChecked(true);
  },
  canary: downedCanary,
};
export default STATE;
