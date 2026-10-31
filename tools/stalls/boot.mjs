// The game's boot measured (tools/stalls, `--scenario boot`): the page loaded in a fresh Chrome as a first visit has
// it (a new profile: every cache empty, no saved game, the game's own settings), then loaded again as a return (its
// caches, the offline worker and the saved profile kept), each traced from the navigation to a while after the
// loading screen reveals the lobby.
import { writeFileSync } from 'node:fs';
import { noCapture } from '../lab/node/browser.mjs';
import { analyzeBoot } from './analyze.mjs';
import { slowCpu } from './chrome.mjs';
import { BLINK_FRAMES, filmFrames, filmOf, logoBox, startFilm } from './film.mjs';
import { bootRecording, chooseIfAsked, fightWarm, loaded, startIfCold, stopBootRecording } from './page.mjs';
import { startTrace } from './trace.mjs';
import { partsOf, VARIANTS } from './variants.mjs';
import { resizeTrips, windFitRead, windFitRecording } from './windFit.mjs';

/** the page's mark on the trace, where its clock starts */
const MARK = 'stalls:boot';
/** how long a boot is given to reveal the lobby, and then to warm the fight's programs behind it (ms) */
const BOOT_TIMEOUT_MS = 180_000;
const WARM_TIMEOUT_MS = 120_000;

/** The visits a boot measure makes in one Chrome, in turn: how each loads the page, and what it is. */
const VISITS = [
  {
    name: 'a first visit',
    note: 'a fresh profile: every cache empty, no saved game',
    load: (page, url) => page.goto(url, { waitUntil: 'commit' }),
  },
  {
    name: 'a return',
    note: 'loaded again in the same Chrome: its caches, the offline worker and the saved game kept',
    load: (page) => page.reload({ waitUntil: 'commit' }),
  },
];

/** `browser`'s first context made ready for a boot: never taking the pointer, the boot recorded from each document's
 *  start (and where its exit draws, with `--resize`), `variant` (each of its parts) applied before the page's
 *  scripts, the performance overlay shown if `perf`, Auto's quality where `auto` says a device settled it and the
 *  battleground where `biome` is given (their cookies, set for `url`). */
async function bootContext(browser, url, variant, options) {
  const context = browser.contexts()[0] ?? (await browser.newContext());
  await context.addInitScript(noCapture);
  const stalls = { stallBlow: options.stallBlow, stallLobby: options.stallLobby };
  const blinks = { blinkExit: options.blinkExit, blinkFrames: BLINK_FRAMES };
  await context.addInitScript(bootRecording, { mark: MARK, ...stalls, ...blinks });
  if (options.resize) await context.addInitScript(windFitRecording, { stale: options.staleWind });
  for (const part of partsOf(variant)) await context.addInitScript(VARIANTS[part].script, VARIANTS[part].arg);
  const cookies = [
    ...(options.perf ? [{ name: 'last-stand-perf-hud', value: '1', url }] : []),
    ...(options.auto ? [{ name: 'last-stand-quality-auto', value: options.auto, url }] : []),
    ...(options.biome ? [{ name: 'last-stand-biome', value: options.biome, url }] : []),
  ];
  if (cookies.length) await context.addCookies(cookies);
  return context;
}

/** Whether `visit` leaves without pressing Start (`--cold-return`: the first visit, so the return finds its maps
 *  kept and the fight's programs never compiled, as after a visit that never fought). */
const leftCold = (visit, options) => options.coldReturn && visit === VISITS[0];

/** What a visit left without pressing Start says of the fight, read off the page as it's left (`fightWarm`): a
 *  build that warms the fight before its lobby (production before the fight's loading bar) left it warm all the
 *  same, and its return is no cold one. */
const LEFT_NOTES = {
  cold: 'left without pressing Start, the fight never compiled',
  warm: 'left without pressing Start, its fight warm all the same (warmed before the lobby): not a cold return',
};

/** One visit of `page` traced: loaded as `visit` loads it (the window taken to `--resize`'s size and back as it
 *  loads, `windFit.mjs`), the lobby revealed and watched `options.seconds` more,
 *  then, unless it's left cold (`leftCold`), Start pressed if the fight's programs aren't warm yet (`startIfCold`)
 *  and watched till they are (`fightWarm`); then its findings (`analyzeBoot`, and its exit's film with `--film`),
 *  how it was left (`LEFT_NOTES`'s key, null where Start could be pressed) and a picture of the screen
 *  (`picture.end`, the film's sheets beside it), taken at the CPU's full speed (`setRate`: slowed ten times, the page
 *  painted none within Playwright's 30 s) and slowed again after. */
