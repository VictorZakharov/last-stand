// The choice after a wave (bank or continue), drawn by the engine (ui/kit; #973). It was `#decision`, styled by
// `_hud.scss` (with `_touch.scss`'s and `_responsive.scss`'s rules for touch and short screens); its sizes, colours
// and fonts are those, in px of the HUD's reference layout. The page's `#decision` stays, out of sight
// (`.kit-mirror`): `hud.ts` writes it as before, and the panel follows it each frame while it shows (its words, its
// chips, its classes: `opening`, `compact`, `closing`, `staked`), so its writers, its buttons' handlers and the
// lab's presses are as they were. A press on a drawn button clicks the page's (`kit/press.ts`).
// Its unfolding out of the wave's badge and its fold back are CSS's keyframes stepped each frame (`dc-open`,
// `dc-close`: the box clipped to the badge's circle, widened to a strip, opened down); its details fold away as
// they did (`compact`). Not drawn: the unfolding's flare and the light sweeping across it, and Continue's spinning
// key while it's on its way to the host (a dot that pulses in its place).
import { Panel, onFrame } from './kit/panel';
import { pressable, standIn, type PressState } from './kit/press';
import { along, bezier, ease, keyframed, now, reducedMotion } from './kit/motion';
import { uiScales } from './scale';
import type { PanelLook } from '../engine/ui';
import type { TextStyle } from './overlay/paint';

const INK = '#e6dcc8';
const INK_DIM = '#9a8f7c';
const ACCENT = '#e2c07e';
const FRAME = '#a07c46';
const FRAME_DARK = '#4a3620';
const DANGER = '#ff5a4a';
const ALLY_TEXT = '#9ccfff';
/** the chips' borders for the two highest rarities (`_modals.scss`) */
const CHIP_BORDERS: Record<string, string> = { ascendant: 'rgba(255,116,23,.6)', ultimate: 'rgba(255,43,69,.7)' };

const BADGE = 70;
const WIDTH = 560;
const TOP = 10;
/** its unfolding and fold back (s, their curves: `dc-open`, `dc-close`), its details folding away (`compact`) */
const OPEN = 0.9;
const CLOSE = 0.65;
const FOLD = 0.5;
const openCurve = bezier(0.5, 0, 0.2, 1);
const closeCurve = bezier(0.6, 0, 0.4, 1);
/** each part's fade in as it unfolds (s: `dc-in`, after each one's wait) */
const PART_IN = 0.45;

/** A text style of the page's: its face, size, weight, colour, spacing, line height. */
function text(face: TextStyle['face'], size: number, color: string, more: Partial<TextStyle> = {}): TextStyle {
  return { face, size, color, ...more };
}

/** The styles a screen's rules give the choice: the desktop's, touch's, a short screen's. */
interface Fit { touch: boolean; short: boolean }

interface Button {
  root: Panel;
  ring: Panel;
  key: Panel;
  keyText: Panel;
  label: Panel;
  stake: Panel;
  primary: boolean;
  state: PressState;
}

interface Choice {
  wrap: Panel;
  clip: Panel;
  box: Panel;
  ring: Panel;
  details: Panel;
  inner: Panel;
  /** the title's line (as wide as the row on a short screen) and its words in it */
  title: Panel;
  titleText: Panel;
  bag: Panel;
  chips: Panel[];
  party: Panel;
  partyText: Panel;
  risk: Panel;
  riskParts: Panel[];
  buttons: Panel;
  bank: Button;
  cont: Button;
}

let choice: Choice | null = null;
/** what it's doing: shown or not, and when it began to unfold, fold back, or fold its details */
const motion = { phase: 'hidden' as 'hidden' | 'opening' | 'closing', at: -Infinity, compact: false, foldAt: -Infinity };

