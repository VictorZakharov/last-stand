// Lobby spell loadout editor: a spellbook row (every class spell) and the key
// bar. Drag spellbook -> key to bind (duplicates allowed), key -> key to swap,
// key -> spellbook (or right-click) to clear. Saved via Player.bind (cookie).
import { G } from '../state';
import { SKILL_KEYS } from '../loot/loadout';
import { makeSkillSlot } from './hud';
import { hideTooltip } from './tooltip';
import { isTouch } from './touch';
import { sfx } from '../core/audio';
import type { SkillKey } from '../types';

type Payload = { kind: 'book'; id: string } | { kind: 'slot'; key: SkillKey };
let drag: Payload | null = null;
let onChange: () => void = () => {};
/** touch: the key picked to receive the next tapped skill */
let picked: SkillKey | null = null;

const book = () => document.getElementById('spellbook')!;
const bar = () => document.getElementById('loadout-bar')!;

export function initLoadoutEditor(changed: () => void): void {
  onChange = changed;
  // dropping a key onto the spellbook clears it
  const b = book();
  b.addEventListener('dragover', (e) => { if (drag?.kind === 'slot') { e.preventDefault(); b.classList.add('over'); } });
  b.addEventListener('dragleave', () => b.classList.remove('over'));
  b.addEventListener('drop', (e) => {
    e.preventDefault();
    if (drag?.kind === 'slot') { G.player.bind(drag.key, null); sfx.salvage(); }
    endDrag();
    commit();
  });
}

function startDrag(e: DragEvent, payload: Payload, el: HTMLElement): void {
  drag = payload;
  hideTooltip();
  e.dataTransfer!.effectAllowed = 'copyMove';
  e.dataTransfer!.setData('text/plain', payload.kind);
  el.classList.add('dragging');
  document.getElementById('loadout')!.classList.add('drag-' + payload.kind);
}

function endDrag(): void {
  drag = null;
  document.getElementById('loadout')!.classList.remove('drag-book', 'drag-slot');
  document.querySelectorAll('#loadout .over, #loadout .dragging').forEach((n) => n.classList.remove('over', 'dragging'));
}

function commit(): void {
  renderLoadoutEditor();
  onChange();
}

function dropOnKey(key: SkillKey): void {
  const p = G.player;
  if (!drag) return;
  if (drag.kind === 'book') p.bind(key, drag.id);
  else if (drag.key !== key) {
    // swap the two keys' spells
    const a = p.loadout[drag.key], b = p.loadout[key];
    p.bind(key, a);
    p.bind(drag.key, b);
  }
  sfx.click();
}

export function renderLoadoutEditor(): void {
  const p = G.player;
  const b = book();
  b.innerHTML = '';
  for (const { def } of p.known.values()) {
    const el = makeSkillSlot(def);
    el.draggable = true;
    el.addEventListener('dragstart', (e) => startDrag(e, { kind: 'book', id: def.impl }, el));
    el.addEventListener('dragend', endDrag);
    // touch: a tapped skill goes onto the picked key (with no key picked, the tap shows its tooltip)
    el.addEventListener('click', () => {
      if (!isTouch() || !picked) return;
      p.bind(picked, def.impl);
      picked = null;
      hideTooltip();
      sfx.click();
      commit();
    });
    b.appendChild(el);
  }

  const k = bar();
  k.innerHTML = '';
  for (const key of SKILL_KEYS) {
    const skill = p.skillAt(key);
    const el = makeSkillSlot(skill?.def ?? null, key);
    if (key === 'q') el.classList.add('sep');
    el.classList.toggle('picking', key === picked);
    // touch: tap a key to pick it, tap it again to clear it
    el.addEventListener('click', () => {
      if (!isTouch()) return;
      hideTooltip();
      if (picked === key) { p.bind(key, null); picked = null; sfx.salvage(); }
      else { picked = key; sfx.click(); }
      commit();
    });
    if (skill) {
      el.draggable = true;
      el.addEventListener('dragstart', (e) => startDrag(e, { kind: 'slot', key }, el));
      el.addEventListener('dragend', endDrag);
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); p.bind(key, null); hideTooltip(); sfx.salvage(); commit(); });
    }
    el.addEventListener('dragover', (e) => { if (drag) { e.preventDefault(); el.classList.add('over'); } });
    el.addEventListener('dragleave', () => el.classList.remove('over'));
    el.addEventListener('drop', (e) => { e.preventDefault(); dropOnKey(key); endDrag(); commit(); });
    k.appendChild(el);
  }
}
