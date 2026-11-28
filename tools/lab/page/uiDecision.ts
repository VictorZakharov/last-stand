// tools/lab ui `decision` (and `decisionTouch`'s): the choice after a wave's buttons, each label on one line. Narrowed
// on a short screen, the mouse's labels (their key beside them) wrapped onto two: "Bank spoils & / leave".
// Each button's stake (#347) is a line of its own under its label, so the label alone is counted, and the stake read
// too: on one line under it, never wrapping, as shown and at its longest (a boss near on wave 98, named by the longest
// boss's name; a co-op bank), each put in its place for the reading and taken out after.
// A canary: the choice made narrow enough to wrap them, which must be found.
// The choice is put away at once as the state closes: folded back into the wave badge on the browser's own timers,
// it was still half shown in the next state's picture.
import { hideDecision, resetDecision } from '../../../src/ui/hud';
import { BIOMES } from '../../../src/data/biomes';
import { measure, type TextStyle } from '../../../src/ui/overlay/paint';
import type { Lab } from './lab';
import { input } from '../../../src/core/input';
import { uiScales } from '../../../src/ui/scale';

/** A box on the screen (css px). */
type Box = { x: number; y: number; w: number; h: number };
/** A button the engine draws (src/ui/decisionPanel.ts): its words and its parts' boxes. */
interface DrawnButton { label: string; stake: string; box: Box | null; labelBox: Box | null; stakeBox: Box | null;
  keyBox: Box | null }
/** The choice drawn by the engine, where the tree has it (main's is the page's: `--ab`). */
interface DecisionPanel { decisionShown(): { box: Box | null; inner: Box | null; buttons: DrawnButton[] } | null }
const PANEL = Object.values(import.meta.glob<DecisionPanel>('../../../src/ui/decisionPanel.ts', { eager: true }))[0];
/** a stake's text, a button's padding either side, its key's gap and the gap between buttons (px of the HUD's
 *  layout: `_hud.scss`, `_controls.scss`) */
const STAKE_STYLE: TextStyle = { face: 'body', size: 10.5, color: '#9a8f7c', spacing: 0.3 };
const BUTTON_PAD = 18;
const KEY_GAP = 6;
const BUTTON_GAP = 12;

/** What the check found: lines for its report, and its problems. */
export interface DecisionFound {
  lines: string[];
  problems: string[];
}

/** The kit's presses (src/ui/kit/press.ts): how each pressable panel shows the pointer. */
interface KitPresses { pressablesShown(): { label: string; state: string }[] }
const PRESSES = Object.values(import.meta.glob<KitPresses>('../../../src/ui/kit/press.ts', { eager: true }))[0];
/** Whether the tree draws the choice by the engine (main's is the page's): its pointer's check and canary are its. */
export const DRAWN = !!PANEL && !!PRESSES;
/** the problem the pointer's canary must raise: the Bank's page button disabled, so its panel takes no press */
export const POINTER_CANARY = { name: 'isn\'t shown on it', what: 'Bank made unpressable' };

/** the choice's width the canary sets (css px): too narrow for the buttons' labels on one line */
const CANARY_WIDTH = '300px';
/** the problem the canary must raise */
export const DECISION_CANARY = { name: 'runs onto', what: 'the choice too narrow for its labels' };

/** The lines `element`'s text is laid out on: its boxes, each starting below the line before it. */
export function linesOf(element: HTMLElement): number {
  const range = document.createRange();
  range.selectNodeContents(element);
  const rects = [...range.getClientRects()].filter((rect) => rect.width > 0).sort((a, b) => a.top - b.top);
  let lines = 0;
  let bottom = -Infinity;
  for (const rect of rects) {
    if (rect.top < bottom - 1) continue;
    lines++;
    bottom = rect.bottom;
  }
  return lines;
}

/** The button's label (or its stake) and the lines it takes, as a report's line; a problem where over one. */
function readLine(state: string, part: HTMLElement, lines: string[], problems: string[]): void {
  const text = part.textContent?.trim() ?? '';
  const count = linesOf(part);
  lines.push(`  ${text}: ${count} line${count === 1 ? '' : 's'}`);
  if (count > 1) problems.push(`${state}: the button "${text}" runs onto ${count} lines`);
}

/** Each of the choice's buttons whose label, or its stake under it, runs onto more than one line, as problems of
 *  `state`. */
