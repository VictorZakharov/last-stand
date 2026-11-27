// `lab ui`'s `banner` state (`../uiKit.ts` `Steps`): the run's banner held half way through its showing, its words
// at their fullest, as a wave's start shows it (`banner` in `src/ui/hud.ts`). Where the page draws it, its CSS
// animation is paused there (the lab leaves a paused one as it is); where the engine draws it (ui/bannerPanel.ts),
// the lab's clock is stepped there. Its canary empties the title, caught as no title shown.
import { banner } from '../../../../src/ui/hud';
import { caught, type Found, type Steps } from '../uiKit';
import { boxOf, type Lab } from '../lab';

/** what it says: a wave's start */
const TITLE = 'Wave 7';
const SUB = 'The horde grows';
/** half way through its 2.8 s, its words at their fullest (ms), and the frames of the lab's clock that take */
const HALF_MS = 1400;
const FRAME_MS = 1000 / 60;
/** The banner shown and held half way. */
async function openBanner(lab: Lab): Promise<void> {
  banner(TITLE, SUB);
  const page = document.querySelector<HTMLElement>('#banner')!;
  for (const animation of page.getAnimations()) {
    animation.pause();
    animation.currentTime = HALF_MS;
  }
  await lab.step(Math.round(HALF_MS / FRAME_MS));
}

/** Its box: shown, within the window, centred across it. */
function bannerChecked(): Found {
  const page = document.querySelector<HTMLElement>('#banner')!;
  const title = page.querySelector<HTMLElement>('.b-title')!;
  const box = boxOf(page);
  const lines = [`  the banner: ${box.width.toFixed(0)}x${box.height.toFixed(0)} px at ${box.left.toFixed(0)}, `
    + `${box.top.toFixed(0)}, saying "${title.textContent}"`];
  const problems: string[] = [];
  if (box.width < 1 || !title.textContent) problems.push('banner: no title shown');
  if (box.left < 0 || box.right > innerWidth) problems.push('banner: reaches past the window');
  if (Math.abs(box.left + box.width / 2 - innerWidth / 2) > 2) problems.push('banner: not centred across the window');
  return { lines, problems };
}

const STATE: Steps = {
  order: 321,
  inRun: true,
  open: openBanner,
  close() {
    document.querySelector('#banner')?.classList.add('hidden');
  },
  check(canary) {
    if (!canary) return bannerChecked();
    document.querySelector('#banner .b-title')!.textContent = '';
    return bannerChecked();
  },
  canary: caught({ name: 'no title shown', what: 'the title emptied' }),
};
export default STATE;
