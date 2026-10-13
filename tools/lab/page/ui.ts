// The game's UI as the player sees it on this screen (tools/lab `ui`): the lobby, an item's tooltip, How to play, the
// save slots, the lobby's camera switched through its views (the labels over the dummies against where they stand
// on the screen, frame by frame through each glide), the run's HUD with the world's labels over it (a hurt foe's
// bar, damage numbers), the scores, the performance overlay, the bank-or-continue choice, the pause menu and the
// run's summary, each pictured whole, with
// the boxes of the page's named elements and of the labels as shares of the window. On two screens (`--screens`), a
// UI laid out as a share of the screen shows the same lines and the same pictures on both, whatever the screens'
// pixel ratios: a 4K screen at 300% as at 100%.
import * as THREE from 'three';
import type { Frame, Lab, Pictured, Report } from './lab';
import { G } from '../../../src/state';
import { NUMBER_COLORS } from '../../../src/data/balance';
import { anchoredLabels, floatText } from '../../../src/ui/floaters';
import { viewMode } from '../../../src/core/renderer';
import * as overlay from '../../../src/ui/overlay/layer';
import { hideDecision, showDecision } from '../../../src/ui/hud';
import { hideSummary, showPause, showSummary } from '../../../src/ui/menus';
import { setPerfHud } from '../../../src/ui/perfHud';
import { openSaves } from '../../../src/ui/saves';
import { hideTooltip, itemTooltip, showTooltipAt } from '../../../src/ui/tooltip';
import { hdrOutput } from './hdrOutput';

/** The states pictured, in the order they run (tools/lab/node/options.mjs `UI_STATES`). */
export type UiState =
  'lobby' | 'tooltip' | 'help' | 'saves' | 'views' | 'run' | 'scores' | 'perf' | 'decision' | 'pause' | 'summary';

export interface UiOptions {
  state: UiState;
  /** HDR forced on first, as on a display in HDR mode (the pause menu then shows its levels) */
  hdr?: boolean;
}

/** the states pictured in a run (the rest are the lobby's) */
const RUN_STATES: UiState[] = ['run', 'scores', 'perf', 'decision', 'pause', 'summary'];
/** where the tooltip is opened, as shares of the window (the mouse over the lobby's left panel) */
const TOOLTIP_AT = { x: 0.18, y: 0.3 };
/** the foe spawned for the run's labels, how far ahead of the hero (m), and the share of its life it has left */
const FOE_AHEAD = 6;
const FOE_LIFE = 0.6;
/** the damage numbers shown over it: their text, kind, height over the floor (m) and, for a hit's, its damage's type
 *  (coloured as the game colours it: the warrior's and the ranger's physical, the mage's arcane, a crit by its type) */
const NUMBERS = [
  { text: 128, kind: 'dmg', rise: 1.6, type: 'physical' },
  { text: 96, kind: 'dmg', rise: 2.4, type: 'arcane' },
  { text: 412, kind: 'crit', rise: 2.0, type: 'cold' },
  { text: 37, kind: 'heal', rise: 1.2 },
] as const;
/** frames run after the numbers are shown, so each has risen a little and none is in its first pop */
const NUMBER_FRAMES = 12;
/** the frames run after each press of V as the camera glides to the next view (its glide is 0.45 s) */
const SWITCH_FRAMES = 40;
/** a label further than this from where its anchor shows on the screen is off (css px) */
const LABEL_SLACK = 1;
/** frames Tab is held for the scores */
const SCORES_FRAMES = 2;

/** `value` (css px) as a share of `whole`, in % to a tenth. */
function share(value: number, whole: number): string {
  return (value / whole * 100).toFixed(1);
}

/** A box (css px) as shares of the window: its left, top, width and height. */
function boxText(box: { x: number; y: number; w: number; h: number }): string {
  const position = `${share(box.x, innerWidth)},${share(box.y, innerHeight)}`;
  return `${position} ${share(box.w, innerWidth)}x${share(box.h, innerHeight)}`;
}

/** Each named element shown (an id, a box with an area, visible), its box as shares of the window. */
function namedBoxes(): string[] {
  const lines: string[] = [];
  for (const element of document.querySelectorAll<HTMLElement>('[id]')) {
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    lines.push(`#${element.id} ${boxText({ x: rect.left, y: rect.top, w: rect.width, h: rect.height })}`);
  }
  return lines;
}

