// How the pictures of an A/B's two sides differ (tools/lab): each pair decoded in a page of the lab's browser and
// compared pixel by pixel. The same view drawn twice with nothing changed came out a level apart in a few pixels (the
// GPU's own rounding), so a picture differs only where some pixel is more than `TOLERANCE` levels apart.

/** how far apart a pixel's channels may be (of 255) and the pictures still count as the same */
export const TOLERANCE = 2;

/**
 * Runs in the page (serialized: it can use nothing from here). Each pair compared: how many pixels are more than
 * `tolerance` apart, of how many, and the largest difference.
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
  const results = [];
  for (const { before, after } of pairs) {
    const [a, b] = await Promise.all([pixelsOf(before), pixelsOf(after)]);
    if (a.width !== b.width || a.height !== b.height) {
      results.push({ sized: `${a.width}×${a.height} against ${b.width}×${b.height}` });
      continue;
    }
    let differing = 0;
    let largest = 0;
    for (let i = 0; i < a.data.length; i += 4) {
      const red = Math.abs(a.data[i] - b.data[i]);
      const green = Math.abs(a.data[i + 1] - b.data[i + 1]);
      const blue = Math.abs(a.data[i + 2] - b.data[i + 2]);
      const most = Math.max(red, green, blue);
      if (most > largest) largest = most;
      if (most > tolerance) differing++;
    }
    results.push({ differing, pixels: a.data.length / 4, largest });
  }
  return results;
}

/**
 * Compares each pair (`{ name, before, after }`, PNG data URLs) and says which differ: their share of pixels more
 * than `TOLERANCE` levels apart, and by how much at most.
 */
export async function describePictureDifferences(browser, pairs) {
  if (pairs.length === 0) return 'pictures: none to compare';
  const page = await browser.newPage();
  let results;
  try {
    const plain = pairs.map(({ before, after }) => ({ before, after }));
    results = await page.evaluate(compareInPage, { pairs: plain, tolerance: TOLERANCE });
  } finally {
    await page.close();
  }
  const lines = [];
  results.forEach((result, index) => {
    const name = pairs[index].name;
    if (result.sized) lines.push(`  ${name}: other sizes (${result.sized})`);
    else if (result.differing > 0) {
      const share = (result.differing / result.pixels * 100).toFixed(2);
      lines.push(`  ${name}: ${share} % of its pixels, by up to ${result.largest} levels`);
    }
  });
  if (lines.length === 0) {
    return `pictures: all ${pairs.length} the same (no pixel more than ${TOLERANCE} levels apart)`;
  }
  return [`pictures: ${lines.length} of ${pairs.length} differ`, ...lines].join('\n');
}
