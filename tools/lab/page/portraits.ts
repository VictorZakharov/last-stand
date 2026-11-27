// Verify optional portrait downloads through the real co-op picker; only image resource requests count.
import type { Lab, Report, Pictured } from './lab';
import { realWait } from './lab';
import { touchMode } from './uiTouch';
import { G } from '../../../src/state';
import { role } from '../../../src/net/role';
import { renderCoop, updateCoopHud } from '../../../src/ui/coop';
import { portraitIds, portraitOf, savePortrait, receivePortrait } from '../../../src/net/portraits';
import { portraitUrl } from '../../../src/ui/portraitArt';
import { classOutline } from '../../../src/ui/classOutlines';
import { CLASS_IDS } from '../../../src/data/classes/index';
import { portraitHtml, syncPortrait } from '../../../src/ui/portraitPicker';
import type { Player } from '../../../src/entities/player';

/** A party card as the engine draws it (`src/ui/partyPanel.ts`, where the commit has it): its parts' boxes, its
 *  borders and colours. Where it hasn't, the page's card is read by its styles. */
type DrawnBox = { x: number; y: number; w: number; h: number } | null;
interface CardDrawn {
  card: DrawnBox; content: DrawnBox; name: DrawnBox; cls: DrawnBox; portrait: DrawnBox; star: DrawnBox;
  border: number[]; borderColour: string; clsColour: string;
}
const PARTY = Object.values(import.meta.glob<{ partyCardsDrawn(): CardDrawn[] }>('../../../src/ui/partyPanel.ts',
  { eager: true }))[0];

/** The local player's card as drawn (the party's first), after a frame for it to follow the page. */
async function ownCardDrawn(lab: Lab): Promise<CardDrawn | null> {
  if (!PARTY) return null;
  await lab.step(1);
  return PARTY.partyCardsDrawn()[0] ?? null;
}

/** A drawn box as the page's (css px); an empty one where it isn't drawn. */
const asRect = (box: DrawnBox): DOMRect => (box ? new DOMRect(box.x, box.y, box.w, box.h) : new DOMRect());

/** The own card's class colour, its left border and the host's star, as drawn: the problems. */
function drawnCardProblems(drawn: CardDrawn, host: boolean): string[] {
  const problems: string[] = [];
  if (drawn.clsColour !== G.player.cls.accent) problems.push('class colour differed from Hero Selection');
  const [top, right, bottom, left] = drawn.border;
  if (!(left >= 3 && top === 0 && right === 0 && bottom === 0)) {
    problems.push('own card did not have a thick plain border on the left only');
  }
  if (host) {
    const star = drawn.star;
    const picture = drawn.portrait;
    const corner = !!star && !!picture && Math.abs(star.x - picture.x) < 3
      && Math.abs(star.y + star.h - (picture.y + picture.h)) < 3;
    if (!corner) problems.push('host star was not over the bottom-left corner of the portrait');
  }
  return problems;
}

/** Plant another class's image request and require the resource audit to catch it. */
export interface PortraitOptions {
  canary: boolean;
}

const element = (selector: string): HTMLElement => document.querySelector<HTMLElement>(selector)!;

/** The classes whose actual image resources were requested, excluding the manifest's JavaScript. */
function requestedClasses(): string[] {
  const classes = performance.getEntriesByType('resource').flatMap((entry) => {
    const match = entry.name.match(/portrait-(mage|warrior|ranger)-\d{2}[^/]*\.webp/);
    return match ? [match[1]] : [];
  });
  return [...new Set(classes)];
}

/** The page's own card, where the page draws it: its class colour, its left border and the host's star, by its
 *  styles. */
