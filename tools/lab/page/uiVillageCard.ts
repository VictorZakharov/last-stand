// `lab ui`'s village card states (`uiStates/card*.ts`): the card a village object opens (`src/ui/villageCard.ts`),
// one page a state: a portal's (its starting wave and Enter), the training grounds' (a battleground's choice over it),
// the chronicle's (the records and the save slots), the duel's menu, the great ledger. Each checked within the window
// with its page's own control shown; the canary hides that control, caught as none shown.
import { showVillageCard } from '../../../src/ui/villageCard';
import { VILLAGE_OBJECTS, type VillageObject, type VillageUse } from '../../../src/data/village';
import { boxOf, seenOf, type Lab } from './lab';
import { caught, type Found } from './uiKit';

/** frames for the card to be written and drawn */
const SETTLE = 3;

/** Each page's control: what the page is for, which must show. */
const CONTROL: Record<CardPage, { selector: string; name: string }> = {
  portal: { selector: '#btn-start', name: 'Enter' },
  training: { selector: '#opt-biome', name: 'the battlegrounds' },
  chronicle: { selector: '#btn-saves', name: 'the save slot button' },
  pvp: { selector: '#pvp-size', name: 'the fight\'s size' },
  records: { selector: '.rec-book', name: 'the ledger\'s pages' },
};

/** The card's pages, by the use of the object that opens each. */
export type CardPage = Extract<VillageUse, 'portal' | 'training' | 'chronicle' | 'pvp' | 'records'>;

/** The object opening `page`: the village's own, or the house of records' ledger, which is a room's. */
function objectFor(page: CardPage): VillageObject {
  const found = VILLAGE_OBJECTS.find((object) => object.use === page);
  if (found) return found;
  const ledger: Partial<VillageObject> = { id: 'ledger', use: 'records', name: 'The Great Ledger' };
  return ledger as VillageObject;
}

/** The card opened on `page`. */
export async function openCard(lab: Lab, page: CardPage): Promise<void> {
  showVillageCard(objectFor(page));
  await lab.step(SETTLE);
}

/** The card put away. */
export function closeCard(): void {
  showVillageCard(null);
}

/** A box as words. */
const boxWords = (box: DOMRect): string =>
  `${box.width.toFixed(0)}x${box.height.toFixed(0)} px at ${box.left.toFixed(0)}, ${box.top.toFixed(0)}`;

/** frames for the UI kit to draw the canary's plant */
const PLANT_FRAMES = 2;

/** Whether `inner` lies within `outer` (to half a px). */
const within = (inner: DOMRect, outer: DOMRect): boolean => inner.left >= outer.left - 0.5
  && inner.right <= outer.right + 0.5 && inner.top >= outer.top - 0.5 && inner.bottom <= outer.bottom + 0.5;

/** The card within the window, its title and its page's control shown. */
export async function cardChecked(lab: Lab, page: CardPage, canary: boolean): Promise<Found> {
  const control = CONTROL[page];
  const controlElement = document.querySelector(`#vcard ${control.selector}`);
  if (canary) controlElement?.classList.add('hidden');
  // (the plant drawn by the UI kit in its next frames: read at once, the card still showed the control)
  if (canary) await lab.step(PLANT_FRAMES);
  const window_ = new DOMRect(0, 0, innerWidth, innerHeight);
  const card = boxOf(document.getElementById('vcard')!);
  const title = document.querySelector('#vcard .vc-title')!;
  const controlBox = controlElement && seenOf(controlElement) ? boxOf(controlElement) : new DOMRect();
  const lines = [
    `  the card: ${boxWords(card)}, titled "${title.textContent}"`,
    `  ${control.name}: ${boxWords(controlBox)}`,
  ];
  const problems: string[] = [];
  if (card.width < 1) problems.push(`card ${page}: not shown`);
  else if (!within(card, window_)) problems.push(`card ${page}: reaches past the window`);
  if (controlBox.width < 1) problems.push(`card ${page}: no ${control.name} shown`);
  else if (!within(controlBox, card)) problems.push(`card ${page}: ${control.name} past the card`);
  if (canary) controlElement?.classList.remove('hidden');
  return { lines, problems };
}

/** What the canary must raise. */
export const cardCanary = caught({ name: 'shown', what: 'the page\'s control hidden' });
