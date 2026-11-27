// `lab ui`'s `target` state (`../uiKit.ts` `Steps`): the run's target frame with a hurt foe aimed at, and with it
// made a boss (`../uiTarget.ts`).
import { closeTarget, onFoe, openTarget, targetChecked, targetPictures } from '../uiTarget';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

/** the canary's plant: the mouse aimed away from every foe, caught as the frame not shown */
const AWAY = { name: 'isn\'t shown', what: 'the mouse aimed away from every foe' };

const STATE: Steps = {
  order: 322,
  inRun: true,
  open: openTarget,
  close: closeTarget,
  // (the frame the state is pictured whole on: the mouse kept on the foe)
  get held() {
    return onFoe();
  },
  check: targetChecked,
  pictures: targetPictures,
  canary: caught(AWAY),
};
export default STATE;