/**
 * The labels drawn over the world last frame, in the order drawn; none in a tree that doesn't list them (an A/B's
 * older commit), read through the module's namespace, where a name it lacks is only undefined.
 */
function drawnLabels(): readonly overlay.Label[] {
  return overlay.drawnLabels?.() ?? [];
}

/** Each label drawn over the world last frame, its box as shares of the window, in the order drawn. */
function labelBoxes(): string[] {
  return drawnLabels().map((label) => `label ${label.order} ${boxText(label.box)}`);
}

/**
 * Every animation of the page brought to its end (an endless one to its start), so a picture shows the UI at rest:
 * CSS animations run on the browser's own clock, not the lab's.
 */
function settleAnimations(): void {
  for (const animation of document.getAnimations()) {
    const iterations = animation.effect?.getComputedTiming().iterations ?? 1;
    if (iterations === Infinity) {
      animation.pause();
      animation.currentTime = 0;
    } else {
      animation.finish();
    }
  }
}

/** The page as it is now, pictured and its boxes listed under `state`, a frame on with `held` held down. */
async function pictureState(lab: Lab, state: UiState, held: Frame): Promise<{ lines: string[]; moment: Pictured }> {
  settleAnimations();
  await lab.step(1, () => held);
  settleAnimations();
  const lines = [state, ...namedBoxes().map((line) => `  ${line}`), ...labelBoxes().map((line) => `  ${line}`)];
  const moment = await lab.screen(state);
  return { lines, moment };
}

/** The tooltip of the hero's equipped weapon, opened where the mouse would be over the lobby's left panel. */
function openTooltip(): void {
  const weapon = G.profile.equipped.weapon;
  if (!weapon) throw new Error('lab: ui: the hero has no weapon equipped for the tooltip');
  showTooltipAt(itemTooltip(weapon)(), { clientX: innerWidth * TOOLTIP_AT.x, clientY: innerHeight * TOOLTIP_AT.y });
}

/** How to play, opened from the lobby's link. */
function openHelp(): void {
  document.getElementById('btn-help')!.click();
}

function closeHelp(): void {
  document.getElementById('help')!.classList.add('hidden');
}

/** The run's summary: banked, nothing in the bag. */
function openSummary(): void {
  showSummary({ outcome: 'banked', wave: 3, score: 12_480, kills: 42, bag: [] });
}

/** A hurt foe ahead of the hero, risen and standing, and damage numbers over it, a few frames on. */
async function showLabels(lab: Lab): Promise<void> {
  const hero = lab.player.pos;
  const at = new THREE.Vector3(hero.x, 0, hero.z + FOE_AHEAD);
  const foe = lab.spawnFoe('husk', at);
  await lab.until(() => !foe.spawning, 300, 'the foe never rose');
  foe.life = foe.maxLife * FOE_LIFE;
  for (const number of NUMBERS) {
    const color = 'type' in number ? NUMBER_COLORS[number.type] : undefined;
    floatText(at.x, number.rise, at.z, number.text, number.kind, color);
  }
  await lab.step(NUMBER_FRAMES);
  const listed = typeof overlay.drawnLabels === 'function';
  if (listed && drawnLabels().length < NUMBERS.length + 1) {
    throw new Error('lab: ui: the foe\'s bar and numbers weren\'t drawn');
  }
}

/** What a state found besides its boxes: lines for its report, and its problems. */
interface Found {
  lines: string[];
  problems: string[];
}

/**
 * How a state is opened over the lobby or the run and closed again after its picture, what's held meanwhile, and
 * what it checks once pictured.
 */
interface Steps {
  open(lab: Lab): unknown;
  close(lab: Lab): unknown;
  held?: Frame;
  check?(): Found;
}

/** One switch of the view: from which to which, the labels measured, and how far the furthest was off and when. */
interface Switch {
  from: string;
  to: string;
  labels: number;
  worst: number;
  worstFrame: number;
}

/** the view switches the `views` state played, for its check */
let switches: Switch[] = [];

/**
 * How far each label anchored to the world is from where its anchor shows by the camera as the frame draws it
 * (css px): the furthest, and how many were measured (shown, not held on the screen).
 */
function labelsOff(): { labels: number; worst: number } {
  const camera = G.camera.clone();
  camera.updateMatrixWorld();
  const point = new THREE.Vector3();
  let labels = 0;
  let worst = 0;
  for (const { label, at, clamp } of anchoredLabels()) {
    if (!at || clamp || !label.shown) continue;
    point.set(at.x, at.y, at.z).project(camera);
    if (point.z > 1) continue;
    const x = (point.x * 0.5 + 0.5) * innerWidth;
    const y = (-point.y * 0.5 + 0.5) * innerHeight;
    labels++;
    worst = Math.max(worst, Math.hypot(label.x - x, label.y - y));
  }
  return { labels, worst };
}

