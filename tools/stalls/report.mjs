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

/** A measure's section: its name, what the scenario did, the frames, the programs (each with `links`) and the long
 *  stalls. */
export function measureText(measure, { links = false } = {}) {
  const { name, notes, findings } = measure;
  const frames = findings.frames;
  const programs = findings.programs;
  const lines = [
    `${name}: ${notes.join('; ')}`,
    `  ${frames.count} frames, median ${frames.median.toFixed(1)} ms; ${frames.stalls} over ${STALL_MS} ms, `
      + `${seconds(frames.stalled)} in them; the worst ${frames.worst.map((value) => value.toFixed(0)).join(', ')} ms`,
    `  Skia programs linked: ${programs.count}, ${ms(programs.total)} in all, the longest ${ms(programs.longest)}`,
  ];
  if (links) lines.push(...linkLines(findings.built));
  if (!findings.clockFound) lines.push('  (the page\'s mark is missing from the trace: stalls and links not matched)');
  if (findings.stalls.length === 0) lines.push(`  no stall of ${LISTED_MS} ms or more`);
  for (const stall of findings.stalls) lines.push(...stallLines(stall));
  return lines.join('\n');
}

/** The measures side by side: one line each. */
export function summaryText(measures) {
  const width = Math.max(...measures.map((measure) => measure.name.length));
  const rows = measures.map((measure) => {
    const { frames, programs } = measure.findings;
    return `  ${measure.name.padEnd(width)}  ${String(frames.stalls).padStart(3)} stalls, ${seconds(frames.stalled)} `
      + `stalled; ${String(programs.count).padStart(3)} programs, ${ms(programs.total)}`;
  });
  return ['side by side:', ...rows].join('\n');
}
