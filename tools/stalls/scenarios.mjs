// What the player does while the stalls are measured (tools/stalls), with the page's own controls alone (real key
// presses and mouse moves sent to the page, its buttons clicked): a production build has no dev hooks to drive it.
import { choiceClosed, deciding, inRun, runOver } from './page.mjs';

/** the keys held in turn while walking round the lobby, and how long each */
const WALK_KEYS = ['w', 'd', 's', 'a', 'w', 'a', 's', 'd'];
const WALK_HOLD_MS = 1200;
/** a fight's beats: how long Steel Tempest (1) is held, the pause after it, and how often a second skill is used */
const TEMPEST_MS = 1600;
const BETWEEN_MS = 600;
const EXTRA_KEYS = ['3', '4', '2'];
/** how long the bank-or-continue choice stays up before Continue is pressed, and how long it may take to close */
const DECIDE_MS = 4000;
const CHOICE_CLOSE_MS = 10_000;
/** how far round the hero the mouse circles (px), and how fast (radians a beat) */
const MOUSE_RADIUS = 160;
const MOUSE_TURN = 1.3;

/** Walks the hero round the lobby for `ms`: each of `WALK_KEYS` held in turn, as a player tries out a hero. */
async function walk(page, ms) {
  const started = Date.now();
  let step = 0;
  while (Date.now() - started < ms) {
    const key = WALK_KEYS[step % WALK_KEYS.length];
    await page.keyboard.down(key);
    await page.waitForTimeout(WALK_HOLD_MS);
    await page.keyboard.up(key);
    step++;
  }
}

/** The page's window size (css px): a page of a browser connected over CDP has no viewport of Playwright's own. */
async function windowSize(page) {
  return page.viewportSize() ?? (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })));
}

/** Puts the mouse at `angle` round the middle of the screen, where the top-down view has the hero. */
async function aimRound(page, angle) {
  const { width, height } = await windowSize(page);
  await page.mouse.move(width / 2 + Math.cos(angle) * MOUSE_RADIUS, height / 2 + Math.sin(angle) * MOUSE_RADIUS);
}

/** One beat of a fight: Steel Tempest held, the mouse swinging round and the left button down, now and then a skill. */
async function fightBeat(page, beat) {
  await aimRound(page, beat * MOUSE_TURN);
  await page.mouse.down();
  await page.keyboard.down('1');
  await page.waitForTimeout(TEMPEST_MS);
  await page.keyboard.up('1');
  await aimRound(page, beat * MOUSE_TURN + MOUSE_TURN / 2);
  if (beat % 3 === 2) await page.keyboard.press(EXTRA_KEYS[Math.floor(beat / 3) % EXTRA_KEYS.length]);
  await page.waitForTimeout(BETWEEN_MS);
  await page.mouse.up();
}

/**
 * Starts a run as the warrior and fights for `ms`: Steel Tempest and swings at whatever comes, through the end of a
 * wave and its bank-or-continue choice (Continue after a few seconds) into the next. Returns what happened.
 */
async function fight(page, ms) {
  const notes = [];
  await page.click('#opt-class button[data-c="warrior"]');
  await page.waitForTimeout(500);
  await page.click('#btn-start');
  await page.waitForFunction(inRun, null, { timeout: 30_000 });
  notes.push('a run started as the warrior');
  const started = Date.now();
  let beat = 0;
  while (Date.now() - started < ms) {
    if (await page.evaluate(runOver)) {
      notes.push(`the run ended at ${((Date.now() - started) / 1000).toFixed(0)} s`);
      break;
    }
    if (await page.evaluate(deciding)) {
      notes.push(`a wave ended at ${((Date.now() - started) / 1000).toFixed(0)} s: Continue`);
      await page.waitForTimeout(DECIDE_MS);
      await page.keyboard.press('c');
      // (still up as it folds away: asked again at once, the choice was answered twice)
      await page.waitForFunction(choiceClosed, null, { timeout: CHOICE_CLOSE_MS });
      continue;
    }
    await fightBeat(page, beat++);
  }
  return notes;
}

/** Stands in the lobby, then walks round it, for `ms` in all. */
async function lobby(page, ms) {
  await page.waitForTimeout(ms / 4);
  await walk(page, (ms * 3) / 4);
  return ['stood in the lobby, then walked round it'];
}

/** The scenarios by name: each plays the page for `ms` and returns notes of what happened. */
export const SCENARIOS = { fight, lobby };
