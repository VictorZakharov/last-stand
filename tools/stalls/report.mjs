// The stalls' report (tools/stalls): each measure's frames, the Skia programs built and every long stall with what
// was built in it and what the page changed just before, then the measures side by side.
import { LISTED_MS, STALL_MS } from './analyze.mjs';

const ms = (value) => `${value.toFixed(0)} ms`;
const seconds = (value) => `${(value / 1000).toFixed(1)} s`;
/** a boot's times (ms) in seconds, to the hundredth, and its bytes */
const bootSeconds = (value) => `${(value / 1000).toFixed(2)} s`;
const megabytes = (bytes) => `${(bytes / 1e6).toFixed(2)} MB`;
/** the innermost tasks a program's link is listed in (outside them, the GPU process's run loop) */
const CHAIN_SHOWN = 4;
/** the least work (ms) other pages' renderers did through a measure that the report says: a page held still does
 *  a millisecond's (its messages), one left drawing 2 s and more in 6 */
const OTHERS_SHOWN_MS = 20;

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
  if (findings.others.ms >= OTHERS_SHOWN_MS) {
    const most = findings.others.most.map(({ what, ms: spent }) => `${spent.toFixed(0)} ${what}`).join('; ');
    lines.push(`  (other pages' renderers did ${ms(findings.others.ms)} of work through it, in its frames' time: `
      + `${most})`);
  }
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

/** A boot's step (`analyze.mjs` `analyzeBoot`): when it started, how long it took, its frames and the longest the
 *  page was held up in it, its long tasks and Skia programs, and what the threads spent its time on in all. */
function bootStepLines(step) {
  const { frames, longTasks, programs } = step;
  const tasks = longTasks.count
    ? `, ${longTasks.count} long tasks (${ms(longTasks.ms)}, the longest ${ms(longTasks.longest)})`
    : '';
  const built = programs.count ? `, ${programs.count} Skia programs (${ms(programs.ms)})` : '';
  const held = frames.count ? `, the page held up ${ms(frames.worst[0])} at most` : '';
  const lines = [
    `  ${bootSeconds(step.from).padStart(7)}  ${step.name}: ${bootSeconds(step.ms)}; ${frames.count} frames${held}`
      + `${tasks}${built}`,
  ];
  if (step.work.length) lines.push(workLine('its work', step.work));
  if (step.gpuMain?.length) lines.push(workLine('the GPU process\'s main thread\'s', step.gpuMain));
  if (step.js?.own.length) lines.push(jsLine('its JS, each function\'s own time', step.js.own));
  return lines;
}

/** The maps the game's workers made in a boot: how many (and how many read back from a visit before), when, their
 *  work in all and the longest. */
function mapsLine({ count, kept, from, to, ms: work, longest }) {
  const shown = longest.map((map) => `${map.name} ${bootSeconds(map.ms)}`).join(', ');
  const read = kept ? ` (${kept} of them read back from a visit before)` : '';
  return `  ${count} maps made in the workers${read} from ${bootSeconds(from)} to ${bootSeconds(to)}, `
    + `${bootSeconds(work)} of work (the longest ${shown})`;
}

/** How the loading screen left a boot (`analyze.mjs` `exitOf`), as a few words. */
function exitText({ kind, markedSlow, slowAfter, forGood }) {
  if (kind === 'blown') return 'the logo blown away';
  if (kind === 'cut' && forGood) return 'the logo\'s blow cut short by its watchdog, which switched it off for good';
  if (kind === 'cut') return `the logo's blow cut short by its watchdog (slow launches in a row: ${slowAfter})`;
  return markedSlow
    ? 'a plain fade (the device marked slow by the watchdog)'
    : 'a plain fade (reduced motion, low graphics, or the blow not ready in time)';
}

/** the warm-ups listed by their longest step */
const WARM_UPS_SHOWN = 6;

/** A warm-up's longest one-task step (its build, its compile or its draw, ms): what holds the lobby's frames up
 *  behind it. */
const longestStep = (warmUp) => Math.max(warmUp.buildMs ?? 0, warmUp.compileMs ?? 0, warmUp.drawMs ?? 0);

/** The game's warm-ups (`src/game/warmup.ts`): how many, and those whose one-task steps took longest, each with
 *  its compile, its wait for its links and its draw. */
function warmUpsLine(warmUps) {
  const ms = (value) => `${Math.round(value ?? 0)}`;
  const longest = [...warmUps].sort((a, b) => longestStep(b) - longestStep(a)).slice(0, WARM_UPS_SHOWN);
  const built = (w) => (w.buildMs === undefined ? '' : `build ${ms(w.buildMs)}, `);
  const steps = (w) => `${built(w)}compile ${ms(w.compileMs)}, links ${ms(w.linksMs)}, draw ${ms(w.drawMs)}`;
  const shown = longest.map((w) => `${w.name} (${steps(w)})`);
  return `  ${warmUps.length} warm-ups, ms, the longest steps first: ${shown.join('; ')}`;
}

