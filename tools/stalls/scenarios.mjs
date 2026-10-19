// What the player does while the stalls are measured (tools/stalls), with the page's own controls alone (real key
// presses and mouse moves sent to the page, its buttons clicked): a production build has no dev hooks to drive it.
import { choiceClosed, deciding, inRun, itemBoxes, markPhase, runOver, scoresShown } from './page.mjs';

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
/** a storm's beats: the foes given this long to come at the mage first; then he walks away from them, a side of a
 *  square each beat (the key, and the way back behind him as the mouse's angle round the screen's middle: the foes
 *  follow him in a line there), and every other beat turns and casts Maelstrom (3, its cooldown 5 s) back at them,
 *  drinking the healing draught (q) whenever it's ready. (Standing, he was dead in 16 to 22 s.) */
const CLOSE_IN_MS = 4000;
const KITE = [['w', Math.PI / 2], ['d', Math.PI], ['s', -Math.PI / 2], ['a', 0]];
const KITE_MS = 2200;
const TURN_MS = 250;
const CAST_MS = 900;
/** a hover's beats: the mouse glides round the middle of a box (an item's slot) this long (ms), in this many moves
 *  (a hand's mouse sends one a frame or so), as far round as this share of the box's size */
const GLIDE_MS = 800;
const GLIDE_MOVES = 40;
const GLIDE_WANDER = 0.3;
/** the box the mouse glides round over the world, at the screen's middle (css px a side) */
const WORLD_BOX = 80;
/** a sweep over the stash: the mouse moved this often (ms: about a frame), and this long over each item unless the
 *  command says (`--item-ms`; ms, as a person running down a row for one item: the owner's hand is faster) */
const SWEEP_MOVE_MS = 16;
export const SWEEP_ITEM_MS = 250;
/** how long a key is held for a tap, as a person's finger holds it (ms): a press down and up again at once is
 *  shorter than a frame */
const TAP_MS = 90;

/** Taps `key` as a person does. */
const tap = (page, key) => page.keyboard.press(key, { delay: TAP_MS });

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

/** The box over the world at the screen's middle, where the mouse hovers nothing. */
async function worldBox(page) {
  const { width, height } = await windowSize(page);
  return { x: (width - WORLD_BOX) / 2, y: (height - WORLD_BOX) / 2, width: WORLD_BOX, height: WORLD_BOX };
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
  if (beat % 3 === 2) await tap(page, EXTRA_KEYS[Math.floor(beat / 3) % EXTRA_KEYS.length]);
  await page.waitForTimeout(BETWEEN_MS);
  await page.mouse.up();
}

/** One beat of a storm: the mage walks a side of the square away from the foes, and every other beat casts
 *  Maelstrom back at those following him. */
async function stormBeat(page, beat) {
  const [key, behind] = KITE[beat % KITE.length];
  await page.keyboard.down(key);
  await page.waitForTimeout(KITE_MS);
  await page.keyboard.up(key);
  if (beat % 2 === 1) {
    // (turned to face them first: the storm goes the way he faces as it's cast)
    await aimRound(page, behind);
    await page.waitForTimeout(TURN_MS);
    await tap(page, '3');
    await page.waitForTimeout(CAST_MS);
  }
  await tap(page, 'q');
}

/** how long the scores are held up on Tab at a scenario's end to read its kills (ms) */
const SCORES_MS = 600;

/** The hero's kills and damage so far, read off the scores held up on Tab, as a note (the scenario's own check that it
 *  fought: a run whose storms caught nothing measured nothing). */
async function scoresNote(page) {
  await page.keyboard.down('Tab');
  await page.waitForTimeout(SCORES_MS);
  const scores = await page.evaluate(scoresShown);
  await page.keyboard.up('Tab');
  if (scores === null) return 'the scores never showed: kills unknown';
  return `${scores.kills} foes killed, ${scores.damage} damage dealt`;
}

/** Starts a run as `hero` from the lobby; returns once it has begun. */
async function startRun(page, hero) {
  await page.click(`#opt-class button[data-c="${hero}"]`);
  await page.waitForTimeout(500);
  await page.click('#btn-start');
  await page.waitForFunction(inRun, null, { timeout: 30_000 });
}

/**
 * Plays a run for `ms`, a `beat` at a time, through the end of a wave and its bank-or-continue choice (Continue after
 * a few seconds) into the next, until the time is up or the run is over. Returns what happened.
 */
async function playRun(page, ms, beat) {
  const notes = [];
  const started = Date.now();
  let count = 0;
  while (Date.now() - started < ms) {
    if (await page.evaluate(runOver)) {
      notes.push(`the run ended at ${((Date.now() - started) / 1000).toFixed(0)} s`);
      break;
    }
    if (await page.evaluate(deciding)) {
      notes.push(`a wave ended at ${((Date.now() - started) / 1000).toFixed(0)} s: Continue`);
      await page.waitForTimeout(DECIDE_MS);
      await tap(page, 'c');
      // (still up as it folds away: asked again at once, the choice was answered twice)
      await page.waitForFunction(choiceClosed, null, { timeout: CHOICE_CLOSE_MS });
      continue;
    }
    await beat(page, count++);
  }
  // (over in its last beat, it's seen only now)
  const ended = notes.some((note) => note.startsWith('the run ended'));
  if (!ended && (await page.evaluate(runOver))) notes.push('the run ended in the last beat');
  return notes;
}

/** Starts a run as the warrior and fights for `ms`: Steel Tempest and swings at whatever comes. */
async function fight(page, ms) {
  await startRun(page, 'warrior');
  const played = await playRun(page, ms, fightBeat);
  return ['a run started as the warrior', ...played, await scoresNote(page)];
}

