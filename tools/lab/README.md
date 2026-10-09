# lab: the game harness

Pictures and measures of the game as the player sees it, in seconds, each on a page booted for it, the same result
every time. The game runs in a headless browser on a fixed clock, driven by scripted input, and measured frame by
frame as it would be drawn. It replaces the one-off probes each task used to write in `.tmp` (each re-copied the
boot, the fixed clock and the ray tests, drifted, and some reported clean while measuring nothing).

## Quick start

```bash
npx playwright install chromium            # once (or have Edge or Chrome installed)
npm run lab:serve                          # in a terminal of its own: boots each command's page ahead of it
npm run lab -- sheet                       # pictures + notes: tools/lab/out/sheets/latest/sheet.png
npm run lab -- carry --canary              # the ranger's carried bow against his body, with planted faults
npm run lab -- sheet --ab                  # the same beside origin/main, and what differs
npm run lab -- probe tools/lab/examples/handSpeed.ts --canary   # a measure of your own
npm run lab -- check --ab                  # every hero's gait, stops and ranges, the ranger's feet and carry, vs main
npm run lab -- help                        # every command and option
```

With `lab:serve` up, the next command's page is booted as soon as a command finishes, and again once the source has
been left alone for a moment after a change, so a command finds it ready: the sheet takes about 2 s, the carry 5.
Without it, a command boots a session of its own (about 15 s) and closes it. The server runs under a supervisor of
the lab's own, which starts it again when what the lab's Node code says changes (not on every change Windows
reports: a file read now and then counts as one, and a server started again under a command closed its browser),
launches its browser again if it has closed (it crashed: every command after it failed until the server restarted),
and every command carries a hash of the code it was sent from: a server that loaded other code starts again before it
runs it (`node --watch` once stopped noticing changes, and the server ran old code that dropped an option the command
line had just learnt). Its Vite server starts again when `vite.config.ts` or the packages change. Stopping the
terminal's task stops it all.

## Commands

- `sheet`: the hero in the states the player sees (`--states stand,walk,full`), pictured from the game's views and
  close up (`--views lobby,top,third,front,left,right,back,above`; `eyes` with `--view first`; `--focus <joint>`
  frames the close-ups on a joint), with each arm's load and posture beside them. Writes
  `out/sheets/<--tag>/sheet.png` and `notes.txt`.
