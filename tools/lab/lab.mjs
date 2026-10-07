// The lab's command line (tools/lab, see its README): `npm run lab -- <command> [options]`.
// A command goes to the lab's server when one is up (`npm run lab:serve`: the next command's page booted ahead);
// without one, it opens a session of its own, runs, and closes it.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { LabSession, SERVER_NOTE, serve } from './node/session.mjs';

const PORT = Number(process.env.LAB_PORT ?? 5196);

const USAGE = `npm run lab -- <command> [options]      (npm run lab:serve boots each command's page ahead of it)

  sheet    the hero pictured in the states the player sees (--states stand,walk,full), from the game's views and
           close up (--views lobby,top,third,front,left,right,back,above; eyes with --view first), with each
           arm's load and posture beside them; writes tools/lab/out/sheets/<--tag, latest>/sheet.png
  carry    the ranger's carried bow against his body through a carry's round (--canary: plant faults it must catch)
  probe    run a probe module: npm run lab -- probe .tmp/mine.ts (its default export takes the lab and the options)
  eval     evaluate an expression in the page, with \`lab\` in scope: npm run lab -- eval "lab.player.nocked"
  status   what the server serves and has booted
  stop     stop the server

  any command: --ab[=ref]   also on another commit, origin/main by default: its results beside this tree's, and
                            the lines that differ (a commit against itself agrees, line for line)
               --class c    the hero (ranger, warrior, mage; the last one used by default)
               --profile    where the command's time went in the page: its busiest functions
  set-up:      --view top|third|first  --at x,z  --facing rad  --nocked[=false]

  Every command runs on a page booted for it, so it gives the same result every time.`;

/** the options that take a value (`--states stand,walk`); any other `--name` is a switch, and `--name=value`
 *  gives any option a value (`--ab=165246d`; `--nocked=false` and `--setup=false` are booleans) */
const VALUE_OPTIONS = new Set(['states', 'views', 'tag', 'class', 'view', 'at', 'facing', 'focus']);

/** The options (`--name value`, `--name=value`, `--switch`) and the positional arguments, under `_`. */
function parseArguments(argv) {
  const options = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      options._.push(arg);
      continue;
    }
    const [name, value] = arg.slice(2).split(/=(.*)/s);
    if (value === 'true' || value === 'false') {
      options[name] = value === 'true';
    } else if (value !== undefined) {
      options[name] = value;
    } else if (VALUE_OPTIONS.has(name)) {
      if (i + 1 >= argv.length) throw new Error(`--${name} needs a value`);
      options[name] = argv[++i];
    } else {
      options[name] = true;
    }
  }
  return options;
}

/** POSTs `body` to the server's `path`; resolves with its reply, or null when no server is up. */
function request(path, body) {
  return new Promise((resolvePromise, reject) => {
    const headers = { 'content-type': 'application/json' };
    const call = http.request({ host: '127.0.0.1', port: PORT, path, method: 'POST', headers }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => {
        try {
          resolvePromise(JSON.parse(text));
        } catch (error) {
          reject(error);
        }
      });
    });
    call.on('error', (error) => {
      if (error.code === 'ECONNREFUSED') resolvePromise(null);
      else reject(error);
    });
    call.end(JSON.stringify(body ?? {}));
  });
}

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const RESTART_WAIT_MS = 60_000;

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
    return note.port === PORT && isAlive(note.watcher);
  } catch {
    return false;
  }
}

/** Waits for the server to answer again; resolves with whether it did. */
async function waitForServer() {
  const deadline = Date.now() + RESTART_WAIT_MS;
  while (Date.now() < deadline) {
    if (await request('/ping')) return true;
    await sleep(300);
  }
  return false;
}

/**
 * Sends a command to the server; resolves with its reply, or null when no server is up. A server restarting (its
 * code changed: `lab:serve` watches it), before the command or under it, is waited for and the command sent again.
 */
async function sendToServer(call) {
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

/** Runs a command in a session of its own, for when no server is up. */
async function runAlone(call) {
  console.log('(no lab server is up: booting for this command alone; npm run lab:serve boots ahead of each)');
  const session = await LabSession.open();
  try {
    return { ok: true, text: await session.run(call) };
  } catch (error) {
    return { ok: false, text: String(error?.message ?? error) };
  } finally {
    await session.close();
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === 'help' || command === '--help') {
    console.log(USAGE);
    return 0;
  }
  if (command === 'serve') {
    await serve(PORT);
    return null;
  }
  if (command === 'stop') {
    const reply = await request('/stop');
    console.log(reply ? reply.text : 'no lab server is up');
    return 0;
  }
  const call = { command, options: parseArguments(rest) };
  const reply = (await sendToServer(call)) ?? (await runAlone(call));
  console.log(reply.text);
  return reply.ok ? 0 : 1;
}

main().then(
  (code) => {
    if (code !== null) process.exit(code);
  },
  (error) => {
    console.error(`lab: ${error.message}`);
    process.exit(1);
  },
);