/** A button of the choice's: its frame, its key cap, its label and its stake under it. */
function button(parent: Panel, primary: boolean): Button {
  const root = new Panel(parent, { alignItems: 'center', justify: 'center', padding: [10, 18], border: 1 });
  const ring = new Panel(root, { position: 'absolute', inset: 0, border: 1 },
    { border: primary ? ACCENT : FRAME, radius: 2 });
  const key = new Panel(root, { padding: [0, 4], minWidth: 20, margin: [0, 6, 0, 0], border: 1, justify: 'center' },
    { border: FRAME, radius: 2 });
  // (its letter centred in it: a cap is at least 20 px wide, and a panel's words are drawn across its box)
  const keyText = new Panel(key, {});
  const labels = new Panel(root, { direction: 'column', alignItems: 'center' });
  const label = new Panel(labels, {});
  const stake = new Panel(labels, {});
  return { root, ring, key, keyText, label, stake, primary, state: 'none' };
}

/** A button's look as it shows the pointer, pressable or not: CSS's `filter: brightness()` on its fills. */
function buttonLook(b: Button, disabled: boolean): PanelLook {
  const fills = b.primary ? ['#6a4a1c', '#2e1e0a'] : ['#2a2420', '#141110'];
  const lit = b.state === 'none' || disabled ? (disabled ? 0.85 : 1) : 1.35;
  const greyed = disabled ? 0.5 : 0;
  const [top, foot] = fills.map((fill) => shaded(fill, lit, greyed));
  return {
    fill: [top, foot], border: '#000', radius: 3,
    shadow: b.primary ? { blur: 14, color: 'rgba(240,190,90,.25)' } : { blur: 6, y: 2, color: 'rgba(0,0,0,.6)' },
  };
}

/** `hex` brightened `by` and greyed `grey` of the way, as CSS's `brightness()` and `grayscale()` filters. */
function shaded(hex: string, by: number, grey: number): string {
  const c = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  const luma = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const out = c.map((v) => Math.min(255, Math.round((v + (luma - v) * grey) * by)));
  return `rgb(${out.join(',')})`;
}

function make(): Choice {
  const wrap = new Panel(null, { position: 'absolute', inset: [TOP, 0, 'auto', 0], justify: 'center',
    alignItems: 'start' });
  const clip = new Panel(wrap, { overflow: 'hidden', justify: 'center', alignItems: 'start', shrink: 0 });
  const box = new Panel(clip, { direction: 'column', alignItems: 'center', shrink: 0, border: 2 },
    { fill: ['rgba(20,17,16,.96)', 'rgba(8,7,8,.96)'], border: FRAME_DARK });
  const ring = new Panel(box, { position: 'absolute', inset: 0, border: 1 }, { border: FRAME });
  const details = new Panel(box, { direction: 'column', alignItems: 'center', overflow: 'hidden', alignSelf: 'stretch' });
  // (as wide as the box, as the page's block is: the bag's chips wrap at its width)
  const inner = new Panel(details, { direction: 'column', alignItems: 'center', shrink: 0, alignSelf: 'stretch' });
  // (a line's words a panel of their own in it: a panel's words are drawn across its box, so a line as wide as its
  // row centres them, as the page's block does)
  const title = new Panel(inner, { margin: [0, 0, 10, 0], justify: 'center' });
  const titleText = new Panel(title, {});
  const bag = new Panel(inner, { wrap: true, gap: 4, justify: 'center', margin: [0, 0, 10, 0], maxHeight: 120,
    overflow: 'hidden' });
  const party = new Panel(inner, { margin: [-4, 0, 10, 0], justify: 'center' });
  const partyText = new Panel(party, {});
  const risk = new Panel(inner, { alignItems: 'baseline', margin: [0, 0, 12, 0] });
  const riskParts = [new Panel(risk, {}), new Panel(risk, {}), new Panel(risk, {})];
  const buttons = new Panel(box, { gap: 12, justify: 'center' });
  const bank = button(buttons, false);
  const cont = button(buttons, true);
  const made: Choice = { wrap, clip, box, ring, details, inner, title, titleText, bag, chips: [], party, partyText,
    risk, riskParts, buttons,
    bank, cont };
  const page = document.getElementById('decision');
  // (its box as CSS measured it: whole, its clip as it unfolds left out)
  if (page) standIn(page, box);
  for (const [b, selector] of [[bank, '.bank'], [cont, '.cont']] as const) {
    const mirror = document.querySelector<HTMLButtonElement>(`#decision ${selector}`);
    if (!mirror) continue;
    pressable({ panel: b.root, mirror, shows: (state) => { b.state = state; } });
  }
  return made;
}