/** How long after the lobby's reveal its frames a second last fell short of the screen's (`analyze.mjs`
 *  `lobbyRateOf`'s `roughTill`), as a few words. */
function roughText(roughTill) {
  if (roughTill === 0) return 'every second at the screen\'s rate';
  if (roughTill === null) return 'short of the screen\'s rate to the end';
  return `short of the screen's rate till ${bootSeconds(roughTill)} in`;
}

/** The lobby's frames a second from its reveal till Start was pressed (`analyze.mjs` `lobbyRateOf`), as the
 *  performance overlay counts them: the fewest and when, how long they fell short of the screen's, and each; then
 *  what the threads and the page's JS (where sampled) spent the fewest's second on. */
function lobbyLines({ seconds: counted, fewest, screenRate, roughTill, work, js }) {
  const each = counted.map((second) => second.count).join(' ');
  const lines = [
    `  the lobby's frames a second (the overlay's count, the screen's ${screenRate.toFixed(0)}): the fewest `
      + `${fewest.count}, ${bootSeconds(fewest.at)} in; ${roughText(roughTill)}; each 0.25 s from 1 s in: ${each}`,
  ];
  if (work.length) lines.push(workLine('the fewest\'s second\'s work', work));
  if (js?.own.length) lines.push(jsLine('its JS, each function\'s own time', js.own));
  if (js?.within.length) lines.push(jsLine('its JS, each function with what it calls', js.within));
  return lines;
}

/** How long after the reveal the loading screen was gone (ms), where it was. */
const goneAfter = ({ goneAt, revealedAt }) => (goneAt && revealedAt !== null ? goneAt - revealedAt : null);

/** A time from the reveal (ms) in seconds, signed: `+0.25 s`. */
const fromReveal = (ms) => `${ms >= 0 ? '+' : ''}${bootSeconds(ms)}`;

/** A flicker of the exit's film (`film.mjs` `flickersOf`): when, how many frames and how far it stood out. */
function flickerText({ at, length, out, sides }) {
  const frames = length === 1 ? 'a frame' : `${length} frames`;
  const off = `${out.toFixed(1)} grey levels off those either side, ${sides.toFixed(1)} apart`;
  return `${fromReveal(at)} (${frames}, ${off})`;
}

/** A boot's exit filmed (`film.mjs` `filmOf`): its frames and their span from the reveal, its flickers, the canary's
 *  blinks found, and where its sheets are. */
function filmLines(film) {
  if (!film.frames) return [`  the exit filmed: no frame of it caught (${film.caught} filmed in all)`];
  const size = `${film.size.width}x${film.size.height}`;
  const span = `${film.frames} frames of ${size}, ${fromReveal(film.from)} to ${fromReveal(film.to)} from the reveal`;
  const flickers = film.flickers.length
    ? `${film.flickers.length} flickers: ${film.flickers.map(flickerText).join('; ')}`
    : 'no flicker';
  const missed = film.found < film.planted ? 'missed' : 'caught';
  const canary = film.planted ? `; the canary's ${film.planted} blinks: ${film.found} found (${missed})` : '';
  const close = film.flickers.length ? `, the flickers' frames in ${film.files.close}` : '';
  return [`  the exit filmed: ${span}; ${flickers}${canary}`, `    the film in ${film.files.sheet}${close}`];
}

/** When the loading screen was gone, after the reveal: `, gone 0.90 s after the reveal` (nothing where it wasn't). */
function goneText(findings) {
  const after = goneAfter(findings);
  return after === null ? '' : `, gone ${bootSeconds(after)} after the reveal`;
}

/** A boot's section: what it was, when the lobby was revealed and the page first painted, the files fetched, the
 *  maps the workers made, how the loading screen left and its film, the lobby's frames a second, and each step from
 *  the navigation's start (`bootStepLines`). */
export function bootText(measure) {
  const { name, notes, findings } = measure;
  const { files } = findings;
  const revealed = findings.revealedAt === null
    ? 'the lobby never revealed'
    : `the lobby revealed at ${bootSeconds(findings.revealedAt)}`;
  const painted = findings.painted === null ? '' : `, first painted at ${bootSeconds(findings.painted)}`;
  const pressed = findings.pressedAt ? `Start pressed at ${bootSeconds(findings.pressedAt)}, ` : '';
  const warm = findings.warmAt ? `, ${pressed}the fight warm at ${bootSeconds(findings.warmAt)}` : '';
  const took = (file) => (file.ms === null ? '' : ` in ${bootSeconds(file.ms)}`);
  const largest = files.largest.map((file) => `${file.name} ${megabytes(file.bytes)}${took(file)}`).join(', ');
  const lines = [
    `${name}: ${notes.join('; ')}`,
    `  ${revealed}${warm}${painted}; ${files.count} files, ${megabytes(files.bytes)} over the network `
      + `(${files.later} after the reveal; the largest ${largest})`,
    ...(findings.maps ? [mapsLine(findings.maps)] : []),
    ...(findings.warmUps?.length ? [warmUpsLine(findings.warmUps)] : []),
    ...(findings.exit ? [`  the loading screen left: ${exitText(findings.exit)}${goneText(findings)}`] : []),
    ...(findings.film ? filmLines(findings.film) : []),
    ...(findings.lobby ? lobbyLines(findings.lobby) : []),
    ...findings.steps.flatMap(bootStepLines),
  ];
  if (!findings.clockFound) lines.push('  (the page\'s mark is missing from the trace: no step\'s work)');
  return lines.join('\n');
}

