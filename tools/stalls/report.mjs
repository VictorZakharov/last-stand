// The stalls' report (tools/stalls): each measure's frames, the Skia programs built and every long stall with what
// was built in it and what the page changed just before, then the measures side by side.
import { LISTED_MS, STALL_MS } from './analyze.mjs';

const ms = (value) => `${value.toFixed(0)} ms`;
const seconds = (value) => `${(value / 1000).toFixed(1)} s`;
/** the innermost tasks a program's link is listed in (outside them, the GPU process's run loop) */
const CHAIN_SHOWN = 4;

/** The tasks a link was built in, the innermost `CHAIN_SHOWN` of them: `… > GPUTask > ... > cache_miss`. */
function chainText(heldIn) {
  const shown = heldIn.slice(-CHAIN_SHOWN);
  return `${heldIn.length > shown.length ? '… > ' : ''}${shown.join(' > ')}`;
}

/**
 * One stall's lines: when and how long, the programs built in it and where, the longest tasks through it, the page's
 * changes before it.
 */
function stallLines(stall) {
  const lines = [`  stall of ${ms(stall.ms)} at ${stall.at.toFixed(1)} s`];
  if (stall.built.length === 0) lines.push('    no Skia program built in it');
  for (const link of stall.built) {
    const where = link.heldIn.length ? ` in ${chainText(link.heldIn)}` : '';
    lines.push(`    Skia program linked: ${ms(link.ms)} on ${link.thread}${where}`);
  }
  const busy = stall.busy.map((task) => `${ms(task.ms)} ${task.name} on ${task.thread}`);
  if (busy.length) lines.push(`    the longest tasks through it: ${busy.join('; ')}`);
  if (stall.work?.length) lines.push(workLine('the work in it', stall.work));
  if (stall.changes.length) lines.push(`    the page's changes just before: ${stall.changes.join('; ')}`);
  return lines;
}

/** Every program's link: when, how long, the tasks it was built in, the page's changes just before. */
function linkLines(built) {
  return built.map((link) => {
    const when = link.at === null ? '?' : `${link.at.toFixed(1)} s`;
    const where = link.heldIn.length ? chainText(link.heldIn) : link.thread;
    const changes = link.changes.length ? `; after ${link.changes.join(', ')}` : '';
    return `    ${when.padStart(7)} ${ms(link.ms).padStart(7)}  ${where}${changes}`;
  });
}

const percent = (share) => `${(share * 100).toFixed(0)}%`;

/** A phase's line: its frames, how many a second and the share that missed the screen's refresh, their median, 90%
 *  of them within what, the worst, and how much of it a tooltip was shown. */
function phaseLine(phase) {
  const worst = phase.worst.map((value) => value.toFixed(0)).join(', ');
  const browser = phase.browserWork === undefined ? '' : `; the browser's work for it ${phase.browserWork.toFixed(0)} `
    + 'ms a second';
  return `  ${phase.name}: ${phase.count} frames, ${phase.rate.toFixed(0)} a second (${percent(phase.missedShare)} `
    + `missed the screen's refresh), median ${phase.median.toFixed(1)} ms, 90% within ${phase.p90.toFixed(1)} ms, `
    + `the worst ${worst} ms; a tooltip shown in ${percent(phase.tipShare)} of them${browser}`;
}

/** What a phase's threads spent a frame's time on (`what`: of which frames), the most first, as a line under its
 *  own. */
function workLine(what, work) {
  const pieces = work.map((piece) => `${piece.ms.toFixed(1)} ${piece.name} on ${piece.thread}`);
  return `    ${what}, ms: ${pieces.join('; ')}`;
}

/** The page's JS a frame by function (`what`: which way it's counted), the most first, as a line under a phase's. */
function jsLine(what, functions) {
  const pieces = functions.map((entry) => `${entry.ms.toFixed(2)} ${entry.name}`);
  return `    ${what}, ms: ${pieces.join('; ')}`;
}

/** A phase's lines: its frames, what its threads spent a frame's time on and a missed frame's (those the trace kept
 *  any work in), and where its JS was sampled (`--js`), a frame's by function. */
function phaseLines(phase) {
  const lines = [phaseLine(phase)];
  if (phase.work?.length) lines.push(workLine('a frame\'s work', phase.work));
  if (phase.missedWork?.length) lines.push(workLine('a missed frame\'s', phase.missedWork));
  if (phase.js?.own.length) lines.push(jsLine('a frame\'s JS, each function\'s own time', phase.js.own));
  if (phase.js?.within.length) lines.push(jsLine('and with what it calls', phase.js.within));
  return lines;
}

/** One kind of change of the page's look (`analyze.mjs` `looksChanged`): how many, of how many changes each and
 *  which, what one brought, over the quiet phase's work, and the share of the frames after it that missed. */
