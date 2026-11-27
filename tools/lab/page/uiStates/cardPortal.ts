// `lab ui`'s `cardPortal` state (`../uiKit.ts` `Steps`): the village's card on a portal's: its starting wave and Enter (`../uiVillageCard.ts`).
import { cardCanary, cardChecked, closeCard, openCard } from '../uiVillageCard';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 235,
  open: (lab) => openCard(lab, 'portal'),
  close: closeCard,
  check: (canary, lab) => cardChecked(lab, 'portal', canary),
  canary: cardCanary,
};
export default STATE;
