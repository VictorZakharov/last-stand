# `check`

One command of the lab in full, moved here from [`COMMANDS.md`](../COMMANDS.md) (which lists every command, and the
options every command takes) for its size.

`check`: the checks of a change to how the heroes move, run side by side: the gait (its steps listed, no films), the
stops, the ranges and the run's form for every hero, the ranger's feet and carry, and the warrior through the eyes
(`eyes`: the basic attack's rows on every weapon, and every other skill on every weapon its way of holding them
takes, `check.mjs` `EYES_SKILLS`, its canaries on each way's first; with the cuts alone checked, five skills were
broken through the eyes and no check said so, #252) and his skills' light there (`cast`: the basic attack and
`EYES_SKILLS` on each way's first weapon, through the eyes in both biomes, `castParts`; a dual wielder's Power
Strike flashed three times a second and Bull Rush stood the camera inside a husk, and no check said so, #252), every
swing of his weapons stepped between its keys (`swing all`, in one job: Thunder Crescent's way back from the floor
took a greatsword's lower grip 7.7 cm past the left arm's reach between its keys, as far as the game holds it before
letting go, and its frames through the eyes read it held) and the foes his charge sweeps up and the skills cast with
it, with a shield and with two weapons (`rush`, `check.mjs` `RUSH_PARTS`), Twin Fangs' blows' pace (`hits`), and
every hero's hits in the battle log (`log`) (`--classes`, `--commands` for fewer, `--only` for the jobs whose name
has a text in it: `--only eyes-warrior-dual`), each report in `out/check/<command>-<hero>.txt` and its pictures in a
folder beside it.

## How it runs

- **Sessions side by side** (`--jobs n`, a core in three by default, at most 8), each a browser of its own, all of
  them served by one Vite server for this tree and one for the other commit. A job is one command for one hero, or a
  part of one (a gait scenario, an eyes row or skill, a cast); the eyes', the casts' and the gait's parts are put
  back together into one report a hero (`out/check/eyes-warrior.txt`, each under its name). It runs in the command
  line's own process, not the server's.
- **The other commit first** (`--ab`): it is exported once before the sessions start, and every job's side not kept
  yet (`out/ab-cache`, by the lab code the command runs: `node/labCode.mjs`) is run first, side by side, kept, and
  read back as its job runs this tree's; a warm check runs this tree's alone.
- **Pages kept between jobs** (`node/checkQueue.mjs`): a session takes next the longest job left for the page it has
  up (its side, hero and command), so a page booted for one job runs the next of its kind, and boots only for another
  side, hero or command; the other side's tasks are handed out first. Never from one command to another: each was
  shown the same on a page its own jobs had run on, but a page kept from the eyes' jobs dealt Twin Fangs' blows 20
  less (`hits`) and stepped two of the warrior's gait scenarios otherwise. A boot is 8 s alone, 25 to 30 s with four at once, and a boot a
  job was most of a check. A page is kept only for the commands shown to come out the same on it as on a page booted
  for each job (`keepsPage` in `node/commands.mjs`), and each of their set-ups in a check builds the hero afresh
  (`afresh`: `Fixture.fresh` for every set-up, the view taken from the top down, and the boot's cookies and storage
  put back as each command begins, `page/lab.ts`). Set up over the hero the jobs before had left, the eyes' Steel
  Tempest struck 25 frames earlier, and a skill bound to a key by one job (`bindKnown`) saved its loadout, which the
  next job's hero loaded. `form` and `log` run on pages of their own (`log` lists the game's clock), and so do the
  two-hander's eyes jobs: a cleave with pauses still turned its forearm past its range on 9 frames more after
  another job, with all of the above, and what carries over isn't found yet. A command that counts the shaders
  compiled late (`countsCompiles`: `cast`) runs only on a page that has compiled none since it loaded, so every
  cast job boots while the warrior's casts compile one late (a point light's shadow of a skinned mesh, on `main`
  too).
- **`--reuse=false`** boots a page for every job, as the check did before; **`--like <dir>`** compares each report
  with the one of the same name in another check's `out/check` (copy it aside first), the lines that say how the run
  went left out (a boot's time, a side read back, the command's time, the range's frame times by the browser's
  clock): a change to how the check runs is shown to leave every result as it was by running a part both ways,
  `--reuse=false` then `--like`. When pages were first kept, every part came out the same line for line.
- **`--plan`** runs nothing: the order the sessions would take the jobs in and when each would be done, by what each
  took last time (`out/check/durations.json`: each task's own work and its boot apart).
- **`npm run lab -- stop`** stops a check (`node/running.mjs`): stopped as a task under Git Bash, `npm run lab` left
  its command no line back to it, and a stopped check ran on to its end, eight browsers at full load.

## The gait's starts

The gait runs a scenario a job, and each hero's scenarios are put back together (`out/check/gait-<hero>.txt`, each
under its name): one after another on one page, each set up from where the last had left the hero and the clock,
main's own gallops were 18, 23 and 17 a hero with films and 13, 14 and 16 without (each now builds the hero afresh,
`fresh`). Each gait scenario runs from three starts (`--starts n`, at most 5): its first move 0, 7 and 13 frames
longer (`gait --offset`), so every later turn and stop comes at another point of a stride. Run once from one start,
a frame's change anywhere sent every later stride elsewhere, and a change's gallops came out 2 or 3 either way over a
check's gait scenarios by chance; stood a few frames first instead, nothing changed (the set-off is the same from any
moment of the idle). What a command counts (`countsOf`: the gait's gallops, hops and short steps) is added up over a
hero's jobs, each side's, in its line of the log and at the head of its report with each scenario's (`hops 2
(048deb5 9)`: this tree's, then the other's), so a check's verdict needs no script of its own to read it.

## What it takes

On the owner's desktop (12 cores, RTX 4070 Ti), 8 sessions, all 162 jobs, 2026-10-28: `check --ab` 715 s with
main's side run too (cold), 398 s with it read back (warm). Before pages were kept and main's side was keyed on the
code each command runs, a cold check had written 11 of its 21 reports after 11.5 minutes and was stopped past 17. Of
the warm check's 3,077 s of sessions' time, 1,344 s are boots, 8 s each alone and 25 to 30 with eight at once: the
casts boot for every job (344 s) while the warrior's casts compile a shader late, the two-hander's eyes jobs for
every job (above), and every hero's command once a session. The longest jobs (`stops` for the ranger, 150 to 210 s;
`feet`, 100 to 150) are one page each, and end the check. Eight sessions load every core: a job takes about half
as long again as with four.

One command at a time, both sides every time, the mage's cape stepped throughout and each gait scenario run again for
its film, the same check took 31 to 35 minutes a round; the harness is run hundreds of times, so keep every check
that runs often to minutes: profile it (`--profile`), cut what its measures don't read, and run side by side what
doesn't depend on each other.
