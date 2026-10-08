// Co-op UI: the "Play together" room dialog, the lobby's room bar, and in a run the partners'
// frames and nameplates, the downed state and the revive prompt.
import { G } from '../state';
import { COOP } from '../data/balance';
import { session, hostRoom, joinRoom, leaveRoom, inviteLink, partners } from '../net/session';
import { serverUp, SERVER_DOWN } from '../net/transport';
import { isCoop } from '../net/role';
import { addAnchored, removeAnchored, project } from './floaters';
import { renderLobbyOptions } from './menus';
import { openSaves } from './saves';
import { isTouch } from './touch';
import { sfx } from '../core/audio';
import { reportLinks, bindReportLinks } from './netHud';
import type { Player } from '../entities/player';

const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document): T => root.querySelector<T>(s)!;
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const who = (p: Player): string => `${p.slot === 0 ? 'Host' : 'Partner'} · ${p.cls.name}`;

let touchRevive = false;
/** Whether the touch revive button is held. */
export const touchReviving = (): boolean => touchRevive;

export function initCoop(): void {
  $('#btn-coop').onclick = () => { sfx.click(); openCoop(true); };
  $('#btn-coop-close').onclick = () => { sfx.click(); openCoop(false); };
  $('#coop').onclick = (e) => { if (e.target === $('#coop')) openCoop(false); };
  const rv = $('#btn-revive');
  const hold = (on: boolean) => (e: Event) => { e.preventDefault(); touchRevive = on; };
  rv.addEventListener('pointerdown', hold(true));
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) rv.addEventListener(ev, hold(false));
  renderCoop();
}

/** the co-op server as last checked: asked each time the dialog opens with no room */
let server: 'checking' | 'up' | 'down' = 'checking';
let checkNo = 0;
async function checkServer(): Promise<void> {
  const n = ++checkNo;
  server = 'checking';
  renderCoop();
  const up = await serverUp();
  if (n !== checkNo) return;
  server = up ? 'up' : 'down';
  renderCoop();
}

function openCoop(open: boolean): void {
  $('#coop').classList.toggle('hidden', !open);
  if (!open) return;
  if (session.status === 'off' || session.status === 'failed') void checkServer();
  else renderCoop();
}

/** The room dialog and the lobby's room bar, for the session as it stands. */
export function renderCoop(): void {
  renderLobbyOptions();
  renderBar();
  const body = $('#coop .coop-body');
  const others = partners();
  const s = session.status;
  if (s === 'off' || s === 'failed') {
    body.innerHTML = `
      <p class="coop-intro">Fight side by side over the internet, up to ${COOP.maxPlayers} heroes. Each brings their own hero and gear and keeps their own spoils.</p>
      <p class="coop-intro">Starting over together? <button class="link coop-saves">Pick an empty save slot</button> first: your saved heroes stay as they are.</p>
      ${server === 'down' ? `<div class="coop-offline" role="status"><p>${esc(SERVER_DOWN)}</p><button class="btn" id="btn-coop-retry">Try again</button></div>`
        : server === 'checking' ? '<p class="coop-checking" role="status">Checking the co-op server…</p>'
        : s === 'failed' ? `<p class="coop-error">${esc(session.error)}</p>` : ''}
      <div class="coop-choice${server === 'up' ? '' : ' off'}">
        <div class="coop-col"><div class="coop-h">Host</div><p>Open a room and send your friend the link.</p>
          <button class="btn primary" id="btn-coop-host"${server === 'up' ? '' : ' disabled'}>Open a room</button></div>
        <div class="coop-col"><div class="coop-h">Join</div><p>Enter the code your friend sent.</p>
          <form class="coop-join"><input id="coop-code" maxlength="8" placeholder="CODE" autocomplete="off" spellcheck="false" aria-label="Room code"${server === 'up' ? '' : ' disabled'}><button class="btn" type="submit"${server === 'up' ? '' : ' disabled'}>Join</button></form></div>
      </div>
      ${reportLinks()}`;
    bindReportLinks(body);
    $('#btn-coop-host', body).onclick = () => { if (server !== 'up') return; sfx.click(); void hostRoom(); };
    const retry = $('#btn-coop-retry', body) as HTMLElement | null;
    if (retry) retry.onclick = () => { sfx.click(); void checkServer(); };
    $('.coop-saves', body).onclick = () => { sfx.click(); openCoop(false); openSaves(true); };
    $<HTMLFormElement>('.coop-join', body).onsubmit = (e) => {
      e.preventDefault();
      const code = $<HTMLInputElement>('#coop-code', body).value.trim();
      if (code.length >= 4 && server === 'up') { sfx.click(); void joinRoom(code); }
    };
    return;
  }
  if (s === 'joining') {
    body.innerHTML = `<p class="coop-wait">Joining room <b class="coop-code">${esc(session.code)}</b>…</p>
      <p class="coop-intro">Finding the host on the co-op server.</p>
      <button class="btn" id="btn-coop-leave">Cancel</button>
      ${reportLinks()}`;
  } else {
    const list = others.length
      ? others.map((p) => `<li><span class="coop-dot"></span>${esc(who(p))}</li>`).join('')
      : `<li class="coop-wait">Waiting for a friend to join…</li>`;
    body.innerHTML = `
      <div class="coop-room">Room <b class="coop-code">${esc(session.code)}</b></div>
      ${s === 'hosting' ? `<div class="coop-link"><input readonly value="${esc(inviteLink())}" aria-label="Invite link"><button class="btn" id="btn-coop-copy">Copy link</button></div>` : ''}
      <ul class="coop-list">${list}</ul>
      <p class="coop-intro">${s === 'hosting' ? 'You pick the battleground and start the run; your friends come along.' : 'The host picks the battleground and starts the run.'}
        After each wave everyone decides: bank and leave, or continue together.</p>
      <button class="btn danger" id="btn-coop-leave">Leave room</button>
      ${reportLinks()}`;
    const copy = $('#btn-coop-copy', body) as HTMLElement | null;
    if (copy) copy.onclick = () => {
      sfx.click();
      navigator.clipboard?.writeText(inviteLink()).then(() => { copy.textContent = 'Copied'; }, () => $<HTMLInputElement>('.coop-link input', body).select());
    };
  }
  bindReportLinks(body);
  $('#btn-coop-leave', body).onclick = () => { sfx.click(); leaveRoom(); };
}

