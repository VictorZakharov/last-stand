// The hint to sit on the seat the cursor rests on (from play: "when pointing at object to sit on, we need to display a
// hint like E Sit"): shown while the seat is outlined (`Sitting.pointed`), with the keyboard and mouse alone (touch
// has no pointing), and never with the prompt to revive a partner up, as E revives then.

import { G } from '../state';
import { isTouch } from './touch';
import { raisePromptShown } from './coop';

let hint: HTMLElement | null = null;

function hintFor(): HTMLElement {
  if (hint) return hint;
  const el = document.createElement('div');
  el.className = 'rvprompt sit-hint hidden';
  el.innerHTML = '<div class="rp-line"><kbd>E</kbd><span>Sit</span></div>';
  document.body.appendChild(el);
  hint = el;
  return el;
}

/** Shows or hides the hint for this frame. */
export function updateSitHint(): void {
  const shown = G.player.sitting.pointed && !isTouch() && !raisePromptShown();
  const el = hint ?? (shown ? hintFor() : null);
  el?.classList.toggle('hidden', !shown);
}