/**
 * Starts a run as the mage and, once the foes have come at him, casts Maelstrom round him as often as it's ready for
 * `ms`: its storm draws the foes in and whirls what it kills (a storm with 7 or 8 bodies in it lagged for the owner).
 */
async function storm(page, ms) {
  await startRun(page, 'mage');
  await page.waitForTimeout(CLOSE_IN_MS);
  const notes = ['a run started as the mage, walking away from the foes and casting Maelstrom back at them'];
  const played = await playRun(page, ms - CLOSE_IN_MS, stormBeat);
  return [...notes, ...played, await scoresNote(page)];
}

/** Glides the mouse round the middle of `box` for `GLIDE_MS`, as a hand does over an item it reads. */
async function glideRound(page, box) {
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  for (let move = 0; move < GLIDE_MOVES; move++) {
    const angle = (move / GLIDE_MOVES) * 2 * Math.PI;
    const x = middle.x + Math.cos(angle) * box.width * GLIDE_WANDER / 2;
    const y = middle.y + Math.sin(angle) * box.height * GLIDE_WANDER / 2;
    await page.mouse.move(x, y);
    await page.waitForTimeout(GLIDE_MS / GLIDE_MOVES);
  }
}

/** Glides the mouse round one box after another for `ms`: `boxAt(beat)` the beat's. */
async function glideFor(page, boxAt, ms) {
  const started = Date.now();
  for (let beat = 0; Date.now() - started < ms; beat++) await glideRound(page, boxAt(beat));
}

/** the most stash items glided over in turn (the first in its view) */
const STASH_HOVERED = 10;

/**
 * Sweeps the mouse along the stash's items in view for `ms`, row after row and back to the first, `itemMs` over
 * each, as a person runs a row down looking for an item: a new item hovered several times a second.
 */
async function sweepFor(page, items, ms, itemMs) {
  const started = Date.now();
  const steps = Math.max(1, Math.round(itemMs / SWEEP_MOVE_MS));
  for (let index = 0; Date.now() - started < ms; index++) {
    const from = items[index % items.length];
    const to = items[(index + 1) % items.length];
    for (let step = 0; step < steps && Date.now() - started < ms; step++) {
      const share = step / steps;
      const x = from.x + from.width / 2 + (to.x - from.x) * share;
      const y = from.y + from.height / 2 + (to.y - from.y) * share;
      await page.mouse.move(x, y);
      await page.waitForTimeout(SWEEP_MOVE_MS);
    }
  }
}

/**
 * Hovers the items in the lobby, a quarter of `ms` each phase: the mouse gliding over the world first (no tooltip: the
 * frames to beat), then over each of the hero's equipment slots and the stash's first items in turn, its tooltip
 * following; then swept along the stash's items, a new one every `itemMs`; then held still on one, its tooltip up (a
 * stash item's, if it has any: `--stash`). (Hovering the items dropped the owner's Chrome from 140 frames a second to
 * 44, #267, and moving between them to 34 once the glow was composited.)
 */
async function hover(page, ms, { itemMs }) {
  const { slots, items } = await page.evaluate(itemBoxes);
  const boxes = [...slots, ...items.slice(0, STASH_HOVERED)];
  if (boxes.length === 0) return ['no items shown in the lobby: hovered nothing'];
  const world = await worldBox(page);
  await page.evaluate(markPhase, 'away');
  await glideFor(page, () => world, ms / 4);
  await page.evaluate(markPhase, 'over items');
  await glideFor(page, (beat) => boxes[beat % boxes.length], ms / 4);
  await page.evaluate(markPhase, 'sweeping');
  await sweepFor(page, items.length ? items : slots, ms / 4, itemMs);
  await page.evaluate(markPhase, 'held still');
  const held = items[0] ?? slots[0];
  await page.mouse.move(held.x + held.width / 2, held.y + held.height / 2);
  await page.waitForTimeout(ms / 4);
  const stash = items.length ? `${Math.min(items.length, STASH_HOVERED)} of the stash's items` : 'no stash items';
  const sweptOver = items.length ? `the stash's ${items.length} items in view` : 'the equipment slots';
  const swept = `${sweptOver}, ${itemMs} ms each`;
  const on = items.length ? 'a stash item' : 'an equipment slot';
  return [`the mouse over the world, then over the ${slots.length} equipment slots and ${stash} in turn, swept along `
    + `${swept}, then held on ${on}`];
}

/** Sweeps the mouse along the stash's items in view, `hover`'s sweeping, for three quarters of `ms`: the moves
 *  between items that cost the most, measured three times as long. The first quarter the mouse glides over the world:
 *  the same run's frames to beat (a machine busy with something else slows both). */
async function sweep(page, ms, { itemMs }) {
  const { slots, items } = await page.evaluate(itemBoxes);
  if (items.length === 0) return ['no stash items shown (--stash): swept nothing'];
  const world = await worldBox(page);
  await page.evaluate(markPhase, 'away');
  await glideFor(page, () => world, ms / 4);
  await page.evaluate(markPhase, 'sweeping');
  await sweepFor(page, items, (ms * 3) / 4, itemMs);
  return [`the mouse over the world, then swept along the stash's ${items.length} items in view, ${itemMs} ms each `
    + `(the ${slots.length} slots left alone)`];
}

/** Stands in the lobby, then walks round it, for `ms` in all. */
async function lobby(page, ms) {
  await page.waitForTimeout(ms / 4);
  await walk(page, (ms * 3) / 4);
  return ['stood in the lobby, then walked round it'];
}

/** The scenarios by name: each plays the page for `ms` (as `options` say, those it reads) and returns notes of what
 *  happened. */
export const SCENARIOS = { fight, lobby, storm, hover, sweep };
