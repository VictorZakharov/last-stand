# `tools/lab`

The lab as an agent works with it: what every command measures and why, how to write a measure, how the lab works and what keeps it repeatable. `README.md` is the short guide for people. The rules across the game are the [root AGENTS.md](../../AGENTS.md); `node/`, `page/`, `test/` and `examples/` have an AGENTS.md of their own.

## Rules

- **Every harness is permanent.** A measure is a lab command from its first use (a module in `page/`, an entry in `page/commands.ts`, one in `node/commands.mjs` and its options in `node/options.mjs`), or part of one that measures the same thing, never a probe left in `.tmp`.
- **A probe never takes the pointer.** Measure through the lab, whose browser stubs pointer lock, keyboard lock and fullscreen; a page of your own grabbed the user's mouse.
- **A check run often takes minutes**, not half an hour (Don't waste compute in the root's Workflow): `--profile` it, cut what its measures don't read, run side by side what doesn't depend on each other, and while iterating run only the scenarios a change can touch.
- **Send a long run's output to a file** in `.tmp` (an `--ab` run, a check) and read its parts: read through `head` or `tail`, a run's end was lost.
- **Stop the server with `npm run lab -- stop`**: its supervisor starts a killed server again.

## Commands at a glance

- `npm run lab:serve`: boots each command's page ahead of it (every command runs on a fresh boot and gives the same result every time)
- `npm run lab -- sheet`: pictures the hero in the player's views with each arm's load beside them
- `carry`: measures the carried bow
- `feet`: the feet against the ground round the dais's edges and on level ground (standing at full draw, walking across, strafing drawn, running reversals: out of reach, wobbling, sliding, in a riser, the rhythm)
- `range`: every joint against a body's ranges frame by frame (standing, walking each way, attacking, and walks that change direction while he attacks, held or tapped, or runs: each angle past its range, its worst and where, each scenario's fastest ankle and weapon tip, a two-hander let go of by the other hand, `--trace` the leg IK frame by frame as `gait --trace` lists it, each frame's joints past their ranges beside it)
- `eyes <skill>`: a skill cast through the eyes, frame by frame (where the blade goes across the view, wound up, through the blow and where it ends, how fast, where it is as the skill fires; a two-hander let go of where it's seen, or seen in one hand; a fist open on its handle; the arms' joints past their ranges; the weapon jumping between frames; a film of the frames)
- `match <picture>`: the hero standing through the eyes beside a reference's screenshot, on a screen of its shape (the screenshot, his frame, the two blended, the points marked on it and his drawn on each, and how far his are off)
- `coop`: two games playing together, the host's and a guest's beside it, their messages carried as a link of a high ping and jitter carries them (`--ping`, `--jitter`: how far behind and how roughly each shows the other's heroes and foes, how its timeline plays them out, whether an arrow that struck a foe on the guest's screen counted, whether a blow it dodged hurt it, a guest brought down and raised, a guest's blink as the host's screen shows it: when it hid the copy, where the copy came out, the foes it dazed on both screens; `--class mage`)
- `stops`: the hero coming to a stop from a run as a person stops (runs let go at different points of a stride, on level ground, drawn and by the dais's edges: the steps once still, a foot put out and drawn back, steps back, a foot on another level than the body's or stepped onto one once still, `--trace`, `--only`)
- `gait`: the walk judged as a person's (level ground and the steps, nothing drawn, drawn, tapping, changing direction often and going round in circles: each foot's time on the ground against the plan, both and neither, the steps a second and their length, hops, a foot dance's short steps, the gallops (a foot leaving within 0.3 of a stride of the other's: counted as hops, both feet within a few frames, a gallop at every set-off went unseen), the steps' width, the hips' rise and fall, a planted foot dragged, each hand's swing against its knee half second by half second, the rhythm against the walk cycle, steps back under a body that stopped, the jerks, each step's swing against its plan and why it left, every frame judged as a body's: its centre of mass with its gear against the push its motion needs from the planted soles, in the air falling as a body does, and every joint within its range, `--trace` each frame (`--span` some), a scenario held up by a prop failing it, and a film of each round its first hop)
- `form`: the run judged against a runner's (published runners' cadence, time on the ground, joint curves over the stride, lean, bounce and arm swing, at a man's size, with each way the hero holds his weapons: stick figures of his stride over a runner's, and the hero pictured from both sides, in the game's views and his arms close up, at eight points of it; the set-up's `--gear` holds them any way his class can)
- `probe <module>`: runs a measure of your own on the lab's clock and set-ups
- `live <step>`: a page kept between steps for trying by hand (start, picture in any look with a reference over
  it, inspect, eval, frames): under a second a picture
