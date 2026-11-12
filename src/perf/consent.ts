// Asking the player before a trace is sent (src/perf/AGENTS.md). A slow stretch the recorder found waits for a moment
// that isn't a fight (the choice after a wave, the summary, the lobby, the hero selection screen), then the player is
// asked in a small prompt that blocks nothing: Send, Not now or Always. Always is kept and sends from then on without
// asking (the pause menu's Slow-game reports turns it back, or off); Not now asks no more this session, and after
// three the game stops asking. A severe stretch (a freeze of a second or more, or a 1% low under 15 frames a second:
// `severe` in detect.ts) is sent without asking under Ask too, and the player told it was, with its code (from play,
// #567: "if game detects lag/freezes, it should send report automatically"); Off sends nothing, and a player who said
// Not now three times isn't sent one either. However asked, a game sends at most 10 in any 24 hours, kept across
// reloads (the traces server holds each address to the same), and none without asking within 10 minutes of the last.
// In co-op each game asks its own player about its own frames.
import { G } from '../state';
import { sfx } from '../core/audio';
import { isReadying } from '../game/warm';
import { recorder, type Slow } from './recorder';
import { severe, type Verdict } from './detect';
import { canSend, packTrace, sendTrace, type Sent } from './upload';

/** what the player chose: asked each time, sent without asking, or never */
export type TraceConsent = 'ask' | 'always' | 'off';
/** what's kept: the choice, the Not nows, and when each send in the last day was tried (ms since 1970) */
interface Kept { consent: TraceConsent; refusals: number; sent: number[] }

const KEY = 'last-stand-perf-traces';
/** after this many Not nows the game stops asking */
const MOST_REFUSALS = 3;
/** at most this many sends in any `DAY_MS`, asked or not, and sent without asking this long apart (ms) */
export const MOST_A_DAY = 10;
const DAY_MS = 24 * 60 * 60_000;
const SENT_APART_MS = 10 * 60_000;
/** how often a waiting stretch looks for its moment (ms), how long after a moment starts it's shown (ms) */
const LOOK_EVERY_MS = 1000;
const CALM_MS = 1500;
/** the gap under the choice after a wave, the prompt's place while it shows (css px) */
const UNDER_GAP = 8;
/** how long the sent note stays (ms) */
const NOTE_MS = 9000;

let askedThisSession = false;
/** where reports go: the game's traces service, or a harness's own (`setTraceTarget`) */
let target: string | undefined;
/** Reports sent to `base` from now on (the lab's own traces service), or the game's again (undefined). */
export function setTraceTarget(base: string | undefined): void { target = base; }
let calmSince = 0, packing = false, sending = false, noteTimer = 0;
/** the stretch the player was asked about (shown again after a fight hid it) */
let askedFor: Slow | null = null;
let packed: { slow: Slow; body: Uint8Array } | null = null;

const $ = (s: string): HTMLElement => document.querySelector<HTMLElement>(s)!;

function kept(): Kept {
  try {
    const k = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Kept> | null;
    const consent = k?.consent === 'always' || k?.consent === 'off' ? k.consent : 'ask';
    const sent = Array.isArray(k?.sent) ? k.sent.filter((t) => typeof t === 'number' && Date.now() - t < DAY_MS) : [];
    return { consent, refusals: Number(k?.refusals) || 0, sent };
  } catch { return { consent: 'ask', refusals: 0, sent: [] }; }
}
function keep(k: Kept): void { try { localStorage.setItem(KEY, JSON.stringify(k)); } catch { /* private mode */ } }

export const traceConsent = (): TraceConsent => kept().consent;
/** The pause menu's choice: asking again starts the refusals over. */
export function setTraceConsent(consent: TraceConsent): void { keep({ ...kept(), consent, refusals: 0 }); }

/** Whether a slow stretch found now, judged `verdict`, could go anywhere: the recorder snapshots one only then. */
function wanted(verdict: Verdict | null): boolean {
  if (!canSend() || recorder.automaticSuppressed()) return false;
  const k = kept();
  if (k.consent === 'off' || k.sent.length >= MOST_A_DAY) return false;
  if (k.consent === 'always' || sentUnasked(k, verdict)) return Date.now() - Math.max(0, ...k.sent) > SENT_APART_MS;
  return !askedThisSession && k.refusals < MOST_REFUSALS;
}