async function bootTraced(browser, page, url, visit, options, picture, setRate) {
  const trace = await startTrace(browser, { js: options.js, angle: options.angle, dawn: options.dawn });
  const film = options.film ? await startFilm(page, { full: options.filmLogo }) : null;
  await visit.load(page, url);
  const resized = options.resize ? resizeTrips(page, options) : null;
  await Promise.all([page.waitForFunction(loaded, null, { timeout: BOOT_TIMEOUT_MS, polling: 250 }), resized]);
  await page.waitForTimeout(options.seconds * 1000);
  const windFit = options.resize ? await page.evaluate(windFitRead) : null;
  const logo = options.filmLogo ? await page.evaluate(logoBox) : null;
  // (a first visit opens on the hero selection screen: the hero in focus chosen, as a player chooses one)
  await page.evaluate(chooseIfAsked);
  let left = null;
  if (leftCold(visit, options)) left = (await page.evaluate(fightWarm)) ? 'warm' : 'cold';
  else {
    await page.evaluate(startIfCold);
    await page.waitForFunction(fightWarm, null, { timeout: WARM_TIMEOUT_MS, polling: 250 });
  }
  if (options.read) writeFileSync(picture.read, `${JSON.stringify(await page.evaluate(options.read), null, 1)}\n`);
  const record = await page.evaluate(stopBootRecording);
  const events = await trace.stop();
  const shots = film ? await film.stop() : [];
  await setRate(1);
  await page.screenshot({ path: picture.end });
  const findings = analyzeBoot(record, events, MARK, options.sourceOf);
  if (windFit) {
    const { trace, resizes, ...fit } = windFit;
    writeFileSync(picture.wind, `${JSON.stringify({ resizes, trace })}\n`);
    findings.windFit = { ...fit, planted: options.staleWind, file: picture.wind };
  }
  if (options.film) {
    const files = { sheet: picture.film, close: picture.flickers, logo: picture.logo };
    const frames = filmFrames(record, shots);
    findings.film = await filmOf(browser, page, frames, findings.revealedAt, files, record.blinks, logo);
  }
  await setRate(options.cpuSlowdown);
  return { findings, left };
}

/** The notes of a boot: the visit, Auto's quality where it was set, the CPU's slowing, the window's trips, the
 *  blow's and the lobby's stalls and the exit's blinks and stale places, how it was left where Start wasn't pressed
 *  (`left`), the page's errors and where its end was pictured. */
function bootNotes(visit, options, left, errors, picture) {
  const auto = options.auto ? [`Auto's quality settled at ${options.auto}`] : [];
  const slowed = options.cpuSlowdown > 1 ? [`the CPU slowed ${options.cpuSlowdown} times`] : [];
  const size = ({ width, height }) => `${width}x${height}`;
  const trip = `the window taken to ${options.resize && size(options.resize)} and back ${options.trips} times as it `
    + 'loaded, the first as the exit was made ready';
  const trips = options.resize ? [trip] : [];
  const stale = options.staleWind ? ['the exit placed once and never again (the canary)'] : [];
  const stalled = options.stallBlow ? [`held up ${options.stallBlow} ms in the logo blow's first frames`] : [];
  const held = options.stallLobby ? [`each of the lobby's frames held up ${options.stallLobby} ms for a second`] : [];
  const blinks = `the loading screen hidden for a frame ${options.blinkExit} times as it left`;
  const blinked = options.blinkExit ? [blinks] : [];
  const leftNote = left ? [LEFT_NOTES[left]] : [];
  const failed = errors.length ? [`page errors: ${errors.slice(0, 3).join(' | ')}`] : [];
  const read = options.read ? [`${options.read} read into ${picture.read}`] : [];
  const notes = [visit.note, ...auto, ...slowed, ...trips, ...stalled, ...held, ...blinked, ...stale, ...leftNote,
    ...failed, ...read];
  return [...notes, `its end pictured in ${picture.end}`];
}

/**
 * Each URL's boots in turn with each variant, `options.rounds` times over: in a fresh Chrome (`chromeFor`), a first
 * visit, then a return (`VISITS`). Rounds side by side in time are slowed alike by whatever else uses the machine.
 * `sourcesFor(url)` names a URL's functions; each measure goes to `measured` as it's made, with `pictureAt()` the
 * pictures of its end and its film (`{ end, film, flickers }`).
 */
export async function measureBoots(urls, options, { chromeFor, sourcesFor, pictureAt, measured }) {
  for (let round = 1; round <= options.rounds; round++) {
    for (const url of urls) {
      for (const variant of options.variants) {
        const chrome = await chromeFor(options);
        try {
          const context = await bootContext(chrome.browser, url, variant, options);
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', (error) => errors.push(String(error)));
          const setRate = await slowCpu(page, options.cpuSlowdown);
          options.sourceOf = sourcesFor(url);
          for (const visit of VISITS) {
            console.log(`booting ${options.nameOf(url)} ${variant}, ${visit.name}, round ${round}`);
            const picture = pictureAt();
            const { findings, left } = await bootTraced(chrome.browser, page, url, visit, options, picture, setRate);
            const group = `${options.nameOf(url)} ${variant}, ${visit.name}`;
            const notes = bootNotes(visit, options, left, errors, picture);
            measured({ name: `${group} (round ${round})`, group, notes, findings });
          }
        } finally {
          await chrome.close();
        }
      }
    }
  }
}