/** `values` (ms) as seconds: their median and range, `5.42 (5.21–5.90) s`. */
function secondsText(values) {
  const range = `${bootSeconds(Math.min(...values)).slice(0, -2)}–${bootSeconds(Math.max(...values))}`;
  return `${bootSeconds(medianOf(values)).slice(0, -2)} (${range})`;
}

/** How the loading screen left a group's boots: each way, how many times (`the logo blown away 2, a plain fade 1`). */
function exitsText(exits) {
  const counts = new Map();
  for (const exit of exits) counts.set(exitText(exit), (counts.get(exitText(exit)) ?? 0) + 1);
  return [...counts].map(([text, count]) => `${text} ${count}`).join(', ');
}

/** A group's lobbies over the rounds (`analyze.mjs` `lobbyRateOf`): their fewest frames a second, and how many of
 *  them fell short of the screen's rate and till when, the median and the range. */
function lobbyRoundsLine(lobbies) {
  const rough = lobbies.filter((lobby) => lobby.roughTill !== 0);
  const till = rough.map((lobby) => lobby.roughTill).filter((at) => at !== null);
  const tillText = till.length ? `, till ${secondsText(till)} in` : '';
  const endless = rough.length - till.length;
  const toEnd = endless ? ` (${endless} to the end)` : '';
  return `    the lobby's fewest frames a second ${medianText(lobbies.map((lobby) => lobby.fewest.count))}; `
    + `${rough.length} of ${lobbies.length} short of the screen's rate${tillText}${toEnd}`;
}

/** The boots by URL, variant and visit (`group`), over the rounds: when the lobby was revealed, when the fight's
 *  programs were warm behind it, when the workers' maps were done, the lobby's frames a second, and how long each
 *  step took, each the median and the range. */
export function bootRoundsText(measures) {
  const groups = new Map();
  for (const measure of measures) {
    if (!groups.has(measure.group)) groups.set(measure.group, []);
    groups.get(measure.group).push(measure);
  }
  const rows = [...groups].flatMap(([group, boots]) => {
    const revealed = boots.map((boot) => boot.findings.revealedAt).filter((at) => at !== null);
    const names = [...new Set(boots.flatMap((boot) => boot.findings.steps.map((step) => step.name)))];
    const stepRows = names.map((name) => {
      const lengths = boots.flatMap((boot) => boot.findings.steps.filter((step) => step.name === name))
        .map((step) => step.ms);
      return `    ${name}: ${secondsText(lengths)}`;
    });
    const head = revealed.length ? `the lobby revealed at ${secondsText(revealed)}` : 'the lobby never revealed';
    const mapsDone = boots.map((boot) => boot.findings.maps?.to).filter((at) => at !== undefined);
    const mapsRow = mapsDone.length ? [`    the workers' maps done at ${secondsText(mapsDone)}`] : [];
    const warm = boots.map((boot) => boot.findings.warmAt).filter((at) => at);
    const pressed = boots.filter((boot) => boot.findings.pressedAt && boot.findings.warmAt);
    const barShown = pressed.map(({ findings }) => findings.warmAt - findings.pressedAt);
    const barText = pressed.length
      ? ` (${pressed.length} cold: Start pressed, its bar shown ${secondsText(barShown)})`
      : '';
    const warmRow = warm.length ? [`    the fight warm at ${secondsText(warm)}${barText}`] : [];
    const exits = boots.map((boot) => boot.findings.exit).filter(Boolean);
    const exitRow = exits.length ? [`    the loading screen left: ${exitsText(exits)}`] : [];
    const gone = boots.map((boot) => goneAfter(boot.findings)).filter((after) => after !== null);
    const goneRow = gone.length ? [`    the loading screen gone ${secondsText(gone)} after the reveal`] : [];
    const films = boots.map((boot) => boot.findings.film).filter(Boolean);
    const flickers = films.map((film) => film.flickers.length).join(', ');
    const filmRow = films.length ? [`    the exit's flickers, boot by boot: ${flickers}`] : [];
    const lobbies = boots.map((boot) => boot.findings.lobby).filter(Boolean);
    const lobbyRow = lobbies.length ? [lobbyRoundsLine(lobbies)] : [];
    const title = `  ${group}: ${boots.length} boots; ${head}`;
    return [title, ...warmRow, ...mapsRow, ...exitRow, ...goneRow, ...filmRow, ...lobbyRow, ...stepRows];
  });
  return ['boots by URL and visit, over the rounds:', ...rows].join('\n');
}