/** Whether a stretch judged `verdict` goes without asking under Ask: a severe one, unless the player has said Not now
 *  three times (the game stops asking then, and doesn't send behind their back either). */
const sentUnasked = (k: Kept, verdict: Verdict | null): boolean =>
  k.consent === 'ask' && k.refusals < MOST_REFUSALS && severe(verdict);

/** A moment the prompt may show in: no fight, no loading bar, the tab in view, the pause menu shut. */
const calm = (): boolean =>
  !(G.mode === 'run' && G.run?.phase === 'fighting') && !isReadying() && !document.hidden && !G.menuOpen
  && !document.querySelector('#loading');

export function initTraceConsent(): void {
  recorder.wanted = wanted;
  const box = $('#perf-ask');
  box.querySelector<HTMLElement>('.pa-send')!.onclick = () => { sfx.click(); void send(); };
  box.querySelector<HTMLElement>('.pa-always')!.onclick = () => { sfx.click(); setTraceConsent('always'); void send(); };
  box.querySelector<HTMLElement>('.pa-later')!.onclick = () => {
    sfx.click();
    const k = kept();
    keep({ ...k, refusals: k.refusals + 1 });
    letGo();
  };
  box.querySelector<HTMLElement>('.pa-close')!.onclick = () => { sfx.click(); hide(); };
  setInterval(look, LOOK_EVERY_MS);
}

/** Each second: a waiting stretch shown (or sent) once a calm moment has lasted; hidden again if a fight starts. */
function look(): void {
  if (recorder.automaticSuppressed()) { letGo(); return; }
  const slow = recorder.pending();
  const box = $('#perf-ask');
  if (!slow) return;
  place();
  // (turned off in the pause menu while it waited)
  if (kept().consent === 'off') { letGo(); return; }
  if (!calm()) {
    calmSince = 0;
    if (box.classList.contains('asking')) box.classList.add('hidden');
    return;
  }
  calmSince ||= performance.now();
  if (performance.now() - calmSince < CALM_MS || packing || sending) return;
  if (askedFor === slow) { if (box.classList.contains('hidden')) box.className = 'asking'; return; }
  if (!wanted(slow.verdict)) { letGo(); return; }
  if (packed?.slow !== slow) { void pack(slow); return; }
  const k = kept();
  if (k.consent === 'always') void send();
  else if (sentUnasked(k, slow.verdict)) void send(true);
  else ask(slow, packed.body.length);
}

async function pack(slow: Slow): Promise<void> {
  packing = true;
  try {
    const body = await packTrace(slow);
    if (!recorder.automaticSuppressed() && recorder.pending() === slow) packed = { slow, body };
  } catch { letGo(); } finally { packing = false; }
}

/** what slowed, said to the player */
const WHERE: Record<Slow['scene'], string> = {
  boot: 'took long to load', readying: 'took long to get ready', heroes: 'ran slowly on the hero selection screen',
  lobby: 'ran slowly in the Sanctuary', fight: 'ran slowly in the fight', break: 'ran slowly',
  profile: 'was profiled',
};

function ask(slow: Slow, bytes: number): void {
  const box = $('#perf-ask');
  askedThisSession = true;
  askedFor = slow;
  box.querySelector('.pa-title')!.textContent = `The game ${WHERE[slow.scene]}`;
  box.querySelector('.pa-size')!.textContent = `${Math.max(1, Math.round(bytes / 1024))} KB`;
  box.className = 'asking';
  place();
}

/** what a report sent without asking under Ask found, said to the player */
const FOUND = (v: Verdict | null): string =>
  v && v.longest >= 1000 ? `The game froze for ${(v.longest / 1000).toFixed(1)} s` : 'The game ran very slowly';

