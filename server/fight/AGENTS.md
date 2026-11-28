# `server/fight`

The dedicated server's fight: the game's fight built for Node (`vite.config.ts`: `src/headless/fight.ts`, its drawing
side swapped out, `src/headless/AGENTS.md`), into `dist/` (ignored by git). `npm run lab -- fight` builds it and runs
rooms of it in worker threads, timed and judged (`tools/lab/commands/fight.md`). The process that joins co-op rooms as
their host, and its deploy by Dokci, are to come. The rules across the game are the [root AGENTS.md](../../AGENTS.md),
the servers' [`server/AGENTS.md`](../AGENTS.md).

- `vite.config.ts`: the server's build alone. Its plugin resolves every import of `src/<path>` to
  `src/headless/swap/<path>` where one stands; the game's own aliases it needs (ez-tree from its source) and defines
  (`__BUILD__`, `__DEV_TOOLS__` off) are set here, not taken from the game's config, whose plugins are the page's.
