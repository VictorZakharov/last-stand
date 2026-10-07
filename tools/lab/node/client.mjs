// The command line's side of the lab's server (tools/lab): a command sent to `npm run lab:serve` and its reply, a
// server restarting waited for, and a source change waited for (`--watch`).
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { labError } from './errors.mjs';
import { LAB_PORT, SERVER_NOTE } from './paths.mjs';

/** how long a restarting server is waited for, ms */
const RESTART_WAIT_MS = 60_000;
/** how often a restarting server is asked whether it's back, ms */
const RESTART_POLL_MS = 300;

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

/**
 * POSTs `body` to the server's `path` as JSON; resolves with its reply, or null when no server is up. Rejects with
 * the server's refusal when it refused the request.
 */
export function request(path, body = {}) {
  return new Promise((resolvePromise, reject) => {
    const headers = { 'content-type': 'application/json' };
    const options = { host: '127.0.0.1', port: LAB_PORT, path, method: 'POST', headers };
    const call = http.request(options, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        text += chunk;
      });
      response.on('end', () => {
        try {
          resolvePromise(JSON.parse(text));
        } catch {
          reject(new Error(`the lab server answered ${response.statusCode}: ${text.slice(0, 200)}`));
        }
      });
    });
    call.on('error', (error) => {
      if (error.code === 'ECONNREFUSED') resolvePromise(null);
      else reject(error);
    });
    call.end(JSON.stringify(body));
  });
}

/** Whether a process is alive. */
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether a server is restarting: none answers, but the last one's watcher (`node --watch` in `lab:serve`) is still
 * alive and will start it again.
 */
function serverRestarting() {
  try {
    const note = JSON.parse(readFileSync(SERVER_NOTE, 'utf8'));
    return note.port === LAB_PORT && isAlive(note.watcher);
  } catch {
    return false;
  }
}

/** Waits for the server to answer again; resolves with whether it did. */
async function waitForServer() {
  const deadline = Date.now() + RESTART_WAIT_MS;
  while (Date.now() < deadline) {
    if (await request('/ping')) return true;
    await sleep(RESTART_POLL_MS);
  }
  return false;
}

/**
 * Sends a command to the server; resolves with its reply (`{ ok, text, version }`), or null when no server is up. A
 * server restarting (its code changed: `lab:serve` watches it), before the command or under it, is waited for and
 * the command sent again.
 */
export async function sendToServer(call) {
  try {
    const reply = await request('/run', call);
    if (reply || !serverRestarting()) return reply;
    console.log('(the lab server is restarting: waiting for it)');
  } catch (error) {
    if (error.code !== 'ECONNRESET') throw error;
    console.log('(the lab server restarted while it ran the command: sending it again)');
  }
  if (!(await waitForServer())) return null;
  return request('/run', call);
}

/**
 * Waits until the source has changed since `version` (a reply's) and settled; resolves with the new version and the
 * files changed last. A server restarting meanwhile is waited for; one gone for good rejects.
 */
export async function waitForChange(version) {
  for (;;) {
    let reply;
    try {
      reply = await request('/changes', { since: version });
    } catch (error) {
      if (error.code !== 'ECONNRESET') throw error;
    }
    if (reply?.changed) return { version: reply.version, files: reply.files ?? [] };
    if (reply) continue;
    if (!serverRestarting() || !(await waitForServer())) throw labError('the lab server stopped');
    // (a restarted server counts its versions from 0 again: its own code changed, so the command runs again)
    return { version: 0, files: ['the lab server (restarted)'] };
  }
}
