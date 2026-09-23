// The class card's skills: one row showing four at a time, scrolled sideways with the arrows, the
// mouse wheel, or by dragging it (mouse) or swiping (touch). It snaps to whole tiles.
const SHOWN = 4;
const smooth = (): ScrollBehavior => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

let row: HTMLElement, prev: HTMLButtonElement, next: HTMLButtonElement;

/** one tile's step (its width plus the gap) */
function step(): number {
  const a = row.children[0] as HTMLElement | undefined, b = row.children[1] as HTMLElement | undefined;
  return a && b ? b.offsetLeft - a.offsetLeft : row.clientWidth / SHOWN;
}

function go(tiles: number): void {
  const s = step();
  row.scrollTo({ left: Math.round(row.scrollLeft / s + tiles) * s, behavior: smooth() });
}

/** Arrows grey out at the ends; neither shows when every skill fits. */
export function syncSkillStrip(): void {
  const max = row.scrollWidth - row.clientWidth;
  const fits = max <= 1;
  row.parentElement!.classList.toggle('fits', fits);
  prev.disabled = fits || row.scrollLeft <= 1;
  next.disabled = fits || row.scrollLeft >= max - 1;
}

export function initSkillStrip(root: HTMLElement): void {
  row = root.querySelector<HTMLElement>('.cc-skills')!;
  prev = root.querySelector<HTMLButtonElement>('.cc-prev')!;
  next = root.querySelector<HTMLButtonElement>('.cc-next')!;
  // an arrow moves a page (the four shown)
  prev.onclick = () => go(-SHOWN);
  next.onclick = () => go(SHOWN);
  row.addEventListener('scroll', syncSkillStrip, { passive: true });
  new ResizeObserver(syncSkillStrip).observe(row);
  // the wheel scrolls it sideways, a tile per notch
  row.addEventListener('wheel', (e) => {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (row.scrollWidth <= row.clientWidth + 1 || !d) return;
    e.preventDefault();
    go(Math.sign(d));
  }, { passive: false });

  // mouse: drag it along (touch scrolls it natively); a drag doesn't count as a click on a tile
  let x0 = 0, left0 = 0, dragging = false, moved = false;
  row.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    dragging = true; moved = false; x0 = e.clientX; left0 = row.scrollLeft;
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - x0;
    if (!moved && Math.abs(dx) < 5) return;
    if (!moved) { moved = true; row.classList.add('dragging'); }
    row.scrollLeft = left0 - dx;
  });
  window.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    if (!moved) return;
    row.classList.remove('dragging');   // snapping back on settles on the nearest tile
    go(0);
  });
  row.addEventListener('click', (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
}
