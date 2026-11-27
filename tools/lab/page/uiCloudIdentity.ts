// Save Slots' private identity display at the UI's screen sizes. Account snapshots are explicit fixtures here;
// the real OAuth/session boundaries and persistence are checked by server/saves/test/google.test.mjs.
import { CLOUD, cloudIdentityHTML } from '../../../src/ui/cloudSaves';
import { openSaves } from '../../../src/ui/saves';
import { forgetServiceHealth } from '../../../src/loot/cloudApi';
import { boxOf, realWait, seenOf, type Lab } from './lab';

const EMAIL = 'a.long.google.account.address.for.testing.wrapping@a.long.example.test';
export const CLOUD_IDENTITY_CANARY = { name: 'email missing', what: 'the Google email removed from the slot' };
let realFetch: typeof fetch;

export async function openCloudIdentity(lab: Lab): Promise<void> {
  realFetch = window.fetch;
  window.fetch = async (input, init) => {
    const path = new URL(input instanceof Request ? input.url : String(input), location.href).pathname;
    if (path === '/saves/health') return Response.json({ ok: true, google: true });
    if (path.startsWith('/saves/')) throw new Error('lab: identity snapshots must not contact a live account');
    return realFetch(input, init);
  };
  // (asked again of the stub: a state before this one asked the lab's server, which has no saves service, and the
  // health is asked once a visit, so Google's button stayed hidden in a run of every state)
  forgetServiceHealth();
  openSaves(true);
  const header = document.querySelector('#saves .sv-pane .sv-head')!;
  header.insertAdjacentHTML('beforeend', `<div class="sv-cloud-info"><span class="sv-cloud-mark">${CLOUD}<span>Cloud</span></span><div class="sv-account">${cloudIdentityHTML({
    google: true, passkey: true, session: { via: 'google', email: EMAIL },
  })}</div></div>`);
  await googleShown(lab);
}

export function closeCloudIdentity(): void {
  document.querySelector('#saves .sv-cloud-info')?.remove();
  openSaves(false);
  window.fetch = realFetch;
  forgetServiceHealth();
}

/** the browser's own clock (the page's `performance.now` is the lab's, standing still between frames) */
const browserNow = (): number => (window as unknown as { __labClock: { realNow(): number } }).__labClock.realNow();

/** what a check found */
type Checked = { lines: string[]; problems: string[] };

/** how long the stub's health answer is waited for (ms of the browser's time), and the frames the UI kit is given to
 *  draw what changed (its Google button shown, the canary's plant) */
const HEALTH_WAIT_MS = 2000;
const KIT_FRAMES = 3;

/** The bar's Google button shown once the stub's health has answered, then the kit's frames to draw it: the save
 *  slots are drawn by the engine (src/ui/savesSheet.ts), and read at once the button stood unshown, 0 px wide. */
async function googleShown(lab: Lab): Promise<void> {
  const started = browserNow();
  const button = (): HTMLElement | null => document.querySelector<HTMLElement>('#saves .sc-google');
  while (button()?.hidden && browserNow() - started < HEALTH_WAIT_MS) await realWait(20);
  await lab.step(KIT_FRAMES);
}

/** Current authentication, linked methods, safe text, and the real slot's wrapping/layout are checked separately. */
export async function cloudIdentityChecked(canary: boolean, lab: Lab): Promise<Checked> {
  await googleShown(lab);
  const problems: string[] = [];
  for (const via of ['passkey', 'code'] as const) {
    const box = document.createElement('div');
    box.innerHTML = cloudIdentityHTML({ google: true, passkey: true, session: { via } });
    if (box.querySelector('.sc-identity svg') || !box.textContent?.includes(`Signed in with a ${via}`)) {
      problems.push(`cloudIdentity: linked Google mislabels a ${via} session`);
    }
    if (!box.textContent?.includes('Linked: Google + Passkey')) problems.push('cloudIdentity: linked methods missing');
    if (!box.querySelector('.sc-methods svg')) problems.push('cloudIdentity: linked Google logo missing');
  }
  const unsafe = document.createElement('div');
  const text = '<img src=x onerror="throw 1">@example.test';
  unsafe.innerHTML = cloudIdentityHTML({ google: true, session: { via: 'google', email: text } });
  if (unsafe.querySelector('img') || !unsafe.textContent?.includes(text)) problems.push('cloudIdentity: email is interpreted as HTML');
  const legacy = cloudIdentityHTML({ google: true, session: { via: 'google' } });
  if (!legacy.includes('sign in again to show email')) problems.push('cloudIdentity: older Google session has no explanation');
  const panel = document.querySelector<HTMLElement>('#saves .sv-account')!;
  const button = document.querySelector<HTMLElement>('#saves .sc-google');
  if (!button?.querySelector('svg')) problems.push('cloudIdentity: Google sign-in button logo missing');
  if (button) {
    const box = boxOf(button);
    if (!seenOf(button) || box.left < 0 || box.right > innerWidth || box.bottom > innerHeight) {
      const seen = seenOf(button) ? 'shown' : 'hidden';
      const at = `${box.left.toFixed(0)} to ${box.right.toFixed(0)} across, ${box.top.toFixed(0)} to ${box.bottom.toFixed(0)} down`;
      const where = `${seen}, at ${at} of ${innerWidth}x${innerHeight}`;
      problems.push(`cloudIdentity: Google sign-in button is not visible within the window (${where})`);
    }
  }
  const unknown = cloudIdentityHTML({ google: true });
  if (!unknown.includes('login details unavailable')) problems.push('cloudIdentity: missing session details unexplained');
  if (canary) {
    panel.querySelector('b')!.textContent = '';
    await lab.step(KIT_FRAMES);
  }
  if (!panel.textContent?.includes(EMAIL)) problems.push('cloudIdentity: email missing');
  const logo = panel.querySelector('svg');
  if (!logo || !seenOf(logo)) problems.push('cloudIdentity: Google logo missing');
  const bounds = boxOf(panel);
  const header = panel.closest('.sv-head');
  if (!header || bounds.right < boxOf(header).right - 35) problems.push('cloudIdentity: identity is not at the right of the header');
  const privacy = boxOf(document.querySelector('#saves .sc-privacy')!);
  const lastButton = boxOf(document.querySelector('#saves .sc-code')!);
  if (privacy.top >= lastButton.bottom || privacy.bottom <= lastButton.top) problems.push('cloudIdentity: Privacy is on a separate line from the buttons');
  const pane = boxOf(panel.closest('.sv-pane')!);
  // (each part's box where it's drawn: the engine draws the slot, so its text has no range on the page)
  for (const node of panel.querySelectorAll<HTMLElement>('span, b, svg')) {
    const box = boxOf(node);
    if (box.width < 1) continue;
    const outside = box.left < pane.left - 1 || box.right > pane.right + 1;
    if (outside || box.top < bounds.top - 1 || box.bottom > bounds.bottom + 1) {
      problems.push('cloudIdentity: identity text overflows the cloud slot');
    }
  }
  if (bounds.bottom > innerHeight || bounds.top < 0) problems.push('cloudIdentity: identity is outside the window');
  const body = boxOf(panel.closest('.sv-pane')!.querySelector('.sv-body')!);
  if (body.top < bounds.bottom - 1 || body.height < 20) problems.push('cloudIdentity: identity overlaps the heroes');
  return { lines: ['  Google email/logo, Google + Passkey, passkey/code sessions, old sessions and escaped text checked',
    `  identity ${Math.round(bounds.width)} × ${Math.round(bounds.height)} px within its slot`], problems };
}
