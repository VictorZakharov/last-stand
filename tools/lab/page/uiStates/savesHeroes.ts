// `lab ui`'s `savesHeroes` state (`../uiKit.ts` `Steps`): the save slots with heroes in slots 2 and 3
// (`../uiSavesHeroes.ts`).
import { closeSavesHeroes, openSavesHeroes } from '../uiSavesHeroes';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 55,
  open: openSavesHeroes,
  close: closeSavesHeroes,
};
export default STATE;
