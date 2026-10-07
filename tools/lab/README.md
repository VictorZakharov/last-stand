# lab: the game harness

Pictures and measures of the game as the player sees it, in seconds, each on a page booted for it, the same result
every time. It replaces the one-off probes that each task used to write in `.tmp` (each re-copied the boot, the fixed
clock and the ray tests, drifted, and some reported clean while measuring nothing).

```bash
npm run lab:serve                         # boot each command's page ahead of it (Ctrl+C stops it; restarts itself
                                          # when tools/lab/node or lab.mjs change)
npm run lab -- sheet --tag try1           # pictures + notes: tools/lab/out/sheets/try1/sheet.png
npm run lab -- sheet --ab                 # the same beside origin/main (--ab=<ref> for another commit)
npm run lab -- carry --canary             # the ranger's carried bow against his body, with planted faults
npm run lab -- probe .tmp/mine.ts         # a probe module of your own (see below)
npm run lab -- eval "lab.player.nocked"   # an expression in the page
npm run lab -- carry --profile            # where the command's time went in the page
npm run lab -- help
```

With `lab:serve` up, the next command's page is booted as soon as a command finishes, and again once the source has
been left alone for a moment after a change, so a command finds it ready: the sheet takes about 2 s, the carry 5.
Without it, a command boots a session of its own (about 15 s) and closes it.

## How it works

- `lab.mjs`: the command line. Sends the command to the server on 127.0.0.1:5196 (`LAB_PORT`), or runs it alone.
- `node/`: the Node side. `session.mjs` (the commands, the server), `side.mjs` (a tree of the game served by a Vite
  dev server of the lab's own, HMR off, and booted in a page; an exported commit for an A/B), `browser.mjs`
  (Playwright's Chromium in its native headless mode, and the scripts every page runs first), `compare.mjs` (an A/B's
  verdict), `profile.mjs` (`--profile`), `sheetImage.mjs`.
- `page/`: the lab inside the game's page, TypeScript typechecked with the game (`tsconfig.json` includes it), imported
  as the game imports its modules, so there is one copy of each. `lab.ts` (the clock, input, set-ups, pictures),
  `commands.ts` (what the server calls), `sheet.ts`, `carry.ts`, `comfort.ts`, `geometry.ts` (meshes baked into the
  world as drawn, ray crossings, segment distances), `ranger.ts` (the bow's handle, `bow.group.userData.bow`).
- **Every command on a fresh page.** A page a command ran on is left as that command left it (the game's clock on, the
  hero wherever it took him), and a set-up on it starts from another moment, so it is never used again. Within one
  command its steps run in order on its page (the sheet's states one after another), the same order every time.
- **The clock.** From the moment the loading screen reveals the game, its frames run on the lab's clock: each a hair
  over a 60th of a second, as fast as the page can, nothing drawn unless asked (the scene's matrices are still
  updated). Every time the page reads is on a grid of 1/1024 ms, so the game's frame time is exact and the same on
  every boot. Frames run back to back; the page gets a turn between frames only for a hero with a cape (its cloth
  steps in a worker).
- **Set-ups check themselves** (`Lab.setup`, the `Fixture`): the run held in its countdown (no foes and none coming),
  the hero placed, stopped and settled, an arrow nocked if asked; each step throws if it didn't take, and so do the
  measures (the walk walked, the draw drew, the arrow was put back). A measure carries a canary where it can.
- **A/B** (`--ab[=ref]`): the commit is exported with `git archive` into `out/commits/<sha>` (no worktree, no links),
  served with its own dependency cache, the lab's page modules copied into it, and each side runs alone in the
  browser. The report ends with the verdict: the two sides agree line for line, or the lines that differ under the
  section each is in (the sheet compares its notes and a fingerprint of each picture). A commit compared with itself
  (`--ab=HEAD`) agrees.
- **The sheet**: each state (`stand`, `walk`: both ends of the arm's swing, `full`: full draw) pictured from the game's
  views (`lobby`, `top`, `third`; `eyes` with `--view first`) and close-ups (`front`, `left`, `right`, `back`, `above`;
  `--focus <joint>`), with each arm's load and posture (`comfort.ts`: N·m at the shoulder and elbow, as a share of
  what a man's can hold, light under 5 %, heavy past 15 %) and how the bow is carried.
- **Rays against the body** (`geometry.ts`, `BakedBody`): the meshes skinned into the world as drawn, each bone's
  matrix made once a frame (three's own way made it again for every vertex, 30 ms a frame), and only the meshes that
  may reach the lines measured, by a bound that holds for any pose (each bone's sphere round its own vertices); every
  baked vertex is checked against it.
- **A probe module**: `export default async function (lab: Lab, options) { ... }`, returning text or JSON. The fixture
  is set up first (`--setup=false` skips it). It may import the game's modules by relative path. It is compiled
  afresh each run, with any module beside it (the lab's Vite server doesn't watch scratch folders, so it drops them
  from its cache before each probe).

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

Found on the way, each a cause of runs that differed: frames run in real time between the reveal and the lab taking
over; a yield after every frame (async work landed between different frames); the loading screen's tips drawing
random numbers on a timer, so a slower boot rolled other weapons; a saved profile and cookies kept between boots; two
pages alive at once (one lost focus; the game lets go of the input on a blur); the exported commit's ez-tree alias
lowercased by the lab (a second copy of three.js, other random draws); `Player.place` keeping the velocity (fixed in
the game); frame times a few bits apart from boot to boot (taken from the browser's clock: a cast of a whole number
of 60ths ended a frame early or late, one self-A/B in five); commands run on a page an earlier one had used; the
random numbers started again before a command's imports rather than after (one boot in four, the haze and pollen
spawned before its set-up lay elsewhere in its pictures); and the first lab frame measured from the game's last real
frame, a browser frame earlier on some boots (every emitter's bursts a frame early or late, one boot in three).

To find where two runs part, record each frame's state and each random draw's caller in a probe and compare boots
(two fresh boots, `--setup=false`, the probe setting up itself): the first frame or draw that differs names the cause.

## Status (2026-10-07, PR for #149) and what's next

- Next: port the measures the next issues need as page modules (#147 uses `carry`; #145 needs the first-person
  screen moves: each hand's, the grip's and the arrows' move on screen a frame, and what covers the view's middle).
