// The lab's picture sheet as one image (tools/lab): a row a moment, a column a view, each row's notes beside it.
// With an A/B, each moment's row from the other commit sits above this tree's.

const TILE_WIDTH = 340;
const TILE_HEIGHT = 560;
const NOTES_WIDTH = 300;
const GAP = 3;

const STYLE = `
  body { margin: 0; background: #1b1c1f; color: #ddd; font: 13px/1.35 system-ui, sans-serif; }
  .row { display: flex; gap: ${GAP}px; margin-bottom: ${GAP}px; }
  .notes { width: ${NOTES_WIDTH}px; flex: none; padding: 8px; box-sizing: border-box; background: #26282c; }
  .notes b { display: block; font-size: 15px; color: #fff; }
  .notes i { display: block; color: #e9b44c; margin: 2px 0 4px; font-style: normal; }
  .notes p { margin: 5px 0; }
  figure { margin: 0; position: relative; width: ${TILE_WIDTH}px; height: ${TILE_HEIGHT}px; background: #000; }
  img { width: 100%; height: 100%; object-fit: scale-down; }
  figcaption { position: absolute; left: 6px; top: 4px; color: #fff; text-shadow: 0 0 3px #000; }
`;

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function rowHtml(moment, sideName) {
  const side = sideName ? `<i>${escapeHtml(sideName)}</i>` : '';
  const notes = moment.notes.map((note) => `<p>${escapeHtml(note)}</p>`).join('');
  const tiles = moment.tiles
    .map((tile) => `<figure><img src="${tile.png}"><figcaption>${tile.view}</figcaption></figure>`)
    .join('');
  return `<div class="row"><div class="notes"><b>${escapeHtml(moment.label)}</b>${side}${notes}</div>${tiles}</div>`;
}

/**
 * Writes the sheet to `file`. `runs` is a list of [side name, sheet] (the other commit first in an A/B); a moment
 * is matched across sides by its place in the list.
 */
export async function writeSheet(browser, runs, viewCount, file) {
  const rows = [];
  const moments = Math.max(...runs.map(([, sheet]) => sheet.moments.length));
  for (let i = 0; i < moments; i++) {
    for (const [sideName, sheet] of runs) {
      const moment = sheet.moments[i];
      if (moment) rows.push(rowHtml(moment, runs.length > 1 ? sideName : ''));
    }
  }
  const width = NOTES_WIDTH + viewCount * (TILE_WIDTH + GAP);
  const page = await browser.newPage({ viewport: { width, height: TILE_HEIGHT + GAP } });
  try {
    await page.setContent(`<!doctype html><style>${STYLE}</style>${rows.join('')}`);
    await page.screenshot({ path: file, fullPage: true });
  } finally {
    await page.close();
  }
}
