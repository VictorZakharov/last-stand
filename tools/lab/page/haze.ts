// tools/lab haze: what the hero's held weapons take from the frame round them through the eyes (lab haze). The frame
// is drawn as the player sees it, and again with the weapons hidden, each also with the grade's adaptation held off
// (core/renderer.ts `holdAdaptation`). Held off, the weapons change only their own pixels (themselves, their bloom,
// their shadows), which are left out. Anywhere else, a pixel the adaptation darkens more with the weapons shown than
// without them is darkened by their light: the eye's adaptation to a bright area spread out round them as a veil, its
// edges on the grid of areas it's measured over. (The owner, of the sword through the eyes: "weapons have a haze
// that darkens the area around them, I think it's a bug", "its pretty big", "when sword moves from left position
// (idle) back to right, haze moves too, but when its all the way left the haze is not there at all".)
import type { Lab, Pictured, Report, Tile } from './lab';
import { G } from '../../../src/state';
import * as rendererCode from '../../../src/core/renderer';
import type { BiomeId } from '../../../src/data/biomes';
import type { WeaponStyle } from '../../../src/loot/loadout';
import { drawFrame, lookAlong, type Canvas } from './light';
import { isWeapon } from './strike';

export interface HazeOptions {
  biome: BiomeId;
  /** the ways the hero looks (degrees, 0 is +z) */
  facings: number[];
  gear?: WeaponStyle;
  weapon?: string;
  at?: [number, number];
  pictures: boolean;
  canary: boolean;
}

/** The game's renderer as far as it goes: `--ab` runs this on main's game, which can't hold its adaptation off. */
const holdAdaptation = (rendererCode as Partial<typeof rendererCode>).holdAdaptation;

/** a pixel the weapons change by this much (a share of white) with the adaptation held off is theirs */
const OWN = 0.01;
/** a pixel the adaptation darkens by this much more with the weapons shown than without them is hazed */
const HAZED = 0.02;
/** the most of the frame (outside the weapons' own pixels) their light may haze */
const HAZE_MOST = 0.005;
/** the frames stood before the frame is drawn, once the view is set */
const SETTLE_FRAMES = 30;
/** a picture's width (px) */
const PICTURE_WIDTH = 640;
/** the canary draws the frame the player sees at this much of its exposure, a veil over all of it */
const CANARY_EXPOSURE = 0.8;

/** What the weapons' light took from one frame. */
interface Haze {
  /** the share of the frame that's the weapons' own, their mean light there with the adaptation held off, and the
   *  share of it the adaptation took */
  own: number;
  ownLight: number;
  ownTaken: number;
  /** the share of the frame they hazed, the mean light lost there and the most (shares of white) */
  hazed: number;
  loss: number;
  most: number;
}

/** A frame drawn as the player sees it, and with the adaptation held off. */
interface Drawn {
  seen: Canvas;
  held: Canvas;
}

/** A pixel's light as an SDR screen shows it, a share of white (gamma 2.2, Rec. 709's weights). */
function lightAt(canvas: Canvas, at: number): number {
  const { pixels } = canvas;
  const red = Math.max(0, pixels[at]) ** 2.2;
  const green = Math.max(0, pixels[at + 1]) ** 2.2;
  const blue = Math.max(0, pixels[at + 2]) ** 2.2;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** The frame drawn as the player sees it, then with the adaptation held off. */
function drawBoth(lab: Lab, exposure = 1): Drawn {
  const was = G.renderer.toneMappingExposure;
  G.renderer.toneMappingExposure = was * exposure;
  let seen: Canvas;
  try {
    seen = drawFrame(lab);
  } finally {
    G.renderer.toneMappingExposure = was;
  }
  holdAdaptation!(true);
  try {
    return { seen, held: drawFrame(lab) };
  } finally {
    holdAdaptation!(false);
  }
}

/** The hero's weapons hidden; returns the undoing. */
function hideWeapons(lab: Lab): () => void {
  const hidden: { visible: boolean }[] = [];
  lab.model.root.traverse((object) => {
    if (object.visible && isWeapon(object)) hidden.push(object);
  });
  for (const object of hidden) object.visible = false;
  return () => {
    for (const object of hidden) object.visible = true;
  };
}

/** What the weapons' light took from the frames `shown` (as they are) and `hidden` (without them), and each pixel's
 *  loss (negative: the weapons' own). */
function hazeOf(shown: Drawn, hidden: Drawn): { haze: Haze; losses: Float32Array } {
  const count = shown.seen.width * shown.seen.height;
  const losses = new Float32Array(count);
  let own = 0;
  let ownLight = 0;
  let ownTaken = 0;
  let hazed = 0;
  let lost = 0;
  let most = 0;
  for (let pixel = 0; pixel < count; pixel++) {
    const at = pixel * 4;
    const shownHeld = lightAt(shown.held, at);
    const hiddenHeld = lightAt(hidden.held, at);
    if (Math.abs(shownHeld - hiddenHeld) > OWN) {
      own++;
      ownLight += shownHeld;
      ownTaken += shownHeld - lightAt(shown.seen, at);
      losses[pixel] = -1;
      continue;
    }
    // (what the adaptation took with the weapons shown, past what it took without them)
    const loss = (shownHeld - lightAt(shown.seen, at)) - (hiddenHeld - lightAt(hidden.seen, at));
    losses[pixel] = Math.max(0, loss);
    if (loss < HAZED) continue;
    hazed++;
    lost += loss;
    most = Math.max(most, loss);
  }
  const haze = {
    own: own / count,
    ownLight: own ? ownLight / own : 0,
    ownTaken: ownLight > 0 ? ownTaken / ownLight : 0,
    hazed: hazed / count,
    loss: hazed ? lost / hazed : 0,
    most,
  };
  return { haze, losses };
}

/** The hero standing in the biome, through the eyes, looking along `facing` (degrees), the frame settled. */
async function standIn(lab: Lab, options: HazeOptions, facing: number): Promise<void> {
  if (G.arena.biome !== options.biome) G.arena.setBiome(options.biome);
  const rad = facing * Math.PI / 180;
  await lab.setup({ view: 'first', facing: rad, gear: options.gear, weapon: options.weapon, at: options.at });
  await lookAlong(lab, rad);
  await lab.step(SETTLE_FRAMES);
}

/** `canvas` (rows from the bottom) as a picture `PICTURE_WIDTH` wide, each pixel coloured by `colour`. */
function tileOf(view: string, canvas: Canvas, colour: (pixel: number) => [number, number, number]): Tile {
  const { width, height } = canvas;
  const image = new ImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [red, green, blue] = colour((height - 1 - y) * width + x);
      const at = (y * width + x) * 4;
      image.data[at] = red;
      image.data[at + 1] = green;
      image.data[at + 2] = blue;
      image.data[at + 3] = 255;
    }
  }
  const full = document.createElement('canvas');
  full.width = width;
  full.height = height;
  full.getContext('2d')!.putImageData(image, 0, 0);
  const small = document.createElement('canvas');
  small.width = PICTURE_WIDTH;
  small.height = Math.round(height * PICTURE_WIDTH / width);
  small.getContext('2d')!.drawImage(full, 0, 0, small.width, small.height);
  return { view, png: small.toDataURL('image/png'), width: small.width, height: small.height };
}

