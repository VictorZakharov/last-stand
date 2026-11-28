// The tavern's bottles' paper labels (from play, "for bottles we need stickers on them, so they look real"): eight
// labels painted once into one atlas of 1024 by 512 (256 a label: 2 MB on the GPU, 2.7 with its smaller levels; at
// 128 a label they read blurred from the bar, from play, "can we get higher quality textures here ?"), each on aged
// paper with a ruled border, a word in a printer's serif (what's in it: plain words, no maker's name), a device and
// lines of small print; and each label a band wrapped round a bottle's body a hair off its
// glass (or a card on a case bottle's flat face), its uv laid into one of the atlas's cells. All the labels are one
// mesh in one material.
import { CanvasTexture, Geometry, LitMaterial, SRGBColorSpace } from '../engine/api/index.ts';
import * as shapes from '../engine/api/shapes/index.ts';
import { canvasOf, ctx2d } from '../core/textures';
import { mulberry } from '../util';

/** the atlas's size and its cells (columns by rows) */
const WIDTH = 1024;
const HEIGHT = 512;
const COLUMNS = 4;
const ROWS = 2;
const CELL = WIDTH / COLUMNS;
/** a label is laid out on a cell of 128 and painted at the cell's size */
const DRAWN = 128;
/** how many labels it holds */
export const LABELS = COLUMNS * ROWS;

/** each label: its paper, its ink, the word printed on it and its small print (not all on white paper: from play,
 *  "not all labels need to be white", some dark or coloured, printed in gold or cream) */
const PRINTS: readonly { paper: string; ink: string; word: string; lines: readonly string[] }[] = [
  { paper: '#e8dcb8', ink: '#5a1a10', word: 'ALE', lines: ['BROWN & STRONG', 'BREWED IN THE VALE'] },
  { paper: '#1c2a4a', ink: '#d8b45a', word: 'MEAD', lines: ['OF WILD HONEY', 'LAID DOWN THREE WINTERS'] },
  { paper: '#efe4c8', ink: '#2a2a20', word: 'RYE', lines: ['TWICE DISTILLED', 'FROM THE HIGH FIELDS'] },
  { paper: '#c8862a', ink: '#2a1408', word: 'CIDER', lines: ['DRY & STILL', 'OF THE ORCHARD'] },
  { paper: '#24402a', ink: '#e8dcb0', word: 'SLOE', lines: ['GIN OF SLOES', 'PICKED AFTER FROST'] },
  { paper: '#6a1a18', ink: '#e6c878', word: 'PORT', lines: ['RUBY & SWEET', 'AGED IN OAK'] },
  { paper: '#1a1714', ink: '#c8a050', word: 'BITTERS', lines: ['OF ROOTS & BARK', 'A FEW DROPS ONLY'] },
  { paper: '#e6d2a8', ink: '#3a2410', word: 'BRANDY', lines: ['FINE OLD', 'OF THE SOUTHERN VINES'] },
];