- `feet`: the hero's feet against the ground round the dais's edges and on level ground (`--scenarios edge,level,
  strafe,cross`): standing at full draw by the edges (a foot moving in the hold, a sole in a step's riser, a dip under
  its own level), and walking across them, strafing up and down the steps with a shot drawn and on level ground (per
  stance: the frames out of the leg's reach, a planted foot's pitch turning back and forth, its slide, the slip of
  the sole's point on the ground that moved least, added up frame by frame (a foot rolling or turning on its ball
  keeps one point still); a sole in the ground, the fastest ankle, breaks in the left, right rhythm, frames with both
  feet up). `--canary` plants a slid and a sunk ankle, `--frames` lists what was flagged (the stances, each foot's
  runs of frames with its sole in the ground, and where the rhythm broke), `--trace` prints each frame of each walk
  with the leg IK's own state (the pelvis's drop and turn; each foot's state, window, spot, ankle, heading, tip, depth
  in the ground, clearance, landing and its shift off a riser; each walk's feet measured as the IK has them); the worst stance of each walk is pictured whole, as the player sees it and from the
  front and the side (`out/feet/sheet.png`). A walk follows on from the ones before it (the hero, the gait and the
  game's clock carry over), so compare runs of the same `--scenarios`.
- `gait`: the hero's walk judged as a person's, over level ground and the dais's steps, nothing drawn (standing,
  off at a run, turned round and stopped), strafing drawn, tapping, changing direction every third of a second and
  going round in circles, nothing drawn and drawn
  (`--scenarios walk,drawn,taps,zigzag,circle,circleDrawn,stairs,stairsDrawn`): each foot's share of the time on the
  ground against the share the gait plans, both down and neither (a walk has a foot always down), the steps a second
  and the ground a step covers, the hops (both feet leaving or landing within a few frames of each other), a foot
  dance's short steps, the hips' rise and fall a step and their height in the air, on one foot and on both, a planted
  foot dragged (its leg short of it even on its toes) and one up on its toes out of a flat foot's reach (a push off),
  each hand's swing fore and aft against its own side's knee (a person's arm swings against the hip's swing, about
  -1; the ankle trails the thigh as the knee folds, so no arm reads -1 against it), over the whole and over each
  half second (the median and the worst stretch, with its frames; a hand that hardly moves is held, a bow drawn, and
  left out), the rhythm (how many strides leave near their window's start, in step with the walk cycle, and which
  don't; how many land already out of reach, and where), the steps a foot takes back under a body that had stopped
  (its feet were out ahead of it), the jerks (a change of the
  change of the hips' or an ankle in the air's speed in a frame: a smooth swing's speed changes steadily, by up to 3.5
  m/s a frame at a run, and counted by that, an ordinary run read as a hundred jerks), and what a person wouldn't do,
  said as such. A scenario whose body moves well short of its own velocity was held up by something in its way (the
  nearest obstacle is named) and the command fails: from where the level walks first started, the walk had run into
  a prop and every walk number measured a body stopping and starting. Every frame is also judged as a body's
  (`page/balance.ts`): its centre of mass from the pose, each segment weighted after de Leva (1996) for an 80 kg man,
  with what he wears and carries (`page/gearWeight.ts`: boots, a coat, a robe or plate and mail on the segments they
  cover, a helmet, gloves, and the bow, weapon, shield or staff and the quiver where their meshes are that frame);
  with a foot down, where on the ground the push must come from for every mass to move as it does (the zero moment
  point of the masses, each one's acceleration at its own height, so a foot stopped by the ground under it moves it
  hardly at all: taken as one mass at the centre, every landing read as a fall) against the planted soles' parts on
  the ground (outside them the body would tip, the way it lies), whether the feet's grip could give the push along the
  ground, and that the ground never pulls; in the air, that nothing pushes the centre along and it falls as anything
  does (held up, a run hung from a string); a push beyond any feet's grip that the game's own movement asks (its
  acceleration is the gameplay's) counted apart. Each such episode names what moved the centre so (the game's
  movement, the trunk, the legs, the arms, the gear) and, for a tip, how far the weight itself lay off the soles. And
  every joint against its range, as `range` judges it. `--frames` lists every step: its foot, where in
  its window it left and why (the IK's `Foot.leftFor`), how long it was down, its swing against the plan, every
  jerk, every episode a body couldn't move so (its frames, the feet, what and why, at its worst) and each hand's swing
  half second by half second; `--trace` every frame (`--span from,to` only those): the way the body faces and goes and
  its speed over the ground, the pelvis, the curve
  it is on, the pelvis's drop, the plan's share on the ground and the speed it plans for, the cycle's phase and rate,
  backing or not, and each foot (planted, with its distance from its hip and `!` out of reach, or its stride's
  progress), where it is in its window, its ankle's speed and how far its way turned, and what a body couldn't do
  that frame. Each
  scenario is measured, then run again to film it from the side round its first hop (else its middle), a picture
  every few frames, so the motion is seen as well as measured; each film is a sheet of its own (`film-1.png` on,
  an A/B's other side `film-main-1.png` on: both sides in one page, or all eight films, took the browser down) and an
  A/B compares the reports.
- `coop`: two games playing together, the host's in the side's page and a guest's in a partner page beside it
  (`Side.openPartner`), stepped together a turn of frames at a time on the lab's clock. Each page's BroadcastChannel
  (the game's `?net=local` link) is replaced by one the lab carries (`page/coop.ts`), and the messages go from one
  page to the other as a link of `--ping` (the least round trip, 300 ms by default) and `--jitter` (how much later each
  way, 60 by default) delivers them: in the order sent, as a WebSocket's TCP does, a late one holding up those behind
  it, and every couple of seconds a stall of several jitters (`node/coop.mjs`). The heroes play scenarios (`walk`: the
  host running round in circles, the guest zigzagging; `foes`: foes chasing them; `shoot`: the guest shooting at a foe
  that chases the host; `dodge`: the guest running from every other blow as it sees it coming; `down`: a foe bringing
  the guest down and the host raising it), each one's input frame by frame from what its own screen shows. What each
  game showed is judged against the other's in the same frame (`node/coopJudge.mjs`): each copy's delay (the one that
  lines its path up best with its own game's), how far off that path and how roughly it moves (its speed against its
  own, its largest move a frame), how each game's timeline plays its partner out (how far behind the freshest report,
  how often a stall held it, how far its clock strayed), the arrows that struck on the guest's screen and whether the
  host counted them, the blows at the guest against whether it stood in their reach on its own screen, and when the
  guest went down and was raised on each screen. Scenarios run on from each other, so a scenario alone can differ.
  `--pictures` pictures both screens at a scenario's moments into `out/coop` (`down`'s: the guest downed across the
  arena, its marker at the edge of the host's screen, then over it, then raised; `shoot`'s last: the host holding Tab,
  the scores). The lab's link reports each game's round trip to "the server" once a second as the relay's pings would
  (half the ping, up to the jitter more), so the scores show a ping and its graph.
- `stops`: the hero coming to a stop from a run, judged as a person stops (a step or two as the body slows, the last
  foot landing under it or beside the other on the ground it stands on, and once still nothing moving), over runs let
  go at different points of a stride: on level ground each way, strafing drawn, and out over the dais's edge, in onto
  it, on a slant, along it astride its step and stopping to shoot along it
  (`--scenarios level,drawn,edgeOut,edgeIn,edgeSlant,edgeAlong,edgeShot`). From the frame the keys are let go: the
  steps once the body was still, a foot put out ahead and drawn back (a waste of motion), a step back against the way
  it went, a foot on another level than the body's once still and whether it ended so, a foot stepped from one level
  onto another once still (put down a step below and stepped up a second later), both feet up once one had landed,
  how long the feet took to settle and their travel once still. `--frames` lists each stop: where it was let go and
  rested along the way, and each step with where it left and landed from there and on which level; `--trace` adds
  each frame (the body, the hips, each ankle and where each foot in the air is aimed, the lean); `--only 'd 23'` runs
  the stops whose names contain that. Within one run each stop starts at its own moment of the clock, so a stop run
  alone can differ from the same one in the whole run: compare the totals. (The gait's steps back counted only steps
  that left once the body stood, and missed every stop's: the step back began as the body slowed.)
- `range`: every joint of the hero against a body's ranges (`models/anatomy.ts`, as the dev builds' `watchBody`
  measures them), frame by frame, over standing, walking each way, attacking standing, and walks that change
  direction while he attacks (held or tapped) or runs (`--scenarios stand,walk,shoot,reverse,taps,run`): each angle
  past its range, on how many frames, its worst and where (for a leg, whether its foot was planted; for a shoulder,
  its raise, the plane it rises in and its turn against what each allows), each scenario's
  fastest ankle, and its worst moment pictured. `--canary` turns the head past the neck's range on one frame,
  `--frames` lists every frame with a joint past its range.
- `carry`: the ranger's carried bow against his body through a carry's round (standing, walking, a draw and its shot,
  waiting with the next arrow, putting it back). `--canary` plants faults it must catch; `--frames` lists every frame
  with a clip, what crossed what and how deep.
- `probe <module>`: a measure of your own (below). Options the lab doesn't know are passed to it (`--frames=30`), and
  `--setup=false` skips the set-up.
- `eval <expression>`: an expression evaluated in the page, with `lab` in scope (`eval "lab.player.nocked"`).
- `status`, `stop`: what the server serves and has booted; stop it.
- `check`: the checks of a change to how the heroes move, run side by side: the gait (its steps listed, no films),
  the stops and the ranges for every hero, and the ranger's feet and carry (`--classes`, `--commands` for fewer), each
  in a session of its own (`--jobs n`, a core in three by default, at most 8), the longest first as they last took,
  each report in `out/check/<command>-<hero>.txt` and its pictures in a folder beside it. With `--ab`, the other
  commit is exported once before the sessions start, and its side read back from the cache once it has run (below).
  The gait runs a scenario a job, each on a page booted for it, and each hero's scenarios are put back together
  (`out/check/gait-<hero>.txt`, each under its name): one after another on one page, each was set up from where the
  last had left the hero and the clock, and main's own gallops were 18, 23 and 17 a hero with films and 13, 14 and
  16 without. What a command counts (`countsOf`: the gait's hops and short steps) is added up over a hero's jobs,
  each side's, in its line of the log and at the head of its report with each scenario's (`hops 2 (048deb5 9)`: this
  tree's, then the other's), so a check's verdict needs no script of its own to read it. It runs in the command line's own process,
  not the server's. One command at a time, both sides every
  time, the mage's cape stepped throughout and each gait scenario run again for its film, the same check took 31 to
  35 minutes a round; the harness is run hundreds of times, so keep every check that runs often to minutes: profile
  it (`--profile`), cut what its measures don't read, and run side by side what doesn't depend on each other.

Options every command run on a page takes:

- a probe or command that doesn't compile says where and why (`.tmp/x.ts:3:10 doesn't compile: Unterminated
  string`), not the browser's "Failed to fetch dynamically imported module";
- the set-up (sheet, carry, probe): `--view top|third|first`, `--at x,z`, `--facing rad`, `--nocked[=false]`,
  `--capes`: the capes' cloth stepped. Every set-up holds them otherwise (`Fixture.capes`, `cape.holdCapes`), each
  riding its neckline as it last hung and hung afresh from it for a picture: stepped, the cloth was three quarters of
  the mage's time in his stops, which never look at it. A sheet and the gait's films step them;
- `gait --films=false`: the numbers alone, each scenario run once (a film runs it again);
- `--class ranger|warrior|mage`: the hero (the last one used by default);
- `--ab[=ref]`: also on another commit (`origin/main` by default), its results beside this tree's, ending with the
  verdict: the lines that differ under the section each is in, and the pictures that differ by more than the GPU's own
  noise, with where (the region of each, and a picture of each in `out/ab/<command>/`: this tree's dimmed, its
  differing pixels magenta). A commit compared with itself (`--ab=HEAD`) agrees, so the other commit's side is kept
  once it has run (`out/ab-cache`, by its commit, the hero, the command and its options, and a hash of the lab's code
  it ran: its page modules, its Node side and a probe's own files) and read back after: run again each time, main's
  side was half of every A/B. `--fresh` runs it again; a side whose page raised an error isn't kept;
- `--profile`: where the command's time went in the page, its busiest functions by their own time and in total,
  each at its line in the source;
- `--watch`: run it again each time the source changes, on the page booted for the change, until Ctrl+C.

A misspelt option or a bad value stops the command before anything boots (`carry takes no --canry (did you mean
canary?)`). The exit status is 1 when the command failed or found a problem: an error in the page, or a problem its
result reports (a canary the measure missed).

## Writing a measure

A measure starts as a probe module: a TypeScript file whose default export takes the lab and the command's options,
and returns text, anything JSON can hold, or a `Report` (`{ text, problems }`: its problems fail the command).
[`examples/handSpeed.ts`](examples/handSpeed.ts) is a short one with every part a measure needs:

```ts
import type { Lab, Report } from '../page/lab';

export default async function handSpeed(lab: Lab, options: { canary?: boolean }): Promise<Report> {
  const start = lab.player.pos.clone();
  const rows = await lab.step(150, (frame) => ({ keys: frame < 60 ? [] : ['w'] }), (frame) => {
    // measure the frame as it would be drawn (the world matrices are up to date)
  });
  const problems = lab.player.pos.distanceTo(start) < 1 ? ['the hero never walked'] : [];
  return { text: '...', problems };
}
```

It runs on a page booted for it, after the set-up the command's options ask for (the run held in its countdown, the
hero placed, stopped and settled), and may import the game's modules by relative path. While you work on it, keep it
in `.tmp`: it is compiled afresh on every run, with the modules beside it it imports. With `--ab` those files are
copied into the other commit, so the same measure runs on both sides.

What the lab gives a probe (`page/lab.ts`):

- `lab.player`, `lab.model`, `lab.joints`, and `lab.THREE` (three.js as the game has it);
- `lab.setup(fixture)`: the run set up afresh (`at`, `facing`, `view`, `nocked`, `capes`), checked, and its report.
  A probe may set up many cases one after another, but each follows on from the ones before it: the hero is the same
  one, and the game's clock, which his idle runs on, only goes forward (to the next whole minute at each set-up, so
  the idle is at the same moment whatever ran before; the hero's own state still carries over). A scan is the same
  every time it runs, but one of its cases run alone may come out otherwise, so trace a case by running the cases
  before it first (an option of the probe's own: `--trace=<case>`, say), or run each on a page of its own as a check
  runs the gait's;
- `lab.step(count, input?, measure?)`: frames run with each frame's input (`keys`, `m0` / `m2` for the mouse buttons,
  `look` for mouse look, `aim` for the point the mouse is over) and measured after each, a row a frame;
- `lab.until(done, limit, what, input?)`: frames until `done`, throwing `lab: <what>` if it never is;
- `lab.spawnFoe(type, at)`: a foe for a measure that needs one (a mark, a lure), which the set-up keeps while it clears
  every other until the next set-up; it rises first as a spawned foe does (`Enemy.spawning`), and a training dummy
  (`dummy`) stands still;
- `lab.capture(views)`: pictures of this moment as PNGs (`lab.drawing = true` draws every frame instead), and
  `lab.picture(label, views, notes)` one moment of a report's `moments`: the lab writes them as a sheet
  (`out/probes/<probe>/sheet.png`) and compares them in an A/B, as the sheet's (to see the frames a measure flagged,
  run the measure's input to them and picture each);
- `await lab.screen(label, notes, around?)`: this moment as the player sees it, the game drawn by its own camera with the
  page's UI over it (the HUD, a menu, a tooltip), pictured by the browser, whole, clipped round the element a CSS
  selector names (`'#hotbar'`) or to an area of the page (`screenArea(points)`: round points of the world as the
  camera shows them), as a moment of the report's `moments` (`picture`'s views show the game's canvas alone);
- `timeCalls(owner, method)` (`page/timing.ts`): every call of a method timed by the browser's own clock (the page's
  `performance.now` is the lab's, which stands still within a frame), for a cost: its calls, total, median and 90th
  percentile. The timer ticks in 0.1 ms, so take a frame's mean over many, and compare sides within one A/B (the
  machine's load drifts between commands);
- `lab.aim` and `lab.pointAt(point)`: where the mouse is;
- in `page/geometry.ts`, the body's meshes skinned into the world as drawn (`BakedBody`), what a line crosses among
  them (`crossingsAlong`), and the distance between segments (`segmentDistance`).

A measure is only as good as what it can catch:

- **Check the state happened.** A measure of a state that never came reads as clean: a probe that scripted the game
  before its run began reported no clips at full draw, because it never drew. Throw `lab: ...` or report a problem
  when the walk didn't walk or the draw didn't draw.
- **Carry a canary.** Plant the fault the measure is for (the bow moved into the hips for a frame, a hand moved
  10 cm) and report a problem when it isn't caught. Run it when the measure changes.
- **Measure, don't choose.** A pose is decided as a person would hold it and looked at in the game's views first
  (`sheet`); a measure checks it (AGENTS.md, Workflow).

Once a measure is needed again, port it into `page/` as a command of its own (a module, an entry in
`page/commands.ts`, one in `node/commands.mjs` and its options in `node/options.mjs`), as the carry's was.

## How it works

- `lab.mjs`: the command line. Reads and checks the command (`node/options.mjs`), and sends it to the server on
  127.0.0.1:5196 (`LAB_PORT`; `node/client.mjs`), or runs it in a session of its own.
- `node/`, the Node side:
  - `server.mjs`: `lab:serve`. One command at a time, the next page booted between them, and `--watch`'s changes. It
    only answers the lab's own command line: a POST of JSON for 127.0.0.1 or localhost, from no web page (a page in
    your browser could otherwise send it an `eval`). `supervisor.mjs` runs it (`serverProcess.mjs`) in a child
    process and starts it again when the lab's code says something else (`codeStamp.mjs`, the hash every command is
    checked against), and stops it when whatever started the supervisor is gone.
  - `session.mjs`: a command run on each side it asks for, its report, problems and A/B verdict; `commands.mjs`:
    what each command does on a side and how its results are compared.
  - `side.mjs`: a tree of the game served by a Vite dev server of the lab's own (HMR off, so a measure never meets a
    stale copy of a module) and booted in a page; `commits.mjs`: another commit exported for an A/B.
  - `browser.mjs`: Playwright's Chromium in its native headless mode, and the scripts every page runs first (the
    clock, seeded random numbers, no pointer lock, fresh storage).
  - `compare.mjs` (the reports' verdict), `pictures.mjs` (the pictures'), `profile.mjs` and `sourceMaps.mjs`
    (`--profile`, its functions traced back through Vite's source maps to their lines in the source),
    `sheetImage.mjs` (the sheet as one image), `probeFiles.mjs`, `errors.mjs`, `paths.mjs`.
- `page/`: the lab inside the game's page, TypeScript typechecked with the game (`tsconfig.json` includes it, and
  `examples/`), imported as the game imports its modules, so there is one copy of each. `lab.ts` (the clock, input,
  set-ups, pictures), `commands.ts` (what the session calls), `sheet.ts`, `carry.ts`, `comfort.ts`, `geometry.ts`,
  `ranger.ts` (the bow's handle, `bow.group.userData.bow`).
- `test/`: the Node side's tests, `npm run lab:test`.
- `out/`: everything the lab writes (sheets, exported commits, Vite's cache, the browser's profile), never the user's
  temp folder.

Some of what that takes:

- **Every command on a fresh page.** A page a command ran on is left as that command left it (the game's clock on,
  the hero wherever it took him), and a set-up on it starts from another moment, so it is never used again. Within
  one command its steps run in order on its page (the sheet's states one after another), the same order every time.
- **The clock.** From the moment the loading screen reveals the game, its frames run on the lab's clock: each a hair
  over a 60th of a second, as fast as the page can, nothing drawn unless asked (the scene's matrices are still
  updated). Every time the page reads is on a grid of 1/1024 ms, so the game's frame time is exact and the same on
  every boot. Frames run back to back, with nothing landing between them: a cape steps in the frame, on the main
  thread (`stepCapesHere`; in the game it steps in a worker, whose results landed a frame or two late, never the same
  frame twice, and a warrior's or mage's pictures of a commit against itself differed wherever the cloth showed).
- **Set-ups check themselves** (`Lab.setup`, the `Fixture`): the run held in its countdown (no foes and none coming),
  the hero placed, stopped and settled, an arrow nocked if asked, the view made as the player makes it (V pressed: the
  game sets the camera's view from its own every frame, and set on the camera alone it was top-down again a frame
  later, so `--view first` never took); each step throws if it didn't take, and so does a boot that didn't boot the
  hero asked for.
- **A/B** (`--ab[=ref]`): the commit is exported with `git archive` into `out/commits/<sha>` (no worktree, no links),
  served with its own dependency cache, the lab's page modules copied into it, and each side runs alone in the
  browser, this tree's first. The pictures are compared pixel by pixel in the lab's browser.
- **Rays against the body** (`geometry.ts`, `BakedBody`): the meshes skinned into the world as drawn, each bone's
  matrix made once a frame (three's own way made it again for every vertex, 30 ms a frame), and only the meshes that
  may reach the lines measured, by a bound that holds for any pose (each bone's sphere round its own vertices); every
  baked vertex is checked against it.

## Repeatability

Every command gives the same result on every boot, its pictures too: a commit compared with itself agrees line for
line, and no pixel of its pictures is more than 2 levels apart (the same view drawn twice with nothing changed comes
out a level apart in a few pixels, the GPU's own rounding). What it takes:

- the clock taken over at the reveal, every time on a grid of 1/1024 ms and a frame a whole number of its steps, so
  the game's frame time is exact; and one frame run with the game held still as the lab installs, so the game's timer
  counts from a lab frame;
- `Math.random` seeded, started again as each command starts (after its modules are imported, in the same task:
  each three.js object made draws a random number for its id, and textures land from the workers while a module
  loads) and at each set-up; timers' callbacks draw from a stream of their own, since they fire by the browser's clock;
- the game's clock moved forward to the next whole minute at a set-up, storage and cookies cleared at each boot, one
  page alive at a time, and every command on a page booted for it.

Each of these was found as a cause of runs that differed:

- frames run in real time between the reveal and the lab taking over;
- a yield after every frame (async work landed between different frames);
- the loading screen's tips drawing random numbers on a timer, so a slower boot rolled other weapons;
- a saved profile and cookies kept between boots;
- two pages alive at once (one lost focus; the game lets go of the input on a blur);
- the exported commit's ez-tree alias lowercased by the lab (a second copy of three.js, other random draws);
- `Player.place` keeping the velocity (fixed in the game);
- frame times a few bits apart from boot to boot, taken from the browser's clock (a cast of a whole number of 60ths
  ended a frame early or late, one self-A/B in five);
- commands run on a page an earlier one had used;
- the random numbers started again before a command's imports rather than after (one boot in four, the haze and
  pollen spawned before its set-up lay elsewhere in its pictures);
- the first lab frame measured from the game's last real frame, a browser frame earlier on some boots (every
  emitter's bursts a frame early or late, one boot in three).

To find where two runs part, record each frame's state and each random draw's caller in a probe and compare boots
(two fresh boots, `--setup=false`, the probe setting up itself): the first frame or draw that differs names the cause.

## Testing the lab

- `npm run lab:test`: the Node side's unit tests (the command line, the verdicts, the server's checks, the source
  maps), in a second; the PR build runs them.
- Each measure's canary (`carry --canary`, the example's `--canary`): run it when the measure changes.
- `npm run lab -- carry --ab=HEAD` and `sheet --ab=HEAD`: a commit against itself must agree, line for line and pixel
  for pixel; anything else is a cause of runs that differ, to be found and removed as above.
