// `lab ui`'s `duelHud` state (`../uiKit.ts` `Steps`): a duel's score over the round's badge and the match's result,
// written onto the page as `src/ui/duelHud.ts` writes them (a duel itself is `lab coop --scenarios duel`'s): both
// within the window, the score's names either side of the badge, the result centred. Its canary empties the result's
// title, caught as no result shown.
import { boxOf, type Lab } from '../lab';
import { caught, type Found, type Steps } from '../uiKit';

/** frames for the page's writing to be drawn */
const SETTLE = 3;
/** what each part says */
const WORDS: Record<string, string> = {
  '#duel-score .ds-a': 'Ashkettle', '#duel-score .ds-b': 'Briony', '#duel-score .ds-points': '2 : 1',
  '#duel-score .ds-note': '1:24', '#duel-result .dr-title': 'Victory',
  '#duel-result .dr-who': 'Ashkettle takes the duel', '#duel-result .dr-score': '3 : 1',
  '#duel-result .dr-note': 'No rewards, nothing lost. Back to the village in a moment.',
};

/** The page's `selector`. */
const element = (selector: string): HTMLElement => document.querySelector<HTMLElement>(selector)!;

/** The score's class list, kept shown while the state is up: the game hides it each frame with no duel on. */
const scoreClasses = (): DOMTokenList => element('#duel-score').classList;

/** The score and the result written and shown. */
async function openDuel(lab: Lab): Promise<void> {
  const classes = scoreClasses();
  const toggle = classes.toggle.bind(classes);
  classes.toggle = (token: string, force?: boolean): boolean => (token === 'hidden' ? false : toggle(token, force));
  for (const [selector, words] of Object.entries(WORDS)) element(selector).textContent = words;
  element('#duel-result').dataset.outcome = 'won';
  for (const id of ['#duel-score', '#duel-result']) element(id).classList.remove('hidden');
  await lab.step(SETTLE);
}

/** Both put away again. */
function closeDuel(): void {
  delete (scoreClasses() as Partial<DOMTokenList>).toggle;
  for (const id of ['#duel-score', '#duel-result']) element(id).classList.add('hidden');
}

/** A box as words. */
const boxWords = (box: DOMRect): string =>
  `${box.width.toFixed(0)}x${box.height.toFixed(0)} px at ${box.left.toFixed(0)}, ${box.top.toFixed(0)}`;

/** Both within the window, the result centred and saying its title. */
function duelChecked(): Found {
  const scoreBox = boxOf(element('#duel-score'));
  const resultBox = boxOf(element('#duel-result'));
  const lines = [`  the score: ${boxWords(scoreBox)}`, `  the result: ${boxWords(resultBox)}`];
  const problems: string[] = [];
  for (const [name, box] of [['score', scoreBox], ['result', resultBox]] as const) {
    if (box.width < 1) problems.push(`duel: no ${name} shown`);
    const past = box.left < 0 || box.right > innerWidth || box.bottom > innerHeight;
    if (past) problems.push(`duel: the ${name} reaches past the window`);
    if (Math.abs(box.left + box.width / 2 - innerWidth / 2) > 2) problems.push(`duel: the ${name} not centred`);
  }
  if (!element('#duel-result .dr-title').textContent) problems.push('duel: no result shown');
  return { lines, problems };
}

const STATE: Steps = {
  order: 324,
  inRun: true,
  open: openDuel,
  close: closeDuel,
  check(canary) {
    if (canary) element('#duel-result .dr-title').textContent = '';
    return duelChecked();
  },
  canary: caught({ name: 'no result shown', what: 'the result\'s title emptied' }),
};
export default STATE;
