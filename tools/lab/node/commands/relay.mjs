// `npm run lab -- relay`: its command line (help, options) and its run, in the command line's own process
// (node/commands/AGENTS.md).

/** `lab relay`, run by the command line itself: no page, no server. */
export default {
  summary: 'what a round trip through the co-op relay is made of, from this PC: the relay\'s ping, a message from one '
    + 'socket to another through it on one clock, both with a 4-player fight\'s messages, and the ping read by a '
    + 'busy thread, which must read longer (`--server` another relay; in full in `commands/relay.md`)',
  help: 'a private room of four sockets on the co-op relay, timed: the relay\'s own ping, a message through it from '
    + 'one socket to another on one clock, both with a fight\'s messages, and the ping read by a thread busy as a '
    + 'game\'s frames keep its page (once: npm ci --prefix server/relay)',
  options: {
    server: { kind: 'text', usage: 'wss://host', help: 'the relay to time (wss://ls.wellscoped.dev by default)' },
    snapshot: { kind: 'number', usage: 'bytes', help: 'the host\'s snapshot\'s size in the fight (12000 by default)' },
  },
  async run(options) {
    // (imported as it runs: the command line reads every command's module on each run)
    const { measureRelay } = await import('../relayRoute.mjs');
    const { lines, problems } = await measureRelay({ server: options.server, snapshotBytes: options.snapshot });
    console.log(lines.join('\n'));
    for (const problem of problems) console.log(`FAILED: ${problem}`);
    return problems.length ? 1 : 0;
  },
};
