// `lab ui`'s `cardTraining` state (`../uiKit.ts` `Steps`): the village's card on the training grounds': a battleground's choice over the wave (`../uiVillageCard.ts`).
import { cardCanary, cardChecked, closeCard, openCard } from '../uiVillageCard';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 236,
  open: (lab) => openCard(lab, 'training'),
  close: closeCard,
  check: (canary) => cardChecked('training', canary),
  canary: cardCanary,
};
export default STATE;
