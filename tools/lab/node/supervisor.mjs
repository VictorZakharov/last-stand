// The lab server's supervisor (tools/lab, `npm run lab:serve`): it runs the server in a child process, starts it again
// when the lab's Node code changes or the server asks (its code is older than a command's), and stops it when it is
// stopped itself, or when whatever started it is gone (a terminal's task killed on Windows left the server running,
// holding its ports and a browser).
import { fork } from 'node:child_process';
import { watch } from 'node:fs';
import { join } from 'node:path';
import { LAB } from './codeStamp.mjs';

/** the server's own entry, run in the child */
const SERVER_ENTRY = join(LAB, 'node', 'serverProcess.mjs');
/** how long the code must be left alone after a change before the server starts again, ms */
const CODE_SETTLE_MS = 300;
/** how often the supervisor checks that whatever started it is still there, ms */
const PARENT_CHECK_MS = 2000;

/** Whether a process is alive. */
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Sends the server a message, if it can still hear one (it may be on its way out). */
function tell(child, message) {
  if (child.connected) child.send(message);
}

function log(message) {
  console.log(`[${new Date().toTimeString().slice(0, 8)}] ${message}`);
}

/** Runs the lab's server under supervision until it's stopped. */
export function supervise() {
  let child = null;
  /** what to do when the child exits: start it again, stop, or wait for the code to change (it failed) */
  let next = 'wait';
  let settling = null;

  const start = () => {
    next = 'wait';
    child = fork(SERVER_ENTRY, [], { stdio: 'inherit', windowsHide: true });
    child.on('message', (message) => {
      if (message?.restart) next = 'start';
      if (message?.stop) next = 'stop';
    });
    child.on('exit', (code) => {
      child = null;
      if (next === 'stop') process.exit(0);
      if (next === 'start') return start();
      log(`the lab server stopped (${code}); it starts again when the lab's code changes`);
    });
  };

  /** the server started again, once the code has settled */
  const codeChanged = () => {
    clearTimeout(settling);
    settling = setTimeout(() => {
      if (next === 'stop') return;
      if (!child) return start();
      next = 'start';
      tell(child, { restart: 'the lab\'s code changed' });
    }, CODE_SETTLE_MS);
  };
  watch(join(LAB, 'node'), (_event, file) => {
    if (String(file).endsWith('.mjs')) codeChanged();
  });
  watch(join(LAB, 'lab.mjs'), codeChanged);

  const stop = () => {
    if (!child) process.exit(0);
    next = 'stop';
    tell(child, { stop: true });
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  const parent = process.ppid;
  setInterval(() => {
    if (!isAlive(parent)) stop();
  }, PARENT_CHECK_MS).unref();

  start();
}
