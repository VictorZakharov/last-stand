// Scales the whole UI relative to a reference layout so it fits small screens
// (and grows on large ones).
const REF_W = 1500, REF_H = 780;

function apply() {
  const s = Math.min(1.35, Math.max(0.6, Math.min(window.innerWidth / REF_W, window.innerHeight / REF_H)));
  document.documentElement.style.setProperty('--ui', s.toFixed(3));
}

export function initUIScale() {
  apply();
  window.addEventListener('resize', apply);
}