/**
 * The lobby's camera switched with V through every view and back to the top-down one, each glide played and drawn:
 * every frame of it, the labels over the dummies measured against where their anchors show.
 */
async function switchViews(lab: Lab): Promise<void> {
  switches = [];
  // (every frame drawn, as the game draws them: the drawing refreshed the camera's matrices once a frame)
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    for (let press = 0; press < 3; press++) switches.push(await switchView(lab));
  } finally {
    lab.drawing = drawing;
  }
  if (viewMode() !== 'top') throw new Error(`lab: ui: the views ended in ${viewMode()}, not the top-down view`);
}

/** V pressed once and the glide to the next view played, the labels measured every frame of it. */
async function switchView(lab: Lab): Promise<Switch> {
  const from = viewMode();
  await lab.step(1, () => ({ keys: ['v'] }));
  const switched: Switch = { from, to: viewMode(), labels: 0, worst: 0, worstFrame: 0 };
  for (let frame = 0; frame < SWITCH_FRAMES; frame++) {
    await lab.step(1);
    const off = labelsOff();
    switched.labels = Math.max(switched.labels, off.labels);
    if (off.worst > switched.worst) {
      switched.worst = off.worst;
      switched.worstFrame = frame;
    }
  }
  return switched;
}

/** The labels through each switch as lines, and a problem for each switch that left them off their anchors. */
function labelsThroughSwitches(): Found {
  const lines: string[] = [];
  const problems: string[] = [];
  for (const switched of switches) {
    const where = `${switched.from} to ${switched.to}`;
    lines.push(`  ${where}: ${switched.labels} labels, off their anchors by up to ${switched.worst.toFixed(1)} px `
      + `(frame ${switched.worstFrame})`);
    if (!switched.labels) problems.push(`views, ${where}: no label over the dummies was measured`);
    if (switched.worst > LABEL_SLACK) {
      problems.push(`views, ${where}: the labels were up to ${switched.worst.toFixed(1)} px off their anchors`);
    }
  }
  return { lines, problems };
}

/** the scores' input: Tab held */
const TAB: Frame = { keys: ['tab'] };

/** How each state is opened and closed. */
const STEPS: Record<UiState, Steps> = {
  lobby: { open: () => undefined, close: () => undefined },
  tooltip: { open: openTooltip, close: hideTooltip },
  help: { open: openHelp, close: closeHelp },
  saves: { open: () => openSaves(true), close: () => openSaves(false) },
  views: { open: switchViews, close: () => undefined, check: labelsThroughSwitches },
  run: { open: () => undefined, close: () => undefined },
  // (shown while Tab is held: pictured with it down, let go after)
  scores: { open: (lab) => lab.step(SCORES_FRAMES, () => TAB), close: (lab) => lab.step(1), held: TAB },
  perf: { open: () => setPerfHud(true, false), close: () => setPerfHud(false, false) },
  decision: { open: showDecision, close: hideDecision },
  pause: { open: () => showPause(true), close: () => showPause(false) },
  summary: { open: openSummary, close: hideSummary },
};

/** whether this page's run is set up for the run's states (each command's page is booted for it: false at first) */
let runReady = false;

/**
 * `lab ui`, a state at a time, the lobby's before the run's (the session asks for each: a 4K screen's ten pictures
 * sent back at once were too much for the browser, which closed): `state` opened, pictured whole with its named
 * elements' and labels' boxes as shares of the window, and closed again.
 */
export async function ui(lab: Lab, options: UiOptions): Promise<Report> {
  const { state } = options;
  if (options.hdr) await (await hdrOutput())?.forceHdr(true);
  if (RUN_STATES.includes(state) && !runReady) {
    await lab.setup({});
    await showLabels(lab);
    runReady = true;
  }
  const steps = STEPS[state];
  await steps.open(lab);
  const pictured = await pictureState(lab, state, steps.held ?? {});
  const found = steps.check?.() ?? { lines: [], problems: [] };
  await steps.close(lab);
  const lines = [...pictured.lines, ...found.lines];
  return { text: lines.join('\n'), problems: found.problems, moments: [pictured.moment] };
}
