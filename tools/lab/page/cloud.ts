// tools/lab's cloud saves (`npm run lab -- cloud`): a device's side of the check, in its page. Its save slots seeded as
// the game keeps them (src/loot/slotData.ts: a slot's every entry written as one), each hero told apart by the ids of
// the items in his stash (a tag each, `A2-mage`), a hero's stash added to as play does (`saveProfile`, which touches
// the cloud's sync), the cloud's state and the dialog as the player sees them, and the bar and the dialog held to the
// window (src/ui/AGENTS.md: nothing past its edges, nothing over another). The node side drives the screens
// (tools/lab/node/cloud.mjs).
import { Vec3 } from './sceneApi.ts';
import { boxOf, seenOf } from './lab';
import { CLASS_IDS } from '../../../src/data/classes/index';
import { villageObject } from '../../../src/game/village';
import { groundHeight } from '../../../src/world/ground';
import { showVillageCard } from '../../../src/ui/villageCard';
import { CLASS_ENTRY, readHero, writeSlot, type Entries } from '../../../src/loot/slotData';
import { loadProfile, peekProfile, saveProfile } from '../../../src/loot/profile';
import { SAVE_SLOTS } from '../../../src/loot/saveSlots';
import * as cloud from '../../../src/loot/cloud';
import { isReadying, readyingLabel } from '../../../src/game/warm';
import { G } from '../../../src/state';
import type { Item, Profile } from '../../../src/types';

/** a slot's heroes, by class: the tag of each item in his stash */
export type SlotHeroes = Record<string, string[]>;

/** each slot's heroes, by its number */
export type Slots = Record<number, SlotHeroes>;

/** the profile's entry, as slot 1 names it (slotData.ts names every entry so) */
const profileEntry = (classId: string): string => `last-stand.profile.${classId}.v1`;

/** A hero's profile as a fresh one is made, with his stash holding `tags` alone (each a copy of an item he wears). */
function heroWith(classId: string, tags: string[]): Profile {
  const profile = structuredClone(loadProfile(classId));
  const worn = Object.values(profile.equipped).find((item): item is Item => Boolean(item));
  if (!worn) throw new Error(`lab: cloud: a fresh ${classId} wears nothing to copy into his stash`);
  profile.stash = tags.map((tag) => ({ ...structuredClone(worn), id: tag }));
  return profile;
}

/** Every slot written as `slots` gives it (a slot not given left empty), its class the first hero's. */
export function cloudSeed(slots: Slots): void {
  for (const slot of SAVE_SLOTS) {
    const heroes = slots[slot] ?? {};
    const entries: Entries = {};
    for (const [classId, tags] of Object.entries(heroes)) {
      entries[profileEntry(classId)] = JSON.stringify(heroWith(classId, tags));
    }
    const first = Object.keys(heroes)[0];
    if (first) entries[CLASS_ENTRY] = first;
    writeSlot(slot, entries);
  }
}

/**
 * The hero stood at the village's chronicle with its card open, as using it leaves him: the card holds the Save
 * slot button there. The command clicked the button where the village hides it, and stopped at its first step.
 */
export function cloudAtChronicle(): void {
  const chronicle = villageObject('chronicle');
  if (!chronicle) throw new Error('lab: cloud: the village has no chronicle to open the save slots from');
  const [x, z] = chronicle.stand;
  G.player.walkTo = null;
  G.player.place(new Vec3(x, groundHeight(x, z), z), 0);
  showVillageCard(chronicle);
}

/** A slot's heroes, from what it holds now. */
function heroesIn(slot: number): SlotHeroes {
  const heroes: SlotHeroes = {};
  for (const classId of CLASS_IDS) {
    const profile = peekProfile(classId, slot);
    if (profile) heroes[classId] = profile.stash.map((item) => item.id);
  }
  return heroes;
}

/** Every slot's heroes, from what this device holds now. */
export function cloudSlots(): Slots {
  const slots: Slots = {};
  for (const slot of SAVE_SLOTS) slots[slot] = heroesIn(slot);
  return slots;
}

