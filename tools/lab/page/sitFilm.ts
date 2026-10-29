// A film of a sit (tools/lab `sit`): him sitting down the first time and getting up the first time, a frame every
// few, in a close view and the game's third-person view, each frame labelled with how far down he is. Two moments
// pictured (half way down, sat) never showed what moves between them: from play, the mage's staff "dropping in a
// weird way" and turned in his hand once he was up, a bow and weapons "summoned" into the hand.
import type { Lab, Pictured, Tile, ViewName } from './lab';

/** a frame filmed every this many while he goes down or up */
const EVERY = 5;
/** each frame's width in the film (px), and frames a row of the sheet */
const WIDTH = 360;
const COLUMNS = 8;

type Way = 'down' | 'up';

/** One view's frames, in turn. */
interface Reel {
  view: ViewName;
  frames: Tile[];
}

/** A film of a sit's first way down and first way up, in `views`. */
export class SitFilm {
  private readonly reels: Reel[];
  private readonly done = new Set<Way>();
  private count = 0;

  constructor(private readonly name: string, views: ViewName[]) {
    this.reels = views.map((view) => ({ view, frames: [] }));
  }

  /** Films this frame if he's on his way `way` (`w` between 0 and 1), that way isn't done, and it's one of every
   *  `EVERY`. */
  take(lab: Lab, w: number, way: Way): void {
    if (w <= 0 || w >= 1 || this.done.has(way)) return;
    if (this.count++ % EVERY !== 0) return;
    const drawn = lab.drawn(this.reels.map((reel) => reel.view));
    drawn.forEach(({ canvas }, i) => {
      this.reels[i].frames.push(small(canvas, `${way} ${(w * 100).toFixed(0)}%`, this.reels[i].view));
    });
  }

  /** No more of `way` filmed (the first is filmed; the sits after it are its repeats). */
  end(way: Way): void {
    this.done.add(way);
  }

  /** The film as moments: each view's frames, `COLUMNS` a row. */
  moments(): Pictured[] {
    const moments: Pictured[] = [];
    for (const reel of this.reels) {
      for (let i = 0; i < reel.frames.length; i += COLUMNS) {
        const label = `${this.name}: sitting down and getting up, ${reel.view} (${i / COLUMNS + 1})`;
        moments.push({ label, tiles: reel.frames.slice(i, i + COLUMNS), notes: [] });
      }
    }
    return moments;
  }
}

/** `frame` drawn `WIDTH` wide with `text` on its top left, as a tile. */
function small(frame: HTMLCanvasElement, text: string, view: ViewName): Tile {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = Math.round(WIDTH * frame.height / frame.width);
  const context = canvas.getContext('2d')!;
  context.drawImage(frame, 0, 0, canvas.width, canvas.height);
  context.font = 'bold 18px system-ui, sans-serif';
  context.lineWidth = 3;
  context.strokeStyle = '#000';
  context.fillStyle = '#fff';
  context.strokeText(text, 8, 46);
  context.fillText(text, 8, 46);
  return { view, png: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
}
