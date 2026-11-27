// `lab ui`'s `chat`, `chatOpen` and `chatTouch` states' work (`uiStates/chat.ts`...): the co-op chat's lines written
// onto the page as `src/ui/chat.ts` writes them (a room's chat itself is `lab coop --scenarios chat`'s), shut (the
// newest few on their strips) or with its box open and something typed. Each within the window, its lines shown
// (shut, six at most), the box and Send in it while open, and on touch the chat button. The canary takes the lines
// away, caught as no lines shown.
import { boxOf, seenOf, type Lab } from './lab';
import { caught, type Found } from './uiKit';

/** frames for the page's writing to be drawn */
const SETTLE = 3;
/** the lines written: a name (with its colour) and its text, or the game's own word */
const LINES: { name?: string; colour?: string; text: string }[] = [
  { text: 'Briony joined the room' },
  { name: 'Ashkettle', colour: 'rgb(255, 170, 120)', text: 'ready when you are' },
  { name: 'Briony', colour: 'rgb(150, 210, 255)', text: 'one sec, swapping my staff' },
  { name: 'Ashkettle', colour: 'rgb(255, 170, 120)', text: 'bank after this wave? the boss is two off' },
  { name: 'Briony', colour: 'rgb(150, 210, 255)', text: 'yes' },
  { name: 'Ashkettle', colour: 'rgb(255, 170, 120)', text: 'on my way to the portal' },
  { name: 'Briony', colour: 'rgb(150, 210, 255)', text: 'wait for me at the gate, I need to drink first' },
  { name: 'Ashkettle', colour: 'rgb(255, 170, 120)', text: 'ok' },
];
/** what's typed in the open box */
const TYPED = 'On my way';
/** shut, the newest lines alone */
const SHUT_LINES = 6;
/** the touch button's side (css px, at the touch controls' scale of 1) */
const BUTTON_SIDE = 44;

/** The page's `selector`. */
const element = (selector: string): HTMLElement | null => document.querySelector<HTMLElement>(selector);

/** `id`'s class list kept from `classes` being toggled or added by the game's frames while the state is up (out of a
 *  room the chat is hidden, and quiet it fades), each added (`on`) or taken off as asked. */
function hold(id: string, classes: Record<string, boolean>): void {
  const list = element(id)!.classList;
  for (const [token, on] of Object.entries(classes)) list.toggle(token, on);
  const toggle = list.toggle.bind(list);
  const add = list.add.bind(list);
  list.toggle = (token: string, force?: boolean): boolean => (token in classes ? classes[token] : toggle(token, force));
  list.add = (...tokens: string[]): void => add(...tokens.filter((token) => !(token in classes)));
}

/** `id`'s class list as it was. */
function letGo(id: string): void {
  const list = element(id)?.classList as Partial<DOMTokenList> | undefined;
  if (!list) return;
  delete list.toggle;
  delete list.add;
}

/** A line as the game writes it. */
function lineElement(line: (typeof LINES)[number]): HTMLElement {
  const row = document.createElement('div');
  row.className = line.name ? 'chat-line lab-chat' : 'chat-line note lab-chat';
  if (line.name) {
    const name = document.createElement('span');
    name.className = 'chat-name';
    name.textContent = `${line.name}:`;
    if (line.colour) name.style.color = line.colour;
    row.append(name, ' ');
  }
  row.append(line.text);
  return row;
}

/** The chat shown with its lines (open, with something typed), and on touch its button. */
export async function openChat(lab: Lab, open: boolean, touch: boolean): Promise<void> {
  await lab.step(1);
  const log = element('#chat .chat-log');
  if (!log) throw new Error('lab: ui: the chat was never made');
  for (const line of LINES) log.appendChild(lineElement(line));
  hold('#chat', { hidden: false, idle: false, open });
  if (touch) hold('#btn-chat', { hidden: false, on: open });
  const field = element('#chat .chat-input') as HTMLInputElement;
  field.value = open ? TYPED : '';
  await lab.step(SETTLE);
}

/** The lines taken away and the chat put back as the game had it. */
export function closeChat(): void {
  for (const line of document.querySelectorAll('.lab-chat')) line.remove();
  letGo('#chat');
  letGo('#btn-chat');
  element('#chat')?.classList.add('hidden');
  element('#chat')?.classList.remove('open');
  element('#btn-chat')?.classList.add('hidden');
  const field = element('#chat .chat-input') as HTMLInputElement | null;
  if (field) field.value = '';
}

/** A box as words. */
const boxWords = (box: DOMRect): string =>
  `${box.width.toFixed(0)}x${box.height.toFixed(0)} px at ${box.left.toFixed(0)}, ${box.top.toFixed(0)}`;

/** Whether `inner` lies within `outer` (to half a px). */
const within = (inner: DOMRect, outer: DOMRect): boolean => inner.left >= outer.left - 0.5
  && inner.right <= outer.right + 0.5 && inner.top >= outer.top - 0.5 && inner.bottom <= outer.bottom + 0.5;

/** The chat within the window, its lines shown (six at most shut), the box and Send in it open, the button on touch. */
export function chatChecked(open: boolean, touch: boolean): Found {
  const window_ = new DOMRect(0, 0, innerWidth, innerHeight);
  const chat = element('#chat')!;
  const box = boxOf(chat);
  const rows = [...chat.querySelectorAll('.chat-line')];
  const shown = rows.filter((row) => seenOf(row)).length;
  const lines = [`  the chat: ${boxWords(box)}, ${shown} of ${rows.length} lines shown`];
  const problems: string[] = [];
  if (box.width < 1 || !shown) problems.push('chat: no lines shown');
  else if (!within(box, window_)) problems.push('chat: reaches past the window');
  if (!open && shown > SHUT_LINES) problems.push(`chat: ${shown} lines shown shut, past the newest ${SHUT_LINES}`);
  if (open) {
    for (const [name, selector] of [['box', '.chat-input'], ['Send', '.chat-send']] as const) {
      const part = boxOf(chat.querySelector(selector)!);
      lines.push(`  its ${name}: ${boxWords(part)}`);
      if (part.width < 1) problems.push(`chat: no ${name} shown open`);
      else if (!within(part, window_)) problems.push(`chat: its ${name} reaches past the window`);
    }
  }
  if (touch) {
    const button = boxOf(element('#btn-chat')!);
    lines.push(`  the chat button: ${boxWords(button)}`);
    if (button.width < BUTTON_SIDE - 1) problems.push(`chat: the chat button is ${button.width.toFixed(0)} px across`);
  }
  return { lines, problems };
}

/** The canary's plant: the lines taken away. */
export function plantChat(): void {
  for (const line of document.querySelectorAll('.lab-chat')) line.remove();
}

/** What the canary must raise. */
export const chatCanary = caught({ name: 'no lines shown', what: 'the chat\'s lines taken away' });
