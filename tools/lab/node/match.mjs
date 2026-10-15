// tools/lab match: the hero through the eyes beside a reference's screenshot (a game his first-person weapons are
// posed after): the screenshot, his frame on a screen of its shape, and the two blended, with the points marked on the
// reference (`<picture>.marks.json`) and his own drawn on each, and the numbers side by side. A rest is matched to a
// reference here, not by eye: matched to a summary of three screenshots, a rest handed over leaned in where they
// lean out, twice as wide, its head out of the frame.
import { existsSync, readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { labError } from './errors.mjs';
import {
  OUTLINE_GRID,
  PARTS,
  coverage,
  partOf,
  rasterOf,
  rasterSvg,
  shapesSvg,
  shiftedRaster,
} from './outline.mjs';

/** how wide the hero's frame is put on the screen (css px), its height by the reference's shape */
export const MATCH_WIDTH = 1280;
/** how wide each picture is shown on the comparison (px) */
const PANEL_WIDTH = 620;
const GAP = 4;
/** how far a canary moves the reference's points across the frame (a share of it), and the most of its outlines
 *  moved so far that may still read as overlapping */
const CANARY_SHIFT = 0.1;
const CANARY_OVERLAP = 0.6;
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
 * has the player's bar round it) and what's marked on that frame: the points (`points`, shares of it across and
 * down), the weapon's width (`wide`, a share of the frame's), the part of the frame it covers (`box`, [left, top,
 * right, bottom] shares) and the outlines of the weapon and the fist holding it (`outline`: for each part, shapes
 * of [x, y] shares), read from `<picture>.marks.json` beside it if there is one.
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
    box: marks.box ? boxOf(marks.box) : undefined,
    outline: marks.outline,
    marked: existsSync(marksFile),
  };
}

/** What `reference` marks of the parts `to` names (line, wide, box, outline), as `match --fit` fits a rest to them
 *  (page/fitRest.ts `Marks`), its outlines on the grid the hero's frame is read on. */
export function marksOf(reference, to) {
  const { points, wide, box, outline } = reference;
  const marked = {
    line: points.in && points.tip,
    wide: wide !== undefined,
    box: box !== undefined,
    outline: outline !== undefined,
  };
  const missing = to.filter((part) => !marked[part]);
  if (missing.length) throw labError(`match --near: ${reference.name} has no ${missing.join(', ')} marked`);
  const marks = {};
  if (to.includes('line')) Object.assign(marks, { in: points.in, tip: points.tip });
  if (to.includes('wide')) marks.wide = wide;
  if (to.includes('box')) marks.box = box;
  if (to.includes('outline')) marks.outline = rastersOf(outline);
  return marks;
}

/** A reference's outlines, each part's on the hero's grid. */
function rastersOf(outline) {
  return Object.fromEntries(PARTS.map((part) => [part, rasterOf(outline[part] ?? [], OUTLINE_GRID)]));
}

