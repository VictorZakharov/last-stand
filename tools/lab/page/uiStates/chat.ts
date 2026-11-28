// `lab ui`'s `chat` state (`../uiKit.ts` `Steps`): the co-op chat shut, the newest lines on their strips
// (`../uiChat.ts`).
import { chatCanary, chatChecked, closeChat, openChat, plantChat } from '../uiChat';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 328,
  inRun: true,
  async open(lab) {
    await openChat(lab, false, false);
  },
  close: closeChat,
  check(canary) {
    if (canary) plantChat();
    return chatChecked(false, false);
  },
  canary: chatCanary,
};
export default STATE;
