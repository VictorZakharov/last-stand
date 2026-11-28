// The lobby's panels drawn by the engine (ui/kit's sheet; #973): the key bar and the spellbook, the inventory (the
// equipment, the attributes, the stash and its filter) and a short screen's rail. They were `#menu`'s, styled by
// `_lobby.scss`, `_loadout.scss`, `_items.scss` and `_responsive.scss`; the page's stay, out of sight (`.kit-mirror`),
// written by `menus.ts`, `loadoutEditor.ts`, `stashFilter.ts` and `attributes.ts` as before, their handlers told the
// pointer's events where the panels are drawn (`kit/forward.ts`: a tooltip's enter and leave, a right-click, a drag
// between the stash and the equipment). The crest stays on the page (its letters are the loading screen's logo
// gathered into it), and the card is `villageCardPanel.ts`'s.
import { LAYERS, layer } from './kit/panel';
import { SheetTree, type Sheet } from './kit/sheet';
import { CONTROLS } from './controlsSheet';
import { LOBBY } from './lobbySheet';
import { LOADOUT } from './loadoutSheet';
import { STASH } from './stashSheet';
import type { Panel } from './kit/panel';

/** the lobby's whole sheet: the shared controls, then each panel's rules */
const SHEET: Sheet = [...CONTROLS, ...LOBBY, ...STASH, ...LOADOUT];
/** the panels the kit draws in the page's place */
const DRAWN = ['#lobby-rail', '.menu-center', '.menu-right'];

let lobby: SheetTree | null = null;

/** The lobby's panels drawn by the engine from now on, the page's out of sight. */
export function drawLobbyPanels(): void {
  const menu = document.getElementById('menu');
  if (!menu || lobby) return;
  for (const selector of DRAWN) menu.querySelector(selector)?.classList.toggle('kit-mirror', true);
  lobby = new SheetTree(menu, SHEET, 'ui', layer(LAYERS.lobby));
}

/** The lobby's panel, once it's drawn (the lab reads it). */
export const lobbyPanel = (): Panel | null => lobby?.panel ?? null;