/** The lobby's line about the room (hidden solo). */
function renderBar(): void {
  const bar = $('#coop-bar');
  bar.classList.toggle('hidden', session.status === 'off' || session.status === 'failed');
  const others = partners();
  const text = session.status === 'joining' ? `Joining room ${session.code}…`
    : others.length ? `With ${others.map((p) => p.cls.name).join(', ')}` : 'Waiting for a friend…';
  bar.innerHTML = `<span class="cb-room">Room <b>${esc(session.code)}</b></span><span class="cb-who">${esc(text)}</span>`;
  bar.onclick = () => { sfx.click(); openCoop(true); };
  $('#btn-coop').textContent = isCoop() ? 'Room' : 'Play together';
}

// --- in a run ------------------------------------------------------------------------------
/** A partner's nameplate over their head, and their frame in the corner. */
interface Tag { el: HTMLElement; fill: HTMLElement; frame: HTMLElement; frameFill: HTMLElement; state: HTMLElement }
const tags = new Map<Player, Tag>();
/** the marker on a downed partner: over them, or at the screen's edge pointing the way to them; and in reach of
 *  them, the prompt to raise them */
let downMark: HTMLElement | null = null;
let raisePrompt: HTMLElement | null = null;
/** the whole seconds the marker last showed, so it beats as each one goes */
let shownSecond = -1;
/** how high over a downed body its marker floats, m (lower, it hid the body from the top-down view) */
const MARK_HEIGHT = 2.1;
/** the seconds left from which the marker beats harder */
const HURRY = 8;

/** how far in from the screen's edges a downed partner's marker's ring stays (px, at the HUD's scale): its arrow clear
 *  of the hotbar and the wave's badge */
const EDGE = { side: 80, top: 120, bottom: 185 };
/** the ring's radius (px, at the HUD's scale): the marker is placed by its ring's middle */
const RING = 38;

function markFor(): HTMLElement {
  if (downMark) return downMark;
  const el = document.createElement('div');
  el.className = 'dnmark hidden';
  el.innerHTML = '<div class="dm-ring"><div class="dm-raise"></div><b></b><div class="dm-arrow"></div></div><span class="dm-what"></span><span class="dm-far"></span>';
  $('#hud').appendChild(el);
  downMark = el;
  return el;
}

function promptFor(): HTMLElement {
  if (raisePrompt) return raisePrompt;
  const el = document.createElement('div');
  el.className = 'rvprompt hidden';
  el.innerHTML = '<div class="rp-line"><kbd>E</kbd><span>Hold to revive</span></div><div class="rp-bar"><div></div></div>';
  $('#hud').appendChild(el);
  raisePrompt = el;
  return el;
}