/** The screen's rules for the choice now. */
function fit(): Fit {
  return { touch: document.body.classList.contains('touch'), short: innerHeight <= 520 };
}

/** Whether the page's HUD shows the choice: the run's, not the lobby's. */
function hudShows(): boolean {
  const hud = document.getElementById('hud');
  return !!hud && !hud.classList.contains('hidden') && !hud.classList.contains('lobby');
}

/** `el`'s text, or '' where it's hidden or missing. */
function shownText(el: Element | null): string {
  return el && !el.classList.contains('hidden') ? (el.textContent ?? '').trim() : '';
}

/** The chips of the bag as the page has them: each one's words, colour, rarity, and whether it's the sealed note. */
function chipsOf(mirror: HTMLElement): { text: string; color: string; rarity: string; sealed: boolean }[] {
  const bag = mirror.querySelector('.dc-bag');
  if (!bag) return [];
  const spans = [...bag.querySelectorAll<HTMLElement>('.chip')];
  // (training's bag is a line of its own, no chips)
  if (!spans.length && bag.textContent) return [{ text: bag.textContent, color: INK, rarity: '', sealed: false }];
  return spans.map((span) => ({
    text: span.textContent ?? '', color: span.style.color || INK, rarity: span.dataset.r ?? '',
    sealed: span.classList.contains('sealed'),
  }));
}

/** The bag's chips brought up to the page's. */
function followChips(c: Choice, mirror: HTMLElement, f: Fit): void {
  const chips = chipsOf(mirror).filter((chip) => !(f.short && chip.sealed));
  while (c.chips.length > chips.length) c.chips.pop()!.remove();
  chips.forEach((chip, i) => {
    const panel = c.chips[i] ?? new Panel(c.bag, { padding: [2, 7], border: 1 });
    c.chips[i] = panel;
    panel.look({ fill: 'rgba(0,0,0,.6)', border: CHIP_BORDERS[chip.rarity] ?? 'rgba(255,255,255,.1)' });
    panel.say(chip.text, text('body', 13, chip.sealed ? INK_DIM : chip.color));
  });
}

/** The risk's line brought up to the page's: its words before, in bold and after its count. */
function followRisk(c: Choice, mirror: HTMLElement, f: Fit): void {
  const risk = mirror.querySelector('.dc-risk');
  const shown = !!risk && !risk.classList.contains('hidden') && !!risk.textContent;
  c.risk.show(shown);
  if (!risk || !shown) return;
  const bold = risk.querySelector('b')?.textContent ?? '';
  const [before, after] = (risk.textContent ?? '').split(bold);
  const size = f.short ? 14 : 15;
  c.riskParts[0].say(before ?? '', text('body', size, DANGER));
  c.riskParts[1].say(bold, text('body', size, DANGER, { weight: 700 }));
  c.riskParts[2].say(after ?? '', text('body', size, DANGER));
  c.risk.style({ margin: [0, 0, f.short ? 0 : 12, 0] });
}

/** A button brought up to the page's: its key, label and stake, and how it shows the pointer. */
function followButton(b: Button, mirror: HTMLButtonElement | null, f: Fit, staked: boolean): void {
  if (!mirror) return;
  const sending = mirror.classList.contains('sending');
  b.key.show(!f.touch || sending);
  const keyStyle = text('display', 12, ACCENT, { weight: 700, spacing: 1 });
  b.keyText.say(sending ? '•' : (mirror.querySelector('.k')?.textContent ?? ''), keyStyle);
  b.key.look({ opacity: sending ? 0.5 + 0.5 * Math.abs(Math.sin(now() * Math.PI / 0.9)) : 1 });
  const label = mirror.querySelector('.bank-label, .cont-label')?.textContent ?? '';
  const color = b.primary ? '#ffe7b0' : INK;
  b.label.say(label, text('display', 15, color, { weight: 700, spacing: 1, line: staked ? 1.1 : undefined }));
  const stake = mirror.querySelector('.stake')?.textContent ?? '';
  b.stake.show(stake !== '');
  b.stake.say(stake, text('body', 10.5, INK_DIM, { spacing: 0.3, line: 1.15 }));
  const tall = f.touch ? 32 / uiScales.hud : 0;
  b.root.style({ padding: [staked ? 6 : 10, 18], minHeight: tall || 'auto' });
  b.root.look(buttonLook(b, mirror.disabled));
}

