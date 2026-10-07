// How the pictures of an A/B's two sides differ (tools/lab): each pair decoded in a page of the lab's browser and
// compared pixel by pixel. The same view drawn twice with nothing changed came out a level apart in a few pixels (the
// GPU's own rounding), so a picture differs only where some pixel is more than `TOLERANCE` levels apart. Where a pair
// differs, a picture of where is written: the newer side dimmed, its differing pixels in magenta.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { REPO } from './paths.mjs';

/** how far apart a pixel's channels may be (of 255) and the pictures still count as the same */
export const TOLERANCE = 2;

/**
 * Runs in the page (serialized: it can use nothing from here). Each pair compared: how many pixels are more than
 * `tolerance` apart, of how many, the largest difference, the box they lie in, and a picture of where they are.
 */
async function compareInPage({ pairs, tolerance }) {
  const pixelsOf = async (dataUrl) => {
    const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return { width: bitmap.width, height: bitmap.height, data };
  };
  const pngOf = async (width, height, data) => {
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0);
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let text = '';
    for (const byte of bytes) text += String.fromCharCode(byte);
    return btoa(text);
  };
  const results = [];
  for (const { before, after } of pairs) {
    const [old, now] = await Promise.all([pixelsOf(before), pixelsOf(after)]);
    const { width, height } = now;
    if (old.width !== width || old.height !== height) {
      results.push({ sized: `${old.width}×${old.height} against ${width}×${height}` });
      continue;
    }
    const where = new Uint8ClampedArray(now.data.length);
    const box = { left: width, right: -1, top: height, bottom: -1 };
    let differing = 0;
    let largest = 0;
    for (let i = 0; i < now.data.length; i += 4) {
      const red = Math.abs(old.data[i] - now.data[i]);
      const green = Math.abs(old.data[i + 1] - now.data[i + 1]);
      const blue = Math.abs(old.data[i + 2] - now.data[i + 2]);
      const most = Math.max(red, green, blue);
      if (most > largest) largest = most;
      const grey = (now.data[i] + now.data[i + 1] + now.data[i + 2]) / 9;
      where.set(most > tolerance ? [255, 0, 255, 255] : [grey, grey, grey, 255], i);
      if (most <= tolerance) continue;
      differing++;
      const x = (i / 4) % width;
      const y = Math.floor(i / 4 / width);
      box.left = Math.min(box.left, x);
      box.right = Math.max(box.right, x);
      box.top = Math.min(box.top, y);
      box.bottom = Math.max(box.bottom, y);
    }
    const result = { differing, pixels: width * height, largest, width, height };
    if (differing > 0) Object.assign(result, { box, where: await pngOf(width, height, where) });
    results.push(result);
  }
  return results;
}

/** A pair's name as a file name: `walking, arm back / left` to `walking-arm-back--left`. */
function fileNameOf(name) {
  return name.toLowerCase().replace(/ \/ /g, '--').replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
}

/** Where in a picture its differences lie, as shares of its width and height (`x 20–55 %, y 40–90 %`). */
function describeBox({ box, width, height }) {
  const share = (from, to, size) => `${Math.round(from / size * 100)}–${Math.round((to + 1) / size * 100)} %`;
  return `x ${share(box.left, box.right, width)}, y ${share(box.top, box.bottom, height)}`;
}

/**
 * Compares each pair (`{ name, before, after }`, PNG data URLs) and says which differ: their share of pixels more
 * than `TOLERANCE` levels apart, by how much at most, and where; with `diffDir`, a picture of where for each pair
 * that differs is written there (the folder emptied first).
 */
export async function describePictureDifferences(browser, pairs, diffDir = null) {
  if (pairs.length === 0) return 'pictures: none to compare';
  const page = await browser.newPage();
  let results;
  try {
    const plain = pairs.map(({ before, after }) => ({ before, after }));
    results = await page.evaluate(compareInPage, { pairs: plain, tolerance: TOLERANCE });
  } finally {
    await page.close();
  }
  if (diffDir) rmSync(diffDir, { recursive: true, force: true });
  const lines = [];
  results.forEach((result, index) => {
    const name = pairs[index].name;
    if (result.sized) {
      lines.push(`  ${name}: other sizes (${result.sized})`);
      return;
    }
    if (result.differing === 0) return;
    const share = (result.differing / result.pixels * 100).toFixed(2);
    lines.push(`  ${name}: ${share} % of its pixels, by up to ${result.largest} levels, in ${describeBox(result)}`);
    if (!diffDir) return;
    mkdirSync(diffDir, { recursive: true });
    writeFileSync(join(diffDir, `${fileNameOf(name)}.png`), Buffer.from(result.where, 'base64'));
  });
  if (lines.length === 0) {
    return `pictures: all ${pairs.length} the same (no pixel more than ${TOLERANCE} levels apart)`;
  }
  const written = diffDir ? ` (where: ${relative(REPO, diffDir)})` : '';
  return [`pictures: ${lines.length} of ${pairs.length} differ${written}`, ...lines].join('\n');
}