/** An item tagged `tag` added to slot 1's hero of `classId`, saved as play saves it (the cloud's sync touched). */
export function cloudAddItem({ classId, tag }: { classId: string; tag: string }): void {
  const entries = readHero(classId, 1);
  const stored = entries[profileEntry(classId)];
  if (!stored) throw new Error(`lab: cloud: slot 1 has no ${classId} to add ${tag} to`);
  const profile = JSON.parse(stored) as Profile;
  const worn = Object.values(profile.equipped).find((item): item is Item => Boolean(item));
  if (!worn) throw new Error(`lab: cloud: slot 1's ${classId} wears nothing to copy`);
  profile.stash.push({ ...structuredClone(worn), id: tag });
  // (saveProfile writes the slot in play's: slot 1, which the lab's boot plays)
  saveProfile({ ...profile, classId });
}

/** The hero in play as the game holds him in memory: his class and his stash's tags (what a save of his writes). */
export function cloudInPlay(): { classId: string; tags: string[] } {
  return { classId: G.profile.classId, tags: G.profile.stash.map((item) => item.id) };
}

/** An item tagged `tag` added to the hero in play and saved as play saves him: from memory (a bank, gear taken off
 *  the floor), not from his slot's stored copy. `drop` (a canary's) takes the item of that tag out of him first. */
export function cloudPlay({ tag, drop = '' }: { tag: string; drop?: string }): void {
  const worn = Object.values(G.profile.equipped).find((item): item is Item => Boolean(item));
  if (!worn) throw new Error(`lab: cloud: the ${G.profile.classId} in play wears nothing to copy`);
  if (drop) G.profile.stash = G.profile.stash.filter((item) => item.id !== drop);
  G.profile.stash.push({ ...structuredClone(worn), id: tag });
  saveProfile(G.profile);
}

/** the lab's clock as the page's scripts have it (tools/lab/node/browser.mjs `labClock`): its parked frames */
interface ParkedClock { t: number; frame: number; queue: FrameRequestCallback[] }

/** most frames a warm-up is given before it counts as stuck */
const WARM_FRAMES = 20_000;
/** the frames run at least, for an act a warm-up held to go ahead once it's over (`whenWarm`, in a promise's turn) */
const SETTLE_FRAMES = 60;

/**
 * The lobby's frames run until nothing pressed waits for a warm-up (src/game/warm.ts `isReadying`: the fight's
 * loading bar gone, what it held done), as a cold boot's lobby warms what's asked for a step a frame; the page's own
 * tasks (its workers' answers) let in between. A returning player's game warms the other heroes only once something
 * asks for them, so waiting for every need to be warm would wait for ever where nothing does. Returns the frames run.
 */
export async function cloudWarmUp(): Promise<number> {
  for (let frame = 0; frame < WARM_FRAMES; frame++) {
    if (frame >= SETTLE_FRAMES && !isReadying()) return frame;
    await parkedFrame();
  }
  throw new Error(`lab: cloud: "${readyingLabel()}" still waited after ${WARM_FRAMES} frames`);
}

