// `lab ui`'s `guideTips` state (`../uiKit.ts` `Steps`): the guide's the tips' loot page and its table (`../uiGuidePages.ts`).
import {
  closeGuidePage, GUIDE_PAGE_CANARY, guidePagePictures, guidePageShown, openGuideOn,
} from '../uiGuidePages';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';
import type { Lab } from '../lab';

const STATE: Steps = {
  order: 47,
  open: (lab: Lab) => openGuideOn(lab, 'tips', 'loot'),
  close: closeGuidePage,
  check: guidePageShown,
  pictures: (lab: Lab) => guidePagePictures(lab, ['.gd-table']),
  canary: caught(GUIDE_PAGE_CANARY),
};
export default STATE;
