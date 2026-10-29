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
  part of one (a scenario of the gait, the stops, the ranges or the feet, an eyes row or skill, a cast); the parts
  are put back together into one report a hero (`out/check/eyes-warrior.txt`, each under its name). Whole, the
  ranger's stops, feet and ranges were single jobs of 90 to 210 s that ended the check; each scenario runs set up
  afresh, and split, each comes out as it did whole, line for line (`CHECK_SPLIT` in `check.mjs`). It runs in the
  command line's own process, not the server's.
- **The other commit first** (`--ab`): it is exported once before the sessions start, and every job's side not kept
  yet (`out/ab-cache`, by the lab code the command runs: `node/labCode.mjs`) is run first, side by side, kept, and
  read back as its job runs this tree's; a warm check runs this tree's alone.
- **Pages kept between jobs** (`node/checkQueue.mjs`): a session takes next the longest job left for the page it has
  up (its side, its hero and the kind of page its command may run on), so a page booted for one job runs the next,
  and boots only for another side, hero or kind; the other side's tasks are handed out first. A boot is 8 s alone,
  25 to 30 s with eight at once, and a boot a job was most of a check. A page is kept only for the commands shown to
  come out the same on it as on a page booted for each job (`keepsPage` and `pageKind` in `node/commands.mjs`): most
  share pages whatever ran on them before (`'shared'`), `hits` only its own jobs' (`'own'`), and `form`, `log`,
  `cast` and the two-hander's eyes jobs boot each (`log` lists the game's clock, `form`'s runner differed, a cast's
  frames still part from about 0.6 s on a kept page as the foes come, not yet found). Each set-up in a check builds
  the hero afresh, in a run of its own (`afresh`, `page/lab.ts`: `Fixture.fresh` for every set-up, the view taken
  from the top down, the boot's cookies and storage put back as each command begins; a page's later set-ups leave
  the run by the pause menu, read the profile again and start a new one at the game's time the page's first run
  started at, `runAfresh`). Each was a leak found by running a part both ways: set up over the hero the jobs before
  had left, the eyes' Steel Tempest struck 25 frames earlier; a skill bound to a key by one job (`bindKnown`) saved
  its loadout, which the next job's hero loaded; in the run kept from the eyes' jobs Twin Fangs' blows dealt 20 less
  and two of the warrior's gait scenarios stepped otherwise (its timers pending, its wave's state, its props). A run
  started afresh lets go of its foes' ways and the view's frustum (`forgetFields`, `forgetFrustum`: stamped by the
  game's clock, which a set-up moves back, each read as fresh). The lab boots a page only once every map the
  loading workers make has come (`mapsCome`): landing mid-command, later on a loaded machine, a map drew the crypt's
  foes otherwise in some of a check's casts and not others, so two checks' casts differed with nothing changed. A
  command that counts the shaders compiled late (`countsCompiles`: `cast`) runs only on a page that has compiled
  none since it loaded.
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

On the owner's desktop (12 cores, RTX 4070 Ti), 8 sessions, 2026-10-29: all 199 jobs on this tree alone (a warm
`check --ab`, main's side read back) in 334 s, its sessions' time 2,540 s, of which 854 s are 46 boots: the casts
boot for every job (27 of them, 352 s), and `form`, `log` and `hits` once each. The sessions end within 20 s of each
other, so a check is now as long as its work over eight: each job takes about three times as long with eight
sessions at once as alone (the casts' 414 s of work, the eyes' 362, the gait's 235, the stops' 302). Main's side run
too (cold) took 924 s, main's own casts compiling their shader late and booting for every job. Before: 398 s warm
and 715 s cold, with pages kept per command, the casts and the two-hander's eyes jobs booting each; before pages
were kept and main's side was keyed on the code each command runs, a cold check had written 11 of its 21 reports
after 11.5 minutes and was stopped past 17. A cast reads back only the pixels it measures, every second one each way,
picked on the GPU (`page/sampledPixels.ts`: the whole canvas read back was 70% of a cast).

One command at a time, both sides every time, the mage's cape stepped throughout and each gait scenario run again for
its film, the same check took 31 to 35 minutes a round; the harness is run hundreds of times, so keep every check
that runs often to minutes: profile it (`--profile`), cut what its measures don't read, and run side by side what
doesn't depend on each other.
