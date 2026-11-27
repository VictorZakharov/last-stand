// `lab ui`'s `decision` state (`../uiKit.ts` `Steps`): the bank-or-continue choice after a wave (`../uiDecision.ts`).
import { showDecision } from '../../../../src/ui/hud';
import { closeDecision, DECISION_CANARY, decisionShown, DRAWN, POINTER_CANARY } from '../uiDecision';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 380,
  inRun: true,
  open: showDecision,
  close: closeDecision,
  check: decisionShown,
  // (the pointer's canary where the tree draws the choice by the engine: main's has none to plant)
  canary: DRAWN ? caught(DECISION_CANARY, POINTER_CANARY) : caught(DECISION_CANARY),
};
export default STATE;
