// One of the folk's face in its oval drawn by the engine (ui/kit's sheet; #973), from `styles/_folkFace.scss`: the
// oval of the theme's frame (a gold ring, a dark one round it), the room's dim colour inside, and his picture
// (`folkFace.ts` draws it into the card's canvas) over it once made, a spinner's ring while it waits. Its card's sheet
// sizes it (`faceBox`): the box reaches past the oval by its rings, as the page's shadows did, and gives it back by
// its margins, so nothing round it moves. Not drawn: the spinner's turn, the picture's fade in, the drop shadow.
import { FRAME, FRAME_DARK, alpha } from './kit/theme';
import type { Painted, Sheet } from './kit/sheet';
import type { PanelStyle } from '../engine/ui';

/** the rings round the oval (`0 0 0 3px $frame, 0 0 0 4.5px $frame-dark`, px) */
const RING = { gold: 3, dark: 1.5 };
const ROUND = RING.gold + RING.dark;
/** the spinner's side and its ring's width (px) */
const SPINNER = { side: 30, width: 3 };

/** An oval `w` by `h` px laid out as its rings reach past it. */
export function faceBox(w: number, h: number): PanelStyle {
  return { width: w + ROUND * 2, height: h + ROUND * 2, margin: -ROUND, shrink: 0 };
}

/** An ellipse filling the box inset by `inset` px each side, as a path. */
function oval(c: CanvasRenderingContext2D, w: number, h: number, inset: number): void {
  c.beginPath();
  c.ellipse(w / 2, h / 2, Math.max(0, w / 2 - inset), Math.max(0, h / 2 - inset), 0, 0, Math.PI * 2);
}

/** The face as it stands: its rings, the room's colour, his picture or the spinner. */
function face(element: Element, w: number, h: number): Painted {
  const photo = element.querySelector<HTMLCanvasElement>('canvas');
  const pictured = element.classList.contains('pictured') && !!photo?.width;
  const waiting = element.classList.contains('waiting');
  const shown = (element as HTMLElement).dataset.shown ?? '';
  return {
    key: `face ${w}x${h} ${pictured ? `pictured ${shown}` : waiting ? 'waiting' : 'empty'}`,
    paint: (c) => {
      oval(c, w, h, 0);
      c.fillStyle = FRAME_DARK;
      c.fill();
      oval(c, w, h, RING.dark);
      c.fillStyle = FRAME;
      c.fill();
      c.save();
      oval(c, w, h, ROUND);
      c.clip();
      const room = c.createRadialGradient(w * 0.35, h * 0.3, 0, w * 0.35, h * 0.3, Math.hypot(w, h) * 0.75);
      room.addColorStop(0, '#4a2e16');
      room.addColorStop(1, '#0c0806');
      c.fillStyle = room;
      c.fillRect(0, 0, w, h);
      if (pictured) drawCovered(c, photo!, ROUND, ROUND, w - ROUND * 2, h - ROUND * 2);
      c.restore();
      if (waiting) spinner(c, w / 2, h / 2);
    },
  };
}

/** `image` drawn over the box at (`x`, `y`), `w` by `h`, covering it (`object-fit: cover`). */
function drawCovered(c: CanvasRenderingContext2D, image: HTMLCanvasElement, x: number, y: number, w: number,
  h: number): void {
  const k = Math.max(w / image.width, h / image.height);
  const [sw, sh] = [w / k, h / k];
  c.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, w, h);
}

/** The spinner's ring at its centre, its lit quarter at the top (it turns on the page; here it stands). */
function spinner(c: CanvasRenderingContext2D, x: number, y: number): void {
  const r = (SPINNER.side - SPINNER.width) / 2;
  c.lineWidth = SPINNER.width;
  c.strokeStyle = alpha(FRAME, 0.25);
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.stroke();
  c.strokeStyle = FRAME;
  c.beginPath();
  c.arc(x, y, r, -Math.PI * 0.75, -Math.PI * 0.25);
  c.stroke();
}

/** The face's rules: painted whole, what's in it on the page alone. */
export const FOLK_FACE: Sheet = [
  { at: '.folk-face', paint: face },
  { at: '.folk-face > *', box: { display: 'none' } },
];
