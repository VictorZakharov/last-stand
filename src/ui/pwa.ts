// Installable, offline game (PWA). Registers the service worker that scripts/pwa.ts builds, offers
// the browser's install prompt from the lobby, and asks to reload once a new version is cached.
// Production builds only: the dev server has no worker.
import { G } from '../state';
import { sfx } from '../core/audio';

const $ = (s: string): HTMLElement => document.querySelector<HTMLElement>(s)!;

/** Chrome's install prompt event (not in the DOM typings). */
interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }

export function initPwa(): void {
  initInstall();
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const base = import.meta.env.BASE_URL;
  const sw = navigator.serviceWorker;
  let reloading = false, asked = false;
  sw.addEventListener('controllerchange', () => {
    // the new version took over because the player asked for it
    if (asked && !reloading) { reloading = true; location.reload(); return; }
    // first install: the worker now sees requests, so fetch the fonts again to cache them for offline
    cacheFonts();
  });
  sw.register(`${base}sw.js`, { scope: base }).then((reg) => {
    const offer = () => { if (reg.waiting && sw.controller) offerUpdate(() => { asked = true; reg.waiting?.postMessage('skip-waiting'); }); };
    offer();
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed') offer(); });
    });
  }).catch(() => { /* no worker (private mode, file://): the game still runs online */ });
}

/** The fonts are cross-origin (Google Fonts); re-requesting them through the worker stores them. */
async function cacheFonts(): Promise<void> {
  const link = document.querySelector<HTMLLinkElement>('link[href*="fonts.googleapis.com/css"]');
  if (!link) return;
  try {
    const css = await (await fetch(link.href)).text();
    for (const m of css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)) fetch(m[1]).catch(() => {});
  } catch { /* offline: next time */ }
}

/** A new version is cached: offer a reload in the lobby (never in the middle of a run). */
function offerUpdate(apply: () => void): void {
  const toast = $('#update-toast');
  const show = () => { if (G.mode === 'menu') toast.classList.remove('hidden'); else setTimeout(show, 2000); };
  toast.querySelector<HTMLElement>('.ut-reload')!.onclick = () => { sfx.click(); toast.classList.add('hidden'); apply(); };
  toast.querySelector<HTMLElement>('.ut-later')!.onclick = () => { sfx.click(); toast.classList.add('hidden'); };
  show();
}

/** Running as the installed app (its own window, not a browser tab). */
const installed = (): boolean =>
  matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

type Platform = 'ios' | 'android' | 'other';
function platform(): Platform {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; its touch screen gives it away
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return /Android/.test(ua) ? 'android' : 'other';
}

/** Where the browser keeps "add to home screen" when it offers no prompt of its own. */
function steps(p: Platform): string {
  if (p === 'ios') return `<p>Tap the <b class="gold">Share</b> button (the square with an arrow) in the browser bar, then <b class="gold">Add to Home Screen</b>.</p>
    <p>No such entry? Open this page in <b>Safari</b> and try again.</p>`;
  return `<p>Open the browser menu (<b class="gold">&#8942;</b>, top or bottom corner) and pick <b class="gold">Install app</b> or <b class="gold">Add to Home screen</b>.</p>
    <p>No such entry? Open this page in <b>Chrome</b> and try again.</p>`;
}

/**
 * The Install link. Chrome and Edge fire a prompt event, and the link opens that prompt. Safari and
 * Firefox never do (and Chrome holds it back for a while), so on a phone or tablet the link is
 * always there, and without a prompt it shows where the browser keeps "add to home screen".
 */
function initInstall(): void {
  const btn = $('#btn-install'), modal = $('#install');
  const p = platform();
  let prompt: InstallPrompt | null = null;
  const show = (on: boolean): void => { btn.classList.toggle('hidden', !on || installed()); };
  show(p !== 'other');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    prompt = e as InstallPrompt;
    show(true);
  });
  window.addEventListener('appinstalled', () => { prompt = null; show(false); });
  $('#btn-install-close').onclick = () => { sfx.click(); modal.classList.add('hidden'); };
  btn.onclick = async () => {
    sfx.click();
    if (!prompt) {
      modal.querySelector<HTMLElement>('.install-steps')!.innerHTML = steps(p);
      modal.classList.remove('hidden');
      return;
    }
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    prompt = null;   // a prompt can be shown once; the steps are still there if it was dismissed
    show(outcome !== 'accepted' && p !== 'other');
  };
}
