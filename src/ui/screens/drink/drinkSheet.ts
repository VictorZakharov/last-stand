// The ale's two buttons and its notice drawn by the engine (ui/kit's sheet; #973), rule for rule from `_drink.scss`:
// Drink and Put down at the screen's foot while a hero holds a mug of the tavern's, in the village objects' prompt's
// look (gold display letters, the key in a frame before each), a finger's height on touch with its keys left out; one
// not on offer now faded, its key hidden, taking no press. The ale's boost waiting for his next run is a pill at the
// screen's top. Each is centred across the screen by a room of its own (the page's `left: 50%` and `translateX`).
// Both are `drink.ts`'s markup, written and listened to there as before. Sizes are px of the lobby's scale.
import { TOUCH } from '../../controlsSheet';
import { accent } from '../../diagFrame';
import { ACCENT, FRAME, alpha } from '../../kit/theme';
import { Panel, layer } from '../../kit/panel';
import { safeInsets } from '../../kit/safeArea';
import { SheetTree, type Sheet } from '../../kit/sheet';
import { uiScales } from '../../scale';

/** the layer they're drawn in (`z-index: 40` among the page's, under the modals') */
const DRINK_LAYER = 39;
const GOLD = '#ffe7b0';

/** The buttons' row, centred over the screen's foot (`bottom: safe + 120px`). */
const CHOICE: Sheet = [
  { at: '#drink-choice', flex: true, box: () => ({ direction: 'row', gap: 10,
    margin: [0, 0, safeInsets().bottom / uiScales.ui + 120, 0] }) },
  { at: '#drink-choice.hidden', box: { display: 'none' } },
  {
    at: '.dc-btn',
    flex: true,
    hits: true,
    box: () => ({ direction: 'row', alignItems: 'center', justify: 'center', gap: 8, width: 150,
      height: TOUCH() ? Math.max(44 / uiScales.ui, 40) : 40, padding: [0, 12], border: 1 }),
    look: { fill: 'rgba(18,12,8,.82)', border: alpha(FRAME, 0.7), radius: 3,
      shadow: { blur: 10, color: 'rgba(0,0,0,.7)' } },
    text: { face: 'display', weight: 700, size: 16, spacing: 0.5, color: GOLD, align: 'center' },
    hover: { look: { fill: 'rgba(40,28,16,.9)', border: ACCENT } },
  },
  { at: '.dc-btn .k', box: { minWidth: 20, padding: [0, 4], border: 1 }, look: { border: FRAME, radius: 2 },
    text: () => ({ face: 'display', weight: 700, size: 12, color: accent(), align: 'center', whole: true }) },
  { at: '.dc-btn.off', hits: false, look: { opacity: 0.4 } },
  { at: '.dc-btn.off .k', look: { opacity: 0 } },
  { at: '.dc-btn .k', when: TOUCH, box: { display: 'none' } },
];

/** The ale's boost waiting for his next run, a pill at the screen's top (`top: safe + 10px`). */
const FORTIFIED: Sheet = [
  { at: '#ale-fortified', flex: true, box: () => ({ direction: 'row', alignItems: 'center', gap: 6, height: 28,
    padding: [0, 12], border: 1, margin: [safeInsets().top / uiScales.ui + 10, 0, 0, 0] }),
  look: { fill: 'rgba(18,12,8,.78)', border: alpha(FRAME, 0.6), radius: 14 } },
  { at: '#ale-fortified.hidden', box: { display: 'none' } },
  { at: '#ale-fortified .af-mug', text: { size: 15, color: GOLD, whole: true } },
  { at: '#ale-fortified .af-text', text: { face: 'display', weight: 700, size: 14, color: GOLD, whole: true } },
];

const trees: SheetTree[] = [];

/** A room over the screen that centres what's in it across, at its top or its foot. */
const room = (at: 'start' | 'end'): Panel => new Panel(layer(DRINK_LAYER),
  { position: 'absolute', inset: 0, direction: 'column', alignItems: 'center', justify: at }, {}, 'ui');

/** The ale's buttons and notice drawn by the engine from now on, the page's own out of sight. */
export function drawDrink(): void {
  if (trees.length) return;
  const parts = [['drink-choice', CHOICE, 'end'], ['ale-fortified', FORTIFIED, 'start']] as const;
  for (const [id, sheet, at] of parts) {
    const page = document.getElementById(id);
    if (!page) continue;
    page.classList.add('kit-mirror');
    trees.push(new SheetTree(page, sheet, 'ui', room(at)));
  }
}
