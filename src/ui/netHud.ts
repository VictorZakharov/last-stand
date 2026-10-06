// Optional network overlay (pause menu, persisted in a cookie): the room, each relay and each
// partner's link as it stands, and the network report (net/netlog) to copy or share when a
// partner can't connect. The co-op dialog offers the report too.
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

const STATE_CLASS: Record<string, string> = { open: 'ok', connected: 'ok', connecting: 'wait', checking: 'wait', new: 'wait', closed: 'bad', failed: 'bad', disconnected: 'bad', 'not opened': 'bad' };

function draw(): void {
  const s = netSummary();
  const open = s.relays.filter((r) => r.state === 'open').length;
  const room = session.status === 'off' ? 'No room' : `Room <b>${esc(session.code)}</b> · ${esc(session.status)}`;
  body.innerHTML = `
    <div class="nt-head">${room}</div>
    <div class="nt-sec">Relays ${s.relays.length ? `<b>${open}</b>/${s.relays.length} open` : '–'}</div>
    <ul class="nt-relays">${s.relays.map((r) => `<li class="${STATE_CLASS[r.state] ?? ''}" title="${esc(r.state)}">${esc(r.name)}</li>`).join('')}</ul>
    <div class="nt-sec">Links</div>
    <ul class="nt-links">${s.conns.length ? s.conns.map((c) => `<li class="${STATE_CLASS[c.state] ?? ''}"><b>${esc(c.name)}</b> ${esc(c.state)}${c.rtt !== null ? ` · ${c.rtt.toFixed(0)} ms` : ''}${c.path ? `<small>${esc(c.path)}</small>` : ''}</li>`).join('') : '<li>none yet</li>'}</ul>
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
  root.querySelectorAll<HTMLElement>('[data-net]').forEach((b) => { b.onclick = () => void sendReport(b.dataset.net as 'copy' | 'share', b); });
}