export function labelsOnOneLine(state: string): DecisionFound {
  const drawn = PANEL?.decisionShown();
  if (drawn) return drawnOnOneLine(state, drawn);
  const lines: string[] = [];
  const problems: string[] = [];
  for (const button of document.querySelectorAll<HTMLElement>('#decision .dc-buttons .btn')) {
    const label = button.querySelector<HTMLElement>('.bank-label, .cont-label') ?? button;
    readLine(state, label, lines, problems);
    const stake = button.querySelector<HTMLElement>('.stake');
    if (stake?.textContent) readLine(state, stake, lines, problems);
  }
  longestStakes(state, lines, problems);
  return { lines, problems };
}

/** Whether `inner` lies within `outer`, to a pixel. */
function within(inner: Box, outer: Box): boolean {
  return inner.x >= outer.x - 1 && inner.y >= outer.y - 1 && inner.x + inner.w <= outer.x + outer.w + 1
    && inner.y + inner.h <= outer.y + outer.h + 1;
}

/** Whether `inner` lies across `outer`'s width, to a pixel. */
function across(inner: Box, outer: Box): boolean {
  return inner.x >= outer.x - 1 && inner.x + inner.w <= outer.x + outer.w + 1;
}

/** The engine's buttons read as the page's are: a label or stake is a line the engine never wraps, so one that runs
 *  past its button, or a button past the choice, is what wrapped on the page; and the longest stakes, measured as
 *  the engine lays them out, must leave both buttons on one row. */
function drawnOnOneLine(state: string, drawn: NonNullable<ReturnType<DecisionPanel['decisionShown']>>): DecisionFound {
  const lines: string[] = [];
  const problems: string[] = [];
  const room = drawn.inner;
  for (const b of drawn.buttons) {
    for (const [text, part] of [[b.label, b.labelBox], [b.stake, b.stakeBox]] as const) {
      if (!text || !part || !b.box) continue;
      const fits = within(part, b.box) && (!room || across(b.box, room));
      lines.push(`  ${text}: ${fits ? 1 : 2} line${fits ? '' : 's'}`);
      if (!fits) problems.push(`${state}: the button "${text}" runs onto 2 lines (past its button or the choice)`);
    }
  }
  if (room) {
    const rows = rowsWithLongestStakes(drawn.buttons, room);
    lines.push(`  the buttons with the longest stakes: ${rows} row${rows === 1 ? '' : 's'}`);
    if (rows > 1) problems.push(`${state}: with the longest stakes the buttons take ${rows} rows`);
  }
  return { lines, problems };
}

/** The rows the drawn buttons would take with each stake at its longest, in the `room` inside the choice: each
 *  button as wide as its key, its padding and the wider of its label and that stake, as the engine lays it out. */
function rowsWithLongestStakes(buttons: DrawnButton[], room: Box): number {
  const hud = uiScales.hud;
  const texts = longestStakeTexts();
  const widths = buttons.map((b, i) => {
    const longest = b.stake ? measure(i === 0 ? texts.bank : texts.cont, STAKE_STYLE).w * hud : 0;
    const words = Math.max(b.labelBox?.w ?? 0, b.stakeBox?.w ?? 0, longest);
    const key = b.keyBox && b.keyBox.w > 0 ? b.keyBox.w + KEY_GAP * hud : 0;
    return words + key + (BUTTON_PAD * 2 + 2) * hud;
  });
  const total = widths.reduce((sum, w) => sum + w, 0) + BUTTON_GAP * hud * (widths.length - 1);
  return total <= room.w + 1 ? 1 : 2;
}

/** The longest words each button's stake can say (`showDecision` in `ui/hud.ts`). */
function longestStakeTexts(): { bank: string; cont: string } {
  // (every rung's short name on every battleground's ladder)
  const names = Object.values(BIOMES).flatMap((biome) => biome.bosses.map((rung) => rung.short));
  const longest = names.reduce((a, b) => (b.length > a.length ? b : a));
  const banks = ['Keep all you carry · the run ends', 'Keep yours · the rest fight on'];
  const bank = banks.reduce((a, b) => (b.length > a.length ? b : a));
  return { bank, cont: `${longest} at wave 100 · better loot` };
}

/** Each stake put at its longest while it shows, read, and put back; the buttons must keep to one row meanwhile (on
 *  touch they wrap onto two where they can't, which made the choice taller). */
