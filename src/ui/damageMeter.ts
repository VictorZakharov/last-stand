// Floating damage readout for training dummies: DPS and total for the current burst
// of hits. A burst ends after a short lull; its result stays up (dimmed) until the next.
import { G } from '../state';
import { addAnchored, removeAnchored } from './floaters';

const BURST_GAP = 3; // seconds without hits that end a burst

type WorldPos = { x: number; y: number; z: number };

export class DamageMeter {
  private readonly el: HTMLElement;
  private readonly dpsEl: HTMLElement;
  private readonly subEl: HTMLElement;
  private total = 0;
  private hits = 0;
  private first = 0;
  private last = -Infinity;
  private nextDraw = 0;

  constructor(name: string, getPos: () => WorldPos | null) {
    const el = document.createElement('div');
    el.className = 'dmeter idle';
    el.innerHTML = `<div class="dm-name">${name}</div><div class="dm-dps"></div><div class="dm-sub"></div>`;
    this.dpsEl = el.querySelector<HTMLElement>('.dm-dps')!;
    this.subEl = el.querySelector<HTMLElement>('.dm-sub')!;
    this.el = addAnchored(el, getPos);
  }

  record(amount: number): void {
    const now = G.time;
    if (now - this.last > BURST_GAP) { this.total = 0; this.hits = 0; this.first = now; }
    this.total += amount;
    this.hits++;
    this.last = now;
    this.el.classList.remove('idle', 'done');
  }

  update(): void {
    if (this.hits === 0 || G.time < this.nextDraw) return;
    this.nextDraw = G.time + 0.1;
    const active = G.time - this.last <= BURST_GAP;
    const span = Math.max(1, (active ? G.time : this.last) - this.first);
    this.dpsEl.innerHTML = `<b>${Math.round(this.total / span).toLocaleString()}</b> DPS`;
    this.subEl.textContent = `${Math.round(this.total).toLocaleString()} total · ${this.hits} hit${this.hits === 1 ? '' : 's'}`;
    this.el.classList.toggle('done', !active);
  }

  dispose(): void { removeAnchored(this.el); }
}
