// The stalls harness: the game played in the installed Chrome on this machine's GPU, its frames recorded and the
// browser traced, for the stalls the lab's Chromium never shows (Chrome on Windows holding up its GPU process, and
// the game's canvas with it, for seconds while Skia builds a program). See tools/stalls/README.md.
//
// npm run stalls -- [--url a,b] [--scenario fight|lobby] [--seconds 45] [--variants base,cpuCanvas] [--headed]
//   [--links] (--help: what each does)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { freshStorage, noCapture } from '../lab/node/browser.mjs';
import { analyze } from './analyze.mjs';
import { startChrome } from './chrome.mjs';
import { readOptions, usage } from './options.mjs';
import { loaded, startRecording, stopRecording } from './page.mjs';
import { measureText, summaryText } from './report.mjs';
import { SCENARIOS } from './scenarios.mjs';
import { serveBuild } from './serve.mjs';
import { startTrace } from './trace.mjs';
import { VARIANTS } from './variants.mjs';

const REPO = resolve(import.meta.dirname, '../..');
const OUT = join(REPO, 'tools/stalls/out');
/** the page's mark on the trace, where its clock starts */
const MARK = 'stalls:start';
/** the settings every measure starts with, as the game keeps them: the forest, the high quality preset */
const COOKIES = { 'last-stand-biome': 'forest', 'last-stand-quality': 'high' };
const LOAD_TIMEOUT_MS = 180_000;

/** Opens the game at `url` in `browser`'s first context, `variant` applied before the page's scripts, and waits out
 *  the loading screen. */
async function openGame(browser, url, variant) {
  const context = browser.contexts()[0] ?? (await browser.newContext());
  await context.addInitScript(noCapture);
  await context.addInitScript(freshStorage);
  await context.addInitScript(VARIANTS[variant]);
  const cookies = Object.entries(COOKIES).map(([name, value]) => ({ name, value, url }));
  await context.addCookies(cookies);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(loaded, null, { timeout: LOAD_TIMEOUT_MS, polling: 250 });
  return { page, errors };
}

/** One measure: a fresh Chrome on `url` with `variant`, the scenario played, its frames and trace analyzed. */
async function measure(url, variant, options) {
  const chrome = await startChrome({ outDir: join(OUT, 'profiles'), headed: options.headed });
  try {
    const { page, errors } = await openGame(chrome.browser, url, variant);
    const trace = await startTrace(chrome.browser);
    await page.evaluate(startRecording, MARK);
    const notes = await SCENARIOS[options.scenario](page, options.seconds * 1000);
    const record = await page.evaluate(stopRecording);
    const events = await trace.stop();
    if (errors.length) notes.push(`page errors: ${errors.slice(0, 3).join(' | ')}`);
    return { name: `${url} ${variant}`, notes, findings: analyze(record, events, MARK) };
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
        const result = await measure(url, variant, options);
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
