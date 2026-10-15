// tools/lab match: the hero through the eyes beside a reference's screenshot (a game his first-person weapons are
// posed after): the screenshot, his frame on a screen of its shape, and the two blended, with the points marked on the
// reference (`<picture>.marks.json`) and his own drawn on each, and the numbers side by side. A rest is matched to a
// reference here, not by eye: matched to a summary of three screenshots, a rest handed over leaned in where they
// lean out, twice as wide, its head out of the frame.
import { existsSync, readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { labError } from './errors.mjs';

/** how wide the hero's frame is put on the screen (css px), its height by the reference's shape */
export const MATCH_WIDTH = 1280;
/** how wide each picture is shown on the comparison (px) */
const PANEL_WIDTH = 620;
const GAP = 4;
/** how far a canary moves the reference's points across the frame (a share of it) */
const CANARY_SHIFT = 0.1;
/** the points a reference marks, as the hero's weapon is framed (page/inFrame.ts): where it comes into the frame, and
 *  its tip */
const POINTS = ['in', 'tip'];

/** The size of a PNG or a JPEG, from its header. */
function imageSize(bytes, file) {
  if (bytes.readUInt32BE(0) === 0x89504e47) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 9 < bytes.length) {
      const marker = bytes[at + 1];
      const startOfFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (startOfFrame) return { width: bytes.readUInt16BE(at + 7), height: bytes.readUInt16BE(at + 5) };
      at += 2 + bytes.readUInt16BE(at + 2);
    }
  }
  throw labError(`match: ${file} is neither a PNG nor a JPEG`);
}

/**
 * A reference: its picture (a data URL), its size, the game's frame within it (`crop`, px: a screenshot of a video
 * has the player's bar round it) and the points marked on that frame (`points`, shares of it across and down; `wide`,
 * the weapon's width, a share of the frame's), read from `<picture>.marks.json` beside it if there is one.
 */
export function readReference(file) {
  if (!existsSync(file)) throw labError(`match: no reference picture ${file}`);
  const bytes = readFileSync(file);
  const size = imageSize(bytes, file);
  const type = extname(file).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
  const marksFile = file.replace(/\.(png|jpe?g)$/i, '.marks.json');
  const marks = existsSync(marksFile) ? JSON.parse(readFileSync(marksFile, 'utf8')) : {};
  const [x, y, width, height] = marks.crop ?? [0, 0, size.width, size.height];
  return {
    name: basename(file).replace(/\.[^.]+$/, ''),
    url: `data:${type};base64,${bytes.toString('base64')}`,
    size,
    crop: { x, y, width, height },
    points: marks.points ?? {},
    wide: marks.wide,
    marked: existsSync(marksFile),
  };
}

/** The screen the hero's frame is put on for `reference`: its frame's shape, `MATCH_WIDTH` wide. */
export function screenFor(reference) {
  const height = Math.round((MATCH_WIDTH * reference.crop.height) / reference.crop.width);
  return { width: MATCH_WIDTH, height, ratio: 1 };
}

/** The lean of the line from `from` to `to` (shares of a frame of `aspect`) from upright, degrees, and whether its top
 *  leans out towards its own side's edge. */
function leanOf(from, to, aspect) {
  const across = (to.x - from.x) * aspect;
  const up = from.y - to.y;
  const lean = (Math.atan2(Math.abs(across), up) * 180) / Math.PI;
  return { lean, out: Math.sign(across) === Math.sign(from.x - 0.5) };
}

/** The hero's points as the reference's are marked, from the weapon as framed. */
function heroPoints(framed) {
  return { in: framed.from, tip: framed.tip };
}

/** A frame's numbers: each point's place, the lean between them, the width. */
function numbersOf(points, wide, aspect) {
  const lean = points.in && points.tip ? leanOf(points.in, points.tip, aspect) : null;
  return { points, lean, wide };
}

const percent = (share) => `${Math.round(share * 100)}%`;
const placeText = (place) => (place ? `${percent(place.x)} across, ${percent(place.y)} down` : 'not marked');

/** A frame's numbers as a line. */
function numbersText(numbers) {
  const places = POINTS.map((name) => `${name} ${placeText(numbers.points[name])}`);
  const lean = numbers.lean ? `leaning ${numbers.lean.lean.toFixed(0)}° ${numbers.lean.out ? 'out' : 'in'}` : '';
  const wide = numbers.wide !== undefined ? `${(numbers.wide * 100).toFixed(1)}% wide` : '';
  return [...places, lean, wide].filter(Boolean).join('; ');
}

/** How far the hero's numbers are from the reference's: each point (shares of the frame), the lean, the width. */
function offBy(hero, reference) {
  const parts = [];
  for (const name of POINTS) {
    const theirs = reference.points[name];
    const his = hero.points[name];
    if (!theirs || !his) continue;
    parts.push(`${name} ${percent(his.x - theirs.x)} across, ${percent(his.y - theirs.y)} down`);
  }
  if (hero.lean && reference.lean) {
    const signed = (lean) => (lean.out ? lean.lean : -lean.lean);
    parts.push(`lean ${(signed(hero.lean) - signed(reference.lean)).toFixed(0)}° (out +)`);
  }
  if (hero.wide !== undefined && reference.wide !== undefined) {
    parts.push(`width ${((hero.wide - reference.wide) * 100).toFixed(1)} points`);
  }
  return parts.join('; ');
}