function lookLines(look) {
  const over = look.over === null ? '' : `, over the ${look.over} phase's`;
  const what = look.what.join(', ');
  return [
    `  ${look.count} changes of the page's look as ${look.kind} (${look.changes.toFixed(0)} changes to its HTML at `
      + `once: ${what}); the browser's work in the ${look.ms.toFixed(0)} ms after each${over}: `
      + `${look.browserWork.toFixed(1)} ms; ${percent(look.missedShare)} of the frames in it missed`,
    workLine(`a change's work${over}`, look.work),
  ];
}

/** A measure's section: its name, what the scenario did, the frames (each phase's), the programs (each with
 *  `links`) and the long stalls. */
export function measureText(measure, { links = false } = {}) {
  const { name, notes, findings } = measure;
  const frames = findings.frames;
  const programs = findings.programs;
  const lines = [
    `${name}: ${notes.join('; ')}`,
    `  ${frames.count} frames, median ${frames.median.toFixed(1)} ms; ${frames.stalls} over ${STALL_MS} ms, `
      + `${seconds(frames.stalled)} in them; the worst ${frames.worst.map((value) => value.toFixed(0)).join(', ')} ms`,
    `  Skia programs linked: ${programs.count}, ${ms(programs.total)} in all, the longest ${ms(programs.longest)}`,
    ...(findings.phases ?? []).flatMap(phaseLines),
  ];
  if (links) lines.push(...linkLines(findings.built));
  if (!findings.clockFound) lines.push('  (the page\'s mark is missing from the trace: stalls and links not matched)');
  if (findings.stalls.length === 0) lines.push(`  no stall of ${findings.listedMs ?? LISTED_MS} ms or more`);
  for (const stall of findings.stalls) lines.push(...stallLines(stall));
  for (const look of findings.looks ?? []) lines.push(...lookLines(look));
  return lines.join('\n');
}

/** The middle of `values` once sorted (the lower middle of an even count), or 0 without any. */
function medianOf(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : 0;
}

/** `values`' median and range, as `117 (112–122)`. */
function medianText(values) {
  return `${medianOf(values).toFixed(0)} (${Math.min(...values).toFixed(0)}–${Math.max(...values).toFixed(0)})`;
}

/** A phase across the rounds: its frames a second, the browser's work for it a second (ms), each a median and a
 *  range, and its median share missed. */
function roundPhaseText(name, phases) {
  const rates = medianText(phases.map((phase) => phase.rate));
  const browser = medianText(phases.map((phase) => phase.browserWork ?? 0));
  const missed = percent(medianOf(phases.map((phase) => phase.missedShare)));
  return `${name} ${rates} a second, ${missed} missed, the browser's work ${browser} ms a second`;
}

/**
 * The rounds' measures (`--rounds`) by variant: each phase's frames a second over its rounds, the median and the
 * range, and the median share that missed the screen's refresh. A single measure's frames a second moved by 20 from
 * one to the next on a machine shared with other agents; the median of rounds side by side in time holds.
 */
export function roundsText(measures) {
  const groups = new Map();
  for (const measure of measures) {
    if (!groups.has(measure.group)) groups.set(measure.group, []);
    groups.get(measure.group).push(measure);
  }
  const width = Math.max(...[...groups.keys()].map((group) => group.length));
  const rows = [...groups].map(([group, rounds]) => {
    const names = [...new Set(rounds.flatMap((round) => (round.findings.phases ?? []).map((phase) => phase.name)))];
    const phaseOf = (name) => rounds
      .map((round) => round.findings.phases.find((phase) => phase.name === name))
      .filter(Boolean);
    const phases = names.map((name) => roundPhaseText(name, phaseOf(name)));
    return `  ${group.padEnd(width)}  ${rounds.length} rounds; ${phases.join('; ')}`;
  });
  return ['by variant, over the rounds:', ...rows].join('\n');
}

/** The measures side by side: one line each, with each phase's frames a second and its share that missed the
 *  screen's refresh. */
export function summaryText(measures) {
  const width = Math.max(...measures.map((measure) => measure.name.length));
  const rows = measures.map((measure) => {
    const { frames, programs, phases = [] } = measure.findings;
    const rates = phases.map((phase) => `${phase.name} ${phase.rate.toFixed(0)} (${percent(phase.missedShare)})`);
    const phased = rates.length ? `; frames a second (missed) ${rates.join(', ')}` : '';
    return `  ${measure.name.padEnd(width)}  ${String(frames.stalls).padStart(3)} stalls, ${seconds(frames.stalled)} `
      + `stalled; ${String(programs.count).padStart(3)} programs, ${ms(programs.total)}${phased}`;
  });
  return ['side by side:', ...rows].join('\n');
}
