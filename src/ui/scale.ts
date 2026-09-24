// Scales the whole UI relative to a reference layout so it fits small screens
// (and grows on large ones).
const REF_W = 1500, REF_H = 780;

function apply() {
  const w = window.innerWidth, h = window.innerHeight;
  if (w < 1 || h < 1) return;   // mid-move between monitors: keep the last real size
  // short screens (phones held sideways) get their own one-panel lobby layout, sized to the height
  const upright = h > w && w <= 1000;   // upright tablet: one lobby panel at a time, spanning the width
  const fit = Math.min(1.35, Math.max(0.6, Math.min(w / REF_W, h / REF_H)));
  const s = h <= 520 ? Math.max(0.6, Math.min(1, h / 520, w / 1150)) : upright ? Math.max(0.6, Math.min(1.25, w / 720)) : fit;
  const root = document.documentElement.style;
  root.setProperty('--ui', s.toFixed(3));
  // the in-run HUD spreads across the screen's width, so an upright tablet keeps the fitted scale
  root.setProperty('--hud', (upright ? fit : s).toFixed(3));
  // touch controls size with the screen's short side (a phone held sideways is ~390 px)
  root.setProperty('--touch', Math.min(1.2, Math.max(0.72, Math.min(w, h) / 480)).toFixed(3));
}

export function initUIScale() {
  apply();
  window.addEventListener('resize', apply);
}
