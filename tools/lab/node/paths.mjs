// Where the lab lives and writes (tools/lab): everything it writes stays under tools/lab/out.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** the repository's root: the tree the lab serves as "this tree" */
export const REPO = resolve(HERE, '../../..');

/** everything the lab writes: sheets, exported commits, Vite's cache, the browser's profile */
export const OUT = resolve(HERE, '../out');

/**
 * The server's note of itself while it runs: its process and the one watching it (`node --watch` in `lab:serve`),
 * so the command line can tell a server restarting from none at all.
 */
export const SERVER_NOTE = join(OUT, 'server.json');

/** the port the lab's server answers on (127.0.0.1 only) */
export const LAB_PORT = Number(process.env.LAB_PORT ?? 5196);