/** The packed report sent; `unasked`: a severe stretch sent under Ask, the player told so and where to turn it off. */
async function send(unasked = false): Promise<void> {
  const box = $('#perf-ask');
  const body = packed?.body;
  if (!body || sending || recorder.automaticSuppressed()) return;
  sending = true;
  // (counted as it's tried: a send that fails still counts, so a failing one never repeats past the day's)
  const k = kept();
  keep({ ...k, sent: [...k.sent, Date.now()] });
  box.className = 'sending';
  box.querySelector('.pa-note')!.textContent = 'Sending the performance report...';
  const found = unasked ? FOUND(packed?.slow.verdict ?? null) : '';
  const sent = await sendTrace(body, target);
  sending = false;
  if (recorder.automaticSuppressed()) { letGo(); return; }
  box.querySelector('.pa-note')!.innerHTML = 'code' in sent
    ? unasked
      ? `${found}: a performance report was sent so it can be fixed. Its code: <b class="gold">${sent.code}</b>. `
        + 'Pause menu, Performance: Slow-game reports turns this off.'
      : `Performance report sent, thank you. Its code: <b class="gold">${sent.code}</b>`
    : `The performance report couldn't be sent (${sent.error}).`;
  box.className = 'sent';
  letGo(false);
  clearTimeout(noteTimer);
  noteTimer = window.setTimeout(hide, NOTE_MS);
}

/** The waiting stretch let go: the recorder may find the next. */
function letGo(close = true): void {
  packed = null;
  askedFor = null;
  recorder.release();
  if (close) hide();
}

/** The prompt at the top of the screen, or under the choice after a wave while it shows (both stand at the top
 *  middle: the prompt hid the choice's buttons). Its top is zoomed with it, so it's given in the UI's px. */
function place(): void {
  const choice = document.getElementById('decision');
  const under = choice && !choice.classList.contains('hidden') ? choice.getBoundingClientRect().bottom + UNDER_GAP : 0;
  $('#perf-ask').style.top = under > UNDER_GAP ? `calc(${Math.round(under)}px / var(--ui, 1))` : '';
}

function hide(): void { $('#perf-ask').className = 'hidden'; }

/** The prompt shown now over a snapshot of the last minute, for a harness (`lab ui --states perfAsk`): nothing is
 *  sent unless a button is pressed. */
export async function askNow(): Promise<void> {
  const slow: Slow = { scene: G.mode === 'run' ? 'break' : 'lobby', verdict: recorder.judged(), tookMs: 0, at: performance.now(), snapshot: recorder.snapshot() };
  packed = { slow, body: await packTrace(slow) };
  ask(slow, packed.body.length);
}

/** Where the reports stand (a harness's: `lab recorder`): what the player chose, the Not nows, and the sends in the last
 *  day; and the prompt's state now (`asking`, `sending`, `sent`, `hidden`) and its note. */
export function traceState(): { consent: TraceConsent; refusals: number; sent: number; prompt: string; note: string } {
  const k = kept(), box = $('#perf-ask');
  return { consent: k.consent, refusals: k.refusals, sent: k.sent.length, prompt: box.className || 'shown', note: box.querySelector('.pa-note')?.textContent ?? '' };
}

/** The kept choice put back as `k` was (a harness's, after it set its own). */
export function keepTraceState(k: string | null): void {
  try { if (k === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, k); } catch { /* private mode */ }
}
export const keptTraceState = (): string | null => { try { return localStorage.getItem(KEY); } catch { return null; } };

/** The prompt put away, as Not now does without counting it. */
export function putAway(): void { letGo(); }

/**
 * A profile (`profiler.ts`) sent as a performance report, its lines in it beside the last minute's frames: sent at
 * once where the player chose Always, else when they press Send under it (the press is their consent). Counted
 * against the day's sends either way, as every report is.
 */
export async function sendProfile(lines: string[]): Promise<Sent> {
  if (!canSend()) return { error: 'this browser can\'t send reports' };
  const k = kept();
  if (k.sent.length >= MOST_A_DAY) return { error: `${MOST_A_DAY} reports were sent in the last day` };
  keep({ ...k, sent: [...k.sent, Date.now()] });
  const slow: Slow = {
    scene: 'profile', verdict: null, tookMs: 0, at: performance.now(), snapshot: recorder.snapshot(), profile: lines,
  };
  return sendTrace(await packTrace(slow), target);
}
