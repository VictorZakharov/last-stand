// What the hero selection screen paints itself (#973, `heroesSheet.ts`), as `styles/_heroes.scss` draws it with
// gradients and turned boxes: the shade over the hall (a dark rim round where the hero stands, and letterbox bands),
// the panel's corner brackets in the hero's colour, a tab's number in its rhombus, a trait's slanted pips, and a
// section's head's fading line. Sizes are px of the lobby's scale.
import { accent } from './diagFrame';
import { FRAME, alpha, mix } from './kit/theme';
import { measure, type TextStyle } from './overlay/paint';
import type { Mark, Painted } from './kit/sheetRules';

/** the shade's dark (`rgba(3,2,4,…)`) */
const SHADE = (opacity: number): string => `rgba(3,2,4,${opacity})`;
/** how much smaller than the screen the shade is painted (its gradients are smooth: stretched, they're the same) */
const SHADE_SHRINK = 8;
/** the dark round the hero (`radial-gradient(ellipse 34% 62% at x 50%, transparent 45%, … .7 100%)`) */
const RIM = { across: 0.34, down: 0.62, clear: 0.45, dark: 0.7 };
/** the letterbox bands: dark at the top, clear from 14% to 80%, dark at the foot */
const BANDS: [number, number][] = [[0, 0.88], [0.14, 0], [0.8, 0], [1, 0.92]];
/** the panel's corner brackets (`corner-brackets(22px, 2px)` at `inset: 5px`) */
const BRACKET = { inset: 5, long: 22, thick: 2 };
/** a trait's pip's slant (`skewX(-24deg)`) */
const SLANT = Math.tan((24 * Math.PI) / 180);
/** the rhombus's dark (`#120e0a`) */
export const KEY_DARK = '#120e0a';

/** An element's class colour: the nearest inline `--cc` round it, else the accent. */
export function heroColour(element: Element): string {
  for (let at: Element | null = element; at; at = at.parentElement) {
    const colour = (at as HTMLElement).style?.getPropertyValue('--cc').trim();
    if (colour) return colour;
  }
  return accent();
}

/** The shade over the hall, `w` by `h` px, the hero standing `across` px from the left. */
export function shade(w: number, h: number, across: number): Painted {
  const size: [number, number] = [Math.max(16, Math.round(w / SHADE_SHRINK)), Math.max(16, Math.round(h / SHADE_SHRINK))];
  const [sw, sh] = size;
  return {
    key: `shade ${sw}x${sh} ${Math.round((across / w) * sw)}`,
    size,
    paint: (c) => {
      c.save();
      c.translate((across / w) * sw, sh / 2);
      c.scale(RIM.across * sw, RIM.down * sh);
      const rim = c.createRadialGradient(0, 0, 0, 0, 0, 1);
      rim.addColorStop(RIM.clear, SHADE(0));
      rim.addColorStop(1, SHADE(RIM.dark));
      c.fillStyle = rim;
      c.fillRect(-sw, -sh, sw * 2, sh * 2);
      c.restore();
      const bands = c.createLinearGradient(0, 0, 0, sh);
      for (const [at, opacity] of BANDS) bands.addColorStop(at, SHADE(opacity));
      c.fillStyle = bands;
      c.fillRect(0, 0, sw, sh);
    },
  };
}

/** The panel's corner brackets: two bars at each corner, in its hero's colour. */
export function brackets(element: Element): Mark[] {
  const fill = heroColour(element);
  const { inset: i, long, thick } = BRACKET;
  const marks: Mark[] = [];
  for (const top of [true, false]) {
    for (const left of [true, false]) {
      const inset: Mark['inset'] = [top ? i : 'auto', left ? 'auto' : i, top ? 'auto' : i, left ? i : 'auto'];
      marks.push({ inset, bar: { width: long, height: thick, fill } });
      marks.push({ inset, bar: { width: thick, height: long, fill } });
    }
  }
  return marks;
}

/** A tab's number's rhombus, `side` px: lit in its hero's colour where his tab's the one chosen. */
export function rhombus(element: Element, side: number): Painted {
  const active = !!element.closest('button.active');
  const colour = heroColour(element);
  const fill = active ? colour : KEY_DARK;
  const edge = active ? colour : alpha(FRAME, 0.7);
  return {
    key: `rhombus ${side} ${fill} ${edge}`,
    paint: (c) => {
      const half = side / 2;
      c.beginPath();
      c.moveTo(half, 0.5);
      c.lineTo(side - 0.5, half);
      c.lineTo(half, side - 0.5);
      c.lineTo(0.5, half);
      c.closePath();
      if (active) {
        c.shadowBlur = 8;
        c.shadowColor = colour;
      }
      c.fillStyle = fill;
      c.fill();
      c.shadowBlur = 0;
      c.strokeStyle = edge;
      c.lineWidth = 1;
      c.stroke();
    },
  };
}

/** A trait's pip, `w` by `h` px, slanted: lit in its hero's colour where it counts. */
export function pip(element: Element, w: number, h: number): Painted {
  const on = element.classList.contains('on');
  const colour = heroColour(element);
  const slant = h * SLANT;
  return {
    key: `pip ${w}x${h} ${on ? colour : 'off'}`,
    paint: (c) => {
      c.beginPath();
      c.moveTo(slant, 0.5);
      c.lineTo(w - 0.5, 0.5);
      c.lineTo(w - slant, h - 0.5);
      c.lineTo(0.5, h - 0.5);
      c.closePath();
      if (on) {
        const fill = c.createLinearGradient(0, 0, 0, h);
        fill.addColorStop(0, mix(colour, 0.9, '#ffffff'));
        fill.addColorStop(1, mix(colour, 0.55, '#000000'));
        c.fillStyle = fill;
      } else {
        c.fillStyle = '#1a1614';
      }
      c.fill();
      c.strokeStyle = on ? colour : alpha(FRAME, 0.35);
      c.lineWidth = 1;
      c.stroke();
    },
  };
}

/** A section's head's line (`section-head`'s `::after`): from 10 px after its words to its end, fading out. */
export function headLine(style: TextStyle) {
  return (element: Element, w: number, h: number): Painted => {
    const words = (element.textContent ?? '').toUpperCase();
    const from = measure(words, style).w + (style.spacing ?? 0) * words.length + 10;
    return {
      key: `head ${w}x${h} ${Math.round(from)}`,
      paint: (c) => {
        if (from >= w) return;
        const fade = c.createLinearGradient(from, 0, w, 0);
        fade.addColorStop(0, alpha(FRAME, 0.5));
        fade.addColorStop(1, alpha(FRAME, 0));
        c.fillStyle = fade;
        c.fillRect(from, Math.round(h / 2), w - from, 1);
      },
    };
  };
}
