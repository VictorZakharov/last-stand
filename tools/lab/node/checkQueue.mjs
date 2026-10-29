// A check's queue (tools/lab): each job's sides as tasks of their own, handed to the sessions so that a page booted
// for one task runs the next too. An A/B's other side runs first, every job's that isn't kept yet (sideCache.mjs),
// and this tree's after it reads it back: run as one task, a job closed one side's page to boot the other's, and a
// check of 162 jobs booted 324 pages, at 15 to 20 s a boot most of its time.

/**
 * A task's page: its side, its hero and the kind of page its command may run on (a session's page runs every task of
 * the same one: commands.mjs `pageKind`, `page` in check.mjs `jobOf`). Each set-up afresh starts a run of its own
 * (page/lab.ts `runAfresh`): in the run kept from the eyes' jobs, Twin Fangs' blows dealt 20 less (`hits`) and two of
 * the warrior's gait scenarios stepped otherwise.
 */
export function pageOf(task) {
  return `${task.side}:${task.job.options.class}:${task.job.page ?? task.job.command}`;
}

/** The name a task's time is kept under (durations.json): a job's own for this tree, `@other` after it for the
 *  other side. */
export function taskName(task) {
  return task.side === 'other' ? `${task.job.name}@other` : task.job.name;
}

/**
 * What a task took last time (`durations.json`, by `taskName`): its own work (`step`, s) and the boot it waited for
 * (`boot`, s), and whether its page was booted again for it (`reboots`: a command that counts the shaders compiled late,
 * on a page that had compiled some); null if it never ran. A number is a duration from before boots were kept apart.
 */
export function lastRun(durations, task) {
  const entry = durations[taskName(task)];
  if (entry === undefined) return null;
  if (typeof entry === 'number') return { step: entry, boot: 0, reboots: false };
  return { step: entry.step ?? 0, boot: entry.boot ?? 0, reboots: Boolean(entry.reboots) };
}

/**
 * The tasks of `jobs`: the other side of each job `runsOther` names (an A/B's not kept yet), then every job on this
 * tree; each part as long as its work last took (`durations`), the longest first within its side.
 */
export function tasksOf(jobs, runsOther, durations) {
  const cost = (task) => lastRun(durations, task)?.step ?? Infinity;
  const longestFirst = (tasks) => tasks.sort((a, b) => cost(b) - cost(a));
  const others = jobs.filter(runsOther).map((job) => ({ job, side: 'other' }));
  const mine = jobs.map((job) => ({ job, side: 'mine' }));
  return [...longestFirst(others), ...longestFirst(mine)];
}

/**
 * The tasks still to run, handed out a session at a time: the first that runs on the page the session has up, else
 * the first whose page no other session has up (a boot either way: one another session would have run without),
 * else the first there is; a job on this tree only once its other side has started (it waits for it to finish).
 */
export class CheckQueue {
  constructor(tasks) {
    this.waiting = [...tasks];
    /** the page each session has up, by the session */
    this.held = new Map();
    /** each job's other side once started, by the job's name: settled when it's done */
    this.othersStarted = new Map();
    this.othersQueued = new Set(tasks.filter((task) => task.side === 'other').map((task) => task.job.name));
  }

  /** Whether `task` can start now: its job's other side has been handed out (a session takes the other sides first,
   *  so there is always one that can while any task waits). */
  canStart(task) {
    return task.side === 'other' || !this.othersQueued.has(task.job.name);
  }

  /**
   * The next task for session `who` whose page is `page` (`pageOf`; null: none yet), taken off the queue, with what
   * it must wait for first (its job's other side, still running), or null when every task has been handed out.
   */
  next(page, who = 0) {
    const startable = this.waiting.filter((task) => this.canStart(task));
    const othersUp = new Set([...this.held].filter(([session]) => session !== who).map(([, up]) => up));
    const task = startable.find((each) => pageOf(each) === page)
      ?? startable.find((each) => !othersUp.has(pageOf(each)))
      ?? startable[0];
    if (!task) {
      this.held.delete(who);
      return null;
    }
    this.held.set(who, pageOf(task));
    this.waiting.splice(this.waiting.indexOf(task), 1);
    if (task.side === 'other') this.othersQueued.delete(task.job.name);
    const before = this.othersStarted.get(task.job.name) ?? null;
    return { task, before: task.side === 'mine' ? before : null };
  }

  /** Marks `task` started, `running` its promise (called as it's handed out): a job on this tree waits on its other
   *  side's. */
  started(task, running) {
    if (task.side !== 'other') return;
    this.othersStarted.set(task.job.name, running.catch(() => {}));
  }
}

/** what a task never timed is taken to take, s */
const UNTIMED = 10;
/** a boot, when no task's was ever timed, s */
const BOOT_UNTIMED = 15;

/** The median of the boots `durations` timed (s), or `BOOT_UNTIMED`. */
export function bootSeconds(durations) {
  const boots = Object.values(durations).map((entry) => entry?.boot ?? 0).filter((boot) => boot > 0).sort((a, b) => a - b);
  return boots.length ? boots[Math.floor(boots.length / 2)] : BOOT_UNTIMED;
}

/**
 * The check `tasks` would make in `workers` sessions, as the queue hands them out, each task as long as it last took
 * (`durations`) and a boot of `boot` s wherever its session's page is another side's or hero's (or the task booted
 * again last time): each session's tasks, boots and end (s), and the end of the last.
 */
export function planOf(tasks, workers, durations, boot = bootSeconds(durations)) {
  const queue = new CheckQueue(tasks);
  const sessions = Array.from({ length: workers }, () => ({ clock: 0, page: null, tasks: 0, boots: 0, done: false }));
  /** each job's other side's end, by the job's name */
  const othersEnd = new Map();
  for (;;) {
    const waiting = sessions.filter((session) => !session.done);
    if (!waiting.length) break;
    const session = waiting.reduce((first, each) => (each.clock < first.clock ? each : first));
    const next = queue.next(session.page, sessions.indexOf(session));
    if (!next) {
      session.done = true;
      continue;
    }
    const { task } = next;
    const last = lastRun(durations, task);
    // (a job on a page of its own boots every time: commands.mjs `pageKind`)
    const ownPage = task.job.page === null;
    const boots = ownPage || pageOf(task) !== session.page || Boolean(last?.reboots);
    const start = task.side === 'mine' ? Math.max(session.clock, othersEnd.get(task.job.name) ?? 0) : session.clock;
    session.clock = start + (boots ? boot : 0) + (last?.step ?? UNTIMED);
    if (task.side === 'other') othersEnd.set(task.job.name, session.clock);
    session.page = pageOf(task);
    session.tasks++;
    if (boots) session.boots++;
  }
  const end = Math.max(...sessions.map((session) => session.clock));
  return { sessions: sessions.map(({ clock, tasks: count, boots }) => ({ end: clock, tasks: count, boots })), end, boot };
}
