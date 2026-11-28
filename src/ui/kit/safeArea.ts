// The screen's safe-area insets (css px: a phone's camera cutout, CSS's `env(safe-area-inset-*)`), for a panel placed
// as the page's CSS placed it past them. Read off a probe of the page's own, out of sight, padded by them.

/** The four insets, css px. */
export interface SafeInsets { top: number; right: number; bottom: number; left: number }

let probe: HTMLElement | null = null;

/** The probe, made once: a box padded by each inset. */
function probeOf(): HTMLElement {
  if (probe) return probe;
  probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  const sides = ['top', 'right', 'bottom', 'left'];
  const padding = sides.map((side) => `env(safe-area-inset-${side}, 0px)`).join(' ');
  probe.style.cssText = `position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;`
    + `padding:${padding}`;
  document.body.appendChild(probe);
  return probe;
}

/** The screen's safe-area insets now (a style read: ask it while what needs it shows). */
export function safeInsets(): SafeInsets {
  const style = getComputedStyle(probeOf());
  return {
    top: parseFloat(style.paddingTop) || 0, right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0, left: parseFloat(style.paddingLeft) || 0,
  };
}
