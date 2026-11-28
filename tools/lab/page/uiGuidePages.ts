// `lab ui`'s states of the guide's pages beside the heroes' (`uiGuideKeys.ts`): a boss's page with its calls for
// help along a minute (`guideBoss`) and the tips' loot page with its table (`guideTips`), each opened where the kit
// has drawn it, pictured whole and at its drawings, and held inside the page: every part of the page's drawn within
// its width (a table's column, a tile, a bar laid past the page's edge is a problem).
import { closeGuide, openGuide, type GuideSection } from '../../../src/ui/guide/index';
import { boxOf, revealOf, type Lab, type Pictured } from './lab';
import { plantLayout } from './kitPlant';
import type { Found, Planted } from './uiKit';

/** frames the kit takes to draw a page opened, and to let its scroll to the top go (`holdScroll` in kit/drawn.ts) */
const OPEN_FRAMES = 12;
/** frames to draw a page scrolled */
const SCROLL_FRAMES = 3;
/** css px a part may reach past the page and still count as inside it (Blink and the kit round apart) */
const SLACK = 1.5;
/** the parts of a page held inside it */
const PARTS = '.gd-top, .gd-h, .gd-tiles, .gd-bars, .gd-bar, .gd-table, .gd-fig, .gd-list, .gd-p';

/** The canary's plant: a part made wider than the page, as a table's columns sized by their words ran past it. */
export const GUIDE_PAGE_CANARY: Planted = { name: 'past the page', what: 'a part made wider than the page' };
/** how wide the canary's part is made (css px): wider than any page */
const PLANT_WIDTH = 3000;

/** The guide opened on `entry` of `section` (none: its first), once the kit has drawn it. */
export async function openGuideOn(lab: Lab, section: GuideSection, entry?: string): Promise<void> {
  openGuide({ section, entry });
  await lab.step(OPEN_FRAMES);
}

/** The guide opened on the first boss whose page draws his calls for help. */
export async function openBossPage(lab: Lab): Promise<void> {
  await openGuideOn(lab, 'bosses');
  const entries = [...document.querySelectorAll<HTMLElement>('#guide .gd-entry[data-ge]')];
  const bosses = entries.map((entry) => entry.dataset.ge!);
  for (const boss of bosses) {
    await openGuideOn(lab, 'bosses', boss);
    if (document.querySelector('#guide .gd-timeline')) return;
  }
  throw new Error('guide pages: no boss\'s page draws his calls for help');
}

export const closeGuidePage = (): void => closeGuide();

/** The page's parts held inside it (the canary's plant first, taken away after). */
export async function guidePageShown(canary: boolean, lab: Lab): Promise<Found> {
  const page = document.querySelector<HTMLElement>('#guide .gd-page')!;
  const parts = [...page.querySelectorAll<HTMLElement>(PARTS)];
  const unplant = canary && parts[0] ? await plantLayout(lab, parts[0], { width: PLANT_WIDTH }) : null;
  try {
    const bounds = boxOf(page);
    const past = parts.filter((part) => {
      const box = boxOf(part);
      return box.width > 0 && (box.left < bounds.left - SLACK || box.right > bounds.right + SLACK);
    });
    const problems = past.map((part) => `guide page: ${part.className || part.tagName} reaches past the page`);
    const lines = [`  ${parts.length} parts of the page, ${past.length} past it`];
    return { lines, problems };
  } finally {
    await unplant?.();
  }
}

/** The page pictured at each part `selectors` name that it has, scrolled to stand at its top. */
export async function guidePagePictures(lab: Lab, selectors: string[]): Promise<Pictured[]> {
  const pictures: Pictured[] = [];
  for (const selector of selectors) {
    const part = document.querySelector(`#guide .gd-page ${selector}`);
    if (!part) continue;
    revealOf(part, 'start');
    await lab.step(SCROLL_FRAMES);
    const name = selector.replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
    pictures.push(await lab.screen(`guide-${name}`, [], '#guide .gd-box'));
  }
  return pictures;
}
