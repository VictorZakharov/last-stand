// `lab ui`'s `downed` and `downedTouch` states' work (`uiStates/downed.ts`, `downedTouch.ts`): a co-op run's downed and
// watching UI written onto the page as `src/ui/coop.ts` writes it (a downed run itself is `lab coop`'s): the note
// while the hero is down, the prompt to hold E by a downed partner, the watching bar and, on touch, the revive button.
// Each within the window, the note, the prompt and the bar centred across it, the bar's buttons inside it. The canary
// empties the note's title, caught as no note shown.
import { boxOf, type Lab } from './lab';
import { caught, type Found } from './uiKit';

/** frames for the page's writing to be drawn */
const SETTLE = 3;
/** the parts written, by their selectors */
const NOTE = '<b>You are down</b><span>Bleeding out in 12s. A teammate can revive you.</span>'
  + '<div class="dn-bar"><div style="width:40%"></div></div>';
const PROMPT = '<div class="rp-line"><kbd>E</kbd><span>Reviving Briony…</span></div>'
  + '<div class="rp-bar"><div style="width:60%"></div></div>';
const WATCH: Record<string, string> = {
  '.sp-name': 'Watching Briony', '.sp-keys': 'LMB next · RMB previous · Q / E turn · F free camera',
  '.sp-free': 'Free camera',
};
/** the pieces kept shown while the state is up: the game hides each, each frame, where no partner is down (and
 *  solo, `hideRunBits`) */
const KEPT = ['#down-note', '#spectate', '#btn-revive'];
/** the touch revive button's side (css px) */
const REVIVE_SIDE = 84;

/** The page's `selector`. */
const element = (selector: string): HTMLElement => document.querySelector<HTMLElement>(selector)!;

/** the prompt the state made (the game makes one only in co-op), to take away again */
let madePrompt: HTMLElement | null = null;

/** `selector`'s class list kept from being hidden while the state is up (by a toggle or an add). */
function keepShown(selector: string): void {
  const classes = element(selector).classList;
  const toggle = classes.toggle.bind(classes);
  const add = classes.add.bind(classes);
  classes.toggle = (token: string, force?: boolean): boolean => (token === 'hidden' ? false : toggle(token, force));
  classes.add = (...tokens: string[]): void => add(...tokens.filter((token) => token !== 'hidden'));
  classes.remove('hidden');
}

/** `selector`'s class list as it was. */
function letHide(selector: string): void {
  const classes = element(selector).classList as Partial<DOMTokenList>;
  delete classes.toggle;
  delete classes.add;
}

/** The revive prompt, the game's or one made as it makes it. */
function promptOf(): HTMLElement {
  const found = document.querySelector<HTMLElement>('#hud .rvprompt');
  if (found) return found;
  madePrompt = document.createElement('div');
  madePrompt.className = 'rvprompt';
  element('#hud').appendChild(madePrompt);
  return madePrompt;
}

/** The note, the prompt and the watching bar written and shown (and the revive button, with `touch`). */
export async function openDowned(lab: Lab, touch: boolean): Promise<void> {
  element('#down-note').innerHTML = NOTE;
  const prompt = promptOf();
  prompt.innerHTML = PROMPT;
  prompt.classList.remove('hidden');
  for (const [selector, words] of Object.entries(WATCH)) element(`#spectate ${selector}`).textContent = words;
  for (const selector of KEPT) {
    if (touch || selector !== '#btn-revive') keepShown(selector);
  }
  await lab.step(SETTLE);
}

/** All put away again. */
export function closeDowned(): void {
  for (const selector of KEPT) {
    letHide(selector);
    element(selector).classList.add('hidden');
  }
  document.querySelector('#hud .rvprompt')?.classList.add('hidden');
  madePrompt?.remove();
  madePrompt = null;
}

/** A box as words. */
const boxWords = (box: DOMRect): string =>
  `${box.width.toFixed(0)}x${box.height.toFixed(0)} px at ${box.left.toFixed(0)}, ${box.top.toFixed(0)}`;

/** Whether `inner` lies within `outer` (to half a px). */
const within = (inner: DOMRect, outer: DOMRect): boolean => inner.left >= outer.left - 0.5
  && inner.right <= outer.right + 0.5 && inner.top >= outer.top - 0.5 && inner.bottom <= outer.bottom + 0.5;

/** Each shown, within the window, centred where it's centred, the bar's buttons in it, the revive a finger's size. */
export function downedChecked(touch: boolean): Found {
  const window_ = new DOMRect(0, 0, innerWidth, innerHeight);
  const parts: [string, Element, boolean][] = [
    ['note', element('#down-note'), true], ['prompt', promptOf(), !touch], ['watching bar', element('#spectate'), true],
  ];
  if (touch) parts.push(['revive button', element('#btn-revive'), false]);
  const lines: string[] = [];
  const problems: string[] = [];
  for (const [name, part, centred] of parts) {
    const box = boxOf(part);
    lines.push(`  the ${name}: ${boxWords(box)}`);
    if (box.width < 1) {
      problems.push(`downed: no ${name} shown`);
      continue;
    }
    if (!within(box, window_)) problems.push(`downed: the ${name} reaches past the window`);
    if (centred && Math.abs(box.left + box.width / 2 - innerWidth / 2) > 2) {
      problems.push(`downed: the ${name} not centred`);
    }
  }
  if (!element('#down-note b').textContent) problems.push('downed: no note shown');
  const bar = boxOf(element('#spectate'));
  for (const button of document.querySelectorAll('#spectate .sp-btn')) {
    const box = boxOf(button);
    if (!within(box, bar)) problems.push(`downed: the bar's ${button.className} runs out of it`);
  }
  if (touch) {
    const side = boxOf(element('#btn-revive')).width;
    if (Math.abs(side - REVIVE_SIDE) > 1) problems.push(`downed: the revive button is ${side.toFixed(0)} px across`);
  }
  return { lines, problems };
}

/** The canary's plant: the note's title emptied. */
export function plantDowned(): void {
  element('#down-note b').textContent = '';
}

/** What the canary must raise. */
export const downedCanary = caught({ name: 'no note shown', what: 'the note\'s title emptied' });