/** The reference's points moved across the frame (`--canary`): a comparison must find them that far off. */
function shifted(points) {
  return Object.fromEntries(Object.entries(points).map(([name, place]) => [name, { ...place, x: place.x + CANARY_SHIFT }]));
}

/** The hero's moment of `sheet` through the eyes: its frame's picture and the weapon as framed. */
function eyesOf(sheet) {
  const moment = sheet.moments[0];
  const tile = moment?.tiles.find((each) => each.view === 'eyes');
  if (!tile) throw labError('match: the sheet pictured no frame through the eyes');
  if (!moment.framed) throw labError('match: no weapon in the frame through the eyes');
  return { tile, framed: moment.framed };
}

/**
 * The comparison of each side's frame with the reference: its lines, and the pictures as HTML (the reference, the
 * hero's frame and the two blended, each with the points drawn). With `canary`, the hero's points are the reference's
 * moved across, and a comparison that doesn't find them so is an error.
 */
export function compare(reference, runs, canary) {
  const aspect = reference.crop.width / reference.crop.height;
  const theirs = numbersOf(reference.points, reference.wide, aspect);
  const lines = [`${reference.name}${reference.marked ? '' : ' (no marks file)'}: ${numbersText(theirs)}`];
  const rows = [];
  for (const [name, sheet] of runs) {
    const { tile, framed } = eyesOf(sheet);
    const points = canary ? shifted(reference.points) : heroPoints(framed);
    const his = numbersOf(points, canary ? reference.wide : framed.wide, aspect);
    const off = offBy(his, theirs);
    if (canary && !off.includes(`${percent(CANARY_SHIFT)} across`)) {
      throw labError(`match --canary: the reference's points moved ${percent(CANARY_SHIFT)} across read as: ${off}`);
    }
    lines.push(`${name}: ${numbersText(his)}`, `  off the reference by: ${off || 'nothing marked to compare'}`);
    rows.push(rowHtml(reference, tile.png, theirs.points, his.points, name));
  }
  return { text: lines.join('\n'), html: pageHtml(rows) };
}

/** The points of a frame drawn over a picture `width` x `height` px: a ring and its name at each, and the line from
 *  where the weapon comes in to its tip. */
function marksSvg(points, width, height, colour) {
  const at = (place) => [place.x * width, place.y * height];
  const parts = [];
  if (points.in && points.tip) {
    const [x1, y1] = at(points.in);
    const [x2, y2] = at(points.tip);
    parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${colour}" stroke-width="2"/>`);
  }
  for (const name of POINTS) {
    if (!points[name]) continue;
    const [x, y] = at(points[name]);
    parts.push(`<circle cx="${x}" cy="${y}" r="7" fill="none" stroke="${colour}" stroke-width="2.5"/>`);
    parts.push(`<text x="${x + 10}" y="${y - 8}" fill="${colour}">${name}</text>`);
  }
  return parts.join('');
}

/** One side's row: the reference, the hero's frame and the two blended, each with both frames' points. */
function rowHtml(reference, heroPng, theirPoints, hisPoints, name) {
  const { crop, size } = reference;
  const scale = PANEL_WIDTH / crop.width;
  const height = Math.round(crop.height * scale);
  const referenceImg = `<img class="ref" src="${reference.url}" style="left: ${-crop.x * scale}px; `
    + `top: ${-crop.y * scale}px; width: ${size.width * scale}px">`;
  const heroImg = (opacity) => `<img class="hero" src="${heroPng}" style="opacity: ${opacity}">`;
  const marks = `<svg width="${PANEL_WIDTH}" height="${height}">`
    + `${marksSvg(theirPoints, PANEL_WIDTH, height, '#ff5a4f')}${marksSvg(hisPoints, PANEL_WIDTH, height, '#4fe0ff')}</svg>`;
  const panel = (caption, inner) => `<figure style="height: ${height}px">${inner}${marks}`
    + `<figcaption>${caption}</figcaption></figure>`;
  return `<div class="row">${panel('reference (red)', referenceImg)}${panel(`${name} (blue)`, heroImg(1))}`
    + `${panel('blended', `${referenceImg}${heroImg(0.5)}`)}</div>`;
}

function pageHtml(rows) {
  const style = `
    body { margin: 0; background: #1b1c1f; color: #ddd; font: 13px system-ui, sans-serif; }
    .row { display: flex; gap: ${GAP}px; margin-bottom: ${GAP}px; }
    figure { margin: 0; position: relative; width: ${PANEL_WIDTH}px; overflow: hidden; background: #000; }
    img { position: absolute; }
    img.hero { left: 0; top: 0; width: 100%; height: 100%; }
    svg { position: absolute; left: 0; top: 0; font: bold 14px system-ui, sans-serif; }
    figcaption { position: absolute; left: 6px; bottom: 4px; color: #fff; text-shadow: 0 0 3px #000; }
  `;
  return `<!doctype html><style>${style}</style>${rows.join('')}`;
}

/** Writes the comparison's pictures (`html`) to `file`. */
export async function writeMatch(browser, html, rows, file) {
  const width = 3 * PANEL_WIDTH + 2 * GAP;
  const page = await browser.newPage({ viewport: { width, height: 400 * rows } });
  try {
    await page.setContent(html);
    await page.screenshot({ path: file, fullPage: true });
  } finally {
    await page.close();
  }
}
