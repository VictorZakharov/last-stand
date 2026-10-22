// A fire's flames seen from under the bowl they burn in (#291: from below, a brazier's flames showed through its
// bowl). The flames are a box marched in its fragment shader, depth-tested at the box's faces alone, so the bowl
// hides them only as far as the shader knows it (`uBowl` in world/fire.ts). Read from under the rim: where the bowl
// is drawn (its meshes' pixels in the lab's `parts` look), the light the flames add must be next to nothing. (Its
// pixels found as those it changed read the sky too: the frame's grade and bloom move with what's drawn.) The
// canary takes the bowl from the shader: the flames show through it, which must be caught.
import * as THREE from 'three';

/** a pixel counts as changed past this many levels (of 255) on its brightest channel */
const CHANGED = 8;
/** the share of the bowl's pixels the flames may light (their glow's soft edge over the rim) */
const THROUGH_MOST = 0.02;
/** a bowl drawn over fewer pixels than this from below says nothing */
const BOWL_LEAST = 400;

/** What the reading from below needs of the fire, the camera already set under it. */
export interface Below {
  /** the game drawn now, read back */
  draw: () => ImageData;
  /** which pixels of the drawing the solid parts round the bed cover (1 where they do) */
  solidsDrawn: () => Uint8Array;
  /** the flames' volume (its material's `uBowl`, where it has one, is the bowl the shader knows) */
  flames: THREE.Mesh;
  /** the fire's other glowing parts (its coals, its embers), hidden throughout: from under a bowl taken away, the
   *  coals' bloom over the sky read as bowl */
  glows: THREE.Object3D[];
  canary: boolean;
}

/** The bowl's pixels from below, the share of them the flames light, the picture, and where each was found (the
 *  bowl grey, the flames through it red). */
export interface BelowReading {
  bowl: number;
  through: number;
  image: ImageData;
  found: ImageData;
}

/** the found picture's colours: the bowl, the flames lighting it */
const BOWL_SHADE = [90, 90, 90];
const THROUGH_SHADE = [255, 40, 40];

function paint(image: ImageData, i: number, shade: number[]): void {
  image.data.set(shade, i);
  image.data[i + 3] = 255;
}

/** The bowl the flames' shader knows, if it knows one (a tree before #291's has none to know). */
const bowlOf = (flames: THREE.Mesh): { value: THREE.Vector2[] } | undefined =>
  (flames.material as THREE.ShaderMaterial).uniforms.uBowl;

/** A bowl the shader knows as none: its rim under its foot. */
const noBowl = (): THREE.Vector2[] => [0, 0, -1].map((y) => new THREE.Vector2(y, 0));

/** Whether pixel `i` (its first channel's index) differs between `a` and `b`. */
function changed(a: ImageData, b: ImageData, i: number): boolean {
  const step = Math.max(...[0, 1, 2].map((c) => Math.abs(a.data[i + c] - b.data[i + c])));
  return step > CHANGED;
}

/** `objects` hidden while `read` runs. */
function without<T>(objects: THREE.Object3D[], read: () => T): T {
  const shown = objects.map((object) => object.visible);
  for (const object of objects) object.visible = false;
  try {
    return read();
  } finally {
    objects.forEach((object, i) => { object.visible = shown[i]; });
  }
}

/** The fire from under its bowl (its other glows hidden): drawn whole and without its flames, over its bowl. */
export function readBelow(below: Below): BelowReading {
  return without(below.glows, () => readBowl(below));
}

function readBowl(below: Below): BelowReading {
  const bowl = bowlOf(below.flames);
  const known = bowl?.value;
  if (below.canary && bowl) bowl.value = noBowl();
  try {
    const whole = below.draw();
    const noFlames = without([below.flames], below.draw);
    const solids = below.solidsDrawn();
    const found = new ImageData(whole.width, whole.height);
    let bowlPixels = 0;
    let lit = 0;
    for (let i = 0; i < whole.data.length; i += 4) {
      if (!solids[i / 4]) continue;
      bowlPixels++;
      const through = changed(whole, noFlames, i);
      if (through) lit++;
      paint(found, i, through ? THROUGH_SHADE : BOWL_SHADE);
    }
    return { bowl: bowlPixels, through: bowlPixels ? lit / bowlPixels : 0, image: whole, found };
  } finally {
    if (bowl && known) bowl.value = known;
  }
}

/** The reading as a line, and its problems (the canary's: it must find the flames through the bowl). */
export function belowFound(reading: BelowReading, canary: boolean): { line: string; problems: string[] } {
  const share = (reading.through * 100).toFixed(1);
  const line = `  from under its bowl: the flames light ${share}% of the bowl's ${reading.bowl} pixels in front of them`;
  if (reading.bowl < BOWL_LEAST) return { line, problems: [`from below, the bowl covers only ${reading.bowl} pixels`] };
  const through = reading.through > THROUGH_MOST;
  if (canary) {
    return { line, problems: through ? [] : ['canary: the flames through a bowl the shader didn\'t know went unseen'] };
  }
  return { line, problems: through ? [`from below, the flames show through the bowl (${share}% of it lit)`] : [] };
}