function pageCardChecks(card: HTMLElement, picture: HTMLElement, check: (ok: boolean, message: string) => void): void {
  const probe = document.createElement('span');
  probe.style.color = G.player.cls.accent;
  card.appendChild(probe);
  check(getComputedStyle(element('#party .self .pf-class')).color === getComputedStyle(probe).color,
    'class colour differed from Hero Selection');
  probe.remove();
  const border = getComputedStyle(card);
  const others = [border.borderTopWidth, border.borderRightWidth, border.borderBottomWidth];
  check(parseFloat(border.borderLeftWidth) >= 3 && border.borderLeftStyle === 'solid'
    && others.every((width) => parseFloat(width) === 0), 'own card did not have a thick plain border on the left only');
  if (G.player.slot !== 0) return;
  const star = getComputedStyle(picture, '::after');
  check(star.content.includes('★') && star.position === 'absolute' && star.left === '1px' && star.bottom === '0px',
    'host star was not over the bottom-left corner of the portrait');
}

/** Read the UI's actual downloads and choices without assuming the manifest's bookkeeping is correct. */
export async function portraits(lab: Lab, options: PortraitOptions): Promise<Report> {
  performance.setResourceTimingBufferSize(4096); // Boot assets can fill the browser's default 250-entry buffer.
  const problems: string[] = [];
  const moments: Pictured[] = [];
  const check = (condition: boolean, message: string): void => {
    if (!condition) problems.push(message);
  };
  const classId = G.player.cls.id;
  check(requestedClasses().length === 0, 'portraits downloaded before the picker or a choice needed them');
  check(portraitOf(G.player) === null, 'the default was not None');
  renderCoop();
  element('#coop').classList.remove('hidden');
  const summary = element('#coop .portrait-picker summary');
  await lab.clickOn(summary);
  await realWait(0); // details dispatches toggle on the browser's clock, after the click.
  const images = [...document.querySelectorAll<HTMLImageElement>('#coop .portrait-options img')];
  await Promise.all(images.map((image) => image.decode()));
  await realWait(0);
  check(images.length === portraitIds(classId).length, 'picker did not show the enabled male portraits');
  check(requestedClasses().every((loaded) => loaded === classId), 'picker downloaded another class');
  check(requestedClasses().includes(classId), 'picker image downloads were not recorded');
  check(document.querySelectorAll('#coop .portrait-option').length === 5, 'portraits are not exactly five');
  check(Boolean(document.querySelector('#coop .portrait-clear [aria-label="No portrait"]')),
    'None is not outside the portrait row');
  const tops = images.map((image) => image.getBoundingClientRect().top);
  check(tops.every((top) => Math.abs(top - tops[0]) < 1), 'the five portraits wrap onto another row');
  moments.push(await lab.screen('portrait-picker'));
  await lab.clickOn(element('#coop .portrait-option[aria-label="Portrait 1"]'));
  const first = portraitIds(classId)[0];
  check(portraitOf(G.player) === first, 'selecting a portrait did not keep it');
  const preview = document.querySelector<HTMLImageElement>('#coop summary .party-portrait');
  check(Boolean(preview?.src) && !preview!.classList.contains('outline'), 'selected portrait did not appear in the preview');

  // Exercise the partner rendering path too, and verify clearing removes the image instead of loading a default.
  const partner = { local: false, cls: { id: classId } } as Player;
  receivePortrait(partner, first);
  const listPicture = document.createElement('span');
  syncPortrait(listPicture, partner);
  check(listPicture.querySelectorAll('img').length === 1, 'partner picture did not render');
  receivePortrait(partner, null);
  syncPortrait(listPicture, partner);
  check(!listPicture.querySelector('img:not(.outline)'), 'cleared portrait still showed a chosen picture');
  check(!listPicture.hidden && Boolean(listPicture.querySelector('.party-portrait.outline')),
    'a player with no portrait showed no class outline');
  const outlines = CLASS_IDS.map((id) => classOutline(id));
  check(new Set(outlines).size === CLASS_IDS.length, 'two classes share an outline');
  await lab.clickOn(element('#coop .portrait-picker summary'));
  await realWait(0);
  await lab.clickOn(element('#coop .portrait-none[aria-label="No portrait"]'));
  check(portraitOf(G.player) === null && portraitHtml(G.player).includes('outline'), 'None retained a portrait image');
  check(!document.querySelector('#coop summary img:not(.outline)'), 'None retained a preview image');
  const previousRole = role.current;
  const life = G.player.life;
  const hudHidden = element('#hud').classList.contains('hidden');
  // (the lobby's HUD, the village's practice bar, hides the party frames: they're a run's, shown as in one)
  const hudLobby = element('#hud').classList.contains('lobby');
  const menuHidden = element('#menu').classList.contains('hidden');
  const screen = { width: innerWidth, height: innerHeight, ratio: devicePixelRatio };
  try {
    element('#coop').classList.add('hidden');
    element('#menu').classList.add('hidden');
    element('#hud').classList.remove('hidden', 'lobby');
    role.current = 'host';
    savePortrait(classId, first);
    updateCoopHud();
    await (element('#party .self img') as HTMLImageElement).decode();
    check(element('#party').firstElementChild?.classList.contains('self') === true,
      'current player card was not first in the top-left list');
    const card = element('#party .self');
    check(!card.textContent?.includes('You · '), 'current player card still said You');
    check(element('#party .self .pf-class').textContent === G.player.cls.name, 'card class was missing');
    check(!card.querySelector('.pf-host'), 'Host text still occupied a separate row');
    const picture = element('#party .self .pf-portrait');
    check(picture.classList.contains('host') === (G.player.slot === 0), 'host star showed for the wrong player');
    const drawnCard = await ownCardDrawn(lab);
    if (drawnCard) problems.push(...drawnCardProblems(drawnCard, G.player.slot === 0));
    else pageCardChecks(card, picture, check);
    for (const [width, height] of [[1024, 700], [1920, 1080], [844, 390], [1180, 820], [820, 1180]]) {
      await lab.showOn({ width, height, ratio: 1 });
      if (width <= 1180 && width !== 1024) await touchMode(lab);
      const drawn = await ownCardDrawn(lab);
      const name = drawn ? asRect(drawn.name) : element('#party .self .pf-name').getBoundingClientRect();
      const cls = drawn ? asRect(drawn.cls) : element('#party .self .pf-class').getBoundingClientRect();
      const content = drawn ? asRect(drawn.content) : element('#party .self .pf-content').getBoundingClientRect();
      check(Math.abs(name.top - cls.top) < 2 && name.right <= cls.left && Math.abs(cls.right - content.right) < 2,
        `${width}x${height}: name and class were not left/right on one line`);
      const box = drawn ? asRect(drawn.card) : null;
      const overflowed = box ? content.right > box.right + 0.5 : card.scrollWidth > card.clientWidth;
      check(!overflowed, `${width}x${height}: card content overflowed`);
      moments.push(await lab.screen(`player-card-${width}x${height}`, [], '#party'));
    }
    G.player.life = G.player.stats.maxLife / 2;
    updateCoopHud();
    check(element('#party .self .pf-fill').style.width === '50%', 'own card health was not updated');
  } finally {
    G.player.life = life;
    await lab.showOn(screen);
    element('#hud').classList.toggle('hidden', hudHidden);
    element('#hud').classList.toggle('lobby', hudLobby);
    element('#menu').classList.toggle('hidden', menuHidden);
    role.current = previousRole;
    updateCoopHud();
  }
  check(!document.querySelector('#party .self'), 'own co-op card remained after leaving co-op');
  if (options.canary) {
    const other = classId === 'mage' ? 'warrior' : 'mage';
    const image = new Image();
    image.src = portraitUrl(portraitIds(other)[0])!;
    await image.decode();
    await realWait(0);
    check(requestedClasses().includes(other), 'canary: another class download went unnoticed');
  }
  element('#coop').classList.add('hidden');
  savePortrait(classId, null);
  return {
    text: 'None at boot; enabled male image downloads on open; selection, partner rendering and clearing checked',
    problems,
    moments,
  };
}
