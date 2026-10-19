// Changes tried on the page before its own scripts run (tools/stalls `--variants`), to A/B a cause of the stalls
// without a build of its own. Each script is serialized into the page, so it can use nothing from here but its
// argument.

/** None: the page as it is. */
function base() {}

/** The stylesheet `css` added after the page's own, as soon as it has a head. */
function styled(css) {
  const add = () => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
  };
  addEventListener('DOMContentLoaded', add);
}

/**
 * Every 2D canvas drawn on the CPU (`willReadFrequently`), never by the GPU process's Skia: a canvas drawn on the GPU
 * builds a Skia program for each new kind of drawing (a shadow's blur, a gradient), and building one holds up the
 * GPU process, the game's WebGL with it.
 */
function cpuCanvas() {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, options) {
    if (kind !== '2d') return getContext.call(this, kind, options);
    return getContext.call(this, kind, { ...options, willReadFrequently: true });
  };
}

/** every part of the stash's glow that loops: main's the glow and its pseudo-elements, #269's spans within it */
const GLOW_PARTS = '.slot-glow, .slot-glow *, .slot-glow::before, .slot-glow::after';

/** The variants by name: each a script run before the page's own, and its argument. Hovering an item: its tooltip
 *  on a layer of its own (moved every mouse move by its `left` and `top`), none at all, its cards without their
 *  blurred shadow, the slot hovered without its brightening filter, and the stash's items that fit its slot lit
 *  without their glow's looping animations (#267). */
export const VARIANTS = {
  base: { script: base },
  cpuCanvas: { script: cpuCanvas },
  tooltipLayer: { script: styled, arg: '#tooltip { will-change: transform; }' },
  noTooltip: { script: styled, arg: '#tooltip { display: none !important; }' },
  noCardShadow: { script: styled, arg: '.tt-card { box-shadow: inset 0 0 0 1px var(--c, var(--frame)) !important; }' },
  noHoverFilter: { script: styled, arg: '.sitem:hover, .eslot:hover { filter: none !important; }' },
  stillGlow: { script: styled, arg: `${GLOW_PARTS} { animation: none !important; }` },
  // (and each of the glow's three animations stopped alone: its pulsing shadow, the arc chasing round its border, the
  // sheen sweeping across; main's on the glow and its pseudo-elements, #269's on spans of their own)
  stillPulse: { script: styled, arg: '.slot-glow, .glow-bright { animation: none !important; }' },
  stillArc: { script: styled, arg: '.slot-glow::before, .glow-arc > span { animation: none !important; }' },
  stillSheen: { script: styled, arg: '.slot-glow::after, .glow-sheen > span { animation: none !important; }' },
  // (and the glow, animations and all, on layers of its own)
  glowLayer: { script: styled, arg: '.slot-glow, .slot-glow::before, .slot-glow::after { will-change: transform; }' },
  // (and moving between items: every item's fade into the slot's focus or out of it cut, the items dimmed and lit
  // without their filters, and the stash's view without its fading mask)
  noFocusFade: { script: styled, arg: '.sitem, .eslot { transition: none !important; }' },
  itemLayers: { script: styled, arg: '.sitem, .eslot { will-change: transform, opacity, filter; }' },
  itemMoveLayers: { script: styled, arg: '.sitem, .eslot { will-change: transform; }' },
  noFocusFilter: { script: styled, arg: '#menu.slot-focus .sitem { filter: none !important; }' },
  noLitFilter: { script: styled, arg: '#menu.slot-focus .sitem.match { filter: none !important; }' },
  noDimFilter: { script: styled, arg: '#menu.slot-focus .sitem:not(.match) { filter: none !important; }' },
  noStashMask: { script: styled, arg: '#stash { mask-image: none !important; }' },
  // (and the glow's loops run on the item hovered and the slots alone, the other stash items that fit lit steady, or
  // pulsing)
  focusLoops: {
    script: styled,
    arg: '.sitem:not(:hover) > .slot-glow span, :not(.match) > .slot-glow span { animation: none !important; }',
  },
  focusLoopsPulse: {
    script: styled,
    arg: '.sitem:not(:hover) > .slot-glow :is(.glow-arc, .glow-sheen) > span, :not(.match) > .slot-glow span '
      + '{ animation: none !important; }',
  },
};
