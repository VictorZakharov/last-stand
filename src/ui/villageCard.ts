// The card a village object opens (`#vcard`, game/village.ts uses the objects): a portal's, its battleground's name, its
// starting wave and its way in (Enter, `#btn-start`); the chronicle's, the save slots and the profile's reset. It stands
// at the foot of the screen over the village, and goes as the hero walks off (or Leave, Esc).
import { G } from '../state';
import { BIOMES } from '../data/biomes';
import { CLASSES } from '../data/classes/index';
import { saveSlot } from '../loot/saveSlots';
import { renderLobbyOptions } from './menus';
import { sfx } from '../core/audio';
import { on } from '../events';
import { skipTraining } from '../game/training';
import type { VillageObject } from '../data/village';

const $ = <T extends HTMLElement = HTMLElement>(s: string, root: ParentNode = document): T => root.querySelector<T>(s)!;

let shown: VillageObject | null = null;
let closed: (o: VillageObject) => void = () => undefined;

/** `onClose` told when a card is put away by its own Leave (the village forgets what it opened). */
export function initVillageCard(onClose: (o: VillageObject) => void): void {
  closed = onClose;
  $('#vcard .vc-skip').onclick = () => { sfx.click(); skipTraining(); };
  on('trainingChanged', () => { if (shown?.use === 'portal') renderLobbyOptions(); });
  $('#vcard .vc-close').onclick = () => { sfx.click(); const o = shown; showVillageCard(null); if (o) closed(o); };
}

/** The card `o` opens (a portal's, the chronicle's) shown, or none. */
export function showVillageCard(o: VillageObject | null): void {
  shown = o;
  const card = $('#vcard');
  card.classList.toggle('hidden', !o);
  if (!o) return;
  const page = o.use === 'portal' ? 'portal' : 'chronicle';
  card.dataset.page = page;
  card.querySelectorAll<HTMLElement>('.vc-page').forEach((p) => p.classList.toggle('hidden', p.dataset.page !== page));
  if (o.use === 'portal' && o.biome) {
    $('.vc-title', card).textContent = BIOMES[o.biome].title;
    $('.vc-sub', card).textContent = 'Every wave, bank what you found or fight on for more.';
    renderLobbyOptions();
  } else {
    $('.vc-title', card).textContent = o.name;
    $('.vc-sub', card).textContent = `${CLASSES[G.profile.classId].name} of save slot ${saveSlot()}`;
  }
}

/** The object whose card is shown, if any. */
export const villageCardOf = (): VillageObject | null => shown;
