// The lab's command line (tools/lab, see its README): `npm run lab -- <command> [options]`. A command goes to the
// lab's server when one is up (`npm run lab:serve`: the next command's page booted ahead); without one, it opens a
// session of its own, runs, and closes it. Exits with 1 when the command failed or found a problem.
import { request, sendToServer, waitForChange } from './node/client.mjs';
import { describeError, labError } from './node/errors.mjs';
import { parseCommandLine, usage } from './node/options.mjs';

/** Runs a command in a session of its own, for when no server is up. */
async function runAlone(call) {
  console.log('(no lab server is up: booting for this command alone; npm run lab:serve boots ahead of each)');
  // (loaded only here: the browser and Vite take a moment to load, and a command sent to the server needs neither)
  const { LabSession } = await import('./node/session.mjs');
  const session = await LabSession.open();
  try {
    const { text, problems } = await session.run(call);
    return { ok: problems.length === 0, text };
  } catch (error) {
    return { ok: false, text: describeError(error) };
  } finally {
    await session.close();
  }
}

/** Runs the command again each time the source changes, until Ctrl+C. Needs the server. */
async function watch(call, reply) {
  let version = reply.version;
  for (;;) {
    console.log('\n(watching the source: the command runs again when it changes; Ctrl+C stops)');
    const { files } = await waitForChange(version);
    console.log(`(changed: ${files.join(', ')})\n`);
    const next = await sendToServer(call);
    if (!next) throw labError('the lab server stopped');
    console.log(next.text);
    version = next.version;
  }
}

async function main() {
  const call = parseCommandLine(process.argv.slice(2));
  if (call.command === 'help') {
    console.log(usage());
    return 0;
  }
  if (call.command === 'serve') {
    const { supervise } = await import('./node/supervisor.mjs');
    supervise();
    return null;
  }
  if (call.command === 'stop') {
    const reply = await request('/stop');
    console.log(reply ? reply.text : 'no lab server is up');
    return 0;
  }
  if (call.command === 'status') {
    const reply = await sendToServer(call);
    console.log(reply ? reply.text : 'no lab server is up (npm run lab:serve)');
    return 0;
  }
  if (call.options.watch) {
    const reply = await sendToServer(call);
    if (!reply) throw labError('--watch needs the lab server: npm run lab:serve');
    console.log(reply.text);
    return watch(call, reply);
  }
  const reply = (await sendToServer(call)) ?? (await runAlone(call));
  console.log(reply.text);
  return reply.ok ? 0 : 1;
}

// (exits at once: what's left open, the HTTP agent's sockets kept alive, would hold the process a few seconds)
main().then(
  (code) => {
    if (code !== null) process.exit(code);
  },
  (error) => {
    console.error(describeError(error));
    process.exit(1);
  },
);
