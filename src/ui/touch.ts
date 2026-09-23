// Touch controls for phones and tablets: a floating move stick on the left half of the screen, the
// skill buttons in an arc at the bottom right, pinch to zoom and a pause button. It drives
// core/input like the keyboard and mouse do.
//
// Skill buttons: the basic attack and channelled skills act while held, aimed at the nearest foe.
// Other skills cast on release: at the nearest foe after a tap, or where the finger dragged to
// (an aim ring shows the spot). The mode follows the last input used, so touch laptops work too.
import * as THREE from 'three';
import { G } from '../state';
import { input } from '../core/input';
import { cameraYaw, zoomBy } from '../core/renderer';
import { additive } from '../core/materials';
import { groundHeight } from '../world/ground';
import { SKILL_KEYS } from '../loot/loadout';
import { makeSkillSlot } from './hud';
import { hideTooltip } from './tooltip';
import type { SkillKey } from '../types';

const $ = (s: string): HTMLElement => document.querySelector<HTMLElement>(s)!;

/** stick travel in px, and how far a skill drag must go before it aims by hand */
const STICK_R = 56, DRAG_MIN = 16;
/** px of skill drag per metre of aim distance, and the aim range */
const DRAG_PX_PER_M = 9, AIM_MIN = 2, AIM_MAX = 14;
/** foes this close are aimed at automatically */
const AUTO_RANGE = 22;
/** a released cast keeps its key down this long, in case the character is still busy */
const RELEASE_HOLD = 0.35;

interface Stick { id: number; x0: number; y0: number }
interface Press { id: number; key: SkillKey; x0: number; y0: number; dx: number; dy: number; dragged: boolean; release: boolean }
interface Released { key: SkillKey; aim: THREE.Vector3; t: number }

let stick: Stick | null = null;
let press: Press | null = null;
let released: Released | null = null;
let pinch: { d: number } | null = null;
let buttons: { key: SkillKey; el: HTMLElement; cd: HTMLElement; cdt: HTMLElement }[] = [];
let ring: THREE.Mesh;
const _aim = new THREE.Vector3();
const listeners: ((touch: boolean) => void)[] = [];

/** Touch mode on/off (a body class that the stylesheet keys off). */
function setTouchMode(on: boolean): void {
  if (input.touchMode === on) return;
  input.touchMode = on;
  document.body.classList.toggle('touch', on);
  if (on) hideTooltip();
  for (const f of listeners) f(on);
}
export const isTouch = (): boolean => input.touchMode;
export function onTouchMode(f: (touch: boolean) => void): void { listeners.push(f); }

export function initTouch(): void {
  // start in touch mode on a device whose main pointer is a finger
  setTouchMode(matchMedia('(pointer: coarse)').matches);
  window.addEventListener('pointerdown', (e) => setTouchMode(e.pointerType !== 'mouse'), true);
  window.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && (e.movementX || e.movementY)) setTouchMode(false); }, true);

  // move stick: anywhere on the left pad
  const pad = $('#touch-pad'), base = $('#touch-stick'), knob = base.querySelector<HTMLElement>('.knob')!;
  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (stick) return;
    pad.setPointerCapture(e.pointerId);
    stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
    base.style.left = `${e.clientX}px`; base.style.top = `${e.clientY}px`;
    base.classList.add('on');
    knob.style.transform = '';
  });
  pad.addEventListener('pointermove', (e) => {
    if (stick?.id !== e.pointerId) return;
    let dx = e.clientX - stick.x0, dy = e.clientY - stick.y0;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const k = Math.min(1, d / STICK_R);
    // a small dead zone, then full speed from 0.6 of the travel
    const m = k < 0.15 ? 0 : Math.min(1, (k - 0.15) / 0.45);
    input.stick.x = d ? (dx / Math.max(d, 1e-3)) * m : 0;
    input.stick.y = d ? (dy / Math.max(d, 1e-3)) * m : 0;
  });
  const endStick = (e: PointerEvent) => {
    if (stick?.id !== e.pointerId) return;
    stick = null;
    input.stick.x = input.stick.y = 0;
    base.classList.remove('on');
  };
  pad.addEventListener('pointerup', endStick);
  pad.addEventListener('pointercancel', endStick);

  // pinch to zoom, with two fingers anywhere but the buttons
  const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  window.addEventListener('touchstart', (e) => { if (e.touches.length === 2 && !press) pinch = { d: dist(e.touches) }; }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (!pinch || e.touches.length !== 2) return;
    const d = dist(e.touches);
    // one zoom notch per 12% change in finger spread
    const n = Math.log(pinch.d / d) / Math.log(1.12);
    if (Math.abs(n) >= 1) { zoomBy(Math.trunc(n)); pinch.d = d; }
  }, { passive: true });
  window.addEventListener('touchend', (e) => { if (e.touches.length < 2) pinch = null; }, { passive: true });

  $('#btn-pause').addEventListener('click', () => input.pressed.add('escape'));

  ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.8, 40).rotateX(-Math.PI / 2), additive(0xffe0a0, 1.6, 0.9));
  ring.visible = false;
  ring.renderOrder = 5;
  G.scene.add(ring);
}

