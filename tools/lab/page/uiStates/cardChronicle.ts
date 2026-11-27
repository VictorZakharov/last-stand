// `lab ui`'s `cardChronicle` state (`../uiKit.ts` `Steps`): the village's card on the chronicle's: the records and the save slots (`../uiVillageCard.ts`).
import { cardCanary, cardChecked, closeCard, openCard } from '../uiVillageCard';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 237,
  open: (lab) => openCard(lab, 'chronicle'),
  close: closeCard,
  check: (canary) => cardChecked('chronicle', canary),
  canary: cardCanary,
};
export default STATE;
