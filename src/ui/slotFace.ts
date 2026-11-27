// A skill bar slot's face painted with the canvas for the engine's kit (#973, `hotbarPanel.ts`): what `.slot` and
// its `.icon` drew on the page (_hud.scss), inside its 1 px border: the skill's painted icon over the slot, or its
// glyph glowing in its colour over a radial shade of it, the frame's line and the dark shade round its edge (the
// slot's inset box-shadow), and the icon dimmed and greyed as a lack of energy or a held-up action dims it. A cast
// draws a gold ring in place of the line and shade. Painted again only as one of those changes. It's painted in px
// of its art (the atlas's context is scaled to the screen already), `scale` for the shadows alone.
import { fontOf } from './overlay/paint';
import { artPicture } from './skillArt';

/** What a slot's face shows: its skill's art or glyph (none: an empty slot), and its state. */
export interface SlotFace {
  /** its painted icon's address, if it has one */
  art?: string;
  /** its glyph and colour, where it has no art */
  glyph?: string;
  color?: string;
  /** short of energy (`.nomana`), being cast (`.active`), held up by another action (`.busy`) */
  nomana: boolean;
  active: boolean;
  busy: boolean;
}

/** the slot's face inside its border (px) and its corners' radius there */
export const FACE = 60;
const FACE_RADIUS = 2;
/** the theme's frame line and highlight (`$frame`, `$highlight`) */
const FRAME_LINE = 'rgba(160, 124, 70, .7)';
const NOMANA_LINE = 'rgba(40, 90, 200, .9)';
const HIGHLIGHT = '#f0c860';
/** the dark shade round its edge (`inset 0 0 12px rgba(0,0,0,.9)`) */
const SHADE_BLUR = 12;
const SHADE = 'rgba(0, 0, 0, .9)';
/** the glyph's size and glow (`.slot .icon`: 33 px, `drop-shadow(0 0 6px currentColor)`) */
const GLYPH_SIZE = 33;
const GLYPH_GLOW = 6;

const pictures = new Map<string, HTMLImageElement>();

/** The painted icon at `art`, once it has loaded (none till then: `loaded` is called as it does). */
export function artLoaded(art: string, loaded: () => void): HTMLImageElement | null {
  let image = pictures.get(art) ?? artPicture(art);
  if (!image) {
    image = new Image();
    image.decoding = 'async';
    image.src = art;
  }
  pictures.set(art, image);
  if (image.complete && image.naturalWidth > 0) return image;
  image.addEventListener('load', loaded, { once: true });
  return null;
}

/** The key a face is painted again by: whatever it shows. */
export function faceKey(face: SlotFace, artReady: boolean): string {
  const looks = `${face.nomana ? 'n' : ''}${face.active ? 'a' : ''}${face.busy ? 'b' : ''}`;
  return `${face.art ?? ''}|${artReady ? 1 : 0}|${face.glyph ?? ''}|${face.color ?? ''}|${looks}`;
}

/** The icon's filter as the state's (`.slot.nomana .icon`, `.slot.busy .icon`, the later rule winning). */
function iconFilter(face: SlotFace): string {
  if (face.busy) return 'grayscale(.85) brightness(.4)';
  if (face.nomana) return 'grayscale(1) brightness(.5)';
  return 'none';
}

/** A rounded box's path, `w` by `h` from (`x`, `y`). */
function roundedPath(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

/** The slot's inset shadows over what's painted: the frame's 1 px line (or a cast's 2 px gold ring) and its shade. */
function paintInset(c: CanvasRenderingContext2D, face: SlotFace, scale: number): void {
  const size = FACE;
  if (face.active) {
    c.lineWidth = 2;
    c.strokeStyle = HIGHLIGHT;
    roundedPath(c, 1, 1, size - 2, size - 2, Math.max(0, FACE_RADIUS - 1));
    c.stroke();
    return;
  }
  // (the shade: a frame round the box, its blurred shadow falling inside it, the frame itself clipped away)
  c.save();
  c.shadowColor = SHADE;
  c.shadowBlur = SHADE_BLUR * scale;
  c.fillStyle = '#000';
  c.beginPath();
  c.rect(-size, -size, size * 3, size * 3);
  c.roundRect(0, 0, size, size, FACE_RADIUS);
  c.fill('evenodd');
  c.restore();
  c.lineWidth = 1;
  c.strokeStyle = face.nomana ? NOMANA_LINE : FRAME_LINE;
  roundedPath(c, 0.5, 0.5, size - 1, size - 1, FACE_RADIUS - 0.5);
  c.stroke();
}

/** The glyph's slot: a shade of its colour round a point 40% down (`radial-gradient(circle at 50% 40%, c40,
 *  #0b0a0c 75%)`), the glyph glowing over it. */
function paintGlyph(c: CanvasRenderingContext2D, face: SlotFace, scale: number): void {
  const size = FACE;
  const x = size / 2;
  const y = size * 0.4;
  const farthest = Math.hypot(size / 2, size * 0.6);
  const shade = c.createRadialGradient(x, y, 0, x, y, farthest * 0.75);
  shade.addColorStop(0, `${face.color}40`);
  shade.addColorStop(1, '#0b0a0c');
  c.fillStyle = shade;
  c.fillRect(0, 0, size, size);
  paintInset(c, face, scale);
  c.save();
  c.filter = iconFilter(face);
  c.font = fontOf({ face: 'body', size: GLYPH_SIZE, color: face.color ?? '#fff' });
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = face.color ?? '#fff';
  c.shadowColor = face.color ?? '#fff';
  c.shadowBlur = GLYPH_GLOW * scale;
  c.fillText(face.glyph ?? '', x, size / 2);
  c.restore();
}

/** Paints `face` (its painted icon `image`, if loaded) at `scale` canvas pixels a px, its top left at the origin. */
export function paintFace(c: CanvasRenderingContext2D, face: SlotFace, image: HTMLImageElement | null,
  scale: number): void {
  const size = FACE;
  c.save();
  roundedPath(c, 0, 0, size, size, FACE_RADIUS);
  c.clip();
  if (face.art) {
    if (image) {
      c.save();
      c.filter = iconFilter(face);
      // (centred and covering the slot, as `background: center / cover`)
      const fit = Math.max(size / image.naturalWidth, size / image.naturalHeight);
      const w = image.naturalWidth * fit;
      const h = image.naturalHeight * fit;
      c.drawImage(image, (size - w) / 2, (size - h) / 2, w, h);
      c.restore();
    }
    paintInset(c, face, scale);
  } else if (face.glyph) {
    paintGlyph(c, face, scale);
  } else {
    paintInset(c, face, scale);
  }
  c.restore();
}