/** The touch rules' place and width for the choice, clear of the bars either side (`_touch.scss`). */
function touchPlace(): { top: number; most: number } {
  const css = getComputedStyle(document.documentElement);
  const touch = parseFloat(css.getPropertyValue('--touch')) || 1;
  const hud = uiScales.hud || 1;
  const bar = parseFloat(css.getPropertyValue('--touch-bar')) || 220;
  const least = 460;
  const room = innerWidth - 2 * (10 + 54 * touch + (bar + 10) * touch);
  const most = Math.max(least, room / hud);
  // (under the bars where the room between them is less than its least: a step, as the page's clamp() makes it)
  const under = least * hud - room > 0 ? 12 + 60 * touch : 0;
  return { top: TOP + under / hud, most };
}

/** A padding the page's choice has set on its own inline (top and bottom, then the sides: px), if any. */
function paddingSet(mirror: HTMLElement): [number, number] | null {
  const parts = mirror.style.padding.split(/\s+/).map(parseFloat).filter(Number.isFinite);
  return parts.length ? [parts[0], parts[1] ?? parts[0]] : null;
}

/** Each part's layout as the screen's rules have it now (and a width the page's sets on its own inline: the lab's
 *  canary narrows it so). */
function followFit(c: Choice, mirror: HTMLElement, f: Fit, compact: boolean): void {
  const place = f.touch ? touchPlace() : { top: TOP, most: Infinity };
  c.wrap.style({ inset: [place.top, 0, 'auto', 0] });
  const set = parseFloat(mirror.style.width);
  const width = Number.isFinite(set) ? set : Math.min(f.touch && f.short ? 500 : WIDTH, place.most);
  const pad: [number, number] = paddingSet(mirror) ?? (f.short ? [8, 14] : [compact ? 10 : 18, 22]);
  c.box.style({ width, padding: [pad[0], pad[1], pad[0], pad[1]] });
  c.inner.style(f.short
    ? { direction: 'row', wrap: true, justify: 'center', alignItems: 'center', gap: [10, 0], padding: [0, 0, 8, 0] }
    : { direction: 'column', wrap: false, alignItems: 'center', gap: 0, padding: 0 });
  c.title.style({ margin: [0, 0, f.short ? 4 : 10, 0], basis: f.short ? '100%' : 'auto' });
  c.party.style({ basis: f.short ? '100%' : 'auto' });
  c.bag.style({ margin: [0, 0, f.short ? 0 : 10, 0] });
  c.buttons.style({ wrap: f.touch });
}

/** The choice brought up to its mirror on the page, and its animations a step on. */
function follow(): void {
  const mirror = document.getElementById('decision');
  if (!mirror) return;
  const hidden = mirror.classList.contains('hidden') || !hudShows();
  if (!choice && hidden) return;
  choice ??= make();
  const c = choice;
  const phase = hidden ? 'hidden' : mirror.classList.contains('closing') ? 'closing' : 'opening';
  if (phase !== motion.phase) {
    motion.phase = phase;
    motion.at = now();
  }
  const compact = mirror.classList.contains('compact');
  if (compact !== motion.compact) {
    motion.compact = compact;
    motion.foldAt = now();
  }
  c.wrap.show(phase !== 'hidden');
  if (phase === 'hidden') return;
  const f = fit();
  const staked = mirror.classList.contains('staked');
  followFit(c, mirror, f, compact);
  const short = f.short;
  c.titleText.say(shownText(mirror.querySelector('.dc-title')),
    text('display', short ? 20 : 26, ACCENT, { line: short ? 1.15 : undefined }));
  followChips(c, mirror, f);
  const party = shownText(mirror.querySelector('.dc-party'));
  c.party.show(party !== '');
  c.partyText.say(party, text('body', 15, ALLY_TEXT));
  followRisk(c, mirror, f);
  followButton(c.bank, mirror.querySelector<HTMLButtonElement>('.bank'), f, staked);
  followButton(c.cont, mirror.querySelector<HTMLButtonElement>('.cont'), f, staked);
  animate(c);
}

