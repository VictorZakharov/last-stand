// `lab recorder`'s freeze report (#567): under Slow-game reports' Ask, a freeze (one frame of 1.2 s, the lab's clock
// jumped) must be sent without asking, at the next calm moment, to the lab's own traces service, and the player told
// so with its code; then a stretch that's slow but not severe (three stalls of 0.3 s) must still ask first; and for a
// player who never chose (Always, the default), the same stalls must be sent without asking, the player told. Its
// canary has the game judge the freeze as the game did before (`wanted` told nothing of the stretch: a freeze asked
// like any slow stretch), which must be caught as asked, not sent.
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { recorder } from '../../../src/perf/recorder';
import { keepTraceState, keptTraceState, putAway, setTraceTarget, traceState } from '../../../src/perf/consent';

/** the freeze planted (ms: over the detector's `BIG_STALL_MS`), and the stalls that are slow but not severe */
const FREEZE_MS = 1200;
const STALL_MS = 300;
const STALLS = 3;
/** frames between the stalls, and played after a stretch for the detector to judge it (it judges once a second) */
const BETWEEN = 20;
const JUDGED = 90;
/** how long a stretch may take to be sent or asked about (ms, the browser's clock): the calm's 1.5 s, the packing,
 *  the send, and the prompt's look once a second */
const WAIT_MS = 15_000;

/** A frame `ms` long: the lab's clock jumped, as a frame the page held up that long. */
async function longFrame(lab: Lab, ms: number): Promise<void> {
  window.__labClock.t += ms - window.__labClock.frame;
  await lab.step(1);
}

/** Frames played, with the browser's own time passing between them (the prompt looks once a second by a timer), until
 *  `done` or `WAIT_MS`; whether it came. */
async function playUntil(lab: Lab, done: () => boolean): Promise<boolean> {
  const until = window.__labClock.realNow() + WAIT_MS;
  while (window.__labClock.realNow() < until) {
    if (done()) return true;
    await lab.step(10);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return done();
}

/** `STALLS` stalls of `STALL_MS`, slow but not severe, and the frames the detector needs to judge them. */
async function stalls(lab: Lab): Promise<void> {
  await lab.step(BETWEEN);
  for (let i = 0; i < STALLS; i++) {
    await longFrame(lab, STALL_MS);
    await lab.step(BETWEEN);
  }
  await lab.step(JUDGED);
}

export interface FreezeFound { lines: string[]; problems: string[] }

/** The freeze sent and the milder stretch asked about, under Ask (`canary`: the freeze judged as before #567). */
export async function freezeReport(lab: Lab, send: string, canary: boolean): Promise<FreezeFound> {
  const keptBefore = keptTraceState();
  const wanted = recorder.wanted;
  const phase = G.run?.phase;
  const lines: string[] = [];
  const problems: string[] = [];
  keepTraceState(JSON.stringify({ consent: 'ask', refusals: 0, sent: [] }));
  setTraceTarget(send);
  if (canary) recorder.wanted = () => wanted(null);
  // (a calm moment: the prompt and the send wait for one, never mid-fight)
  if (G.run) G.run.phase = 'cleared';
  putAway();
  try {
    await lab.step(BETWEEN);
    await longFrame(lab, FREEZE_MS);
    await lab.step(JUDGED);
    let asked = false;
    const sent = await playUntil(lab, () => {
      const s = traceState();
      asked ||= s.prompt.includes('asking');
      return s.prompt === 'sent';
    });
    const after = traceState();
    const code = /code: (\S+?)\./.exec(after.note)?.[1] ?? '';
    lines.push(`  a ${(FREEZE_MS / 1000).toFixed(1)} s freeze under Ask: ${sent ? `sent without asking, code ${code}` : asked ? 'asked, not sent' : 'nothing'}`
      + `${sent ? `; the player told: "${after.note}"` : ''}`);
    if (!sent) problems.push(`a ${FREEZE_MS / 1000} s freeze under Ask was ${asked ? 'asked about, not sent without asking' : 'never sent'}`);
    if (sent && asked) problems.push('a freeze under Ask was asked about before it was sent');
    if (sent && (!code || !after.note.includes('froze'))) problems.push(`the player wasn't told the freeze's report was sent, with its code ("${after.note}")`);
    if (sent && after.sent !== 1) problems.push(`the freeze's send counted ${after.sent} against the day's, not 1`);
    putAway();

    // slow, not severe: asked first
    await stalls(lab);
    const askedMild = await playUntil(lab, () => traceState().prompt.includes('asking'));
    const mild = traceState();
    lines.push(`  ${STALLS} stalls of ${(STALL_MS / 1000).toFixed(1)} s under Ask: ${askedMild ? 'asked first' : `not asked (${mild.prompt})`}, ${mild.sent - (sent ? 1 : 0)} sent`);
    if (!askedMild) problems.push(`${STALLS} stalls of ${STALL_MS / 1000} s under Ask were never asked about`);
    if (mild.sent > (sent ? 1 : 0)) problems.push(`${STALLS} stalls of ${STALL_MS / 1000} s under Ask were sent without asking`);
    putAway();

    // a player who never chose: sent by default, without asking
    keepTraceState(null);
    await stalls(lab);
    let askedDefault = false;
    const sentDefault = await playUntil(lab, () => {
      const s = traceState();
      askedDefault ||= s.prompt.includes('asking');
      return s.prompt === 'sent';
    });
    const byDefault = traceState();
    lines.push(`  ${STALLS} stalls of ${(STALL_MS / 1000).toFixed(1)} s, never chosen (${byDefault.consent}): `
      + `${sentDefault ? `sent without asking; the player told: "${byDefault.note}"` : askedDefault ? 'asked, not sent' : 'nothing'}`);
    if (byDefault.consent !== 'always') problems.push(`a player who never chose is on ${byDefault.consent}, not Always`);
    if (!sentDefault || askedDefault) problems.push(`slow play was ${askedDefault ? 'asked about' : 'never sent'} for a player who never chose, not sent by default`);
    else if (!/code: \S+/.test(byDefault.note)) problems.push(`the player wasn't told the default report was sent, with its code ("${byDefault.note}")`);
  } finally {
    putAway();
    recorder.release();
    recorder.wanted = wanted;
    setTraceTarget(undefined);
    keepTraceState(keptBefore);
    if (G.run && phase) G.run.phase = phase;
  }
  return { lines, problems };
}