/** In reach of a downed partner (keyboard and mouse: touch has its button), the prompt to hold E, and the revive. */
function promptRaise(downed: Player | undefined, near: boolean): void {
  const el = promptFor();
  const shown = !!downed && near && !isTouch();
  el.classList.toggle('hidden', !shown);
  if (!shown) return;
  $('span', el).textContent = downed.revive > 0 ? `Reviving the ${downed.cls.name}…` : `Hold to revive the ${downed.cls.name}`;
  $('.rp-bar div', el).style.width = `${(downed.revive * 100).toFixed(0)}%`;
}

/** The marker beats once as each second of a downed partner's clock goes, harder near its end (a heartbeat: the
 *  animation restarted by swapping between two copies of it). */
function beat(el: HTMLElement, second: number): void {
  if (second === shownSecond) return;
  const first = shownSecond < 0;
  shownSecond = second;
  if (first) return;
  el.classList.toggle('beat-b', !el.classList.contains('beat-b'));
  el.classList.add('beating');
  el.classList.toggle('hurry', second <= HURRY);
}

/**
 * A downed partner's marker, every frame: over them where the view shows them, else at the screen's edge on the way to
 * them with an arrow pointing there; their clock running out round its ring, the revive filling it, how far they are.
 * (A small ring over the body alone was lost from sight as soon as the body was off screen.)
 */
function markDowned(downed: Player | undefined, near: boolean): void {
  const el = markFor();
  el.classList.toggle('hidden', !downed);
  if (!downed) {
    shownSecond = -1;
    return;
  }
  const me = G.player;
  // (the HUD's scale as ui/scale sets it on the root: read from its own style, no style recalc)
  const ui = parseFloat(document.documentElement.style.getPropertyValue('--hud')) || 1;
  const w = window.innerWidth, h = window.innerHeight;
  const p = project(downed.pos.x, downed.obj.position.y + MARK_HEIGHT, downed.pos.z);
  const left = EDGE.side * ui, right = w - EDGE.side * ui, top = EDGE.top * ui, bottom = h - EDGE.bottom * ui;
  const inView = !p.behind && p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
  let x = p.x, y = p.y;
  if (!inView) {
    // along the way from the middle of the screen to them (behind the camera, the projection points the other way)
    const cx = w / 2, cy = (top + bottom) / 2;
    let dx = (p.x - cx) * (p.behind ? -1 : 1), dy = (p.y - cy) * (p.behind ? -1 : 1);
    if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) dy = 1;
    const reach = Math.min(Math.abs(dx) > 1e-3 ? (right - cx) / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-3 ? (bottom - cy) / Math.abs(dy) : Infinity);
    x = cx + dx * reach;
    y = cy + dy * reach;
    el.style.setProperty('--turn', `${Math.atan2(dy, dx)}rad`);
  }
  el.classList.toggle('edge', !inView);
  // (pointing down, its words go above the ring, out of the arrow's way)
  const above = !inView && Math.abs(y - bottom) < 1;
  el.classList.toggle('above', above);
  const ring = RING * ui;
  el.style.transform = `translate(${x}px, ${y}px) translate(-50%, ${above ? `calc(-100% + ${ring}px)` : `${-ring}px`})`;
  const bleedLeft = Math.max(0, downed.bleed);
  $('.dm-ring', el).style.setProperty('--p', `${((bleedLeft / COOP.bleedOut) * 100).toFixed(1)}%`);
  $('.dm-raise', el).style.setProperty('--r', `${(downed.revive * 100).toFixed(0)}%`);
  const second = Math.ceil(bleedLeft);
  $('b', el).textContent = String(second);
  // (while someone raises them their clock stops, and so does the beat)
  beat(el, second);
  el.classList.toggle('raising', downed.revive > 0);
  el.classList.toggle('near', near);
  const what = near ? (isTouch() ? 'Hold Revive' : 'Hold E') : downed.revive > 0 ? 'Being raised' : `${downed.cls.name} is down`;
  $('.dm-what', el).textContent = what;
  $('.dm-far', el).textContent = `${Math.round(Math.hypot(downed.pos.x - me.pos.x, downed.pos.z - me.pos.z))} m`;
}

