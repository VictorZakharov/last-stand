// Scales the whole UI from a reference layout to the screen, as a share of it: a 4K screen shows the same UI at 100%
// as at 300% (css px follow the OS's scaling, which says nothing of how big the screen is or how far away). Only
// small screens keep a floor in css px, so phones and small windows stay readable.
const REF_W = 1500, REF_H = 780;

/** The scales as last fitted (css px per px of the reference layout): `ui` the lobby's and the modals', `hud` the run's
 *  HUD's and the world's labels', `touch` the touch controls' (sized for a finger, so in css px). */
export const uiScales = { ui: 1, hud: 1, touch: 1 };

const round = (v: number): number => Math.round(v * 1000) / 1000;

function apply() {
  const w = window.innerWidth, h = window.innerHeight;
  if (w < 1 || h < 1) return;   // mid-move between monitors: keep the last real size
  // short screens (phones held sideways) get their own one-panel lobby layout, sized to the height
  const upright = h > w && w <= 1000;   // upright tablet: one lobby panel at a time, spanning the width
  // (no ceiling: capped at 1.35, a 4K screen at 100% showed the UI at half its size at 300%)
  const fit = Math.max(0.6, Math.min(w / REF_W, h / REF_H));
  const s = h <= 520 ? Math.max(0.6, Math.min(1, h / 520, w / 1150)) : upright ? Math.max(0.6, Math.min(1.25, w / 720)) : fit;
  // (rounded as the stylesheet has them, so what the world's labels read and the page's boxes agree)
  uiScales.ui = round(s);
  // the in-run HUD spreads across the screen's width, so an upright tablet keeps the fitted scale
  uiScales.hud = round(upright ? fit : s);
  // touch controls size with the screen's short side (a phone held sideways is ~390 px)
  uiScales.touch = round(Math.min(1.2, Math.max(0.72, Math.min(w, h) / 480)));
  const root = document.documentElement.style;
  root.setProperty('--ui', String(uiScales.ui));
  root.setProperty('--hud', String(uiScales.hud));
  root.setProperty('--touch', String(uiScales.touch));
}

export function initUIScale() {
  apply();
  window.addEventListener('resize', apply);
}
