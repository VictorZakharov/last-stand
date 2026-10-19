// The stalls harness: the game played in the installed Chrome on this machine's GPU, its frames recorded and the
// browser traced, for the stalls the lab's Chromium never shows (Chrome on Windows holding up its GPU process, and
// the game's canvas with it, for seconds while Skia builds a program). See tools/stalls/README.md.
//
// npm run stalls -- [--url a,b] [--scenario fight|lobby|storm|hover] [--seconds 45] [--listed 300]
//   [--variants base,cpuCanvas] [--view top] [--biome forest] [--hero warrior] [--stash 40] [--scale 1.25] [--perf]
//   [--headed] [--links] (--help: what each does)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { freshStorage, noCapture } from '../lab/node/browser.mjs';
import { analyze } from './analyze.mjs';
import { startChrome } from './chrome.mjs';
import { readOptions, usage, VIEWS } from './options.mjs';
import {
  equipmentShown, loaded, menuStowed, seededProfile, seedStash, startRecording, stopRecording,
} from './page.mjs';
import { measureText, summaryText } from './report.mjs';
import { SCENARIOS } from './scenarios.mjs';
import { serveBuild } from './serve.mjs';
import { startTrace } from './trace.mjs';
import { VARIANTS } from './variants.mjs';

const REPO = resolve(import.meta.dirname, '../..');
const OUT = join(REPO, 'tools/stalls/out');
/** the page's mark on the trace, where its clock starts */
const MARK = 'stalls:start';
/** the settings every measure starts with, as the game keeps them: the battleground, the high quality preset, and
 *  the performance overlay shown or not */
function cookiesFor({ biome, perf }) {
  return { 'last-stand-biome': biome, 'last-stand-quality': 'high', 'last-stand-perf-hud': perf ? '1' : '0' };
}
const LOAD_TIMEOUT_MS = 180_000;
/** how long a key is held, and the view given to settle after each press (ms) */
const KEY_HOLD_MS = 90;
const VIEW_SETTLE_MS = 1500;
/** how long a hero chosen in the lobby is given to be built, and an item moved to be saved (ms) */
const HERO_BUILT_MS = 1500;
const ITEM_MOVED_MS = 300;

/** Opens the game at `url` in `browser`'s first context, `variant` applied before the page's scripts, and waits out
 *  the loading screen. */
async function openGame(browser, url, variant, options) {
  const context = browser.contexts()[0] ?? (await browser.newContext());
  await context.addInitScript(noCapture);
  await context.addInitScript(freshStorage);
  await context.addInitScript(seededProfile);
  await context.addInitScript(VARIANTS[variant].script, VARIANTS[variant].arg);
  const cookies = Object.entries(cookiesFor(options)).map(([name, value]) => ({ name, value, url }));
  await context.addCookies(cookies);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(url, { waitUntil: 'load' });
  await waitLoaded(page);
  return { page, errors };
}

/** Waits out the loading screen and the lobby's panels. */
async function waitLoaded(page) {
  await page.waitForFunction(loaded, null, { timeout: LOAD_TIMEOUT_MS, polling: 250 });
  await page.waitForFunction(equipmentShown, null, { timeout: LOAD_TIMEOUT_MS, polling: 250 });
}

/**
 * Fills the hero's stash with `count` items (`seedStash`) as a player's long kept one is: an item moved off him so
 * his profile is saved, copies of his own kept for the next load, and the page loaded again. Throws if it couldn't.
 */
async function fillStash(page, count) {
  await page.click('#equip .eslot:not(.empty)');
  await page.waitForTimeout(ITEM_MOVED_MS);
  const filled = await page.evaluate(seedStash, count);
  if (filled === 0) throw new Error('stalls: --stash: no profile saved once an item was moved off the hero');
  await page.reload({ waitUntil: 'load' });
  await waitLoaded(page);
}

/** Sets the lobby up as `options` say: the hero chosen, his stash filled, the view. */
async function setUpLobby(page, options) {
  if (options.hero) {
    await page.click(`#opt-class button[data-c="${options.hero}"]`);
    await page.waitForTimeout(HERO_BUILT_MS);
  }
  if (options.stash > 0) await fillStash(page, options.stash);
  await chooseView(page, options.view);
}

/** Puts the lobby in `view` as a player does: V pressed until it's there (a close view stows the panels), then
 *  Space to show them again. */
async function chooseView(page, view) {
  for (let press = 0; press < VIEWS.indexOf(view); press++) {
    await page.keyboard.press('v', { delay: KEY_HOLD_MS });
    await page.waitForTimeout(VIEW_SETTLE_MS);
  }
  if (await page.evaluate(menuStowed)) await page.keyboard.press('Space', { delay: KEY_HOLD_MS });
  await page.waitForTimeout(VIEW_SETTLE_MS);
}

/** The picture of what a measure's scenario left on screen: `out/end-<n>.png`, n its place in the command's
 *  measures (to see that it played what it meant to). */
const endPicture = (index) => join(OUT, `end-${index + 1}.png`);

/** One measure: a fresh Chrome on `url` with `variant`, the scenario played, its frames and trace analyzed, and a
 *  picture of the screen at its end (`picture`). */
async function measure(url, variant, options, picture) {
  const chrome = await startChrome({ outDir: join(OUT, 'profiles'), headed: options.headed, scale: options.scale });
  try {
    const { page, errors } = await openGame(chrome.browser, url, variant, options);
    await setUpLobby(page, options);
    const trace = await startTrace(chrome.browser);
    await page.evaluate(startRecording, MARK);
    const notes = await SCENARIOS[options.scenario](page, options.seconds * 1000);
    const record = await page.evaluate(stopRecording);
    const events = await trace.stop();
    await page.screenshot({ path: picture });
    notes.push(`its end pictured in ${picture}`);
    if (errors.length) notes.push(`page errors: ${errors.slice(0, 3).join(' | ')}`);
    return { name: `${url} ${variant}`, notes, findings: analyze(record, events, MARK, options.listed) };
  } finally {
    await chrome.close();
  }
}

async function main() {
  const options = readOptions(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  mkdirSync(OUT, { recursive: true });
  const served = options.urls.length ? null : await serveBuild(REPO, OUT);
  const urls = served ? [served.url] : options.urls;
  const measures = [];
  try {
    for (const url of urls) {
      for (const variant of options.variants) {
        console.log(`measuring ${url} ${variant}: ${options.scenario} for ${options.seconds} s`);
        const result = await measure(url, variant, options, endPicture(measures.length));
        console.log(measureText(result, { links: options.links }));
        measures.push(result);
      }
    }
  } finally {
    await served?.close();
  }
  const sections = measures.map((result) => measureText(result, { links: options.links }));
  const text = [...sections, summaryText(measures)].join('\n\n');
  writeFileSync(join(OUT, 'report.txt'), `${text}\n`);
  if (measures.length > 1) console.log(`\n${summaryText(measures)}`);
  console.log(`\n(written to ${join(OUT, 'report.txt')})`);
}

await main();
