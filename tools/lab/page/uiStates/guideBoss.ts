// `lab ui`'s `guideBoss` state (`../uiKit.ts` `Steps`): the guide's a boss's page, his bars and his calls for help along a minute (`../uiGuidePages.ts`).
import {
  closeGuidePage, GUIDE_PAGE_CANARY, guidePagePictures, guidePageShown, openBossPage,
} from '../uiGuidePages';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';
import type { Lab } from '../lab';

const STATE: Steps = {
  order: 46,
  open: (lab: Lab) => openBossPage(lab),
  close: closeGuidePage,
  check: guidePageShown,
  pictures: (lab: Lab) => guidePagePictures(lab, ['.gd-bars', '.gd-timeline']),
  canary: caught(GUIDE_PAGE_CANARY),
};
export default STATE;
