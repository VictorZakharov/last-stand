// `lab ui`'s `chatOpen` state (`../uiKit.ts` `Steps`): the co-op chat with its box open and something typed
// (`../uiChat.ts`).
import { chatCanary, chatChecked, closeChat, openChat, plantChat } from '../uiChat';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 329,
  inRun: true,
  async open(lab) {
    await openChat(lab, true, false);
  },
  close: closeChat,
  check(canary) {
    if (canary) plantChat();
    return chatChecked(true, false);
  },
  canary: chatCanary,
};
export default STATE;
