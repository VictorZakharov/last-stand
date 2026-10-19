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
npm run stalls -- --scenario storm --listed 120  # the mage's Maelstrom cast into the foes, every stall of 120 ms+
npm run stalls -- --scenario hover --hero warrior --stash 40 --view first --scale 1.25 --perf  # a report's lobby
npm run stalls -- --scenario hover --stash 40 --variants base,stillGlow  # hovering with the stash's glow held still
npm run stalls -- --scenario sweep --stash 60 --view top --window 1536x695 --seconds 12  # moving between items
npm run stalls -- --scenario sweep --stash 60 --item-ms 100 --seconds 8 --rounds 3  # the owner's pace, fast
npm run stalls -- --scenario hover --stash 60 --listed 40   # every frame of 40 ms+ listed with what was busy
npm run stalls -- --scenario sweep --stash 60 --seconds 8 --rounds 3 --variants base,iconFilter,stillGlow+noTooltip
                                                 # one page, the variants in turn three times over, by their medians
npm run stalls -- --help
npm run stalls:test                              # the tool's own unit tests
```

The report is printed and written to `tools/stalls/out/report.txt`.

## What a measure does

- **A fresh Chrome:** the installed one (`CHROME_EXE`, or Chrome's usual places) with a profile made fresh for each
  measure, so its shader caches are empty, as on a first visit after an update (the worst case). It runs headless
  unless `--headed`, with `--use-angle=d3d11` on Windows, and muted (the game's sound still plays, out of no
  speaker: the owner heard its music from a headless one). Its whole process tree is killed when the measure ends (a
  browser connected over CDP outlives `browser.close()`), and its profile is deleted. A shell whose sandbox can't
  delete files Chrome wrote is told which profile was left.
- **The page:** the lab's `noCapture` and `freshStorage` (`tools/lab/node/browser.mjs`), so it never takes the pointer
  and starts as a first boot. The battleground (`--biome`, the forest by default), the High preset and the performance
  overlay (`--perf`) are set by cookie, and a `--variants` change is applied before the page's scripts (`a+b`: both).
  The window is `--window` css px (1536x864 by default; a report's `window`), scaled `--scale` times (its
  `devicePixelRatio`).
- **Rounds** (`--rounds N`): the page booted and set up once, then the variants played in turn N times over, each
  one's stylesheet put on the running page (`page.mjs` `useStyle`: variants that only add styles). A boot is most of a
  measure's time, and measures side by side in time are slowed alike by whatever else uses the GPU meanwhile.
- **The lobby set up as a player's is:** the hero chosen (`--hero`); his stash filled with `--stash` items (copies of
  his own in each rarity: an item moved off him so his profile is saved, the copies kept in the session and put back
  over the next load's fresh storage, `page.mjs` `seededProfile`); the view stepped to with V (`--view`), the panels
  shown again with Space. A report says which: its `Mode`, `view`, `devicePixelRatio`, and the weapon in its shaders.
- **The scenario** is played with the page's own controls: real key presses (each held 90 ms, as a finger does), mouse
  moves and clicks, as a production build has no dev hooks. Each ends with the hero's kills and damage, read off the
  scores held up on Tab, and a picture of the screen (`out/end-N.png`): a scenario that fought nothing measured
  nothing.
  - `fight`: the warrior through a wave and its choice into the next. Steel Tempest is held with the mouse circling
    and the left button down, now and then another skill, and Continue after a few seconds.
  - `lobby`: standing, then walking round the lobby.
  - `hover`: the lobby's items hovered, a quarter of the time each: the mouse gliding over the world (the frames to
    beat); over each equipment slot and the stash's first ten items in turn, its tooltip following; swept along the
    stash's items in view, a new one every 250 ms (`--item-ms`), as a player runs a row down looking for one; then
    held still on a
    stash item, those that fit its slot lit. Its notes say what it hovered: with nothing in the stash (`--stash 0`),
    nothing lights.
  - `sweep`: `hover`'s sweep alone, three quarters of the time, after a quarter over the world: the same run's
    frames to beat, as a machine busy with something else slows both.
  - `storm`: the mage in a run, walking away from the foes a side of a square at a time and casting Maelstrom back
    at those following him in a line, every other side: its storm draws them in and whirls what it kills.
- **Recorded in the page:** every animation frame's interval and whether the item tooltip showed in it, every change
  to the page's HTML (a `MutationObserver`: what changed and on which element), and the scenario's phases
  (`markPhase`). The page marks the trace (`console.timeStamp`) as its clock starts, which puts them all on one clock.
- **Traced in the browser:** `toplevel`, `gpu`, `viz`, Skia's shaders and the timeline. Only Skia's
  `driver_compile_shader` and `driver_link_program`, the page's mark, and work of 0.5 ms or more on any thread (by its
  name, thread and times alone) are kept, as they stream in: a 20 s trace with Skia's draws in it was 250 MB.

## The report

For each measure:
- **Frames:** how many, their median, how many took over 100 ms and how long those took in all, and the worst five;
  and each phase's: frames a second over its time and the share that **missed the screen's refresh** (1.5 times the
  fastest phase's median or longer), its median, 90% of them within what, the worst, the share the tooltip showed in
  (a phase meant to show it that reads 0% hovered nothing), and **the browser's work for the page**, ms a second (its
  style, layout, paint, layers, raster and compositor frames; not the page's scripts nor the GPU running its commands).
  Under each phase, **a frame's work**: what each thread spent its time on, shared out a frame, the most first (each
  piece's own time, less the work the trace kept inside it; the GPU's waits for the screen left out), and **a missed
  frame's**, the same over the frames that missed.
- **Programs:** the Skia programs linked, how long in all, and the longest. With `--links`, every one: when, how long,
  the innermost tasks it was built in, and the page's changes in the 150 ms before it.
- **Each stall of 300 ms or more** (`--listed` sets it, down to 20):
  - the programs built in it, and the tasks each was built inside;
  - the longest tasks (20 ms or more) on any thread through it, and the work in it as a frame's work is given;
  - the page's changes in the 400 ms before it, by kind and element, the most frequent first.

With more than one measure, they are listed side by side at the end, each phase's frames a second and share missed
with them; with `--rounds`, then by variant: each phase's frames a second and the browser's work, the median over the
rounds and the range.

## Reading it

- **A program linked in the stall:** something on the page drew a new kind of thing (a shadow's blur, a gradient, a
  filter). The changes listed before it say what moved. Make it draw nothing new mid-game: put it on a layer of its
  own, draw it in WebGL (as `ui/overlay` does), or show it once at load.
- **Long GPU tasks, no program:** the game's own WebGL work, such as a three.js program compiled mid-game, which
  `core/shaders.ts` and `game/warmup.ts` exist to prevent, or ANGLE translating one.
- **Neither:** the stall came from outside this browser: another program on the GPU, or the driver.
- **A phase slower than its run's away phase:** its frame's work says which thread pays and for what. On the page's
  main thread, `UpdateLayoutTree` (style), `Layerize` and `Commit` grow with each layer an animation keeps moving
  (each is styled again every frame the page has one, and the tooltip following the mouse gives it one a move); on
  the GPU process, `DirectRenderer::DrawFrame` draws every layer, filter and mask again each frame something in them
  moves; `DoEndRasterCHROMIUM::Flush` is a layer painted again. `FunctionCall` on the main thread is the game's own
  frame (about 5 ms here).
- **The GPU is the game's first.** The owner's scene takes 6 ms of the GPU a frame (its report's GPU split), and at
  144 Hz a frame is 6.9 ms: whatever the page adds there in a frame (a filter's pass drawn again, a layer painted)
  costs that frame. In a missed frame's work, `CommandBufferService:PutChanged` of 14 to 30 ms is the GPU process
  held up running what it was sent.
- **Frames a second move with whatever else is on the GPU; the browser's work doesn't.** With another game open in
  a browser beside it (the owner's), one variant read 102 to 124 a second measure to measure, base 98 to 123 run to
  run, and the away phase fell to 127, while the browser's work held within a tenth. Compare variants by the
  browser's work, over `--rounds`, and trust frames a second only from runs whose away phase holds the screen's rate.
  With the screen off or locked, Windows paces frames at 60: every phase reads 60, and only the work compares.

**Look at the machine first.** In October 2026, 1.4–1.9 s stalls in the owner's Chrome (RTX 4070 Ti, driver 610.88) went
away with a reinstall of the NVIDIA driver. This tool, run in a fresh profile on the same machine, never showed them.
When stalls show in one person's browser alone:
- ask for a run of this tool on that machine before tracing the game;
- on a machine shared with other agents' browsers, run it again and compare medians: their GPU work is in no trace of
  this browser.

**A 20 s fight** on this tree in headless Chrome 154 (RTX 4070 Ti): 38 programs linked, 455 ms in all, the longest
27 ms. 2 frames took over 100 ms (243 and 174), and none took 300 ms or more.

**Hovering the stash** (issue #267: the owner's lobby fell from 140 frames a second to 44 while hovering items):
production as the report had it, the warrior with 40 items in his stash, in first person at 1.25, his weapon held on
for 10 s, ran its median frame at 20.9 ms (48 a second) against 6.9 away from the items; with the glow's loops held
still (`stillGlow`), 6.9. Each of its three loops alone cost as much (`stillPulse`, `stillArc`, `stillSheen`: 20.8
to 20.9), and on layers of their own, 13.9 (`glowLayer`): each painted its glow again every frame. Moved by the
compositor alone, 6.9 (`src/ui/styles/AGENTS.md`). With the stash empty (every measure before it), nothing lit and
nothing showed: 145 a second, headless or in a window, the tooltip shown or not.

**Moving between the stash's items** (the owner's next report, on #269's first preview: down to 34 a second): the top
view in the forest, 1536x695 at 1.25, 60 items. Its glide phases read 143 a second; the sweep, 72 (13.9 ms) against
6.9 away. A frame's work showed why: with 30 items lit, their 90 loops (composited) cost the main thread 1.8 ms of
`Layerize`, 1.1 of style and 0.8 of `Commit` a frame, and the compositor 3.7 ms of `DrawFrame`; with the game's own
5 ms, a frame took two of the screen's. Each loop stopped alone changed nothing (`stillPulse`, `stillArc`,
`stillSheen`), nor did the lit items' filters (`noFocusFilter`, `noLitFilter`, `noDimFilter`) or the stash's mask
(`noStashMask`); all three loops stopped, 7.0 (`stillGlow`). The loops on the item hovered and the slots alone held
143 a second in every phase (`focusLoops`; the pulse kept on every lit item too, `focusLoopsPulse`: 143, its
compositor's draw 1.7 ms a frame against 0.3). What was left were frames of 100 to 250 ms as the hovered item changed:
the 60 items whose focus changed made layers for their fades and painted again, the worst 167 ms; every item a layer
all along, 49 (`itemLayers`; `will-change: transform` alone, `itemMoveLayers`, 195). The focus kept across the gap to
the next item (`src/ui/menus.ts` `focusSlot`) took the glide's and the held item's frames to 90% within 7.1 ms.

That preview still dropped for the owner (105 a second, its 1% low 36), and the sweep's median of 7.0 had hidden it:
its frames came at 99 a second, a third of them a refresh late (hence frames a second and the share missed, above).
A missed frame held three times an average frame's style, layers, painting and compositor's draw: a change of slot,
the 60 items' fades into and out of the focus and the glow's, the tooltip's new card. Over rounds, the glow's fade cut
read 7 to 19 a second more in frames but no less work; the items' filters moved onto their icons (`iconFilter`) did
a fifth less every run (538 to 559 ms a second against 616 to 747): each filter on an item, itself a layer, was a pass
of the compositor's own, drawn again every frame its glow moved. Its look kept by colours painted once
(`src/ui/styles/_items.scss`). This tree against that preview, 3 rounds each: 422 ms a second against 556 sweeping.

That still dipped for the owner, hovering "pretty quickly": at 100 ms an item (`--item-ms 100`) the sweep read 95 a
second. Split by variants over rounds, the tooltip's new card was a small part (`noTooltip` 105) and the focus's look
nearly all of it (`noFocusLook`: nothing lit or dimmed, 143; the browser's work 282 ms a second against 703). Hence
the focus moved only once the pointer rests on an item for 200 ms (the owner's own idea, `src/ui/menus.ts`
`FOCUS_DELAY_MS`), the glow's loops on that item (`.focal`) rather than the one under the pointer: at 100 ms an item,
144 a second, none missed. Resting on each item in turn (300 ms an item), each change of focus still cost about
70 ms of the browser's work, 133 to 136 a second (4% missed): no one part of it (the fades, `snapFocus`; the items'
colours painted again, `keepColours`; the glows painted at load, `glowLayers`, twice the work) but all of them, fades
cut and colours kept together 142.

**A 60 s storm** (the mage's Maelstrom, after a report of lag with 7 or 8 bodies in it), on #221's tree and on
production (no ragdolls): 14 and 21 kills, the median frame 16.7 ms on both. Each had one frame over 100 ms (167 and
183 ms), at 0.8 s into the run: the HUD's first paint in it, 18 Skia programs built for its hotbar. After that the
worst frame was 50 and 67 ms.

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