/** Rebuild the skill buttons from the player's loadout (and gear, which can change a key's skill). */
export function buildTouchSkills(): void {
  const box = $('#touch-skills');
  box.innerHTML = '';
  buttons = SKILL_KEYS.map((key) => {
    const el = makeSkillSlot(G.player.skillAt(key)?.def ?? null, key);
    el.classList.add(`tk-${key}`);
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (press || !G.player.skillAt(key)) return;
      el.setPointerCapture(e.pointerId);
      const def = G.player.skillAt(key)!.def;
      // the basic attack and channels act while held; the rest wait for the release
      const release = key !== 'mouse0' && !def.channel;
      press = { id: e.pointerId, key, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, dragged: false, release };
      if (!release) input.touch.add(key);
      el.classList.add('pressed');
    });
    el.addEventListener('pointermove', (e) => {
      if (press?.id !== e.pointerId) return;
      press.dx = e.clientX - press.x0; press.dy = e.clientY - press.y0;
      if (!press.dragged && Math.hypot(press.dx, press.dy) > DRAG_MIN) press.dragged = true;
    });
    const end = (e: PointerEvent) => {
      if (press?.id !== e.pointerId) return;
      const p = press;
      press = null;
      el.classList.remove('pressed');
      input.touch.delete(p.key);
      if (p.release && e.type === 'pointerup') {
        aimFor(p, _aim);
        released = { key: p.key, aim: _aim.clone(), t: 0 };
        input.touch.add(p.key);
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    box.appendChild(el);
    return { key, el, cd: el.querySelector<HTMLElement>('.cd')!, cdt: el.querySelector<HTMLElement>('.cdt')! };
  });
}

/** The nearest foe in reach, or a spot a few metres ahead. */
function autoAim(out: THREE.Vector3): THREE.Vector3 {
  const p = G.player.pos;
  let best = AUTO_RANGE;
  let found = false;
  for (const e of G.enemies) {
    if (!e.alive || e.spawning > 0) continue;
    const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
    if (d < best) { best = d; out.set(e.pos.x, 0, e.pos.z); found = true; }
  }
  if (!found) out.set(p.x + Math.sin(G.player.facing) * 6, 0, p.z + Math.cos(G.player.facing) * 6);
  return out;
}

/** Where a press aims: dragged by hand (screen direction turned into the camera's frame), or auto. */
function aimFor(p: Press, out: THREE.Vector3): THREE.Vector3 {
  if (!p.dragged) return autoAim(out);
  const d = Math.hypot(p.dx, p.dy), m = Math.min(AIM_MAX, Math.max(AIM_MIN, d / DRAG_PX_PER_M));
  const yaw = cameraYaw(), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const x = p.dx / d, z = p.dy / d;   // screen right / down, as the move keys map them
  const pl = G.player.pos;
  return out.set(pl.x + (x * cy + z * sy) * m, 0, pl.z + (z * cy - x * sy) * m);
}

/** Per frame, before the player updates: the aim point, and whether the controls show at all. */
export function updateTouch(dt: number): void {
  const menu = $('#menu');
  const show = input.touchMode && !G.paused && (G.mode === 'run'
    ? !!G.run && G.run.phase !== 'dead' && G.run.phase !== 'banked'
    : menu.classList.contains('stowed'));
  $('#touch').classList.toggle('hidden', !show);
  if (!show && (press || stick)) { press = null; stick = null; input.stick.x = input.stick.y = 0; input.touch.clear(); }

  input.aim = null;
  ring.visible = false;
  if (released) {
    released.t += dt;
    const sk = G.player.skillAt(released.key);
    // held until the character takes it up (or gives up)
    const started = !sk || G.player.casting?.skill === sk || G.player.cooldownLeft(sk.def.impl) > 0;
    if (started || released.t > RELEASE_HOLD) { input.touch.delete(released.key); released = null; }
    else input.aim = released.aim;
  }
  if (press) {
    input.aim = aimFor(press, _aim);
    if (press.dragged && press.release) {
      ring.visible = true;
      ring.position.set(_aim.x, groundHeight(_aim.x, _aim.z) + 0.06, _aim.z);
    }
  }
  if (!show) return;

  // cooldowns and energy on the buttons, as the hotbar shows them
  const pl = G.player;
  for (const b of buttons) {
    const sk = pl.skillAt(b.key);
    if (!sk) continue;
    const left = pl.cooldownLeft(sk.def.impl), full = pl.cooldownOf(sk.def);
    b.cd.style.setProperty('--p', `${full > 0 ? (left / full) * 100 : 0}%`);
    b.cdt.textContent = left > 0.05 ? (left < 1 ? left.toFixed(1) : String(Math.ceil(left))) : '';
    b.el.classList.toggle('nomana', !pl.sandbox && pl.energy < (sk.def.channel ? sk.def.cost * 0.2 : sk.def.cost));
    b.el.classList.toggle('active', pl.channel?.key === b.key || pl.casting?.skill === sk);
  }
}
