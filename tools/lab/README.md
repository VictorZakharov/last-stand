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
npm run lab -- help                        # every command and option
```

With `lab:serve` up, the next command's page is booted as soon as a command finishes, and again once the source has
been left alone for a moment after a change, so a command finds it ready: the sheet takes about 2 s, the carry 5.
Without it, a command boots a session of its own (about 15 s) and closes it. The server restarts itself when the
lab's Node code changes, and its Vite server when `vite.config.ts` or the packages do.

## Commands

- `sheet`: the hero in the states the player sees (`--states stand,walk,full`), pictured from the game's views and
  close up (`--views lobby,top,third,front,left,right,back,above`; `eyes` with `--view first`; `--focus <joint>`
  frames the close-ups on a joint), with each arm's load and posture beside them. Writes
  `out/sheets/<--tag>/sheet.png` and `notes.txt`.
- `carry`: the ranger's carried bow against his body through a carry's round (standing, walking, a draw and its shot,
  waiting with the next arrow, putting it back). `--canary` plants faults it must catch.
- `probe <module>`: a measure of your own (below). Options the lab doesn't know are passed to it (`--frames=30`), and
  `--setup=false` skips the set-up.
- `eval <expression>`: an expression evaluated in the page, with `lab` in scope (`eval "lab.player.nocked"`).
- `status`, `stop`: what the server serves and has booted; stop it.

Options every command run on a page takes:

- the set-up (sheet, carry, probe): `--view top|third|first`, `--at x,z`, `--facing rad`, `--nocked[=false]`;
- `--class ranger|warrior|mage`: the hero (the last one used by default);
- `--ab[=ref]`: also on another commit (`origin/main` by default), its results beside this tree's, ending with the
  verdict: the lines that differ under the section each is in, and for the sheet, the pictures that differ by more
  than the GPU's own noise. A commit compared with itself (`--ab=HEAD`) agrees;
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
- `lab.setup(fixture)`: the run set up afresh (`at`, `facing`, `view`, `nocked`), checked, and its report;
- `lab.step(count, input?, measure?)`: frames run with each frame's input (`keys`, `m0` / `m2` for the mouse buttons,
  `look` for mouse look, `aim` for the point the mouse is over) and measured after each, a row a frame;
- `lab.until(done, limit, what, input?)`: frames until `done`, throwing `lab: <what>` if it never is;
- `lab.capture(views)`: pictures of this moment as PNGs (`lab.drawing = true` draws every frame instead);
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
    your browser could otherwise send it an `eval`).
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
  every boot. Frames run back to back; the page gets a turn between frames only for a hero with a cape (its cloth
  steps in a worker).
- **Set-ups check themselves** (`Lab.setup`, the `Fixture`): the run held in its countdown (no foes and none coming),
  the hero placed, stopped and settled, an arrow nocked if asked; each step throws if it didn't take, and so does a
  boot that didn't boot the hero asked for.
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
- the game's clock moved forward to 60 s at a set-up, storage and cookies cleared at each boot, one page alive at a
  time, and every command on a page booted for it.

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
