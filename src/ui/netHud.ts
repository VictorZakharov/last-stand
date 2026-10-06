// Optional network overlay (pause menu, persisted in a cookie): the room, the link to the relay server and the
// partners as they stand, and the network report (net/netlog) to copy or share when a partner can't connect. The co-op
// dialog offers the report too.
import { readCookie, writeCookie } from '../core/cookies';
import { netReport, netSummary } from '../net/netlog';
import { session } from '../net/session';
import { role } from '../net/role';

declare const __BUILD__: { ref: string; time: string };

const COOKIE = 'last-stand-net-hud';
const REDRAW_MS = 500;

let enabled = false;
let el: HTMLElement;
let body: HTMLElement;
let timer: ReturnType<typeof setInterval> | undefined;

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const canShare = (): boolean => typeof navigator.share === 'function';

export function initNetHud(): void {
  el = document.querySelector<HTMLElement>('#net')!;
  // the buttons stay put while the rest redraws, so what they say after a click is seen
  el.innerHTML = `<div class="nt-body"></div>
    <div class="nt-acts"><button class="link" data-net="copy">Copy log</button>${canShare() ? '<button class="link" data-net="share">Send log</button>' : ''}</div>`;
  body = el.querySelector<HTMLElement>('.nt-body')!;
  bindReportLinks(el);
  setNetHud(readCookie(COOKIE) === '1', false);
}

export const netHudEnabled = (): boolean => enabled;

export function setNetHud(on: boolean, persist = true): void {
  enabled = on;
  el.classList.toggle('hidden', !on);
  clearInterval(timer);
  if (on) { draw(); timer = setInterval(draw, REDRAW_MS); }
  if (persist) writeCookie(COOKIE, on ? '1' : '0');
}

const STATE_CLASS: Record<string, string> = { open: 'ok', connecting: 'wait', closed: 'bad' };

function draw(): void {
  const s = netSummary();
  const room = session.status === 'off' ? 'No room' : `Room <b>${esc(session.code)}</b> · ${esc(session.status)}`;
  const sv = s.server, peers = [...session.peers.values()];
  body.innerHTML = `
    <div class="nt-head">${room}</div>
    <div class="nt-sec">Server</div>
    <ul class="nt-links">${sv ? `<li class="${STATE_CLASS[sv.state] ?? ''}"><b>${esc(sv.host)}</b> ${esc(sv.state)}${sv.rtt !== null ? ` · ${sv.rtt.toFixed(0)} ms` : ''}${sv.dropped ? `<small>dropped ${sv.dropped}x</small>` : ''}</li>` : '<li>–</li>'}</ul>
    <div class="nt-sec">Partners</div>
    <ul class="nt-links">${peers.length ? peers.map((p) => `<li class="ok"><b>${esc(p.id.slice(0, 6))}</b> slot ${p.slot}${p.inRun ? ' · in run' : ''}</li>`).join('') : '<li>none yet</li>'}</ul>
    <div class="nt-sub">Messages in ${s.msgs.in} · out ${s.msgs.out}</div>`;
}

const report = (): string => netReport([
  `Time ${new Date().toISOString()} | build ${__BUILD__.ref} (${__BUILD__.time})`,
  `Page ${location.origin}${location.pathname}${location.search}`,
  `Session ${session.status}${session.code ? ` room ${session.code}` : ''} | role ${role.current}${session.error ? ` | error: ${session.error}` : ''}`,
  `Partners ${[...session.peers.values()].map((p) => `${p.id.slice(0, 6)} slot ${p.slot}${p.inRun ? ' in run' : ''}`).join(', ') || 'none'}`,
]);

/** Copy the network report to the clipboard, or hand it to the system's share sheet (a chat app). */
export async function sendReport(how: 'copy' | 'share', btn: HTMLElement): Promise<void> {
  const text = report();
  const label = btn.textContent;
  let done = 'Copied';
  try {
    if (how === 'share' && canShare()) { await navigator.share({ title: 'Last Stand network log', text }); done = 'Sent'; }
    else await navigator.clipboard.writeText(text);
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
    // no clipboard (an insecure page, a denied permission): the copy that always works
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    done = document.execCommand('copy') ? 'Copied' : 'Copy failed';
    ta.remove();
  }
  btn.textContent = done;
  setTimeout(() => { btn.textContent = label; }, 1600);
}

/** The co-op dialog's links to the report. */
export const reportLinks = (): string =>
  `<p class="coop-netlog">Trouble connecting? <button class="link" data-net="copy">Copy the network log</button>${canShare() ? ' or <button class="link" data-net="share">send it</button>' : ''} to whoever runs the game.</p>`;

export function bindReportLinks(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-net]').forEach((b) => {
    b.onclick = () => void sendReport(b.dataset.net as 'copy' | 'share', b);
  });
}
