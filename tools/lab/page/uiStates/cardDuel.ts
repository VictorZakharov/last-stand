// `lab ui`'s `cardDuel` state (`../uiKit.ts` `Steps`): the village's card on the duel's menu at the weapons rack (`../uiVillageCard.ts`).
import { cardCanary, cardChecked, closeCard, openCard } from '../uiVillageCard';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 238,
  open: (lab) => openCard(lab, 'pvp'),
  close: closeCard,
  check: (canary, lab) => cardChecked(lab, 'pvp', canary),
  canary: cardCanary,
};
export default STATE;
