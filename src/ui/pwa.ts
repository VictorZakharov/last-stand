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

/** Browsers that support it (Chrome, Edge, Android) fire a prompt event: an Install link offers it. */
function initInstall(): void {
  const btn = $('#btn-install');
  let prompt: InstallPrompt | null = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    prompt = e as InstallPrompt;
    btn.classList.remove('hidden');
  });
  window.addEventListener('appinstalled', () => { prompt = null; btn.classList.add('hidden'); });
  btn.onclick = async () => {
    if (!prompt) return;
    sfx.click();
    await prompt.prompt();
    await prompt.userChoice;
    prompt = null;
    btn.classList.add('hidden');
  };
}
