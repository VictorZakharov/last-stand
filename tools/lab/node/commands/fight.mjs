// `npm run lab -- fight`: its command line (help, options) and its run, in the command line's own process
// (node/commands/AGENTS.md).

/** `lab fight`, run by the command line itself: no page, no server. */
export default {
  summary: 'the fight as the dedicated server will run it: the game\'s fight built for Node (server/fight), rooms '
    + 'each in a worker thread on a battleground built as the game builds it, a crowd of foes stepped 20 times a '
    + 'second, or a run from `--wave`; says a room\'s build, step and memory, and that it fought: its foes came to '
    + 'the hero, its run cleared waves (a canary room with no hero, a run no one strikes in: neither; in full in '
    + '`commands/fight.md`)',
  help: 'the game\'s fight built for Node and run as the dedicated server will run it, rooms side by side in '
    + 'worker threads: each room\'s load, build, step and memory, and whether it fought',
  options: {
    biome: { kind: 'choice', choices: ['forest', 'crypt'], usage: 'forest|crypt', help: 'the battleground (forest)' },
    foe: { kind: 'text', usage: 'id', help: 'the foe of every room (the battleground\'s melee foe by default)' },
    count: { kind: 'number', usage: 'n', help: 'foes a room (38, a wave\'s most at once)' },
    wave: { kind: 'number', usage: 'n', help: 'a run from wave n instead of a crowd, the party striking' },
    rooms: { kind: 'number', usage: 'n', help: 'rooms side by side (4)' },
    seconds: { kind: 'number', usage: 's', help: 'how long each room fights (10)' },
  },
  async run(options) {
    // (imported as it runs: the command line reads every command's module on each run)
    const { measureFight, MELEE_FOE } = await import('../fightRooms.mjs');
    const biome = options.biome ?? 'forest';
    const { lines, problems } = await measureFight({
      biome,
      foe: options.foe ?? MELEE_FOE[biome],
      count: options.count ?? 38,
      wave: options.wave,
      rooms: options.rooms ?? 4,
      seconds: options.seconds ?? 10,
    });
    console.log(lines.join('\n'));
    for (const problem of problems) console.log(`FAILED: ${problem}`);
    return problems.length ? 1 : 0;
  },
};