/** One label painted in its cell: paper aged at its edges, a double rule, the word, a device, small print. */
function paint(context: CanvasRenderingContext2D, k: number, rng: () => number): void {
  const { paper, ink, word, lines } = PRINTS[k];
  const x0 = (k % COLUMNS) * CELL, y0 = Math.floor(k / COLUMNS) * CELL;
  context.save();
  context.translate(x0, y0);
  // (laid out in a cell of 128 whatever the cell's size)
  context.scale(CELL / DRAWN, CELL / DRAWN);
  context.fillStyle = paper;
  context.fillRect(0, 0, DRAWN, DRAWN);
  // (aged: darker toward its edges, foxed in spots)
  const age = context.createRadialGradient(DRAWN / 2, DRAWN / 2, DRAWN * 0.25, DRAWN / 2, DRAWN / 2, DRAWN * 0.75);
  age.addColorStop(0, 'rgba(90, 60, 20, 0)');
  age.addColorStop(1, 'rgba(90, 60, 20, 0.35)');
  context.fillStyle = age;
  context.fillRect(0, 0, DRAWN, DRAWN);
  for (let spot = 0; spot < 12; spot++) {
    context.fillStyle = `rgba(110, 70, 30, ${0.08 + rng() * 0.12})`;
    context.beginPath();
    context.arc(rng() * DRAWN, rng() * DRAWN, 1 + rng() * 3, 0, Math.PI * 2);
    context.fill();
  }
  context.strokeStyle = ink;
  context.lineWidth = 3;
  context.strokeRect(7, 7, DRAWN - 14, DRAWN - 14);
  context.lineWidth = 1;
  context.strokeRect(12, 12, DRAWN - 24, DRAWN - 24);
  context.fillStyle = ink;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `bold ${word.length > 5 ? 22 : 30}px Georgia, 'Times New Roman', serif`;
  context.fillText(word, DRAWN / 2, DRAWN * 0.42);
  // (a device over it: a star, a sheaf or a ring)
  context.beginPath();
  if (k % 3 === 0) {
    for (let p = 0; p < 10; p++) {
      const angle = (p / 10) * Math.PI * 2 - Math.PI / 2, r = p % 2 ? 4 : 9;
      context.lineTo(DRAWN / 2 + Math.cos(angle) * r, DRAWN * 0.2 + Math.sin(angle) * r);
    }
    context.closePath();
    context.fill();
  } else if (k % 3 === 1) {
    for (const lean of [-0.35, 0, 0.35]) {
      context.moveTo(DRAWN / 2, DRAWN * 0.27);
      context.lineTo(DRAWN / 2 + Math.sin(lean) * 14, DRAWN * 0.27 - Math.cos(lean) * 14);
    }
    context.lineWidth = 2;
    context.stroke();
  } else {
    context.lineWidth = 2;
    context.arc(DRAWN / 2, DRAWN * 0.2, 8, 0, Math.PI * 2);
    context.stroke();
  }
  // (small print under a rule: two lines of words, and a third of numbers)
  context.fillRect(DRAWN * 0.25, DRAWN * 0.56, DRAWN * 0.5, 1.5);
  context.font = `bold 8.5px Georgia, 'Times New Roman', serif`;
  lines.forEach((line, at) => context.fillText(line, DRAWN / 2, DRAWN * (0.66 + at * 0.09), DRAWN * 0.74));
  context.font = `italic 7.5px Georgia, 'Times New Roman', serif`;
  context.fillText(`No. ${10 + Math.floor(rng() * 89)}`, DRAWN / 2, DRAWN * 0.86);
  context.restore();
}

/** The labels' material, one for all of them: the atlas painted once, paper's matte. */
let made: LitMaterial | null = null;
export function labelMaterial(): LitMaterial {
  if (made) return made;
  const canvas = canvasOf(WIDTH, HEIGHT), context = ctx2d(canvas), rng = mulberry(7343);
  for (let k = 0; k < LABELS; k++) paint(context, k, rng);
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 8;
  made = new LitMaterial({ map, roughness: 0.85 });
  return made;
}

/** Where a label sits on a bottle: wrapped round its body (`radius`, `arc` rad wide) or on its flat face (`face`, m
 *  out from its axis, `wide` across), from `from` to `to` up it (m). */
export interface LabelPlace {
  from: number;
  to: number;
  radius?: number;
  arc?: number;
  face?: number;
  wide?: number;
}

/** a label's uv laid into cell `k` of the atlas, a margin in, from a uv of 0 to 1 */
function intoCell(geometry: Geometry, k: number): void {
  const uv = geometry.attributes.uv;
  const column = k % COLUMNS, row = Math.floor(k / COLUMNS);
  for (let i = 0; i < uv.count; i++) {
    const u = (column + 0.02 + uv.getX(i) * 0.96) / COLUMNS;
    // (the canvas's rows run down, a texture's v up: three flips the canvas as it uploads it)
    const v = 1 - (row + 0.02 + (1 - uv.getY(i)) * 0.96) / ROWS;
    uv.setXY(i, u, v);
  }
}

/** A label of cell `k` as it sits on a bottle whose foot is the origin, facing +z: a band round its body a hair off
 *  the glass, or a card on its flat face. */
export function labelOn(place: LabelPlace, k: number): Geometry {
  const high = place.to - place.from;
  let geometry: Geometry;
  if (place.face !== undefined) {
    geometry = shapes.plane(place.wide ?? 0.04, high).translate(0, place.from + high / 2, place.face + 0.0008);
  } else {
    const radius = (place.radius ?? 0.03) + 0.0008, arc = place.arc ?? 1.4;
    // (a cylinder's open side, its middle facing +z: three's start from +z at 0, round toward +x)
    geometry = shapes.cylinder(radius, radius, high, 8, 1, true, -arc / 2, arc)
      .translate(0, place.from + high / 2, 0);
  }
  intoCell(geometry, k);
  return geometry;
}