- `check`: runs every hero's checks of a change to how they move side by side (`--ab`: against main, its side kept once it has run; each gait scenario from three starts, its turns at other points of a stride, as a frame's change anywhere sends a scenario's later strides elsewhere: judge a change on the counts over all of them, each side's in the log)
- `ui`: pictures the UI in its states (the lobby, a tooltip, How to play, the save slots, a class button clicked and a key pressed after it, the lobby's views switched with each label against its anchor through every glide, the run's HUD with a hurt foe's bar and damage numbers, the scores, the perf overlay, the choice after a wave, the pause menu, the summary) with each named element's and label's box as a share of the window
- `touch`: the touch controls' move stick pushed by a finger, its touches sent as a touch screen's (slid out through the stick's travel, to its edge and far past it, half the window across: the stick's push, the knob against the finger and the hero's speed, a push further out never giving less)
- `tap`: the touch buttons of every skill aimed by holding, the other thumb on the move stick (tapped standing, at once and walking: a movement skill the way he moves, any other at the nearest foe; dragged while the stick moves: the skill's own preview following the drag, cast where it last showed, the stick still walking him)
- `light`: the frame's light as the player sees it (the hero standing in each biome, view and facing, the frame drawn and read back from the canvas: its light as a share of the screen's white, by thirds, its brightest pixels, near white and past it; `--hdr` draws each again in HDR and checks it against the SDR frame)
- `haze`: the hero's held weapons' light through the eyes (each way he looks: their surface blown out near white, their bloom past it, and the frame round them darkened by the adaptation to them)
- `spawns`: the foes coming in (boss waves one after another, a seed each: the gate every foe came by, its spot against the props, the gates each group and wave left idle, when the boss came against the rest of its wave, and its walk to the hero from each gate)
- `health`: the low-Health look (the hero's Health held at shares of his most in each biome, view and facing: the colour drained, the blood's cover and how far in it reaches, nothing in the view's middle, more of both as the Health falls, none above where it starts)
- `held`: every held skill's preview as the player holds it (ready, then through its cooldown and short of energy: its own look, red and counting down until a release would cast; Quarry Mark's outline round its foe in every view, its pixels near the foe and none away; Starfall's ring against its strikes, every foe inside it struck on every cast; every mark on the floor held across the dais's step, on each level and down its faces, none of it under the floor or standing off it; no shader compiled meanwhile)
- `shots`: the bow's shots at a boss with its foes packed round it (each biome and view, the bow drawn to full over points across them and loosed, its flight followed frame by frame: the first foe drawn along it struck, none if none, and one aimed inside a foe reaching it unless another is in the way)
- `blink`: the mage's blink cast as the player casts it (open ground, past his reach, into a prop, past one, the arena's edge, onto the dais, his own feet: where it came out against its preview and his reach, the frames he was hidden and the blows that landed in them, the foes near and far it dazed and how they stood)
- `draw`: each drawn shot held at full draw as the player holds it (the glint round its arrowhead every frame in every view: none as it's drawn, held at full until it's loosed, the pixels it lights as the player sees it, and no blob of glare; the crosshair bold at full draw alone, its one beat into it about its middle, none with reduced motion)
- `cast`: a skill cast as the player casts it, its effect seen frame by frame (each biome and view with the biome's foes coming at him, every frame drawn and read back: its light against the budget, the frame's mean every tenth of a second, the flashes in any second and the worst cell's light through it, the shaders compiled late)
- `trail`: the trail a swung weapon leaves (each strike in each view, every frame drawn with it and without: its light where the weapons swept over the last 0.15 s, lit through every blow, its newest end on the blade, nothing while the weapons are still)
- `death`: each skill's kills as they fall (foes stood dazed where it strikes, a hair from death and with little to spare: how hard each body was thrown and which way, how far it flew, when it lay still; its drawn pose against the floor, the props, the wall and its points)
- `crowd`: a crowd of foes killed at once and what the frame costs as they fall (each frame timed by the browser's clock with the game drawn, the bodies' part apart, at each CPU slowdown, as a low-end device's, and frame rate)
- `draws`: one frame's draw calls with the crowd standing, by what drew them (the geometries drawn most often, those that drew the most triangles, the triangles drawn outside the view of the pass that drew them, the draws that drew nothing, the scene's draws by their material's look, through the eyes what the arms' own camera drew, the hero's arms and what they hold alone; the scene's objects whose matrices are made again each frame)
- `perf <skills>`: skills cast in turn with the biome's foes coming, every frame timed as the game's performance report times it (the frame, the update by stage, the render, the GPU by pass, the draws, triangles and the particles' fill), on a phone's screen, boot and CPU if asked
- `compiles`: whether the boot's warm-up compiled what a fight draws (a prop of every kind broken and the first wave fought in each biome: every program compiled meanwhile, and the draw that first used it)
- `gear`: full sets of gear rolled for every class at each tier (the Health, regeneration and draught they give, and the damage they multiply)
- `weapons`: each of the hero's weapons alone in a lit studio (face on, edge on, from behind, from three-quarters and its head close up, with its size and its triangles)
- `hands`: the hero's right hand alone in the studio, flat, open, relaxed, in a fist and round a handle, from each side and close up (its size against a man's, its triangles, where it was sculpted)
- `music`: each biome's music as the player hears it (its lobby, a run's countdowns, fights and wins, a hidden tab and the bank back: which track plays, how it fades, where it comes in, what reaches WebAudio)

Options every command takes:

- `--screen WxH@ratio`: puts a command's page on a screen of that size and pixel ratio
- `--screens a,b`: runs it on two screens and compares them as `--ab` compares two commits (`ui --screens 3840x2160@1,1280x720@3`: a 4K screen at 100% and 300%)
- `--ab`: runs any of them on `origin/main` too and says which lines and pictures differ (a commit against itself agrees, line for line)
- `--watch`: runs one again on each change to the source
- `--profile`: says where a command's time went
- `--tune name.field=v,...;...`: sets the game's tunable values before a command's set-up (`src/core/tuning.ts`: `warriorEyes.oneOn=0.75,-1.1,0.5`), so a pose or a camera is compared across values in seconds, without editing the source and booting again
- `--boot level[@pixels]`: the page booted as a device whose Auto settled on that quality (`low@518400`: #243's phone): Auto's cookie set before the boot, so its warm-ups run at that level and the hero is built at its detail; a page booted ahead counts as ready only for the same boot
- `--wear helm,chest,hands|none` (any command that sets the run up): the armour the hero wears, every piece not named left off (the set-up's report says what he `wears`): with `--screen` at the owner's window, a picture of what they see (the lab's hero is otherwise as the boot rolled him, bare-handed, and his first-person hands looked nothing like the owner's gloved ones)

A command exits with 1 when it failed or found a problem (an error in the page, a canary missed). An A/B's pictures that differ are pictured where they differ (`tools/lab/out/ab/<command>/`), a probe can return moments pictured (`lab.picture`, or `lab.screen` for the screen as the player sees it, the page's UI over the game, whole or round one element; written as a sheet and compared in an A/B), and `page/timing.ts` times a method's calls by the browser's own clock (the page's `performance.now` is the lab's). Write a new measure in the lab (`tools/lab/examples/handSpeed.ts` shows its parts: the state it measures checked to have happened, a canary it must catch), never as a script with a boot and a clock of its own, and keep it: from its first use it is a lab command, or part of one that measures the same thing, never a probe left in `.tmp` (every harness is permanent). The probes and films the AGENTS.md files and their notes name (the bow probe, the range probe, `legdet`, the zigzag and aim probes...) were such scripts and aren't in the repo: each is a measure to port into the lab the first time it's needed again, as the carry's was (`carry`). The lab's own code has unit tests: `npm run lab:test`.

## Commands

- `sheet`: the hero in the states the player sees (`--states stand,walk,full,cast`), pictured from the game's views
  and close up (`--views lobby,top,third,front,left,right,back,above`; `eyes` with `--view first`, the whole frame
  at the row's height; `--focus <joint>`
  frames the close-ups on a joint), with each arm's load and posture beside them. `cast` casts `--skill` (its key, its
  behaviour or its name; bound to its own key if the hero knows it but hasn't it on one) ahead of him and pictures
  it at shares of its cast (`--shares`, 0.3,0.55,0.8 by default; a channel at shares of its key's hold, `holdFor`),
  with where its cast point (the weapon's tip) is: how high over the floor, how far ahead, and the way the weapon
  points (up, from ahead, and in the chest's frame, as a two-hander's holds are placed). `--gear` holds the weapons a
  style's way (`--weapon` the base). `--look` draws the pictures another way (below: the hero's wireframe, his
  faces' orientation, his parts with where each is, his skeleton). Writes `out/sheets/<--tag>/sheet.png` and
  `notes.txt`.
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
  off at a run, turned round and stopped; a long run straight on), strafing drawn, tapping, changing direction every
  third of a second and going round in circles, nothing drawn and drawn
  (`--scenarios walk,run,drawn,taps,zigzag,circle,circleDrawn,stairs,stairsDrawn`): each foot's share of the time on the
  ground against the share the gait plans, both down and neither (a walk has a foot always down), the steps a second
  and the ground a step covers, the steps' width (footprint to footprint across the way: a runner's 5 to 10 cm, a
  walker's 10 to 15; over 30 the legs are apart), the hops (both feet leaving or landing within a few frames of each
  other), the gallops (a foot leaving within 0.3 of a stride of the other's, the legs swinging together: a person's
  leaves half a stride after it; the hops missed the set-off's, its second foot 6 frames after the first), a foot
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
  backing or not, and each foot (planted, with its distance from its hip, `!` out of reach and `d` dragged, or its
  stride's progress, `~` in a timed step), where it is in its window, its ankle's speed and how far its way turned,
  and what a body couldn't do that frame (`page/legTrace.ts`, which `range --trace` shares). Each
  scenario is measured, then run again to film it from the side round its first hop or gallop (else its middle),
  a picture every few frames, so the motion is seen as well as measured; each film is a sheet of its own (`film-1.png` on,
  an A/B's other side `film-main-1.png` on: both sides in one page, or all eight films, took the browser down) and an
  A/B compares the reports.
- `form`: the hero's run judged against a runner's (`page/runner.ts`: the cadence and each foot's time on the ground
  by speed after Dorn, Schache and Pandy (2012), the hips', knees' and ankles' curves over the stride after Novacheck
  (1998) and Fukuchi (2017), the arms' after Hinrichs (1987), and the trunk's lean and the hips' rise and fall), with
  each way he holds his weapons (`--gear oneHanded,shield,twoHanded,dual`: the class's own by default). He runs
  straight across open ground at full speed, judged at a man's size (his speed and lengths scaled by his legs against
  a man's, `MAN_LEG`); each leg's frames are folded onto its own cycle from its foot's touchdown to the next, the
  stance and the swing each stretched onto the runner's so the curves line up at the touchdown and the push off. Says
  the steps a second and their length, a foot's time down and in the air, the hips' rise and fall, each joint at the
  touchdown, mid-stance, the push off and the swing's most against the runner's (and how far off on average and at
  its worst), the trunk's lean and the head's tip, the pelvis's and chest's turn, each arm's swing in the chest's
  frame and its elbow's bend, and what is unlike a runner. Each way is pictured at eight points of the stride
  (`out/form/<way>.png`, one sheet a way: all four in one took the browser down): stick figures of his run (the left
  limbs blue, the right orange) over a runner's on his lengths (grey, the hips rising and falling as a body flies),
  the hero from both sides, the game's own views and his arms close up, measured first and run again to picture the
  frames chosen. `--frames` lists each leg's cycles (touchdown, push off, the next touchdown) and the curves bin by
  bin; `--canary` holds the left knee straight through its stances, which the knee's curve must show.
- `coop`: two games playing together, the host's in the side's page and a guest's in a partner page beside it
  (`Side.openPartner`), stepped together a turn of frames at a time on the lab's clock. Each page's BroadcastChannel
  (the game's `?net=local` link) is replaced by one the lab carries (`page/coop.ts`), and the messages go from one
  page to the other as a link of `--ping` (the least round trip, 300 ms by default) and `--jitter` (how much later each
  way, 60 by default) delivers them: in the order sent, as a WebSocket's TCP does, a late one holding up those behind
  it, and every couple of seconds a stall of several jitters (`node/coop.mjs`). The heroes play scenarios (`walk`: the
  host running round in circles, the guest zigzagging; `foes`: foes chasing them; `shoot`: the guest shooting at a foe
  that chases the host; `dodge`: the guest running from every other blow as it sees it coming; `down`: a foe bringing
  the guest down and the host raising it; `blink`, played only by a hero with a blink, `--class mage`: the guest
  blinking between two spots as foes close on it), each one's input frame by frame from what its own screen shows.
  What each game showed is judged against the other's in the same frame (`node/coopJudge.mjs`): each copy's delay (the
  one that lines its path up best with its own game's), how far off that path and how roughly it moves (its speed
  against its own, its largest move a frame), how each game's timeline plays its partner out (how far behind the
  freshest report, how often a stall held it, how far its clock strayed), the arrows that struck on the guest's screen
  and whether the host counted them, the blows at the guest against whether it stood in their reach on its own screen,
  when the guest went down and was raised on each screen, and each blink: when and how long it hid the guest's copy on
  the host's screen, how far from where it came out on its own screen the copy came out and how far it moved after,
  and the foes it dazed on the guest's screen against those dazed on the host's. Scenarios run on from each other, so
  a scenario alone can differ.
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
  onto another once still (put down a step below and stepped up a second later), both feet up once one had landed
  for more than 6 frames running (up to 6, the run's own flight going on as the braking foot comes down, as a
  runner's does, are listed apart), how long the feet took to settle and their travel once still. `--frames` lists each stop: where it was let go and
  rested along the way, and each step with where it left and landed from there and on which level; `--trace` adds
  each frame (the body, the hips, each ankle and where each foot in the air is aimed, the lean); `--only 'd 23'` runs
  the stops whose names contain that. Within one run each stop starts at its own moment of the clock, so a stop run
  alone can differ from the same one in the whole run: compare the totals. (The gait's steps back counted only steps
  that left once the body stood, and missed every stop's: the step back began as the body slowed.)
- `range`: every joint of the hero against a body's ranges (`models/anatomy.ts`, as the dev builds' `watchBody`
  measures them), frame by frame, over standing, walking each way, attacking standing, and walks that change
  direction while he attacks (held or tapped) or runs (`--scenarios stand,walk,shoot,reverse,taps,run`), and with
  `--skill` a skill cast standing and its end held (`cast`: its key held as long as the player would, `holdFor`, a
  channel through; pressed for a frame, Steel Tempest stopped at once), the weapons held `--gear`'s way throughout
  (`--weapon` the base): each angle past its range, on how many frames, its worst and where (for a leg, whether its
  foot was planted; for a shoulder, its raise, the plane it rises in and its turn against what each allows), each
  scenario's fastest ankle, its weapon tip's fastest move a frame between moves and through them, each with how far
  the hand moved then and the joint whose own turn changed most (`page/tipMoves.ts`, in the hero's own frame: between
  moves, where a pose eases back to the stance, a jump shows; Thunder Crescent's end was back at rest in a frame,
  131 cm, and a two-handed swing's end turned the hand over, `handR turned 178°`), a two-hander's lower grip let go
  of by the other hand (on how many frames, how often, from which frames and moments of a move, and why at the worst:
  the grip past the arm's reach, its joints past their ranges, the arm into the body; a failure. Its frames on the
  shoulder or the flask in hand are counted apart, `LowerGrip.free`), and its worst moment pictured, and the weapon
  under the floor (`page/weaponFloor.ts`: every corner of the surface of what the main hand holds, on how many frames,
  the deepest and how far along the weapon; Thunder Crescent put an axe's or a maul's head into the floor to its
  middle). `--canary` turns the head past the neck's range on one frame and sinks the hero 2 m for one measure (the
  weapon must be found under the floor), `--frames` lists every frame with a joint past its range, every frame the
  weapon was under the floor and every frame between moves the tip moved 10 cm or more (with every joint that
  turned: an elbow swung round its arm turns the shoulder alone), and `--trace` (`--span a,b` for some frames) the leg IK frame by
  frame as the gait's trace does (`page/legTrace.ts`: each foot down, in the air or in a timed step `~`, dragged `d`),
  each frame's joints past their ranges after it.
- `eyes <skill>`: a skill cast through the eyes (`page/eyes.ts`, `--class warrior`; `--gear` and `--weapon` hold the
  weapons as `range` does), its key held as the player would through `--times` casts in a row (a basic attack's
  chained swings), stepped frame by frame from the press until the arms are at rest again; a cast, a dash (Bull Rush,
  Twin Fangs' lunge) or a channel (Steel Tempest) all count as what it follows. Each frame it places the weapon's
  blade (its middle, from the grip to the tip: a long blade's tip is out of the frame's top as often as not), the grip
  and the other hand's fist on the screen, and says per cast where the blade began, where it was wound up to, the blow
  (the frames round the fastest that move at least 0.4 of it, measured only while the blade is in or near the frame:
  passing close beside the eyes out of the view it swept 90 degrees of their view in a frame, and that read as the
  blow), where the blade was as the skill fired against the blow, and where it ended, how many frames it was out of
  the frame; the shoulders at rest in the eyes' frame and an arm's reach (where a pose through the eyes can put the
  hands), and the arms' joints past their ranges, each one's worst and on how many frames (information: through the
  eyes the arms are placed where they're seen, not fitted to a body's ranges), and each hand's fist on its handle
  (`Model.fists`: how far the handle passes from where the fist closes, how far the fingers are curled). Problems: a
  two-hander let go of by the other hand where that hand is in the frame (one let go of below the frame is listed,
  unseen); a two-hander seen in one hand, its lower grip in the frame with the other hand out of it, for longer than
  200 ms (a fist below the frame on a handle that runs out of it is lost to a person's own eyes too: counted whenever
  the weapon's hand was seen, the middle guard at rest read as one-handed); and a hand seen holding its handle as an
  open hand, the handle over 1.2 cm from where its fist closes or its fingers curled under 0.5 rad (through the eyes a
  hand is drawn large, and the user saw the grip "not gripping the sword"); and the weapon jumping between frames, seen
  in or near the frame: a frame its tip moves into at least 6 m/s, 3 times the median of the moves 3 frames each
  side of it and twice the slower of the frames either side (`page/jumps.ts`; the median, as a blade out and back
  again in a frame moves as far into the next; the sides, as a dual wielder's cut, fast for three frames, read as a
  jump against a round mostly still), the
  tip passed from one hand's weapon to the other's not counted (#249: Steel Tempest's blade leapt a metre and more each
  turn of the spin, the elbow flipping over as the shoulder came round under the camera; a two-hander's dropped 43 cm
  as Power Strike's way back ended). `--film=false` takes no film (it's
  `tools/lab/out/eyes/<skill>/`, every `--every`
  frames, 2 by default), `--frames` lists every frame: the grip, the weapon's way and the other hand in the camera's
  space as the moves through the eyes are keyed (`models/warriorEyes.ts`), held or let go and why, and its joints
  past their ranges, and the fists. `--canary` freezes the body, the trunk and the arms as they were at the press (and
  puts the hero under the camera again by his neck as held: placed by the neck as posed, Steel Tempest's frozen arms
  went round the eyes each turn), turns the other arm down out of the frame and lifts the weapon 15 cm up the view out
  of the fists: there must be no blow, a two-hander must be seen in one hand, and a fist must be off its handle (frozen
  alone, the arms swung with the trunk's turn and read as a blow); and lifts the weapon 30 cm up the view on its
  stillest frame in the frame alone, which must read as a jump there. A spin's blow (a skill with a `spin`: Steel
  Tempest) isn't asked to cross the aim, as it strikes all round; whether its passes may be seen is `cast`'s flashes'
  to say (held across the view, the one-hander's steel lit the crypt 3 times a second at 2.4 turns a second). Every run
  of the cast, the canaries' as the first, starts at full energy, its cooldowns cleared (Steel Tempest drains energy
  while held: the runs after the first spun 11 frames less, and the jump canary's lift fell past their end).
- `match <picture>`: the hero through the eyes matched to a reference (`node/match.mjs`; another game's, the one the
  owner names), not by eye: handed over as matching three Vermintide 2 screenshots from a one-line summary of them, a
  rest leaned in where they lean out, was twice as wide and had its head out of the frame. He stands at rest, or is
  caught at a moment of a strike: `--skill` cast ahead, at `--share` of its cast (0.5 by default; `page/sheet.ts`'s
  cast state). The reference is a screenshot, or a frame of a clip of the other game's swings (`.mp4`, `.webm`, `.mkv`,
  `.mov`; `--frame <s>`, cut by ffmpeg into `out/match/frames` once, `node/clipFrames.mjs`). He's put on a screen of
  the reference's shape (`--gear`, `--weapon`, `--wear` and `--tune` set him up; it takes no `--screen`), and
  `out/match/<picture>/match.png` shows the reference, his frame and the two blended, with the reference's marks (red)
  and his (blue) on each. The marks are written once beside the picture, `<picture>.marks.json` (a clip's frame's:
  `<clip>@<ms>.marks.json`): `crop` (px: the game's frame within a screenshot of a video), `points` (`in`, where the
  weapon comes into the frame, and `tip`, its tip or head; shares of the frame across and down), `wide` (the weapon's
  width, a share of the frame's: a bar across its line at its middle shows it), `box` (the part of the frame it covers,
  [left, top, right, bottom]) and `outline` (the weapon's and the fist's, shapes of [x, y] shares). His are the sheet's
  (`page/inFrame.ts`: read off the frame as drawn, through the camera that draws the arms; which of the weapon or the
  arm each cell of a 96 by 54 grid shows is the two drawn alone in flat colours, `page/pickGrid.ts`: a ray a cell
  against the skinned hands took 43 s a frame at a strike, and saw them skinned another way than the game draws
  them). It says each frame's numbers (the points, the lean between them, the width, the box), how far his are off the
  reference's, and how much of each outline his frame covers. Check the marks on the reference's own panel before
  trusting a comparison. `--fit a.b,c.d` searches tunable values (`--tune`'s) for the rest nearest the marks `--near`
  names (`line`, `wide`, `box`, `outline`, by default; `page/fitRest.ts`; a rest only), then pictures it with the
  `--tune` that gives it: fitted one number at a time, a rest matched every number with the blade out of the frame and
  the hand in it. `--canary` takes his points as the reference's moved 10% across, which the comparison must find so,
  and with `--fit` fits him to his own frame from values moved off it, which must find its way back.
- `carry`: the ranger's carried bow against his body through a carry's round (standing, walking, a draw and its shot,
  waiting with the next arrow, putting it back). `--canary` plants faults it must catch; `--frames` lists every frame
  with a clip, what crossed what and how deep.
- `probe <module>`: a measure of your own (below). Options the lab doesn't know are passed to it (`--frames=30`), and
  `--setup=false` skips the set-up.
- `ui`: the game's UI as the player sees it, in its states (`--states lobby,tooltip,help,saves,clicked,views,run,
  scores,perf,decision,pause,summary`: the lobby, an item's tooltip, How to play, the save slots, the hero's class
  button clicked with the mouse and a key pressed after it as the browser gets them (where the focus went and whether
  the browser shows its ring: a problem when the button kept it), the lobby's camera switched with V through every
  view and back, each glide played and drawn (every frame, each label over the dummies against where its anchor shows
  by the camera as the frame draws it: off by more than a pixel is a problem; placed with the camera's turn of the
  frame before, they were up to 1442 px off as a glide set off), the run's HUD with a hurt foe's
  bar and damage numbers over it, the scores, the performance overlay, the choice after a wave, the pause menu, the
  run's summary), each pictured whole as a PNG of its own at the screen's pixels (`out/ui/<state>.png`), with every
  named element's box and every label's over the world as shares of the window. With `--screens`, whether the UI is
  the same share of both screens: on `3840x2160@1,1280x720@3` (a 4K screen at 100% and at 300%) the lines agree but
  the tooltip's place (it keeps off the pointer in css px, as the OS scales the pointer) and the lobby's text, which
  drifts by up to 1% of the screen down a panel (Blink rounds each line of text to whole css px), and the pictures
  differ by text's antialiasing, 2 to 5% of their pixels (the lobby's states 12 to 16%, with the drift). The page
  takes a state at a time: a 4K screen's ten pictures sent back at once were too much for the browser, which closed.
  `--hdr` puts HDR on first, as on a display in HDR mode, so the pause menu shows its levels.
- `light`: the frame's light as the player sees it. The hero stands in each biome (`--biomes crypt,forest`), in each
  view (`--views top,third,first`), the close views looking each way (`--facings 0,90,180,270`, degrees: the camera
  turned by mouse look, which the body follows), and the frame is drawn by the game's own camera and read back from
  the canvas. Its light is a share of the screen's white: the mean, by thirds (through the eyes the sky is the top's),
  the 50th, 90th and 99th percentiles, the brightest pixel, and the shares near white and past it. An SDR frame is
  read as an SDR screen shows it (gamma 2.2), an HDR one as the browser shows its extended sRGB. Each frame is
  pictured (`out/light/`; `--pictures=false` for the numbers alone). With `--hdr` (`--paper`, `--peak`), the same
  moment is drawn again in HDR, on any display, and checked against the SDR frame: every pixel under the knee as the
  SDR screen shows it at the paper white, nothing past the peak, and the canvas shown (the WebGPU one, read back) the
  frame drawn. `--canary` draws the first frame at twice the exposure, which must come out brighter, and in HDR at
  1.2 times the paper white, which the check under the knee must catch. With `--ab` the SDR frames agree with main,
  line for line.
- `haze`: the hero's held weapons' light through the eyes (`page/haze.ts`), standing in a biome (`--biome`, the
  forest by default) looking each way (`--facings`), held as `--gear` and `--weapon` say. The frame is drawn with the
  weapons and without them, each also with the grade's adaptation held off, and their surface found in the `parts`
  look. Held off, the share of their surface near white is their glare (5% at most), and the share of the frame past
  them that their light brightens by 0.03 of white is their bloom (0.5% at most): the sun on a dual wielder's blade
  held up by the eyes blew it out over 16% of its surface and bloomed over 7.7% of the frame. Past their own pixels,
  a pixel the adaptation darkens more with them than without is hazed (0.5% at most). Each frame is pictured with its
  map: the weapons blue, their glare yellow, their bloom pink, the haze red (`out/haze/`). `--canary` plants a veil
  (the frame at 0.8 of its exposure), which must haze, and the weapons lit white, which must glare and bloom. Not
  yet within its haze: on main as here, a single sword hazes up to 4.9% of the frame looking 135 to 315 degrees.
- `touch`: the touch controls' move stick pushed by a finger, its touches sent by the browser as a touch screen's
  (`lab.touchDown`): put down on the move pad and slid right, within the dead zone, through the stick's travel, to its
  edge and far past it, and half the window across, each push from a fresh set-up. Each push's line says what the
  game made of it: the stick's push (0 to 1), how far out the knob stood and the hero's speed against his full. It is a
  problem when the knob isn't under the finger within the travel, when a push further out gives less than a nearer
  one, or when a push past the edge falls short of full speed. On main, the knob was held to the edge and the push
  divided by the finger's whole distance, so half a screen out the hero walked at a seventh of his speed. `--canary`
  slides the furthest push's finger back to 20 px before it's read. Try it on a phone too
  (`--screen 844x390@3`): the stick is drawn at the touch controls' scale, and so is its travel.
- `tap`: every skill of the hero's class aimed by holding (`SkillDef.aimed`: `--class mage` Starfall and Veilstep,
  `ranger` Quarry Mark and Strawman), its touch button pressed by a finger, the other thumb on the move stick
  (`lab.touchDown(at, finger)`), each from a fresh set-up with a training dummy standing clear at the hero's side.
  Tapped standing, tapped down and up between two frames (a slow phone's quick tap: the release takes the aim as the
  press would have) and tapped while he walks away from the dummy across the way he faces: a movement skill
  (Veilstep) must go within 3° of the stick's way, or of his facing standing, and any other be cast at the dummy where
  it stood as the finger lifted. Each cast is read as the skill is given it (its `cast` wrapped for the round). No
  tooltip may open after a tap. Then dragged from the button through three stops, the stick slid to a new way at
  each: the skill's own preview must show within 3° of the drag's way from the hero (Quarry Mark's outline round the
  dummy standing along it), no plain ring beside it, and let go it must be cast where the preview last showed, the
  stick still pushed and the hero walking on. On main a tapped Veilstep went at the dummy (87° to 177° off), no held
  skill showed its own preview on touch, and a tap opened its tooltip over the buttons. `--canary` taps a movement
  skill with the stick let go and the hero turned to the dummy, another with the dummy carried out of reach, reads
  each drag's last preview before a frame showed it, holds its cast against the stop before's preview, and reads the
  plain ring as shown beside a preview: each must be caught. (A dummy risen outside the arena or in a prop is pushed
  in over its first frames, metres for one off the edge: spots are picked where one stands clear.)
- `spawns`: the foes coming in. Boss waves (the 5th, 10th, 15th and 20th in turn, `--waves 32` in each biome,
  `--biomes`) are set off one after another, each from a seed of its own (every set-up seeds the same numbers, which
  would roll the same gates), the hero at the arena's middle (`--at`). Every foe is read as it rises: the gate it
  came by, how far into the arena and to the side of the gate's middle, and its room from the props and the edge. The
  first group is left standing, each of its foes timed as it comes within its reach of the hero (its range and his
  body, as the AI strikes within), as the boss's time is reckoned from it; a later group is taken out once its last
  foe has risen, and the next called at once. The boss's summons are held off (they rise round it, not by a gate).
  The report says each gate's share of the foes, how many groups came by one, two, three and four gates and the
  packs' sizes (a number of gates no group came by, though enough had foes for it, is a problem, as is a gate sent
  under half its share), the waves that left a gate idle though their packs were enough for all four, the spots and
  the least room, the gates the bosses came by, whether each boss rose after its
  wave's first group and when against that group reaching the hero, and from each gate the first boss's walk to the
  hero (how long from its rise it took to come within its slam's reach). Each of those is a problem when it's wrong,
  as is a foe risen inside a prop or a boss outside its time (`bossJitter` either way, and 1.5 s for the game's
  estimate, a straight walk at each foe's wave's pace). Then waves 1, 5 and 10 are played at the game's own pace, each
  foe taken out as it reaches the hero, as a player killing each one as it comes: when each group came, its foes, and
  when the wave was over (the same seed needn't give main the same foes, as the waves before leave the clock
  elsewhere). On main each group came by two gates picked at random, often one twice, every boss in the first group
  by one gate, and by the Thornwood's west gate foes rose in a log. `--canary`, in the first biome: every foe read
  again moved onto one gate, the first half into a prop, and waves of their own with the boss put first, come late
  and frozen where it rose.
- `cast <skill>`: a skill cast as the player casts it, its effect seen frame by frame (`page/cast.ts`; the skill
  named by its key, its behaviour or its name, `--class` for whose). The hero stands in each biome and view
  (`--biomes`, `--views`, `--facing` in degrees, `--at x,z`: off the dais by default; `--at 0,0` its middle) with the biome's commonest foes coming at him from 13 m ahead
  (`--foes`, 4 by default), and the key is pressed over an aim 8 m ahead: held for a held skill, drawn to full for a
  drawn shot, held 3 s for a channel. Every frame from the press until the effect is over is drawn as the game draws
  it and read back from the canvas (`page/screenCells.ts`: as stored, 0 to 255, and as light by sixteenths of the
  frame). Its light is held to the budget taken from the owner's screenshots: the frame's mean raised by 50 at most
  over the scene before the press, a sixteenth of it 150 at most and 5% of it bright (200 or more) at most, those two
  not judged where the scene alone is past them. The flashes are counted as WCAG counts a general flash
  (`page/flashes.ts`: a pair of opposing changes of a tenth of white in a sixteenth's light, the darker under 0.8),
  three in any second a problem; the worst cell's light is listed through its worst second, and the frame's mean
  every tenth of a second through the cast, and the blinks, listed and not judged (`page/blinks.ts`: a patch of a
  64 by 36 grid brightening by 20 or more over the frame before and back within 3 frames, an effect's own crackle
  among them; a broken prop's rubble piece drawn full size at the world's middle for a frame, beside a hero on the
  dais, was one). `--what s,x,y` says what the eye's ray meets at that moment and point of the screen (% across and
  down), nearest first (`page/whatIsAt.ts`): the runs give the same frames, so a blink one finds, the next can look
  into. It casts through each camera that drew the frame, on the layers it draws: through the eyes, the arms' own
  first, as it draws over the world's. Cast on every layer from the world's camera, it listed the hero's hidden hair at
  the eyes and missed the arms, drawn through a narrower view. Shaders compiled after loading, and nothing cast, are problems too. The
  props a cast broke stand again before the next. `--times` (0.4,1.5,3 by default) are the moments pictured, the
  screen as the player sees it with the HUD, into `out/cast/<skill>`; `--canary` strobes the exposure in the first
  biome and view (5 a second), which the flashes must catch. `--gear` holds the weapons a style's way (Thunder
  Crescent takes a two-hander), and a skill the hero knows but hasn't on a key is bound to its own first.
- `trail`: the trail a swung weapon leaves (`page/trail.ts`, `fx/swingTrail.ts`; `--class warrior`). Each strike
  (`--strikes skill@style,...`: every warrior strike and Rending Cleave with every weapon style by default) is cast
  in each view (`--views`) in the crypt (`--biome`), and every frame from the press until his weapons are still again
  is drawn twice, with the trail and without it (its meshes hidden), both without bloom (`holdBloom` in
  `core/renderer.ts`: from the top-down view, where the trail is a few pixels wide, the glow round its newest end was a
  hundred across, and read as trail off the blade's path), so the pixels it lit are told apart (`page/sweptArea.ts`).
  Where it may be is where his weapons swept over the last 0.15 s: each frame every weapon in his hands is placed from
  its grip to its far end, read off its own meshes and not the trail's points, in his own frame (as the trail is
  kept), and each gap between two frames is cut into steps along the curve through its places round it (joined by
  straight lines, a blade swung round the eyes 80 degrees a frame was placed half a metre inside its arc), and drawn on
  the screen as the camera drawing his arms sees them now, with a margin round them. Problems: more than 5% of the
  trail's light outside that; a blow (frames moving at 12 m/s and 0.4 of the strike's fastest, three or more, a
  weapon's far end in the frame) lighting less than 0.02% of the screen; the lit pixel nearest a blade swung at a
  blow's speed in the frame further from it than the margin (the median through the blows); the newest column of the
  trail's own geometry over 3 cm from the weapon through a blow; and pixels lit before the press or while the weapons
  have been still (under 3 m/s) for longer than the window. Each strike's frame its trail lit most is pictured into
  `out/trail`: as the player saw it, its trail's pixels (white where the weapons swept, red outside, where they swept
  tinted blue) and those close up. `--frames` lists every frame (the weapons' speed, the pixels lit and outside, the
  newest column against the weapon); through the eyes, Steel Tempest's blade was put back 53 cm in a frame as it ended
  and the trail drew that as a slash across the top of the view, now a place is as fast as the slower of the moves
  into it and on from it. `--canary` plants three faults in the first strike: the trail lasting a second (lit away
  from the last 0.15 s and while still), never lit, and through the eyes drawn by the world's camera instead of the
  arms' own.
- `health`: the screen as the hero's Health runs low (`page/health.ts`). Standing in each biome, view and facing
  (`--biomes`, `--views`, `--facings`), his Health is held at shares of his most (`--shares`, 1 down to 0) and at
  each the frame is drawn three times at the same moment: without the low-Health look twice (the pixels that differ
  between those two are unsteady, the forest through the eyes shimmering a level every other frame, and left out),
  then with it (`light.ts`'s `drawFrame`, read back from the canvas). Reported for each share: the look's strength,
  the share of the pixels it changed, the colour it drained (off the blood), the blood's cover of the screen and of
  its middle third, and how far in from the edges it reaches (the furthest blood pixel and where). A frame changed
  above where the look starts, blood in the view's middle, a lower Health that drains or covers less, and a look
  too faint with nothing left are problems. `--pictures` (on by default) pictures the frames under the share the
  look starts at into `out/health`; `--canary` draws the look with the Health whole and drives its blood into the
  middle.
- `blink`: the mage's blink cast as the player casts it (`page/blink.ts`, `--class mage`): the key held over the
  aim and let go, on open ground, past his reach, at a prop's middle, past a prop, out at the arena's edge, up onto
  the dais and at his own feet. Each says where it was aimed, where the preview showed and where he came out, how
  far, in how many frames, how many of them he was hidden and whether a blow tried in each landed (none may, and one
  just after must). Then held through its cooldown (`page/heldCooldown.ts`): pressed with 2.5 s of it left, let go
  while the preview is red (nothing may be cast), pressed again and held until it's green, and let go (it must cast),
  the preview read every frame as it's drawn: red on every frame of the cooldown, its countdown the seconds left
  rounded up (3, 2, 1), green within a quarter of a second once ready; then held short of energy (red, no countdown,
  nothing cast). Then foes stood near where he vanished and further off: how long each was dazed, its speed
  while dazed and after, and the stars over it. A landing off its preview, past his reach or in a prop, a blow
  landed while he crossed, a near foe moving while dazed or never coming on again and a far one dazed or stopping
  are problems. `--pictures` (on by default) pictures the held preview, his coming apart, the crossing, his forming
  again, the preview counting down and the dazed foes into `out/blink`; `--canary` reads the preview a metre off,
  takes the guard off as he comes apart, reads it green with no countdown on its cooldown and clears a near foe's
  daze at once.
- `death`: each skill's kills followed as they fall (`page/death.ts`). `--skills` names them by key, behaviour or
  name; by default every skill of the hero's that deals damage (Thunder Crescent needs `--gear twoHanded`, Twin Fangs
  `--gear dual`). The biome's commonest foe is stood dazed where each skill strikes (`STANDS`), and the skill is cast
  twice, each on a fresh set-up: first at foes a hair from death (1 Health: thrown hard), then at foes holding 80% of
  what the first cast's killing hit dealt them (thrown softly). Every body is followed as drawn until it has
  dissolved: how hard it was thrown, how far it flew and how high, when it lay still (or began to dissolve: a frozen
  body shatters as it lands), and how far one struck off its middle turned its blow's way over its first 0.2 s (its
  shoulders' heading). These are problems:
  - a drawn part more than 4 cm under the floor (a ball's depth into its own level or a higher one, `depthInFloor`)
    or 6 cm into a prop;
  - the pose more than 10 cm off its points, a bone stretched over 8%, NaN, or a body past the wall;
  - a body lying with its hips over 0.6 of their standing height above what's under it;
  - a body going back at the hero, or against its throw for a skill that strikes from elsewhere (Hailfletch's
    shower, Starfall's crystals); a body going against a sweep's swing;
  - a body struck off its middle turning more than 5° against its blow;
  - a storm's kill not going round it (its path at least twice its way, its hips up a metre);
  - the bodies killed with little to spare thrown as hard;
  - a shader compiled meanwhile.

  `--trace` lists every hard-thrown body frame by frame: each point's clearance as drawn, its pose's error, its
  point's own clearance, a prop touched, and its fastest point (what keeps a body from lying still). `--pictures`
  (on by default) pictures the bodies as the player sees them, and close from the hero's left and from behind, at
  0.15 s, at 0.5 s and lying still, into `out/death`. `--canary` puts a body a metre under the floor for a frame,
  throws one back at the hero, and turns the first struck off its middle the other way.
- `crowd`: a crowd of foes killed at once (`page/crowd.ts`), and what the frame costs as their bodies fall: the low-end
  device's measure. `--count` sets the crowd (38 by default, the most a wave keeps alive); it's killed by a blow each
  from the hero, or by `--skill` cast at it. Each round sets the crowd up afresh, times 60 frames with it standing,
  kills it, and times every frame until its bodies are gone, with the game drawn and waited out on the GPU (`finish`:
  what the GPU draws runs behind the page, and the page's time alone left out what the bodies' smoke and embers cost
  it), every time taken by the browser's own clock: the frame, its draw calls, the particles alive, the deaths
  (`Enemy.die`), the bodies (`Corpse.update`) and, of those, the ragdolls' steps and poses (`timeCalls`' laps).
  There's a round for each CPU slowdown (`--throttles`, by default 1,4,6: as it is, then DevTools' mid-range and
  low-end phones; `lab.throttle`) at each frame rate (`--rates`, 60,30: a device already slow steps each body twice
  as far a frame). Two things are problems, each judged against the
  frame with the crowd standing so it holds on any machine:
  - the frame as the crowd fell more than 15% slower (its 90th percentile);
  - the bodies' part over 20% of the standing frame.

  `--canary` runs the first round again with each body made 0.1 ms slower a frame, which must show. The machine's load
  drifts, so compare rounds within one run. Drawn mesh by mesh, a foe was about 77 draw calls (#222); in its kind's
  crowd (`src/entities/models/crowd.ts`) the 38 are about 20, and the frame standing went from 20 ms to 6 to 9 on a
  desktop.
- `draws`: one frame's draw calls (`page/draws.ts`), the crowd `crowd` times standing before the hero (`--count`, 38
  by default; 0 for none) in the biome (`--biome`; the crypt's top view is 368k triangles, 13% of them outside the
  view) and view the set-up asks for, each of the renderer's draw calls recorded with
  its pass (the scene's, its shadow map's, the post and overlays after it), its geometry and its material. Its lists
  (`--rows` each, 16 by default): the geometries drawn most often (one drawn many times a frame is one an instanced
  mesh would draw once), the geometries that drew the most triangles (the GPU's vertices: 38 mossbacks are about half
  of a forest frame's 2.5 million), the triangles drawn outside the view of the pass that drew them (an instanced
  mesh's instances, each by its own sphere, beyond the scene's camera or the shadow map's box: three culls an
  instanced mesh only whole, and half the forest's top view was such until `world/culling.ts`), the draws that drew
  nothing, alike ones together, saying why (an instanced mesh of no instances, a range of nothing: the renderer's work
  for a draw each on the CPU, though an instanced mesh of none never reaches the GPU, so the perf overlay's count,
  which counts GL draws, leaves them out; the rubble's empty pools were 46 a frame), and the scene's draws by their
  material's look (draws of one look, a merge of what doesn't move would make one). Its head line says the draws in
  each pass and how many drew nothing, the triangles and how many lay outside the view, the scene's objects whose
  matrices are made again each frame, and how many of them are off the camera's layer (a crowd's bodies' own meshes).
  Through the eyes (`--view first --class warrior`), the arms' own camera's draws are a pass of their own
  (renderer.ts `drawArms`), and what it drew is listed, the hero's and what isn't his. Anything that is neither under the
  hero's model nor his weapons' trail (`fx/swingTrail.ts` `swingTrailsOf`) is a problem, drawn over the frame at the
  arms' narrower view. The crowds' bodies' own meshes shared the arms'
  layer, and 38 mossbacks were 656 draws of it a frame (`core/layers.ts` now). `--canary` stands seven boxes of one
  geometry before the hero, which must come out as seven draws of it, seven instanced boxes, four far behind the
  camera, which must come out as four outside the view, and an instanced mesh of none, which must come out as a draw
  of nothing. Through the eyes it also stands a box on the arms' layer before them, which must come out as drawn by
  their camera, not the hero's.
- `perf <skills>`: skills cast in turn as the player casts them (`page/perf.ts`; `maelstrom,glacialNova`), the
  biome's foes coming at the hero (`--foes`, 10), every frame timed as the game's performance report times it
  (`ui/perfHud.ts`, on the browser's clock: `perfClock`) and summed by phase: standing (60 frames), then from each
  press (`--apart` s, 1) to the next, the last to `--after` s (4). Each frame is timed whole by the browser's clock,
  drawn and waited out on the GPU (`gl.finish`), then a task yielded (the GPU's timer queries come back only then);
  each phase says the frame, the page's work (the update by stage, the render), the GPU whole and by pass (where the
  browser times it, `EXT_disjoint_timer_query_webgl2`), the draws (the GL draws, as the overlay counts them) and
  triangles, and the particles' fill (`page/particleFill.ts`: each live particle's disc as its shader sizes it, in
  the scene's pixels, every layer: the fill a phone's GPU pays, which a desktop's GPU times don't show; Glacial
  Nova's was 15 times the scene's pixels on #243's phone while the particles were sized by the canvas, 1.4 times
  since); `--frames` lists every frame. `--biome` (forest), `--view` (top), `--facing`, `--at`, `--gear`. Run it on
  a phone's screen, boot and CPU: `--screen 832x384@3.75 --boot low@518400 --throttle 4` (#243's phone: booted as Auto
  settled there, the hero built at Low's detail and the warm-ups run at it), or `--quality low@518400` on the lab's
  own boot (the level and the most pixels Auto lets the scene render, put to use before the set-up, the hero built
  again at its detail, and at the page's after). Read the GPU at `--throttle 1` alone: a slowed CPU feeds the GPU slowly, and a pass's time runs from its
  start to its end, its waits for the page's commands with it; on a desktop the scene pass's GPU time often matches
  the render's CPU time, as the GPU waits on it, so a triangle cut shows smaller there than on a phone whose GPU sets
  the pace. A cast pressed and never made, a shader compiled while it was timed, and frames all read 0 ms are
  problems. `--canary` runs a round with the hero's update made 2 ms slower (it must read at least 0.8 of that) and
  the scene drawn twice (the scene pass's GPU time must read at least 1.3 times more), and the particles twice as
  wide (their fill must read at least 2.5 times more). The machine's load drifts: compare an A/B run `--fresh`, both
  sides then, not one side from the cache and the other now.
- `compiles`: whether the boot's warm-up compiled what a fight draws (`page/compiles.ts`). In each biome (`--biomes`,
  both) the hero stands in the view (`--view`, top) and a prop of every kind the biome has is worn down (its gauge
  over it, chips knocked off) and broken in turn, its rubble, debris and smoke drawn as they fly and settle; then the
  run's first wave is set off and fought as the game plays it, the hero (kept whole) casting each skill on his bar
  in turn at the nearest foe, until it's cleared or 40 s are up, its foes killed as a fight kills them (no other
  check lets a foe die of a fight). Every program compiled meanwhile is a problem, said as the game's perf report
  says it and with the draw that first used it, its object, its material and its pass (the game can't name a
  shadow's: three keeps its shadow materials). Run it as a phone boots, `--boot low@518400`: a Low boot's warm-ups
  draw other shadows (small parts cast none there). It found #243's mid-fight compile, the forest's wood rubble's
  shadow (`steadyShadowPrograms` in `src/core/shaders.ts`). `--canary` draws a material nothing else does before the
  hero, which must come out as compiled.
- `weapons`: each of the hero's weapons alone (`page/weapons.ts`; `--weapons Sword,Maul`, the class's bases by
  default): a copy of the one in his right hand, at its own frame (unturned in the fist), put in a plain, lit
  studio of its own and pictured face on (a blade's flat, an axe's bit to the side), edge on, from behind (a face
  wound inside out shows there as a hole), from three-quarters and its head close up, each framed on its own length
  and width, with its size and how many triangles it's drawn with. A weapon is judged here as it's made, before
  it's seen in a hand. Its pictures are read from the drawing buffer and taken as opaque: the game draws its frame
  with an alpha of 0 (`core/hdr.ts` adds it to the page as light), and copied onto a 2D canvas every picture came
  out black; and the lab draws nothing outside its pictures (`Lab.drawing`). A picture with next to nothing of the
  weapon in it is a problem, and `--canary` pictures an empty studio, which must read as nothing drawn. Compare a
  change to a model with `--ab`. The studio, its camera and its pictures are `page/studio.ts`, which `hands` shares.
- `hands`: the hero's right hand alone (`page/hands.ts`): a copy of it on a wrist of its own (`handLike` in
  `models/hands.ts`), in its glove or bare as the hero's is (`--glove`, `=false`: bare), laid flat, open, relaxed, in
  a fist and closed round a handle of a sword's grip (`--poses`), from the back, the palm, the thumb's side, the
  little finger's, the fingertips and three-quarters (`--views`), and close up when asked for: `cuffs`, the glove's
  cuffs over the fingers, and `web`, the thumb's web (where a bent thumb once pressed the glove into the skin). Said
  beside it: its length, breadth and thickness against a man's (anatomy's tables: 10.9% of his height, 46% of the
  length, 38% of the breadth) and each finger's length against the middle's, the triangles and meshes it's drawn
  with, how long a side takes to sculpt on the page, and whether both sides were sculpted by workers as the game
  loaded (one sculpted on the page is a problem: it held the boot up). `--look` draws it in a look (wire, faces,
  parts, bones), and `--canary` pictures an empty studio, which must read as nothing drawn, and builds the hand 10%
  larger, which must measure so. On `--ab` against a game whose hands were pieces, the old hand is built again from
  the materials its pieces were made in (`userData.own`).
- `held`: every held skill of the hero's class (`SkillDef.aimed`: the ranger's Quarry Mark and Strawman, the mage's
  Starfall and Veilstep; `page/held.ts`, `--class`) held as the player holds it, over a training dummy the way the
  camera looks: ready, its preview shown in its own look with no countdown, and let go it casts; then held through
  its cooldown and short of energy (`page/heldCooldown.ts`, as `blink`'s), red and counting 3, 2, 1 until a release
  would cast. Quarry Mark's red outline (`ui/overlay/outline.ts`) is checked in the top-down view, over the shoulder
  and through the eyes: round the foe the cast would mark, the pixels it lit (red risen over the same frame drawn
  without it) near the foe on the screen and none away from it; and in the top-down view over the biome's commonest
  foe too, standing dazed (a creature, drawn in its kind's crowd: its own meshes are on a layer of their own, which
  the outline must still draw). And over each biome's boss with its summons about it (one between it and the hero)
  and two of the biome's commonest foes beside it, each a hair off its circle (`bossWithSmall`), dazed, in each view (`page/heldBoss.ts`, the screen read by `page/onScreen.ts`): the key held and the aim swept a frame each across a grid over each foe's box on the screen
  (the crosshair turned onto each point in the close views), the outline must be round the foe drawn there at every
  point, met by the eye's ray on its meshes as they're drawn, skinned and rigid, a breakable prop in front leaving
  the point out (a miss says where the game's aim was against the point drawn); let go over the boss where it lies
  deepest in another foe's circle, with the aim moving on onto a small foe as the cast goes, and again while a shot
  is drawn (the cast waiting for it), the boss must take the mark (`main`'s aim, met on the rigid meshes alone,
  outlined the thornheart at 53 of 119 points through the eyes and marked a small foe in every view; and the mark,
  given to the foe nearest the cast's point on the floor, went to a small foe pressed against the boss, which the
  outline had never been round). The boss marked, its reticle (`page/markSeen.ts`) must stand over its top as drawn
  and be seen whole from the camera, its middle and its ring's points round it, none of them met by the eye's ray on
  a body before it (off the screen, a close view's near a tall boss, they're said but aren't problems); `main`'s,
  placed by its height, stood inside a boss's crown. With `--pictures`, each round pictures the mark over the dazed
  boss, its stars with it.
  Starfall is cast ten times over the dummy with more
  standing round it inside its ring as drawn and outside it (`page/heldArea.ts`): every one inside must be struck on
  every cast (each one's casts struck by its distance). Each skill is then held across the dais's step from off it
  and let go: every mark it lays on the floor (`fx/floorPatch.ts`) is read triangle by triangle against the floor
  under it, and must lie on more than one level with no point under the floor or standing off it. Then the shaders
  compiled meanwhile, which must be none (the rounds they came in are said). A preview missing, in the wrong look or
  off its countdown, a release that cast when it mustn't or didn't when it must, an outline off its foe, a foe inside
  Starfall's ring missed, a mark off the floor and a late compile are problems. `--pictures` (on by default) pictures
  each preview ready, on its cooldown and across the step into `out/held`; `--canary` reads each preview ready with
  no countdown on its cooldown, draws Quarry Mark's outline round the hero (the programs it compiles aren't counted:
  the game never outlines a hero), moves its outline over the forest's boss onto a thornling and the boss's mark onto
  it, puts the mark's reticle at the boss's middle (which must be found hidden), reads Starfall's ring as drawn round all its crystals may strike, lays the marks
  across the step point by point on the floor under them, as they were, and compiles a shader mid-game.
- `draw`: every drawn shot of the hero's class drawn to full and held there as the player holds it (`page/draw.ts`,
  `--class ranger`), in the top-down view, over the shoulder and through the eyes (`--views`): the key held over an
  aim ahead, 120 frames at full draw, and let go. Every frame its motes on the arrowhead (`fx/glintMotes.ts`, on the
  model's `arrowHead`) are read, with nothing drawn, drawn short of full and held at full. Every 4 frames of the hold
  (28 moments: the motes move, and judged at four, their worst went unseen) the glint is judged as the player sees it
  (`page/addedLight.ts`: the frame drawn with it and without it round the arrowhead, only that box read back, the
  pixels it lit by a tenth of white and its glare, those it lit by 0.4, in patches, `page/patches.ts`), the least it
  was seen and the most it glared. A glint before the draw is full (it's the sign that it is), on fewer than 90% of
  the frames held at full or gone for more than 20 of them, one with nothing drawn, a glint lighting less than 0.4 in
  10,000 of the frame's pixels in any view (as glow particles it lit none through the eyes), a patch of glare over
  0.55 in 10,000 (a star of light on the arrowhead glared in one of 0.64 to 3.6, and was too bright, and motes bright
  enough to bloom merged into blobs of 0.9 to 1.6; the motes' specks are 0.41 at most) and a shader compiled meanwhile
  are problems. In the close views the crosshair is read every frame too (`page/crosshair.ts`: its lines' thickness as
  the page's styles draw them, and its animations): bold held at full draw on 90% of the frames, on none before it or
  with nothing drawn, and one beat into it, run once and swelling about its middle, which moves no more than half a
  css px from where it was at the beat's height and once bold (centred by `transform`, it swelled about where its box
  was before that and moved 10 css px up and left; the page's motion is let run meanwhile, `lab.reduceMotion`); with
  motion reduced it comes to bold with no beat. `--pictures` (on by default) pictures each shot held at full at its
  most glaring moment, the screen whole and its arrowhead close, and the crosshair as it's drawn, at its beat's height
  (held there: the beat runs on the page's clock) and bold, into `out/draw`; `--canary` shows the glint and the
  crosshair's bold from half the draw, takes them away once the draw is full, swells the crosshair about its corner,
  and leaves the motion on for the reduced check.
- `shots`: the hero's basic attack loosed at a boss with its foes packed round it (`page/shots.ts`, `--class
  ranger`): each biome's boss with its summons and two of its commonest foes beside it (`held`'s `bossWithSmall`),
  their life raised so none dies, in each view (`--views`). `--shots` points (12 a view) are taken from `held`'s grid
  over the foes on the screen, half over the boss, none at their feet (an arrow there goes into the floor first);
  before each shot every foe is put back where it stood (the shots knock them off their places), the point is taken
  again at its spot on the screen (the foes sway), the crosshair is turned onto it in the close views and the bow
  drawn to full over it and loosed. Its flight is followed frame by frame, each frame's step (by the arrow's point,
  half its length ahead) looked along for the first foe drawn on it before the frame runs, as the game meets them:
  against the bodies as last drawn (looked along after the frame, the foe it struck had flinched off its line). It
  must strike that foe and it alone, or none if its flight met none; and one aimed inside a foe on the screen as
  it's loosed (the foe drawn 6 pixels round the aim every way) must meet a foe, the one aimed at unless another is
  in the way. One aimed at an edge may go past it: a pixel off, or the body swayed a centimetre, the aim is past it.
  A basic attack that doesn't fly at the point aimed at (the mage's seeking bolt, level at the hand's height and
  struck within its circle) is said so, as a problem: there's nothing to judge. `main` failed 56 of 72 shots (the
  bosses' crowns and arms flown through, imps struck in the air beside them, shots at a boss's legs striking the
  imp whose circle they passed). `--canary` makes the first shot's foe invulnerable: struck, it takes nothing, and
  the shot must be found missed.
- `gear`: full sets of gear rolled for every class as its loot rolls them (`page/gear.ts`, `--sets` each, 400 by
  default), at each tier (`--tiers`, a rarity at an item level each: `magic@5,rare@15,epic@30,legendary@50`), and
  what a set gives on average: Health (his own and the gear's, and the gear's against the mage's), regeneration a
  second, the draught's heal and how much it multiplies his damage (as the game's damage stats add up on his
  skills). A class whose Health or regeneration from gear is out of the order of his own Health is a problem;
  `--canary` rolls the ranger's Health from gear as the mage's.
- `music`: each biome's music played through as the player hears it (`page/music.ts`, `--biomes forest,crypt` in
  turn). Each round goes through the biome's lobby, a run's countdown, the first wave's fight and its win, the next
  wave's countdown and fight, the tab hidden and shown again mid-fight, and the bank back to the lobby. Every frame
  is judged by what the game sends to WebAudio (each buffer source it starts, `page/musicTap.ts`) and by what each
  track's output carries (an analyser on it), not by the music's own bookkeeping (`page/musicJudge.ts`). These are
  problems:
  - a track rising where another is wanted (`EXPECTED`, the owner's choice for each place: the lobby's track in the
    lobby and between waves, the battle track through each fight);
  - a level that moves faster than a 0.75 s fade;
  - a fresh track that doesn't start at its top, or a track coming back elsewhere than where it was left (the
    lobby's after a fight, the battle's in the next wave, either after a hidden tab);
  - a source looping off its track's loop, or past its samples' end;
  - a battle track not decoded within the run's countdown;
  - a track kept decoded while it's silent and wanted nowhere;
  - a track wanted at full that carries less than -45 dB (listened to for up to 4 s, as a piece may open near
    silence), or a silent one, or any in a hidden tab, that carries anything.

  `--canary` plays a round again with four faults planted: the biome's battle track played as another's, the
  lobby's fade in cut to a twentieth of a second, every fresh track started 5 s in, and every track coming back
  started from its top.
- `eval <expression>`: an expression evaluated in the page, with `lab` in scope (`eval "lab.player.nocked"`).
- `live <step>`: a page of the game kept between steps, each on the state the last one left, as a modelling
  tool's scene is kept between edits (`node/live.mjs`, `page/live.ts`; needs `lab:serve`). `live start` boots the
  hero (`--class`, the warrior by default) and sets him up (`--view`, `--gear`, `--weapon`, `--at`, `--facing`);
  then `live picture` pictures him from `--views` (through the eyes `eyes`, else `third`, by default) in any
  `--look` (a close-up from `--distance` m off what it's framed on: 1.7 from a joint, 4.3 from the body by
  default), with a reference laid over each picture and stretched to it (`--over <picture> --strength 0.5`) and
  a part of it kept (`--crop 0.5,0,1,0.6`, its edges as shares), each in its own file in `out/live/`; `live
  inspect [name]` lists the hero (or a joint, or any object by name: the warrior's weapons and shield are named)
  and what's under it (`--depth`), each with where it is in the world, how it's turned, what it's drawn with and
  where its posed vertices are on the screen; `live eval <expression>` evaluates on the page (`lab` in scope: a
  joint turned, a value set); `live frames <count>` runs frames with no input; `live log` lists the steps;
  `live stop` closes it. A picture takes under a second where a command boots and sets up for each look. The
  steps are kept (`out/live/steps.json`, `node/liveLog.mjs`): when the source changes, or the server starts again,
  the next step boots the page again and replays them first (every `eval` is kept, a read too: `live start`
  begins again). It runs in a browser of its own, as a command's page lost the input to a second page in the same
  one. It's for trying by hand: what's found there is measured by a command on a page of its own, as the live
  page is wherever its steps took it. `live picture --canary` hides the hero and pictures him in the `parts` look
  too, where no part of him may be found.
- `status`, `stop`: what the server serves and has booted; stop it.

**Looks** (`page/looks.ts`, `--look` on `sheet` and `live picture`, `CaptureOptions.look`): `lit` is the frame as
the player sees it; `wire` the hero's wireframe; `faces` which way his faces point (front blue, back red, shaded
by how square each faces the camera: a face wound inside out shows red; a hair card's back does too); `parts` each
of his meshes in a flat colour of its own, and a note of each in the picture, the most first, with its share of
it and its box (named by the nearest of it and its parents with a name, a joint's or its own, and its material);
`bones` his skeleton drawn over the lit frame. The first three draw outside the game's chain and read the
drawing buffer back as opaque (`page/pixels.ts`), with the world in its own materials but only its depth: what
the game draws in front of him (a leaf card cut out by its texture, a prop dissolved round him) still hides him.
(Drawn flat, the forest's leaf cards were whole squares, and one by a close-up's camera filled its frame.) A
part's cut-out (a hair card's) keeps its texture's alpha. A pixel is found as a part by its colour within 2 levels
a channel, looked up once (matched against every part's colour, a picture took 10 s).
- `check`: the checks of a change to how the heroes move, run side by side: the gait (its steps listed, no films), the
  stops, the ranges and the run's form for every hero, and the ranger's feet and carry (`--classes`, `--commands` for
  fewer), each in a session of its own (`--jobs n`, a core in three by default, at most 8), the longest first as they
  last took, each report in `out/check/<command>-<hero>.txt` and its pictures in a folder beside it. With `--ab`, the
  other commit is exported once before the sessions start, and its side read back from the cache once it has run
  (below). The gait runs a scenario a job, each on a page booted for it, and each hero's scenarios are put back
  together (`out/check/gait-<hero>.txt`, each under its name): one after another on one page, each was set up from
  where the last had left the hero and the clock, and main's own gallops were 18, 23 and 17 a hero with films and 13,
  14 and 16 without. Each gait scenario runs from three starts (`--starts n`, at most 5): its first move 0, 7 and 13
  frames longer (`gait --offset`), so every later turn and stop comes at another point of a stride. Run once from one
  start, a frame's change anywhere sent every later stride elsewhere, and a change's gallops came out 2 or 3 either
  way over a check's gait scenarios by chance; stood a few frames first instead, nothing changed (the set-off is the
  same from any moment of the idle). What a command counts (`countsOf`: the gait's gallops, hops and short steps) is
  added up over a hero's jobs, each side's, in its line of the log and at the head of its report with each scenario's
  (`hops 2 (048deb5 9)`: this tree's, then the other's), so a check's verdict needs no script of its own to read it.
  It runs in the command line's own process, not the server's. One command at a time, both sides every time, the
  mage's cape stepped throughout and each gait scenario run again for its film, the same check took 31 to 35 minutes a
  round; the harness is run hundreds of times, so keep every check that runs often to minutes: profile it
  (`--profile`), cut what its measures don't read, and run side by side what doesn't depend on each other.

Options every command run on a page takes:

- a probe or command that doesn't compile says where and why (`.tmp/x.ts:3:10 doesn't compile: Unterminated
  string`), not the browser's "Failed to fetch dynamically imported module";
- the set-up (sheet, carry, probe): `--view top|third|first`, `--at x,z`, `--facing rad`, `--nocked[=false]`,
  `--gear oneHanded|shield|twoHanded|dual` (the hero holding his weapons that way, from his class's own bases: as the
  profile rolled them by default), `--weapon` the base held so (with `dual` one in each hand);
- `gait --films=false`, `form --pictures=false`: the numbers alone, each run once (a film or a picture runs it
  again); `gait --offset n`: each scenario's first move n frames longer, its later turns and stops at other
  points of a stride (a check's starts);
- `--class ranger|warrior|mage`: the hero (the last one used by default);
- `--screen WxH[@ratio]`: the page put on a screen of that size in css px and pixel ratio once it has booted (`1280x720@3`:
  a 4K screen at 300%), as a window moved onto another monitor is: the game fits its canvas to it on the next frame
  (1920x1080 at 1 by default);
- `--screens WxH[@ratio],WxH[@ratio]`: this tree on two screens, one after the other, compared as `--ab` compares two
  commits: the lines that differ, and the pictures pixel by pixel (both 3840x2160 for a 4K screen at 100% and 300%);
- `--ab[=ref]`: also on another commit (`origin/main` by default), its results beside this tree's, ending with the
  verdict: the lines that differ under the section each is in, and the pictures that differ by more than the GPU's own
  noise, with where (the region of each, and a picture of each in `out/ab/<command>/`: this tree's dimmed, its
  differing pixels magenta). A commit compared with itself (`--ab=HEAD`) agrees, so the other commit's side is kept
  once it has run (`out/ab-cache`, by its commit, the hero, the command and its options, and a hash of the lab's code
  it ran: its page modules, its Node side and a probe's own files) and read back after: run again each time, main's
  side was half of every A/B. `--fresh` runs it again; a side whose page raised an error isn't kept;
- `--profile`: where the command's time went in the page, its busiest functions by their own time and in total,
  each at its line in the source; `--profile=<function>` (its name, or its name and file: `"--profile=animate
  ranger.ts"`) lists only the time in that function, by its share of it (the busiest 14 of a whole profile left the
  ranger's animation, 2.7 ms a frame, unexplained);
- `--randoms`: what drew the page's random numbers as the command ran (`node/randoms.mjs`): the draws in all and the
  busiest callers, each at its line, and with `--ab` the callers whose draws differ between the sides, the smallest
  differences first. An A/B's pictures of anything random (particles, sparks, motes) differ after the first draw one
  side made and the other didn't: drawn in crowds, the foes' skeletons never made the bone textures three makes as a
  skinned mesh is first drawn, four numbers each for their ids, and every mote after them lay elsewhere;
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
- `lab.setup(fixture)`: the run set up afresh (`at`, `facing`, `view`, `nocked`, `gear`, `fresh`), checked, and its report.
  A probe may set up many cases one after another, but each follows on from the ones before it: the hero is the same
  one, and the game's clock, which his idle runs on, only goes forward (to the next whole minute at each set-up, so
  the idle is at the same moment whatever ran before; the hero's own state still carries over). A scan is the same
  every time it runs, but one of its cases run alone may come out otherwise, so trace a case by running the cases
  before it first (an option of the probe's own: `--trace=<case>`, say), or run each on a page of its own as a check
  runs the gait's;
- `lab.step(count, input?, measure?)`: frames run with each frame's input (`keys`, `m0` / `m2` for the mouse buttons,
  `look` for mouse look, `aim` for the point the mouse is over, `sight` for a point the close views' crosshair is
  turned onto: a mouse-look move a frame, over it in one or two) and measured after each, a row a frame;
- `lab.until(done, limit, what, input?)`: frames until `done`, throwing `lab: <what>` if it never is;
- `lab.spawnFoe(type, at, options)`: a foe for a measure that needs one (a mark, a lure; `options` as the game's
  `EnemyOpts`: a hero foe with its name, say), which the set-up keeps while it clears every other until the next
  set-up; it rises first as a spawned foe does (`Enemy.spawning`), and a training dummy (`dummy`) stands still;
- `lab.letWavesCome()`: the run's waves let come until the next set-up, the hero still kept whole; a measure sets one
  off itself (`G.run.wave`, its `timer` to 0) and reads its foes as they rise;
- `lab.capture(views)`: pictures of this moment as PNGs (`lab.drawing = true` draws every frame instead), and
  `lab.picture(label, views, notes)` one moment of a report's `moments`: the lab writes them as a sheet
  (`out/probes/<probe>/sheet.png`) and compares them in an A/B, as the sheet's (to see the frames a measure flagged,
  run the measure's input to them and picture each);
- `await lab.screen(label, notes, around?)`: this moment as the player sees it, the game drawn by its own camera with the
  page's UI over it (the HUD, a menu, a tooltip), pictured by the browser, whole, clipped round the element a CSS
  selector names (`'#hotbar'`) or to an area of the page (`screenArea(points)`: round points of the world as the
  camera shows them), as a moment of the report's `moments` (`picture`'s views show the game's canvas alone); taken
  through the DevTools protocol at the screen's own pixels (Playwright's screenshot put the page back on the screen
  Playwright had given it, and on a `--screen` every picture after the first showed 1920x1080);
- `timeCalls(owner, method)` (`page/timing.ts`): every call of a method timed by the browser's own clock (the page's
  `performance.now` is the lab's, which stands still within a frame), for a cost: its calls, total, median and 90th
  percentile. The timer ticks in 0.1 ms, so take a frame's mean over many, and compare sides within one A/B (the
  machine's load drifts between commands). Its `lap()` says what the calls took since the last lap: a frame's, read
  after each frame (`crowd`);
- `await lab.throttle(rate)`: the page's CPU slowed `rate` times as the browser emulates a slower device's (DevTools'
  presets: 4 a mid-range phone, 6 a low-end one), sent through the DevTools protocol: times read by the browser's
  own clock take that much longer, while the lab's frames stay as long as ever. Set it up at full speed and slow
  only what's measured (`crowd`);
- `lab.aim` and `lab.pointAt(point)`: where the mouse is;
- `await lab.touchDown(at, finger)`, `touchMove(at, finger)`, `touchUp(finger)`: a finger on the page (css px) as a
  touch screen gives it, sent through the DevTools protocol, so the page's own pointer events follow with their
  pointer ids and its touch controls take it as a player's (no frame runs; each returns once the page has handled
  it). `finger` (0 by default) tells fingers down at once apart: a thumb on the move stick and the other on a skill
  (`tap`). Each touch names only the finger it changes, by its id, as Puppeteer sends them: sent as the protocol's
  docs have it (every finger down in each touch, the one lifted left out), a finger left out was never lifted. The
  game's first touch puts it in touch mode, as a player's does, and its controls show from the next frame;
- `await lab.click(at)` and `lab.press(code)`: a click of the mouse's left button on the page (css px) and a key
  (`KeyW`, `Space`) as a mouse and a keyboard give them, sent through the DevTools protocol, so the browser handles
  them as a player's, the focus with them (a script's `click()` and events moved none and showed no focus ring);
- `await lab.reduceMotion(reduced)`: the page's `prefers-reduced-motion` as the browser emulates it. Every page opens
  with it reduced (the page's decorative animation left out); a measure of such an animation (the crosshair's beat,
  `draw`) lets it run and puts it back as it ends. CSS's animations run on the page's clock, not the lab's: read them
  with `getAnimations()`, and hold one at a moment to picture it;
- in `page/geometry.ts`, the body's meshes skinned into the world as drawn (`BakedBody`), what a line crosses among
  them (`crossingsAlong`), and the distance between segments (`segmentDistance`).

A measure is only as good as what it can catch:

- **Check the state happened.** A measure of a state that never came reads as clean: a probe that scripted the game
  before its run began reported no clips at full draw, because it never drew. Throw `lab: ...` or report a problem
  when the walk didn't walk or the draw didn't draw.
- **Carry a canary.** Plant the fault the measure is for (the bow moved into the hips for a frame, a hand moved
  10 cm) and report a problem when it isn't caught. Run it when the measure changes.
- **Measure, don't choose.** A pose is decided as a person would hold it and looked at in the game's views first
  (`sheet`); a measure checks it (`src/entities/models/AGENTS.md`).

Every measure is kept: from its first use it is a command of its own in `page/` (a module, an entry in
`page/commands.ts`, one in `node/commands.mjs` and its options in `node/options.mjs`), as the carry's and the touch
stick's are, or a part of one that already measures the same thing, never a probe left in `.tmp`.

## How it works

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

A boot that fails fails at once, with why (`side.mjs` `openPageIn`): a boot that threw says so on the game's loading
screen, and a module Vite couldn't compile answers its request with an error, which the lab asks for again to say
Vite's message (where it went wrong in which file). Waited for the loading screen to go alone, either was waited out
to the timeout, three minutes: a module that wouldn't compile never runs, so its loading screen never says it failed.

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
  set-ups, pictures), `commands.ts` (what the session calls: each command's module loaded as it runs, as an A/B copies
  these modules into the other commit's tree, and one measuring game code that commit hasn't got stopped every command
  loading there), `sheet.ts`, `carry.ts`, `comfort.ts`, `geometry.ts`,
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
  every boot. Frames run back to back, with nothing landing between them (an A/B's side on a commit from before the
  heroes' capes were taken off steps its capes in the frame, on the main thread, `stepCapesHere`: in the game they
  stepped in a worker, whose results landed a frame or two late, and a commit's pictures against itself differed).
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
  loads) and at each set-up, and as a hero's profile is found missing, just before a new one rolls its gear; and at
  each lab frame, from the last seed and the frames since (`__labFrame`), so a draw one side made and the other didn't
  moves only what's random after it in its own frame (it moved every particle from then on: a crowd's pictures differed
  by 17% of their pixels where its bodies were drawn the same); timers' callbacks draw from a stream of their own,
  since they fire by the browser's clock;
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
  emitter's bursts a frame early or late, one boot in three);
- the default profile rolled from wherever the boot had left the sequence: a commit that made one more three.js
  object as its modules loaded rolled the ranger another bow and 2 less Health than main, so every A/B of him
  compared two heroes (`ui --ab` differed in 11 of 12 pictures).

To find where two runs part, record each frame's state and each random draw's caller in a probe and compare boots
(two fresh boots, `--setup=false`, the probe setting up itself): the first frame or draw that differs names the cause.

## Testing the lab

- `npm run lab:test`: the Node side's unit tests (the command line, the verdicts, the server's checks, the source
  maps), in a second; the PR build runs them.
- Each measure's canary (`carry --canary`, the example's `--canary`): run it when the measure changes.
- `npm run lab -- carry --ab=HEAD` and `sheet --ab=HEAD`: a commit against itself must agree, line for line and pixel
  for pixel; anything else is a cause of runs that differ, to be found and removed as above.