/** The frame as the player sees it, and its haze: the frame greyed, the weapons' own pixels blue, each pixel their
 *  light darkened red by how much (fully red at a fifth of white). */
function pictureOf(label: string, shown: Drawn, losses: Float32Array, notes: string[]): Pictured {
  const { seen } = shown;
  const byte = (canvas: Canvas, pixel: number, channel: number) => Math.round(canvas.pixels[pixel * 4 + channel] * 255);
  const frame = tileOf('seen', seen, (pixel) => [byte(seen, pixel, 0), byte(seen, pixel, 1), byte(seen, pixel, 2)]);
  const map = tileOf('haze', seen, (pixel) => {
    const grey = Math.round(byte(seen, pixel, 1) * 0.5);
    if (losses[pixel] < 0) return [grey * 0.5, grey * 0.5, 160];
    const red = Math.min(1, losses[pixel] / 0.2);
    return [Math.round(grey + (255 - grey) * red), Math.round(grey * (1 - red)), Math.round(grey * (1 - red))];
  });
  return { label, tiles: [frame, map], notes };
}

const percent = (share: number) => `${(share * 100).toFixed(1)}%`;

/** A frame's haze as words. */
function hazeLine(haze: Haze): string {
  return `the weapons ${percent(haze.own)} of the frame, their light ${haze.ownLight.toFixed(2)} of white (the `
    + `adaptation took ${percent(haze.ownTaken)} of it); round them ${percent(haze.hazed)} of the frame darkened by `
    + `their light, by ${haze.loss.toFixed(3)} of white on average, ${haze.most.toFixed(3)} at most`;
}

/** The frame as it stands, with the weapons and without, measured; `exposure` the shown frame's (the canary's). */
function measureNow(lab: Lab, exposure = 1): { haze: Haze; losses: Float32Array; shown: Drawn } {
  const shown = drawBoth(lab, exposure);
  const show = hideWeapons(lab);
  let hidden: Drawn;
  try {
    hidden = drawBoth(lab);
  } finally {
    show();
  }
  return { ...hazeOf(shown, hidden), shown };
}

/** `lab haze`: through the eyes in each facing, what the hero's weapons' light takes from the frame round them. */
export async function haze(lab: Lab, options: HazeOptions): Promise<Report> {
  if (!holdAdaptation) return { text: 'this game can\'t hold its adaptation off: no haze measured', problems: [] };
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  for (const facing of options.facings) {
    await standIn(lab, options, facing);
    const name = `${options.biome}, looking ${facing}°`;
    const { haze: found, losses, shown } = measureNow(lab);
    lines.push(`${name}: ${hazeLine(found)}`);
    if (found.own === 0) problems.push(`${name}: no weapon in the frame`);
    if (found.hazed > HAZE_MOST) {
      problems.push(`${name}: the weapons' light hazes ${percent(found.hazed)} of the frame round them (at most `
        + `${percent(HAZE_MOST)})`);
    }
    if (options.pictures) moments.push(pictureOf(name, shown, losses, [hazeLine(found)]));
    if (options.canary && facing === options.facings[0]) {
      const planted = measureNow(lab, CANARY_EXPOSURE).haze;
      const caught = planted.hazed > HAZE_MOST;
      lines.push(`canary, the frame with the weapons drawn at ${CANARY_EXPOSURE} of its exposure: `
        + `${caught ? 'caught' : 'missed'}: ${percent(planted.hazed)} of it darkened`);
      if (!caught) problems.push('the canary was missed');
    }
  }
  return { text: lines.join('\n'), problems, moments };
}
