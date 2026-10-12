# stalls: the browser's own stalls

The game played in the installed Chrome on this machine's GPU, its frames recorded and the browser traced, for the
stalls the lab never shows. Chrome on Windows draws through ANGLE on Direct3D 11. When the page needs a Skia program
that isn't built yet, building it holds up Chrome's GPU process, and the game's canvas with it, for up to seconds. The
lab runs Playwright's Chromium on a fixed clock with nothing drawn between its pictures, so it can't see this: these
stalls are the real browser's, at its own pace.

```bash
npm run stalls                                   # this tree built and served, a 45 s fight in headless Chrome
npm run stalls -- --url https://victorzakharov.github.io/last-stand/      # production
npm run stalls -- --url https://victorzakharov.github.io/last-stand/pr-preview/pr-194/,https://victorzakharov.github.io/last-stand/
npm run stalls -- --headed --links --seconds 30  # a window on the screen, every program built listed
npm run stalls -- --variants base,cpuCanvas      # the page as it is, then every 2D canvas drawn on the CPU
npm run stalls -- --scenario lobby               # standing, then walking round the lobby
npm run stalls -- --help
npm run stalls:test                              # the tool's own unit tests
```

The report is printed and written to `tools/stalls/out/report.txt`.

## What a measure does

- **A fresh Chrome:** the installed one (`CHROME_EXE`, or Chrome's usual places) with a profile made fresh for each
  measure, so its shader caches are empty, as on a first visit after an update (the worst case). It runs headless
  unless `--headed`, with `--use-angle=d3d11` on Windows. Its whole process tree is killed when the measure ends (a
  browser connected over CDP outlives `browser.close()`), and its profile is deleted. A shell whose sandbox can't
  delete files Chrome wrote is told which profile was left.
- **The page:** the lab's `noCapture` and `freshStorage` (`tools/lab/node/browser.mjs`), so it never takes the pointer
  and starts as a first boot. The forest and the High preset are set by cookie, and a `--variants` change is applied
  before the page's scripts.
- **The scenario** is played with the page's own controls: real key presses, mouse moves and clicks, as a production
  build has no dev hooks.
  - `fight`: the warrior through a wave and its choice into the next. Steel Tempest is held with the mouse circling
    and the left button down, now and then another skill, and Continue after a few seconds.
  - `lobby`: standing, then walking round the lobby.
- **Recorded in the page:** every animation frame's interval, and every change to the page's HTML (a
  `MutationObserver`: what changed and on which element). The page marks the trace (`console.timeStamp`) as its
  clock starts, which puts both on one clock.
- **Traced in the browser:** `toplevel`, `gpu`, `viz`, Skia's shaders and the timeline. Only Skia's
  `driver_compile_shader` and `driver_link_program`, the page's mark, and tasks of 20 ms or more on any thread are
  kept, as they stream in: a 20 s trace with Skia's draws in it was 250 MB.

## The report

For each measure:
- **Frames:** how many, their median, how many took over 100 ms and how long those took in all, and the worst five.
- **Programs:** the Skia programs linked, how long in all, and the longest. With `--links`, every one: when, how long,
  the innermost tasks it was built in, and the page's changes in the 150 ms before it.
- **Each stall of 300 ms or more:**
  - the programs built in it, and the tasks each was built inside;
  - the longest tasks on any thread through it;
  - the page's changes in the 400 ms before it, by kind and element, the most frequent first.

With more than one measure, they are listed side by side at the end.

## Reading it

- **A program linked in the stall:** something on the page drew a new kind of thing (a shadow's blur, a gradient, a
  filter). The changes listed before it say what moved. Make it draw nothing new mid-game: put it on a layer of its
  own, draw it in WebGL (as `ui/overlay` does), or show it once at load.
- **Long GPU tasks, no program:** the game's own WebGL work, such as a three.js program compiled mid-game, which
  `core/shaders.ts` and `game/warmup.ts` exist to prevent, or ANGLE translating one.
- **Neither:** the stall came from outside this browser: another program on the GPU, or the driver.

**Look at the machine first.** In October 2026, 1.4–1.9 s stalls in the owner's Chrome (RTX 4070 Ti, driver 610.88) went
away with a reinstall of the NVIDIA driver. This tool, run in a fresh profile on the same machine, never showed them.
When stalls show in one person's browser alone:
- ask for a run of this tool on that machine before tracing the game;
- on a machine shared with other agents' browsers, run it again and compare medians: their GPU work is in no trace of
  this browser.

**A 20 s fight** on this tree in headless Chrome 154 (RTX 4070 Ti): 38 programs linked, 455 ms in all, the longest
27 ms. 2 frames took over 100 ms (243 and 174), and none took 300 ms or more.

## The code

| File | Job |
| --- | --- |
| `stalls.mjs` | The command line: each URL and variant measured in turn, the report written |
| `options.mjs` | Its options read and checked, and the usage |
| `chrome.mjs` | The installed Chrome started on a fresh profile, connected over CDP, its tree killed |
| `serve.mjs` | This tree's production build (into `out/dist`), served by Vite's preview server |
| `scenarios.mjs` | What the player does |
| `variants.mjs` | Changes tried on the page before its scripts |
| `page.mjs` | What runs in the page: the recording, and the states the scenarios wait for |
| `trace.mjs` | The browser's trace, its events filtered as they stream in |
| `analyze.mjs` | The page's frames and the trace on one clock: the programs, the stalls, what was busy |
| `report.mjs` | The findings as text |
| `test/` | Unit tests of the command line, the analysis and the report on made-up traces |