/** One of the game's parked frames run, and the page's own tasks let in after it. */
async function parkedFrame(): Promise<void> {
  const clock = (window as unknown as { __labClock: ParkedClock }).__labClock;
  clock.t += clock.frame;
  for (const callback of clock.queue.splice(0)) callback(clock.t);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** the frames the UI kit is given to draw what changed before its boxes are read (src/ui/kit: two or three) */
const KIT_FRAMES = 3;

/** `count` of the game's parked frames run: what a click changed drawn by the UI kit. */
export async function cloudFrames(count = KIT_FRAMES): Promise<void> {
  for (let frame = 0; frame < count; frame++) await parkedFrame();
}

/** What `cloudBox` is asked for: the first element `selector` names, or the first of them whose words are `text`. */
export interface Wanted { selector: string; text?: string }

/** A box as plain numbers, css px (a DOMRect doesn't cross to Node). */
export interface PlainBox { left: number; top: number; right: number; bottom: number; width: number; height: number }

/**
 * The box of the element `wanted` names where it's drawn, after the UI kit's frames: the save slots and their
 * dialogs are the engine's (src/ui/savesSheet.ts, cloudSheet.ts), their page elements out of sight, so the node side
 * clicks and taps there. Throws if it shows nothing.
 */
export async function cloudBox(wanted: Wanted): Promise<PlainBox> {
  await cloudFrames();
  const element = [...document.querySelectorAll(wanted.selector)]
    .find((each) => wanted.text === undefined || each.textContent?.trim() === wanted.text);
  if (!element) throw new Error(`lab: cloud: nothing on the page is ${describeWanted(wanted)}`);
  const box = boxOf(element);
  if (box.width < 1 || box.height < 1) throw new Error(`lab: cloud: ${describeWanted(wanted)} isn't drawn`);
  return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
}

/** `wanted` in a report's words. */
const describeWanted = (wanted: Wanted): string =>
  (wanted.text === undefined ? wanted.selector : `${wanted.selector} "${wanted.text}"`);

/** Whether the lobby's fight loading bar says it readies something pressed (a slot's hero waiting for his programs). */
export const cloudReadying = (): string => (isReadying() ? readyingLabel() : '');

/** The next load of this tab keeps its storage (the lab's pages clear it as they start, `freshStorage`): the device
 *  opened again as a player opens the game again. */
export function cloudKeepStorage(): void {
  sessionStorage.setItem('lab.keepStorage', '1');
}

/** What the device shows of the cloud: its state, the dialog's, and the game's mode (a download waits for the
 *  lobby). */
export interface CloudState {
  status: string;
  message: string;
  accountId: string;
  lastSync: number;
  linked: boolean;
  identity: ReturnType<typeof cloud.cloudIdentity>;
  pending: number;
  token: string;
  dialog: { open: boolean; title: string; text: string; buttons: string[] };
  savesOpen: boolean;
  /** the bar's Account dropdown is open */
  menuOpen: boolean;
  mode: string;
}

export function cloudState(): CloudState {
  const shown = cloud.cloudStatus();
  const box = document.getElementById('cloud-dialog')!;
  const buttons = [...box.querySelectorAll<HTMLElement>('.dc-buttons button')].map(textOf);
  return {
    ...shown,
    linked: cloud.linked(),
    identity: cloud.cloudIdentity(),
    pending: cloud.pendingConflicts().length,
    token: keptToken(),
    dialog: {
      open: !box.classList.contains('hidden'),
      title: box.querySelector('.sm-title')?.textContent ?? '',
      text: (box.querySelector('.cd-body') as HTMLElement | null)?.innerText ?? '',
      buttons,
    },
    savesOpen: !document.getElementById('saves')!.classList.contains('hidden'),
    menuOpen: document.querySelector('#saves .sc-more[open]') !== null,
    mode: G.mode,
  };
}

const textOf = (element: Element): string => element.textContent ?? '';

/** the session's token the device keeps (src/loot/cloud.ts's `last-stand.cloud.v1`), '' while signed out */
function keptToken(): string {
  try {
    const kept = JSON.parse(localStorage.getItem('last-stand.cloud.v1') ?? 'null') as { token?: string } | null;
    return kept?.token ?? '';
  } catch {
    return '';
  }
}

/** A sign-in code made by this device's session, as Sign in elsewhere makes it (that button shows on production
 *  alone, `onProduction` in src/ui/cloudSaves.ts, and the lab's page is localhost). */
export async function cloudMakeCode(): Promise<string> {
  const { code } = await cloud.makeLinkCode();
  return code;
}

/** the parts of the screen a box of the bar or the dialog may not lie over, beside its own siblings */
const BAR_NEIGHBOURS = ['#saves .sv-back', '#saves .sv-title', '#saves .sv-panes'];

/** A shown element's box where it's drawn (the engine draws the save slots: `boxOf`), or null if it shows nothing. */
function shownBoxOf(element: Element): DOMRect | null {
  const box = boxOf(element);
  if (box.width < 1 || box.height < 1) return null;
  if (!seenOf(element)) return null;
  return box;
}

const overlap = (a: DOMRect, b: DOMRect): boolean =>
  a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

/** How far a box lies past the window's edges, css px (0: within it). */
function pastWindow(box: DOMRect): number {
  return Math.max(0, -box.left, -box.top, box.right - innerWidth, box.bottom - innerHeight);
}

/** A short name for an element in a report. */
function nameOf(element: Element): string {
  const text = (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 24);
  const kind = element.className ? `.${String(element.className).split(' ').filter(Boolean).join('.')}` : '';
  return `${element.tagName.toLowerCase()}${kind}${text ? ` "${text}"` : ''}`;
}

/** Each of `elements` within the window and over none of the others: the problems found. */
function fitOf(where: string, elements: Element[]): string[] {
  const problems: string[] = [];
  const shown = elements.map((element) => ({ element, box: shownBoxOf(element) }))
    .filter((entry): entry is { element: Element; box: DOMRect } => entry.box !== null);
  for (const { element, box } of shown) {
    const past = pastWindow(box);
    if (past > 0.5) problems.push(`${where}: ${nameOf(element)} reaches ${past.toFixed(0)} px past the window`);
  }
  for (let i = 0; i < shown.length; i++) {
    for (let j = i + 1; j < shown.length; j++) {
      if (!overlap(shown[i].box, shown[j].box)) continue;
      problems.push(`${where}: ${nameOf(shown[i].element)} lies over ${nameOf(shown[j].element)}`);
    }
  }
  return problems;
}

/** The bar and, if open, the dialog held to the window: each part within it and over no other. */
export async function cloudFit(): Promise<{ lines: string[]; problems: string[] }> {
  // (the kit's frames first: the bar is written again as the sync's state changes, and its new boxes are drawn then)
  await cloudFrames();
  const bar = document.querySelector('#saves .sv-cloud')!;
  const row = [...bar.querySelectorAll('.sc-row > *')];
  const neighbours = BAR_NEIGHBOURS.flatMap((selector) => [...document.querySelectorAll(selector)]);
  const problems = [...fitOf('the bar', row), ...fitOf('the bar among the screen', [bar, ...neighbours])];
  const box = document.getElementById('cloud-dialog')!;
  const lines = [`bar ${boxText(bar)}`];
  const menu = document.querySelector('#saves .sc-more[open] .sc-menu');
  if (menu) {
    problems.push(...fitOf('the Account menu', [menu]), ...fitOf('the Account menu\'s buttons', [...menu.children]));
    lines.push(`Account menu ${boxText(menu)}`);
  }
  if (!box.classList.contains('hidden')) {
    const panel = box.querySelector('.modal-box')!;
    const parts = [...panel.children];
    const inner = [...panel.querySelectorAll('.dc-buttons button, .cd-slot, .cd-side, .cd-code')];
    const buttons = [...panel.querySelectorAll('.dc-buttons button')];
    problems.push(...fitOf('the dialog', [panel]), ...fitOf('the dialog\'s parts', parts));
    problems.push(...fitOf('the dialog\'s controls', inner), ...fitOf('the dialog\'s buttons', buttons));
    lines.push(`dialog ${boxText(panel)}`);
  }
  return { lines, problems };
}

/** A box as a share of the window: where it starts and how large it is, in %. */
function boxText(element: Element): string {
  const box = boxOf(element);
  const share = (value: number, of: number): string => `${Math.round((value / of) * 100)}%`;
  return `at ${share(box.left, innerWidth)},${share(box.top, innerHeight)} `
    + `${share(box.width, innerWidth)}x${share(box.height, innerHeight)}`;
}