function tagFor(p: Player): Tag {
  let t = tags.get(p);
  if (t) return t;
  const el = document.createElement('div');
  el.className = 'ptag';
  el.innerHTML = `<div class="ptag-name">${esc(p.cls.name)}</div><div class="etrack"><div class="efill"></div></div>`;
  const frame = document.createElement('div');
  frame.className = 'pf';
  frame.innerHTML = `<div class="pf-name">${esc(who(p))}</div><div class="pf-bar"><div class="pf-fill"></div></div><div class="pf-state"></div>`;
  $('#party').appendChild(frame);
  t = { el, fill: $('.efill', el), frame, frameFill: $('.pf-fill', frame), state: $('.pf-state', frame) };
  // over the head (a downed partner has the revive prompt instead)
  addAnchored(el, () => (G.players.includes(p) && !p.away && p.obj.visible && G.mode === 'run' && p.alive
    ? { x: p.pos.x, y: p.obj.position.y + p.model.height + 0.45, z: p.pos.z } : null));
  tags.set(p, t);
  return t;
}

/** Every frame of a co-op run: the party frame, nameplates, the downed note and the revive prompt. */
export function updateCoopHud(): void {
  // partners gone from the room take their nameplate and frame with them
  for (const [p, t] of tags) if (!G.players.includes(p)) { removeAnchored(t.el); t.frame.remove(); tags.delete(p); }
  if (!isCoop()) { hideRunBits(); return; }
  // out of the run and watching: our bars, skills and spoils have nothing more to show
  $('#hud').classList.toggle('watching', !!G.player.out);
  const others = G.players.filter((p) => !p.local);
  for (const p of others) {
    const t = tagFor(p);
    const w = `${(Math.max(0, p.life / p.stats.maxLife) * 100).toFixed(1)}%`;
    t.fill.style.width = t.frameFill.style.width = w;
    const state = p.away ? 'In the lobby' : p.out === 'banked' ? 'Banked' : p.out === 'dead' ? 'Fallen'
      : p.downed ? (p.revive > 0 ? 'Being revived…' : `Down · ${Math.ceil(p.bleed)}s`) : '';
    if (t.state.textContent !== state) t.state.textContent = state;
    t.frame.classList.toggle('down', p.downed);
    t.frame.classList.toggle('out', !!p.out || p.away);
  }


  // down: how long is left, and that a teammate can help
  const me = G.player;
  const note = $('#down-note');
  note.classList.toggle('hidden', !me.downed);
  if (me.downed) {
    note.innerHTML = `<b>You are down</b><span>${me.revive > 0 ? 'Your partner is raising you…' : `Bleeding out in ${Math.ceil(me.bleed)}s. A teammate can revive you.`}</span>
      <div class="dn-bar"><div style="width:${(me.revive * 100).toFixed(0)}%"></div></div>`;
  }

  // watching the rest of the run
  const watching = me.out && G.run && G.run.phase !== 'over' ? others.find((p) => p.inRun) : undefined;
  const spec = $('#spectate');
  spec.classList.toggle('hidden', !watching || !$('#summary').classList.contains('hidden'));
  if (watching) spec.textContent = `Watching the ${watching.cls.name}`;

  // a downed partner: the marker on them (or at the screen's edge), and on touch the button to hold
  const downed = me.active ? others.find((p) => p.downed && p.inRun) : undefined;
  const near = !!downed && Math.hypot(downed.pos.x - me.pos.x, downed.pos.z - me.pos.z) < COOP.reviveRange;
  markDowned(downed, near);
  promptRaise(downed, near);
  const rv = $('#btn-revive');
  rv.classList.toggle('hidden', !(near && isTouch()));
  if (!near) touchRevive = false;
}

function hideRunBits(): void {
  $('#hud').classList.remove('watching');

  $('#down-note').classList.add('hidden');
  $('#spectate').classList.add('hidden');
  $('#btn-revive').classList.add('hidden');
  downMark?.classList.add('hidden');
  raisePrompt?.classList.add('hidden');
  shownSecond = -1;
}

/** The decision panel's line about the partners: who is still deciding, who continues, who left. */
export function partyDecision(): string {
  if (!isCoop() || !G.run) return '';
  const r = G.run;
  const rows = G.players.filter((p) => !p.local && !p.away).map((p) => {
    const s = p.out === 'banked' ? 'banked and left' : p.out === 'dead' ? 'fell' : r.votes.has(p.slot) ? 'continues' : 'is deciding…';
    return `${p.slot === 0 ? 'The host' : 'Your partner'} (${p.cls.name}) ${s}`;
  });
  return rows.join(' · ');
}

/** Waiting on the others after choosing Continue. */
export const waitingForParty = (): boolean => !!G.run && isCoop() && G.run.votes.has(G.player.slot);

