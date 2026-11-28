// The guide's portraits kept in the browser's storage for the build that made them (a production build's alone: a
// dev build's models change under it), so a later visit makes none (`portraits.ts`).
declare const __BUILD__: { ref: string; time: string };

/** the browser's store the pictures are kept in */
export const CACHE = { db: 'last-stand-guide', store: 'portraits', on: !import.meta.env.DEV && typeof indexedDB !== 'undefined' };

/** the build's own key: its commit and time (a new deploy's models may differ) */
const buildKey = (): string => `${__BUILD__.ref}@${__BUILD__.time}`;

function openStore(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(CACHE.db, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(CACHE.store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

/** The pictures this build kept on an earlier visit, each handed to `take` decoded; another build's let go. */
export async function kept<Who extends string>(take: (id: Who, picture: ImageBitmap) => void): Promise<void> {
  if (!CACHE.on) return;
  const db = await openStore();
  if (!db) return;
  const found: [Who, Blob][] = [];
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(CACHE.store, 'readwrite');
      const store = tx.objectStore(CACHE.store);
      const req = store.openCursor();
      const prefix = `${buildKey()}|`;
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        const key = String(cursor.key);
        if (key.startsWith(prefix) && cursor.value instanceof Blob) found.push([key.slice(prefix.length) as Who, cursor.value]);
        else cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch { resolve(); }
  });
  db.close();
  // (decoded off the page's thread)
  await Promise.all(found.map(async ([id, blob]) => {
    try { take(id, await createImageBitmap(blob)); } catch { /* left to be made again */ }
  }));
}

/** A picture kept for this build's later visits. */
export function keep(id: string, blob: Blob): void {
  if (!CACHE.on) return;
  void openStore().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(CACHE.store, 'readwrite');
      tx.objectStore(CACHE.store).put(blob, `${buildKey()}|${id}`);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    } catch { db.close(); }
  });
}
