// The hero selection screen's Equipment page (ui/heroSelect.ts): a hall hero's gear and stash laid out as the lobby's
// are, to be looked at and not changed (he's not the lobby's hero until he's chosen): each item's card on hover, on
// touch a tap, and nothing to click, drag or throw.
import { SLOTS, SLOT_INFO } from '../data/items';
import { RUN } from '../data/balance';
import { CLASSES } from '../data/classes/index';
import { byValue, isTwoHanded, rarityOf } from '../loot/items';
import { itemIconSVG, slotPlaceholderSVG } from './itemIcons';
import { bindTooltip, itemTooltipHTML } from './tooltip';
import { LOCK, lockedTooltip } from './menus';
import type { Item, Profile } from '../types';

const LOOK_ONLY = 'Choose this hero to change his gear';

/** Class `id`'s paper doll, the lobby's own silhouette copied (its gradients are the lobby's, by their ids). */
function dollOf(id: string): Element | null {
  const doll = document.querySelector(`#equip .doll[data-class="${id}"]`)?.cloneNode(true) as Element | undefined;
  doll?.classList.remove('hidden');
  return doll ?? null;
}

/** One equipment slot of `profile`, its item's card on hover. */
function slotOf(profile: Profile, slot: (typeof SLOTS)[number]): HTMLElement {
  const cls = CLASSES[profile.classId];
  const it = profile.equipped[slot];
  const d = document.createElement('div');
  d.className = 'eslot' + (it ? '' : ' empty');
  d.dataset.slot = slot;
  const color = it ? rarityOf(it.rarity).color : '#666';
  d.style.boxShadow = `inset 0 0 0 1px ${it ? color : 'rgba(160,124,70,.5)'}`;
  d.style.setProperty('--c', color);
  d.innerHTML = it ? itemIconSVG(it) : slotPlaceholderSVG(slot, cls);
  const label = SLOT_INFO[slot].label;
  d.setAttribute('aria-label', `${label}: ${it ? it.name : 'empty'}`);
  const main = profile.equipped.weapon;
  if (slot === 'offhand' && !it && main && isTwoHanded(main, cls)) {
    d.classList.add('locked');
    d.innerHTML += LOCK;
    d.setAttribute('aria-label', `${label}: locked, both hands are on the ${main.name}`);
    bindTooltip(d, () => ({ ...lockedTooltip(main, false), foot: undefined }));
  } else if (!it) {
    const html = `<div class="tt-card empty"><div class="tt-name">${label}</div><div class="tt-type">Empty</div></div>`;
    bindTooltip(d, () => ({ html, color: '#666' }));
  } else bindTooltip(d, () => ({ ...itemTooltipHTML(it, undefined, cls), foot: LOOK_ONLY }));
  return d;
}

/** One item of the stash, its card beside the one he wears in its slot. */
function stashItem(profile: Profile, it: Item): HTMLElement {
  const d = document.createElement('div');
  const color = rarityOf(it.rarity).color;
  d.className = 'sitem';
  d.dataset.item = it.id;
  d.style.setProperty('--c', color);
  d.style.color = color;
  d.innerHTML = itemIconSVG(it);
  d.setAttribute('aria-label', it.name);
  bindTooltip(d, () => ({ ...itemTooltipHTML(it, profile.equipped[it.slot] ?? null), foot: LOOK_ONLY }));
  return d;
}

/** `profile`'s equipment round his class's doll into `equip`, and his stash (sorted as the lobby sorts it, no
 *  filter) into `stash`, its count into `count`. */
export function renderHeroGear(profile: Profile, equip: HTMLElement, stash: HTMLElement, count: HTMLElement): void {
  const doll = dollOf(profile.classId);
  equip.replaceChildren(...(doll ? [doll] : []), ...SLOTS.map((slot) => slotOf(profile, slot)));
  count.textContent = `(${profile.stash.length}/${RUN.bagLimit})`;
  const items = profile.stash.slice().sort(byValue).map((it) => stashItem(profile, it));
  const empty = Array.from({ length: Math.max(0, RUN.bagLimit - items.length) }, () => {
    const d = document.createElement('div');
    d.className = 'sitem';
    return d;
  });
  stash.replaceChildren(...items, ...empty);
}