/** A box marked as [left, top, right, bottom], as the frame measure gives it (page/inFrame.ts `Box`). */
function boxOf([left, top, right, bottom]) {
  return { left, top, right, bottom };
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

/** The hero's points as the reference's are marked, from the weapon as framed: where it comes in, and the farthest of
 *  it the frame shows (a reference's tip is where its weapon ends or leaves the frame; his own tip, out of the frame,
 *  read as 123% above it) */
function heroPoints(framed) {
  return { in: framed.from, tip: framed.far };
}

/** A frame's numbers: each point's place, the lean between them, the width, the part of the frame covered. */
function numbersOf(points, wide, box, aspect) {
  const lean = points.in && points.tip ? leanOf(points.in, points.tip, aspect) : null;
  return { points, lean, wide, box };
}

const percent = (share) => `${Math.round(share * 100)}%`;
const placeText = (place) => (place ? `${percent(place.x)} across, ${percent(place.y)} down` : 'not marked');

const boxText = (box) => `${percent(box.left)} to ${percent(box.right)} across, `
  + `${percent(box.top)} to ${percent(box.bottom)} down`;

/** A frame's numbers as a line. */
function numbersText(numbers) {
  const places = POINTS.map((name) => `${name} ${placeText(numbers.points[name])}`);
  const lean = numbers.lean ? `leaning ${numbers.lean.lean.toFixed(0)}° ${numbers.lean.out ? 'out' : 'in'}` : '';
  const wide = numbers.wide !== undefined ? `${(numbers.wide * 100).toFixed(1)}% wide` : '';
  const box = numbers.box ? `covering ${boxText(numbers.box)}` : '';
  return [...places, lean, wide, box].filter(Boolean).join('; ');
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
  if (hero.box && reference.box) {
    const edge = (name) => `${name} ${percent(hero.box[name] - reference.box[name])}`;
    parts.push(`covering: ${['left', 'top', 'right', 'bottom'].map(edge).join(', ')}`);
  }
  return parts.join('; ');
}

/** How each part of the hero's frame covers the reference's outline of it (`--canary`: theirs moved across). */
function outlinesOf(reference, framed, canary) {
  if (!reference.outline || !framed.cells) return null;
  const grid = framed.grid;
  const theirs = Object.fromEntries(PARTS.map((part) => [part, rasterOf(reference.outline[part] ?? [], grid)]));
  const shift = Math.round(CANARY_SHIFT * grid.across);
  const ours = (part) => (canary ? shiftedRaster(theirs[part], grid, shift) : partOf(framed.cells, part));
  const each = PARTS.map((part) => ({ part, ours: ours(part), ...coverage(ours(part), theirs[part]) }));
  if (canary && each.some((part) => part.overlap > CANARY_OVERLAP)) {
    const read = each.map((part) => `${part.part} ${percent(part.overlap)}`).join(', ');
    throw labError(`match --canary: outlines moved ${percent(CANARY_SHIFT)} across read as overlapping: ${read}`);
  }
  return { grid, theirs, each };
}

/** The outlines' line: how much of each of the reference's the hero's frame covers, and how much of his is outside. */
function outlinesText(outlines) {
  const part = (each) => `the ${each.part} ${percent(each.overlap)} (covering ${percent(each.covered)} of theirs, `
    + `${percent(each.outside)} of it outside)`;
  return `  outlines overlapping the reference's: ${outlines.each.map(part).join('; ')}`;
}

/** A fit's values as `--tune` takes them. */
const tuneText = (tune) => Object.entries(tune).map(([path, values]) => `${path}=${values.join(',')}`).join(';');

/** A fit's line (`--fit`): how far off the marks it started and ended, in how many tries, and the values found. */
function fitText(fit) {
  const unseen = fit.unseen ? `, ${fit.unseen} of them with no weapon seen` : '';
  return `  fitted to its ${fit.to.join(', ')} in ${fit.tries} tries${unseen}, off them by ${fit.from.toFixed(3)} `
    + 'at the start, '
    + `${fit.miss.toFixed(3)} at: --tune "${tuneText(fit.tune)}"`;
}

/** The reference's points moved across the frame (`--canary`): a comparison must find them that far off. */
function shifted(points) {
  const moved = ([name, place]) => [name, { ...place, x: place.x + CANARY_SHIFT }];
  return Object.fromEntries(Object.entries(points).map(moved));
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
  const theirs = numbersOf(reference.points, reference.wide, reference.box, aspect);
  const lines = [`${reference.name}${reference.marked ? '' : ' (no marks file)'}: ${numbersText(theirs)}`];
  const rows = [];
  for (const [name, sheet] of runs) {
    const { tile, framed } = eyesOf(sheet);
    const points = canary ? shifted(reference.points) : heroPoints(framed);
    const his = canary
      ? numbersOf(points, reference.wide, reference.box, aspect)
      : numbersOf(points, framed.wide, framed.box, aspect);
    const off = offBy(his, theirs);
    if (canary && !off.includes(`${percent(CANARY_SHIFT)} across`)) {
      throw labError(`match --canary: the reference's points moved ${percent(CANARY_SHIFT)} across read as: ${off}`);
    }
    lines.push(`${name}: ${numbersText(his)}`, `  off the reference by: ${off || 'nothing marked to compare'}`);
    const outlines = outlinesOf(reference, framed, canary);
    if (outlines) lines.push(outlinesText(outlines));
    if (sheet.fit) lines.push(fitText(sheet.fit));
    rows.push(rowHtml(reference, tile.png, { theirs, his, outlines }, name));
  }
  return { text: lines.join('\n'), html: pageHtml(rows) };
}

/** The bar across the weapon's line at its middle, as long as the weapon is wide: a width marked wrong shows on
 *  the picture (one marked by eye was half the haft it was read off) */
function widthBar(numbers, width, height, colour) {
  const { in: from, tip } = numbers.points;
  const middle = [((from.x + tip.x) / 2) * width, ((from.y + tip.y) / 2) * height];
  const along = [(tip.x - from.x) * width, (tip.y - from.y) * height];
  const length = Math.hypot(along[0], along[1]);
  const half = (numbers.wide * width) / 2;
  const across = [(-along[1] / length) * half, (along[0] / length) * half];
  return `<line x1="${middle[0] - across[0]}" y1="${middle[1] - across[1]}" x2="${middle[0] + across[0]}" `
    + `y2="${middle[1] + across[1]}" stroke="${colour}" stroke-width="4"/>`;
}

/** What's marked on a frame drawn over a picture `width` x `height` px: a ring and its name at each point, the line
 *  from where the weapon comes in to its tip with its width across it, and the part of the frame it covers. */
function marksSvg(numbers, width, height, colour) {
  const { points, box } = numbers;
  const at = (place) => [place.x * width, place.y * height];
  const parts = [];
  if (points.in && points.tip) {
    const [x1, y1] = at(points.in);
    const [x2, y2] = at(points.tip);
    parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${colour}" stroke-width="2"/>`);
    if (numbers.wide !== undefined) parts.push(widthBar(numbers, width, height, colour));
  }
  if (box) {
    parts.push(`<rect x="${box.left * width}" y="${box.top * height}" width="${(box.right - box.left) * width}" `
      + `height="${(box.bottom - box.top) * height}" fill="none" stroke="${colour}" stroke-width="2" `
      + 'stroke-dasharray="6 4"/>');
  }
  for (const name of POINTS) {
    if (!points[name]) continue;
    const [x, y] = at(points[name]);
    parts.push(`<circle cx="${x}" cy="${y}" r="7" fill="none" stroke="${colour}" stroke-width="2.5"/>`);
    parts.push(`<text x="${x + 10}" y="${y - 8}" fill="${colour}">${name}</text>`);
  }
  return parts.join('');
}

/** A reference's outlines drawn over a picture, and on the blended one (`cells`) the hero's cells of each part. */
function outlinesSvg(reference, outlines, width, height, cells) {
  if (!outlines) return '';
  const drawn = [
    shapesSvg(reference.outline.weapon ?? [], width, height, '#ff5a4f'),
    shapesSvg(reference.outline.fist ?? [], width, height, '#ffd34f', '5 3'),
  ];
  if (cells) {
    const colours = { weapon: '#4fe0ff', fist: '#ffd34f' };
    for (const each of outlines.each) {
      drawn.push(rasterSvg(each.ours, outlines.grid, width, height, colours[each.part]));
    }
  }
  return drawn.join('');
}

/** One side's row: the reference, the hero's frame and the two blended, each with both frames' marks (`theirs`,
 *  `his`) and the reference's outlines, the blended one with the hero's cells of each part. */
function rowHtml(reference, heroPng, { theirs, his, outlines }, name) {
  const { crop, size } = reference;
  const scale = PANEL_WIDTH / crop.width;
  const height = Math.round(crop.height * scale);
  const referenceImg = `<img class="ref" src="${reference.url}" style="left: ${-crop.x * scale}px; `
    + `top: ${-crop.y * scale}px; width: ${size.width * scale}px">`;
  const heroImg = (opacity) => `<img class="hero" src="${heroPng}" style="opacity: ${opacity}">`;
  const marks = (cells) => `<svg width="${PANEL_WIDTH}" height="${height}">`
    + marksSvg(theirs, PANEL_WIDTH, height, '#ff5a4f')
    + marksSvg(his, PANEL_WIDTH, height, '#4fe0ff')
    + `${outlinesSvg(reference, outlines, PANEL_WIDTH, height, cells)}</svg>`;
  const panel = (caption, inner, cells = false) => `<figure style="height: ${height}px">${inner}${marks(cells)}`
    + `<figcaption>${caption}</figcaption></figure>`;
  return `<div class="row">${panel('reference (red)', referenceImg)}${panel(`${name} (blue)`, heroImg(1))}`
    + `${panel('blended, his cells', `${referenceImg}${heroImg(0.5)}`, true)}</div>`;
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
