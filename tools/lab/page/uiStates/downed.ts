// `lab ui`'s `downed` state (`../uiKit.ts` `Steps`): a co-op run's note while the hero is down, the prompt to hold E
// by a downed partner and the watching bar, written as the game writes them (`../uiDowned.ts`).
import { closeDowned, downedCanary, downedChecked, openDowned, plantDowned } from '../uiDowned';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 327,
  inRun: true,
  open: (lab) => openDowned(lab, false),
  close: closeDowned,
  check(canary) {
    if (canary) plantDowned();
    return downedChecked(false);
  },
  canary: downedCanary,
};
export default STATE;