function longestStakes(state: string, lines: string[], problems: string[]): void {
  const texts = longestStakeTexts();
  const planted: { stake: HTMLElement; shown: string }[] = [];
  for (const [selector, text] of [['.bank-stake', texts.bank], ['.cont-stake', texts.cont]] as const) {
    const stake = document.querySelector<HTMLElement>(`#decision ${selector}`);
    if (!stake?.textContent) continue;
    planted.push({ stake, shown: stake.textContent });
    stake.textContent = text;
    readLine(state, stake, lines, problems);
  }
  if (planted.length) {
    const tops = [...document.querySelectorAll<HTMLElement>('#decision .dc-buttons .btn')]
      .map((button) => Math.round(button.getBoundingClientRect().top));
    const rows = new Set(tops).size;
    lines.push(`  the buttons with the longest stakes: ${rows} row${rows === 1 ? '' : 's'}`);
    if (rows > 1) problems.push(`${state}: with the longest stakes the buttons take ${rows} rows`);
  }
  for (const { stake, shown } of planted) stake.textContent = shown;
}

/** frames for a change of the page's choice to reach the one the engine draws, and for it to be laid out again */
const FOLLOW_FRAMES = 3;

/** The kit's animations' clock (src/ui/kit/motion.ts), where the tree has it. */
interface KitMotion { finishMotion(): void }
const MOTION = Object.values(import.meta.glob<KitMotion>('../../../src/ui/kit/motion.ts', { eager: true }))[0];

/** The choice drawn by the engine unfolded whole, where the tree draws it so, as the page's animations are finished
 *  (main's is the page's, finished by the state's opening): a frame for it to begin, then its end. */
export async function unfolded(lab: Lab): Promise<void> {
  if (!PANEL || !MOTION) return;
  await lab.step(1);
  MOTION.finishMotion();
  await lab.step(FOLLOW_FRAMES);
}

/** The mouse over the Bank the engine draws: shown on it, and the game counting it over the UI, so a press there is
 *  the button's, never an attack. With the canary, Bank made unpressable first, which must be found. */
async function pointerOnBank(lab: Lab, canary: boolean): Promise<DecisionFound> {
  const bank = PANEL?.decisionShown()?.buttons[0]?.box;
  const button = document.querySelector<HTMLButtonElement>('#decision .bank');
  if (!bank || !button || !PRESSES) return { lines: [], problems: ['decision: no Bank drawn to point at'] };
  if (canary) button.disabled = true;
  // (read as the move is handled: a frame the lab steps sets the game's mouse as its own input has it; moved once
  // beside it first, as a state on touch before this one leaves the game in touch mode, which a mouse's first move
  // only ends)
  await lab.mouseTo({ x: bank.x - 4, y: bank.y - 4 });
  await lab.mouseTo({ x: bank.x + bank.w / 2, y: bank.y + bank.h / 2 });
  const shown = PRESSES.pressablesShown().find((p) => p.label.includes('Bank'))?.state ?? 'none';
  const overUi = input.mouse.overUI;
  await lab.mouseTo({ x: 4, y: innerHeight - 4 });
  if (canary) button.disabled = false;
  const lines = [`  the mouse over Bank: it shows ${shown}, the game counts it over the UI: ${overUi ? 'yes' : 'no'}`];
  const problems: string[] = [];
  if (shown !== 'hover') problems.push(`decision: the pointer over Bank isn't shown on it (${shown})`);
  if (!overUi) problems.push('decision: a press over Bank would be the world\'s (an attack)');
  return { lines, problems };
}

/** The choice's buttons checked; with the canary, again with the choice made narrow, which must be found. */
export async function decisionShown(canary: boolean, lab: Lab): Promise<DecisionFound> {
  await unfolded(lab);
  const found = labelsOnOneLine('decision');
  if (DRAWN) {
    const pointer = await pointerOnBank(lab, false);
    found.lines.push(...pointer.lines);
    found.problems.push(...pointer.problems);
  }
  if (!canary) return found;
  if (DRAWN) {
    const planted = await pointerOnBank(lab, true);
    found.lines.push(...planted.lines.map((line) => `${line} (canary)`));
    found.problems.push(...planted.problems);
  }
  const box = document.getElementById('decision')!;
  box.style.width = CANARY_WIDTH;
  if (PANEL) await lab.step(FOLLOW_FRAMES);
  const planted = labelsOnOneLine('decision');
  box.style.width = '';
  if (PANEL) await lab.step(FOLLOW_FRAMES);
  return { lines: found.lines, problems: [...found.problems, ...planted.problems] };
}

/** The choice put away at once, its fold back into the badge skipped. */
export function closeDecision(): void {
  hideDecision();
  resetDecision();
}
