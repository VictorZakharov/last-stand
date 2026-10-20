// What the loading workers make, kept across visits in IndexedDB (a production build's): a return reads in a few
// ms what took the workers seconds (core/pbr.worker.ts). Each entry holds the build that made it (the worker's
// script by its name, which carries a hash of its code), so a new build makes it again; one entry a key keeps the
// store to one build's worth (~90 MB). Dev builds keep nothing: their scripts' names don't change with their code.

const DB = 'last-stand-kept';
const STORE = 'made';
/** the build reading and keeping: the worker's script */
const BUILD = self.location.pathname;
const KEEPS = !import.meta.env.DEV && typeof indexedDB !== 'undefined';

/** the store, once open (null where it can't be: a private window, storage blocked) */
let db: IDBDatabase | null = null;
let opening: Promise<void> | null = null;
const open = (): Promise<void> => (opening ??= new Promise((resolve) => {
  try {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => { db = request.result; resolve(); };
    request.onerror = () => resolve();
  } catch { resolve(); }
}));

/** What `key` was kept as by this build (undefined where it wasn't, or by another build). */
export async function kept<T>(key: string): Promise<T | undefined> {
  if (!KEEPS) return undefined;
  await open();
  if (!db) return undefined;
  const request = db.transaction(STORE).objectStore(STORE).get(key);
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result?.build === BUILD ? request.result.value as T : undefined);
    request.onerror = () => resolve(undefined);
  });
}

/**
 * Keeps each value as its key's, in one transaction, resolved once written (or failed: a full disk keeps nothing).
 * They're copied at once, so their buffers may be sent on as soon as this returns; the store must be open (`kept`
 * asked first). Keep them once nothing is left to ask for: a read waits for every write asked before it, and a
 * first visit's workers, each keeping a map as it made it, spent 13.8 s of their 22 s waiting on the store.
 */
export function keepAll(entries: readonly (readonly [string, unknown])[]): Promise<void> {
  if (!KEEPS || !db || !entries.length) return Promise.resolve();
  try {
    const transaction = db.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    for (const [key, value] of entries) store.put({ build: BUILD, value }, key);
    return new Promise((resolve) => {
      transaction.oncomplete = transaction.onerror = transaction.onabort = () => resolve();
    });
  } catch {
    return Promise.resolve();
  }
}
