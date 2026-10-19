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
  stillGlow: { script: styled, arg: '.slot-glow, .slot-glow::before, .slot-glow::after { animation: none !important; }' },
  // (and each of the glow's three animations stopped alone: its pulsing shadow, the arc chasing round its border, the
  // sheen sweeping across)
  stillPulse: { script: styled, arg: '.slot-glow { animation: none !important; }' },
  stillArc: { script: styled, arg: '.slot-glow::before { animation: none !important; }' },
  stillSheen: { script: styled, arg: '.slot-glow::after { animation: none !important; }' },
  // (and the glow, animations and all, on layers of its own)
  glowLayer: { script: styled, arg: '.slot-glow, .slot-glow::before, .slot-glow::after { will-change: transform; }' },
};
