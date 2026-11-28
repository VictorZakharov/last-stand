// The guide's pictures as the kit paints them (#973, `guideSheet.ts`): a foe's or hero's portrait from its canvas
// (and the spinner standing in its place till it's drawn), a skill's art framed as the hotbar frames it, a heading's
// gilt rules either side of its words. Sizes are px of the art.
import { artLoaded } from '../slotFace';
import { drawText, measure, type TextStyle } from '../overlay/paint';
import { FRAME, alpha } from '../kit/theme';
import type { Painted } from '../kit/sheet';

/** the spinner's side, a share of its box's (`--spin`), and its ring's width (px) */
const SPIN = { mini: 0.4, portrait: 0.28 };
/** the frame the hotbar draws over a slot's art (`.gd-kart::after`: black, a gilt line, a shade inward) */
const ART_FRAME = { line: alpha(FRAME, 0.7), shade: 'rgba(0,0,0,.8)', shadeReach: 10 };

/** The spinner's ring at the middle of a `w` by `h` box, its lit quarter at the top (it turns on the page; here it
 *  stands). */
function spinner(c: CanvasRenderingContext2D, w: number, h: number, share: number, width: number): void {
  const r = (Math.min(w, h) * share - width) / 2;
  c.lineWidth = width;
  c.strokeStyle = alpha(FRAME, 0.25);
  c.beginPath();
  c.arc(w / 2, h / 2, r, 0, Math.PI * 2);
  c.stroke();
  c.strokeStyle = '#f0c860';
  c.beginPath();
  c.arc(w / 2, h / 2, r, -Math.PI * 0.75, -Math.PI * 0.25);
  c.stroke();
}

/** A radial glow behind a picture: `inner` at its middle (`y` of the way down) to `outer` `stop` of the way out. */
function glow(c: CanvasRenderingContext2D, w: number, h: number, y: number, inner: string, outer: string,
  stop: number): void {
  const reach = Math.hypot(w, h) / 2;
  const fill = c.createRadialGradient(w / 2, h * y, 0, w / 2, h * y, reach);
  fill.addColorStop(0, inner);
  fill.addColorStop(stop, outer);
  fill.addColorStop(1, outer);
  c.fillStyle = fill;
  c.fillRect(0, 0, w, h);
}

/** A foe's or hero's picture (`.gd-pic`): its glow, its canvas once drawn, the spinner while it waits; round for the
 *  list's (`.gd-mini`, cut by its panel's corners), square for a page's. */
export function portrait(element: Element, w: number, h: number): Painted {
  const canvas = element.querySelector('canvas');
  const waiting = element.classList.contains('waiting');
  const none = element.classList.contains('none');
  const mini = element.classList.contains('gd-mini');
  const who = (element as HTMLElement).dataset.foe ?? '';
  return {
    key: `guide pic ${who} ${mini ? 'mini' : 'big'} ${waiting ? 'waiting' : none ? 'none' : 'drawn'} ${w}x${h}`,
    paint: (c) => {
      if (mini) glow(c, w, h, 0.4, alpha(FRAME, 0.3), 'rgba(0,0,0,.5)', 0.7);
      else {
        c.fillStyle = '#0e0c0b';
        c.fillRect(0, 0, w, h);
        glow(c, w, h, 0.45, 'rgba(160,124,70,.28)', 'rgba(160,124,70,0)', 0.72);
      }
      if (!waiting && !none && canvas?.width) c.drawImage(canvas, 0, 0, w, h);
      if (waiting) spinner(c, w, h, mini ? SPIN.mini : SPIN.portrait, mini ? 2 : 3);
    },
  };
}

/** A skill's painted art (`i.art`'s background, cut to its square as `center / cover`), and the hotbar's frame over
 *  it where `framed`; none till its picture has loaded. */
export function skillArt(framed: boolean) {
  return (element: Element, w: number, h: number): Painted | null => {
    const art = (element as HTMLElement).style.backgroundImage;
    const url = art ? /url\(["']?([^"')]+)["']?\)/.exec(art)?.[1] : undefined;
    if (!url) return null;
    const image = artLoaded(url, () => undefined);
    if (!image) return null;
    return {
      key: `guide art ${url} ${framed} ${w}x${h}`,
      paint: (c) => {
        const side = Math.max(w, h);
        c.drawImage(image, (w - side) / 2, (h - side) / 2, side, side);
        if (framed) frameArt(c, w, h);
      },
    };
  };
}

/** The hotbar's frame over a slot's art: black at its edge, a gilt line inside, a shade inward. */
function frameArt(c: CanvasRenderingContext2D, w: number, h: number): void {
  const reach = ART_FRAME.shadeReach;
  for (const [x0, y0, x1, y1] of [[0, 0, 0, reach], [0, h, 0, h - reach], [0, 0, reach, 0], [w, 0, w - reach, 0]]) {
    const shade = c.createLinearGradient(x0, y0, x1, y1);
    shade.addColorStop(0, ART_FRAME.shade);
    shade.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = shade;
    c.fillRect(0, 0, w, h);
  }
  c.strokeStyle = '#000';
  c.lineWidth = 1;
  c.strokeRect(0.5, 0.5, w - 1, h - 1);
  c.strokeStyle = ART_FRAME.line;
  c.strokeRect(1.5, 1.5, w - 3, h - 3);
}

/** A heading (`.gd-h`): its words `lead` + `gap` px in, half way down its box, and its rules (`::before`, `::after`),
 *  one fading in to its words, `lead` px wide, and one fading out from them to the box's end, `gap` px clear of the
 *  words each side. Painted whole: laid out as runs, its words stood a word a line in the boss's page. */
export function headRules(styleOf: () => TextStyle, lead: number, gap: number) {
  return (element: Element, w: number, h: number): Painted => {
    const style = styleOf();
    const words = measure(element.textContent ?? '', style);
    const end = lead + gap + words.w + gap;
    const y = Math.round(h / 2);
    return {
      key: `guide head ${words.text} ${style.size} ${style.color} ${w}x${h}`,
      paint: (c, scale) => {
        const into = c.createLinearGradient(0, 0, lead, 0);
        into.addColorStop(0, alpha(FRAME, 0));
        into.addColorStop(1, alpha(FRAME, 0.8));
        c.fillStyle = into;
        c.fillRect(0, y, lead, 1);
        drawText(c, words, lead + gap, (h - words.h) / 2, style, scale);
        if (end >= w) return;
        const out = c.createLinearGradient(end, 0, w, 0);
        out.addColorStop(0, alpha(FRAME, 0.8));
        out.addColorStop(1, alpha(FRAME, 0));
        c.fillStyle = out;
        c.fillRect(end, y, w - end, 1);
      },
    };
  };
}
