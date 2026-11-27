// `lab ui`'s `cardRecords` state (`../uiKit.ts` `Steps`): the village's card on the great ledger's pages (`../uiVillageCard.ts`).
import { cardCanary, cardChecked, closeCard, openCard } from '../uiVillageCard';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 239,
  open: (lab) => openCard(lab, 'records'),
  close: closeCard,
  check: (canary) => cardChecked('records', canary),
  canary: cardCanary,
};
export default STATE;