/** The box's clip as the unfolding or fold back has it now: its width and height (px) and corners, and how much of it
 *  shows. */
function clipNow(full: { w: number; h: number }): { w: number; h: number; r: number; opacity: number } {
  const still = reducedMotion();
  const half = BADGE / 2;
  if (motion.phase === 'opening') {
    const t = still ? 1 : along(motion.at, OPEN);
    return {
      w: keyframed([[0, BADGE], [0.22, BADGE], [0.55, full.w], [1, full.w]], t, openCurve),
      h: keyframed([[0, BADGE], [0.55, BADGE], [1, full.h]], t, openCurve),
      r: keyframed([[0, half], [0.55, half], [1, 4]], t, openCurve),
      opacity: keyframed([[0, 0], [0.12, 1]], t, openCurve),
    };
  }
  const t = still ? 1 : along(motion.at, CLOSE);
  return {
    w: keyframed([[0, full.w], [0.5, full.w], [0.85, BADGE]], t, closeCurve),
    h: keyframed([[0, full.h], [0.5, BADGE]], t, closeCurve),
    r: keyframed([[0, 4], [0.5, half]], t, closeCurve),
    opacity: keyframed([[0, 1], [0.85, 1], [1, 0]], t, closeCurve),
  };
}

/** Its clip, its details' fold and its parts' fades a step on. */
function animate(c: Choice): void {
  const still = reducedMotion();
  const hud = uiScales.hud || 1;
  const boxRect = c.box.rect();
  const innerRect = c.inner.rect();
  // (the details fold to nothing as they go compact, and open again: their whole height eased)
  const whole = innerRect ? innerRect.h / hud : 0;
  const folded = still ? 1 : ease(along(motion.foldAt, FOLD));
  const shut = motion.compact ? folded : 1 - folded;
  c.details.style({ height: motion.foldAt === -Infinity ? 'auto' : Math.round(whole * (1 - shut) * 100) / 100 });
  c.details.look({ opacity: 1 - Math.min(1, shut * FOLD / 0.3) });
  const full = boxRect ? { w: boxRect.w / hud, h: boxRect.h / hud } : { w: WIDTH, h: 200 };
  const clip = clipNow(full);
  c.clip.style({ width: Math.min(clip.w, full.w), height: Math.min(clip.h, full.h) });
  c.clip.look({ radius: clip.r, opacity: clip.opacity, hits: true });
  const closing = motion.phase === 'closing';
  const partsShow = closing ? 1 - (still ? 1 : along(motion.at, 0.15)) : 1;
  // (each part fades in after its wait as it unfolds: the title, the bag, the party and risk, the buttons)
  const waits: [Panel, number][] = [[c.title, 0.5], [c.bag, 0.7], [c.party, 0.78], [c.risk, 0.78], [c.buttons, 0.86]];
  for (const [part, wait] of waits) {
    const shown = motion.phase === 'opening' && !still ? ease(along(motion.at + wait, PART_IN)) : 1;
    part.look({ opacity: Math.min(shown, partsShow) });
  }
}

/** The choice drawn by the engine from now on, its page's own put out of sight. */
export function drawDecision(): void {
  document.getElementById('decision')?.classList.add('kit-mirror');
  onFrame(follow);
}

type Box = { x: number; y: number; w: number; h: number };
/** A button as drawn: its words and its, its label's, its stake's and its key's boxes (css px). */
export interface DrawnButton { label: string; stake: string; box: Box | null; labelBox: Box | null;
  stakeBox: Box | null; keyBox: Box | null }

/** The choice as drawn, if it's shown (the lab reads it): its box, the room inside it, and each button. */
export function decisionShown(): { box: Box | null; inner: Box | null; buttons: DrawnButton[] } | null {
  if (!choice || motion.phase === 'hidden') return null;
  const c = choice;
  return {
    box: c.clip.rect(),
    inner: c.details.rect(),
    buttons: [c.bank, c.cont].map((b) => ({
      label: b.label.said, stake: b.stake.said, box: b.root.rect(), labelBox: b.label.rect(),
      stakeBox: b.stake.said ? b.stake.rect() : null, keyBox: b.key.rect(),
    })),
  };
}
