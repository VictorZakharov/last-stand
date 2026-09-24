// Co-op UI: the "Play together" room dialog, the lobby's room bar, and in a run the partners'
// frames and nameplates, the downed state and the revive prompt.
import { G } from '../state';
import { COOP } from '../data/balance';
import { session, hostRoom, joinRoom, leaveRoom, inviteLink, partners } from '../net/session';
import { isCoop } from '../net/role';
import { addAnchored, removeAnchored } from './floaters';
import { renderLobbyOptions } from './menus';
import { isTouch } from './touch';
import { sfx } from '../core/audio';
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

function openCoop(open: boolean): void {
  $('#coop').classList.toggle('hidden', !open);
  if (open) renderCoop();
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
      ${s === 'failed' ? `<p class="coop-error">${esc(session.error)}</p>` : ''}
      <div class="coop-choice">
        <div class="coop-col"><div class="coop-h">Host</div><p>Open a room and send your friend the link.</p>
          <button class="btn primary" id="btn-coop-host">Open a room</button></div>
        <div class="coop-col"><div class="coop-h">Join</div><p>Enter the code your friend sent.</p>
          <form class="coop-join"><input id="coop-code" maxlength="8" placeholder="CODE" autocomplete="off" spellcheck="false" aria-label="Room code"><button class="btn" type="submit">Join</button></form></div>
      </div>`;
    $('#btn-coop-host', body).onclick = () => { sfx.click(); void hostRoom(); };
    $<HTMLFormElement>('.coop-join', body).onsubmit = (e) => {
      e.preventDefault();
      const code = $<HTMLInputElement>('#coop-code', body).value.trim();
      if (code.length >= 4) { sfx.click(); void joinRoom(code); }
    };
    return;
  }
  if (s === 'joining') {
    body.innerHTML = `<p class="coop-wait">Joining room <b class="coop-code">${esc(session.code)}</b>…</p>
      <p class="coop-intro">Finding the host through public relays. This can take a few seconds.</p>
      <button class="btn" id="btn-coop-leave">Cancel</button>`;
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
      <button class="btn danger" id="btn-coop-leave">Leave room</button>`;
    const copy = $('#btn-coop-copy', body) as HTMLElement | null;
    if (copy) copy.onclick = () => {
      sfx.click();
      navigator.clipboard?.writeText(inviteLink()).then(() => { copy.textContent = 'Copied'; }, () => $<HTMLInputElement>('.coop-link input', body).select());
    };
  }
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
let reviveTag: HTMLElement | null = null;
let reviveFor: Player | null = null;

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

  // a downed partner: the prompt over them, and on touch the button to hold
  const downed = me.active ? others.find((p) => p.downed && p.inRun) : undefined;
  const near = downed && Math.hypot(downed.pos.x - me.pos.x, downed.pos.z - me.pos.z) < COOP.reviveRange;
  if (downed !== reviveFor) {
    removeAnchored(reviveTag);
    reviveTag = null;
    reviveFor = downed ?? null;
    if (downed) {
      const el = document.createElement('div');
      el.className = 'rvtag';
      el.innerHTML = '<div class="rv-ring"></div><span></span>';
      reviveTag = addAnchored(el, () => (G.mode === 'run' && reviveFor?.downed ? { x: downed.pos.x, y: 0.6, z: downed.pos.z } : null));
    }
  }
  if (reviveTag && downed) {
    $('.rv-ring', reviveTag).style.setProperty('--p', `${(downed.revive * 100).toFixed(0)}%`);
    $('span', reviveTag).textContent = near ? (isTouch() ? 'Hold Revive' : 'Hold E to revive') : 'Down: go to them';
  }
  const rv = $('#btn-revive');
  rv.classList.toggle('hidden', !(near && isTouch()));
  if (!near) touchRevive = false;
}

function hideRunBits(): void {
  $('#hud').classList.remove('watching');

  $('#down-note').classList.add('hidden');
  $('#spectate').classList.add('hidden');
  $('#btn-revive').classList.add('hidden');
  removeAnchored(reviveTag);
  reviveTag = null;
  reviveFor = null;
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

