// `lab ui`'s `chatTouch` state (`../uiKit.ts` `Steps`): the co-op chat with its box open and something typed, on touch
// with its button (`../uiChat.ts`).
import { chatCanary, chatChecked, closeChat, openChat, plantChat } from '../uiChat';
import { touchMode } from '../uiTouch';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 529,
  inRun: true,
  async open(lab) {
    await touchMode(lab);
    await openChat(lab, true, true);
  },
  close: closeChat,
  check(canary) {
    if (canary) plantChat();
    return chatChecked(true, true);
  },
  canary: chatCanary,
};
export default STATE;
