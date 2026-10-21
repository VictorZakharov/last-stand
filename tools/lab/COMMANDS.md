# `tools/lab`'s commands

Every command of the lab in full: what it measures and what it was measured against, its options, the looks a picture
takes and the options every command takes. [`AGENTS.md`](AGENTS.md) has the lab's rules, each command in a line
(Commands at a glance), how to write a measure, how the lab works and what keeps it repeatable.

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
  blinking between two spots as foes close on it; `rush`, played only by a hero with Bull Rush, `--class warrior`:
  the guest charging through three dazed foes once; `strike`, the same but for a Power Strike charged first and the
  charge cast over it 0.35 s from its blow), each one's input frame by frame from what its own screen shows. The guest
  practises in its lobby while it waits (stowed, as Space and a phone's Practice stow it), as a player does, and a
  game whose hero casts freely in the run the host starts is a problem (on main the guest's did, no costs or
  cooldowns through the whole run: `practice` measures the casts).
  What each game showed is judged against the other's in the same frame (`node/coopJudge.mjs`): each copy's delay (the
  one that lines its path up best with its own game's), how far off that path and how roughly it moves (its speed
  against its own, its largest move a frame), how each game's timeline plays its partner out (how far behind the
  freshest report, how often a stall held it, how far its clock strayed), the arrows that struck on the guest's screen
  and whether the host counted them, the blows at the guest against whether it stood in their reach on its own screen,
  when the guest went down and was raised on each screen, and each blink: when and how long it hid the guest's copy on
  the host's screen, how far from where it came out on its own screen the copy came out and how far it moved after,
  and the foes it dazed on the guest's screen against those dazed on the host's, and each foe the guest's charge met
  on its screen: whether the host's carried and threw it too, where it was let go, came down and ended on each
  against where the guest stopped there (one ending behind it or level with it is a problem), and its largest move a
  frame on the guest's screen and when (eased at once onto the host's late reports as its own carry ended, a copy
  slid back 1.2 m a frame; carried into a copy not yet met, one was shoved 73 cm off it), and the guest's Power Strike
  under its charge on each screen (each game's hooks on each hero's pose and `fire`: `Sample.acts`): the frame it
  landed and whether the charge ran then, the frames the charge was shown in its place, and whether it was still
  building as it landed (a copy, replayed, was taken as landed as the charge cast over it landed, and its build-up
  stopped short). Scenarios run on from each other, so a scenario alone can differ.
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
  (`Model.fists`: how far the handle passes from where the fist closes, how far the fingers are curled), and the frames
  each fist is in the frame (Steel Tempest's two-hander held low came round into the view's bottom once a turn, a
  flash each time, which no line said). Each strike's whip (its blow's point against its hilt) is held to what the
  arm and the weapon swung round the shoulder as one would give, a spin's to what carried round the body as one would
  (`page/strike.ts` `Pivot`: held out from the shoulder, a two-hander's spin read as slid across). A strike moves
  against the eyes, the camera, which carries the arms (in the world's space, Bull Rush's run carried the hilt along
  at the body's pace, and the cut swung as it ended read as slid across). One slowed to a fifth of its speed within
  60 ms is stopped dead, unless the floor stopped it: its weapon's lowest point (every corner of what's drawn) within
  6 cm of the floor by then, Thunder Crescent's driven into the ground; further under it, it has sunk in, a problem of
  its own. `--canary` judges each blow the floor stopped again with the floor read 30 cm under where it is, which must
  find it stopped dead in the air. A blow is looked for only over the frames the game swings a weapon in a strike
  (`Model.swung`, which the swing's trail follows: a war cry's, a drink's and a raised shield's weapons strike nothing,
  and were failed as led by their flats), and one a hand where a cast's tip passes from one hand's weapon to the
  other's (Twin Fangs' right blade, then its left: judged as one, the left's blow was never looked at). Problems: a
  two-hander let go of by the other hand, in the frame or out of it, its fist as drawn more than 15 cm off the lower
  grip (held, it reads about 7 cm; let go, 50 cm and more within four frames), but where the game lets that hand go
  (`LowerGrip.free`: drinking, the weapon on the shoulder, the hand coming back onto the grip), the frames, how many in
  the frame, and the worst with why it was let go (past the arm's reach, its joints past their ranges, the arm into
  the body: let go of below the frame, it was only listed, and the owner saw the two-hander "one handed", #198); a
  two-hander seen in one hand, its lower grip in the frame with the other hand out of it, for longer than
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
  space (the swings' keys are their own, `models/warriorEyes.ts`: `lab swing` keys a pose), held or let go and why,
  and its joints
  past their ranges, and the fists. `--canary` freezes the body, the trunk and the arms as they were at the press (and
  puts the hero under the camera again by his neck as held: placed by the neck as posed, Steel Tempest's frozen arms
  went round the eyes each turn), turns the other arm down out of the frame and lifts the weapon 15 cm up the view out
  of the fists: there must be no blow, a two-hander must be seen in one hand, and a fist must be off its handle (frozen
  alone, the arms swung with the trunk's turn and read as a blow); lifts it alone each frame of the cast played as it
  is, which must show a fist off its handle (the right's weapon, or the left's where only the left fist is seen: a
  dual wielder's Bull Rush holds the right blade under the frame, and lifted, it was never seen); and lifts the weapon
  30 cm up the view on its stillest frame in the frame alone, which must read as a jump there. A jump is a peak, at
  least as far as the frames either side of it (a dual wielder's elbow slowing to a stop in a cut, 23 cm, 15, then 6,
  read as a jump on the 15): a pose out and back again in a frame reads on the further of its two moves, which a
  canary planted on a frame takes either way. The elbows' jumps are read as the weapon's (each at least 3 m/s), seen
  where that arm is in or near the frame anywhere from its shoulder to its fist and listed where it isn't (read on
  the weapon alone, an arm flipped over round a hand held still passed; a two-hander's right elbow flipped out to the
  shoulder's height under the frame, the arm out of it from the shoulder to the fist, was never seen); the canary
  moves the right elbow 30 cm on its stillest frame alone, which must read there, seen or out of the frame as that
  arm was. The arm a swing keys (`Model.swingKeyed`, `page/keyed.ts`) is held to the arm drawn wherever the arm is
  all the swing's: its shoulder, elbow and grip within 4 cm (a wrist keyed at its range's end was clamped, and the
  grip drawn 7 cm off its keys through a cut's wind-up), the weapon's way within 5 degrees and its flat within 10,
  read by the grip's turn alone (the left hand's grip is mirrored: read through its matrix, the left blade's flat was
  180 degrees off its keys throughout its cut), its shoulder and elbow only as far as the arm is the swing's
  (`KeyedArm.armShare`: a backhand held by the hands, `ViewSwing.holds`, draws the right arm from its own shoulder,
  and judged by the arm its plane lays out from the left, every frame read 44 cm off). The arms' joints past their
  ranges fail a run where that arm is in or near the frame, and are listed everywhere (a two-hander's row of cuts
  holds the right arm under the frame from the shoulder to the fist throughout, and its forearm was failed for a turn
  no one sees); the arms in the body the view hides (`page/armsIn.ts`) are said, not failed: through the eyes the
  shoulders aren't where that body has them, and none of it is drawn (the two-hander's guard read its right forearm
  17.6 cm into the chest); their canary moves the right elbow into the chest, which must read 10 cm deep or more. A
  spin's blow (a skill with a `spin`: Steel Tempest) isn't asked to cross the aim, as it strikes all round; whether
  its passes may be seen is `cast`'s flashes' to say (held across the view, the one-hander's steel lit the crypt 3
  times a second at 2.4 turns a second). Every run
  of the cast, the canaries' as the first, starts at full energy, its cooldowns cleared (Steel Tempest drains energy
  while held: the runs after the first spun 11 frames less, and the jump canary's lift fell past their end).
- `swing <name>`: a swing through the eyes keyed from a pose (`page/swing.ts`, `src/entities/viewSwing.ts`;
  `--class warrior`, a swing by its name in `models/warriorEyes.ts` `SWINGS_NAMED`). A pose is decided as a person
  holds it, then keyed: `--grip x,y,z --way x,y,z` (camera space, a pose each three numbers, as many as given) says
  the key of the swing that holds the grip there and the weapon that way, and what of it an arm swung in the swing's
  plane can't hold (the grip or the way off the plane, the wrist bent past its range, the grip past the arm's reach);
  `--key way,reach,bend,drop,roll` places keys given; with neither, every key of the swing is placed as the game
  places it at its share: in the plane it has there (a cut in a row turned in from the one before's, `from`, over
  `turning`), a two-hander's held swing (`holds`: its hands turned about the left shoulder) with each hand's distance
  from its own shoulder, and its first key against where the one before leaves the arm, which must be within 1 cm and
  1 degree (placed in its own plane, a backhand's first key read its lower grip 0.98 m from the left shoulder where
  the game drew it at the forehand's end, 0.39). Each placed key says the grip (in the frame or not), the weapon's
  way and its share in the frame (as `eyes` counts a cut's end), the elbow, the wrist, and a two-hander's lower grip
  with its distance from the other shoulder against an arm's reach (keyed by trying numbers in a cast, a two-handed
  forehand took an hour and its wind-up still put the lower grip 12 cm past the left arm's reach). `--turn rad` turns
  it all with the trunk (to the left), as a cut turns it, a pose taken as the eyes see it so turned; `--trunk
  rest|row|back` turns each key as far as the trunk turns a cut of the
  hero's weapons at its share (`cutTurnAt`): a forehand from rest, one in a row, or a backhand, the other way (by its
  keys alone, a two-handed cut's end read 64% in the frame, and 0% as the eyes saw it, turned 40 degrees left);
  `foreOut|backOut`, the way back to the guard after one, the turn its end left unwound. Placing every key, it also
  steps the swing in 1% steps as the game lays it out (`page/swingPath.ts`) and fails an elbow turned over round the
  line to its grip between two (3 cm and 3 times the grip's move: as Power Strike's plane turned through upright from
  the guard's, the elbow's drop went over to the plane's other side, 20 cm in a step the grip moved 3, each key as
  placed alone looking right) and a two-hander's lower grip past the other arm's reach as far as the game lets go of
  it (the backhand's way back, within reach at both its keys, went 13 cm past between them); its canary turns one
  step's elbow over, which must be read. A guard with a head has its swings named too (`twoPowerHead`,
  `twoOutBackHead`...). `swing all` steps every swing of every weapon each way the hero holds them (`--gear`'s and
  `--weapon`'s alone, if given), each turned as the game turns it (`page/swing.ts` `SWINGS_HELD`: the basic
  attack's cuts by the trunk at their shares, its ways back unwinding it, the skills' unturned), a set-up each on one
  page: its plane, where it starts against the swing before's end and its path, its canaries on the cut from rest
  (`check` runs it; a page booted for each weapon, its ten jobs took 547 s for 3 s of stepping). On a game that
  places every key in its swing's own plane, nothing is stepped (its every step read as its first key, and a cut in
  a row 97 cm from the last one's end).
  `--canary`: the swing's blow keyed back from where its own key places it must come back as that key, and a grip
  moved 10 cm off the plane must read 10 cm off. `--tune warriorSwings.<swing>=...` tries keys and planes unwritten.
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
- `probe <module>`: a measure of your own (Writing a measure in `AGENTS.md`). Options the lab doesn't know are passed to it (`--frames=30`), and
  `--setup=false` skips the set-up.
- `ui`: the game's UI as the player sees it, in its states (`--states lobby,tooltip,glow,help,saves,readying,
  readyingClass,clicked,views,logLobby,skillTipsTouch,run,scores,perf,decision,pause,summary,skillTips,log,logTouch`, every one by default:
  the lobby, an item's tooltip, the stash given 60 items (more than its view shows, on most screens) and a weapon
  among them hovered by the mouse, those that fit its slot lit (`page/uiGlow.ts`: a short screen's rail turned to the
  gear first; pictured round the stash, its tooltip put away, at 400, 1000 and 1600 ms into the
  glow's loops, each held there, so `--ab` pictures the same moment on both sides; every loop a lit item runs must
  animate only what the compositor moves, a layer's transform or opacity, and each that animates anything else, read
  off its `@keyframes`, is a problem: its shadow, gradient and background animated, a full stash lit dropped the lobby
  from 145 frames a second to 44, #267; and each loop on a stash item not hovered is a problem: 30 lit items' 90
  loops, composited, still halved the frames while the mouse moved between them; and each part of the hovered item's
  glow shown with a mask within another mask round it is a problem: a pass of the compositor's own within another,
  drawn again every frame (the arc kept to the border's ring by one, within the stash's fading mask, raised the GPU's
  time a frame from 5.4 ms to 6.3 moving between items (the owner's rose from 5 to 14 as the frames fell to 30), where
  either mask alone raised it by 0.1 at the most, `npm run stalls -- --scenario sweep --perf`); and the stash's fade, the panel's colour laid over a
  row its scroll cuts (its tab page's `::after`, shown by the stash's scroll), read at the stash's top and its end, the
  mouse off the stash meanwhile: not shown at the top with a row cut is a problem, and so is shown at the end or over a
  stash that fits (a dark band over the bare panel); `--canary` loops a shadow on the hovered item, turns a lit one's
  glow not hovered, masks the hovered item's steady glow within a mask on the stash and holds the fade shown, each of
  which must be found),
  How to play, the save slots, the fight's loading bar over the lobby as a press waiting for the fight's programs
  shows it (`ui/readying.ts`, 40% along: within the window, its label on one line, its fill as far as painted;
  `--canary` gives the label a letter's width, whose wrap must be found), another class picked with the mouse while
  the heroes' programs are kept cold (`game/warm.ts` `chill`), its bar saying it readies that hero and every label the
  bar can show (`readyingLabels`) on one line on this screen (`--canary` puts back the page's own "Readying the fight",
  which a class pick said, and it must be found; a tree from before it can't keep them cold, and says so), the hero's
  class button clicked with the mouse and a key pressed after it as the browser gets them (where the focus went and whether
  the browser shows its ring: a problem when the button kept it), the lobby's camera switched with V through every
  view and back, each glide played and drawn (every frame, each label over the dummies against where its anchor shows
  by the camera as the frame draws it: off by more than a pixel is a problem; placed with the camera's turn of the
  frame before, they were up to 1442 px off as a glide set off), the battle log over the lobby with a training dummy
  struck (clear of its panels: it first lay over the hero panel, as the performance stats did), each skill's tooltip
  in the lobby opened by a finger's tap (the class card's and the skill book's, the book opened by taps: a short
  screen's rail turned to the skills, the book's toggle; each tooltip pinned and within the window, the tallest
  pictured; the mouse then puts the page back in mouse mode), the run's HUD with a hurt foe's
  bar and damage numbers over it, the scores, the performance overlay, the choice after a wave, the pause menu, the
  run's summary, each skill's tooltip on the hotbar opened by the mouse moved over its slot (within the window, the
  tallest pictured; `--canary` makes each as tall as the window, which must be found past it: issue #256's damage
  lines made them taller), the battle log with each skill on a key struck at the foe twice and its blows on the hero
  listed, then paused: a row for every line, within the window, over none of the HUD's named elements but the layers as
  wide as the screen, no row wider than the panel, its head on one line; and the same in touch mode, put in it by a finger's tap, where its lines must
  let a touch through: on a phone the panel first lay over the scores button under the pause button), each pictured
  whole as a PNG of its own at the screen's pixels (`out/ui/<state>.png`), with every
  named element's box and every label's over the world as shares of the window. In every state, the cursor over each
  element the mouse can be over (shown, with an area, taking the pointer) must be the game's own (its art, from
  `index.html`) or a text field's caret: the system's (`auto`, `pointer`, a UA stylesheet's `default`) is a problem,
  listed by element; `--canary` gives the page's body the system's, which must be found. In every state too, the
  digits shown must sit on their line (`page/digits.ts`): each look of the page's text showing digits (its font,
  weight, style and numeric settings) has the ten set out alone in it at 64 px (as large as fits across a narrower
  window: past its edge the picture was cut short, "no ink of the 1"), white on black over the page, pictured
  and each one's ink read, and each font the world's labels are painted in (`overlay/paint.ts` `fontOf`) has each
  digit's ink measured by the canvas; their tops or their bottoms more than 8% of their size apart is a problem,
  naming the highest and the lowest and where the look shows, with its picture (`out/ui/digits-<n>.png`). Old-style
  digits are 11% apart; the display face's 3 and 5 dip 6% by design. `--canary` gives the page's body old-style
  digits and takes the labels' lining twin away: both must be found. (The owner, of the skill tooltips: "digits are
  all jumping up and down in the same line".) With `--screens`, whether
  the UI is
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
- `fire`: each biome's fire as the player meets it (`page/fire.ts`, `page/fireMeasure.ts`, tested in
  `test/fireMeasure.test.mjs`; `--biomes crypt,forest`). Found by its light, the warm one of the biome's six, the hero
  stood 4.5 m before it towards the middle. For `--seconds` (2), 30 times a second, it's drawn from beside it with its
  own light, without (what draws unlit within 1.5 m of its light, and the glow particles) and without its smoke too:
  the differences are its light alone (graded: the tone curve carries the logs' grain into it) and its smoke (a pale
  smoke over the daylit forest, read as light, was counted into the tips). Read: its size, its light and hue in four
  bands from its base up, the share drawn white, the parts its top 40% breaks into (glow particles count as parts),
  its light's spread, the share above it its smoke changes, how much of it moves a moment, its light's and its point
  light's swing and strongest frequency, and the top-down view's flashes over a second at least. Then at one moment
  its flames alone (all else hidden by its materials, as the culled plants show themselves again each render; the
  adaptation held off, which exposed each picture by itself) from four sides, level from 10 m through 12°: a flame's
  light passes through it, so from behind it's its own mirror, while sheets turned to the camera show one face from
  either side (the owner: "fire rotates when camera rotates"). Its detail (light less its local mean) from behind
  under 0.6 alike its front's mirror, or more alike its front as it is, turns with the camera, unless its front is
  over 0.9 alike its own mirror, too even to tell (main's disc of coals, edge on). And the plants over it
  (`page/fireClear.ts`): the instanced meshes' points the top-down view last drew in its column (its half-width and
  0.3 m round, 2.5 m up). Nothing drawn, still, blown out (20% white), turning, plants over it and 3 flashes a second
  are problems. `--cost` (`page/fireCost.ts`) times its flames on the GPU from beside them (in the top-down view they
  cost under the timer's noise), each render by a query of its own, drawn and not in turns: its times differ run to
  run, so they're in the lines only when asked. `--canary`: a still flame, one drawn white, one put out, a 4 Hz
  strobe, the front shown from behind, a leaf over the bed, and with `--cost` the flames drawn four times over (twice
  their cost at least). Pictured (`out/fire/`): close (beside it at 0, 0.13, 0.27 s, its light alone, from above),
  round (the four sides, the first's light alone), and the top, third, first and lobby views. Main's fires (a disc of
  coals under glow particles): 1.4 to 1.6 m by 0.9, dim orange-red throughout (7 to 25°, at most 0.22 of white), no
  smoke, 19 to 37% moving a moment, six fern clumps over the bonfire. As sheets turned to the camera they turned with
  it (0.52 alike their mirror); as a volume 1.55 m by 0.6 to 0.7, 0.33 to 0.41 of white at 30° low to 0.13 at 25° at
  the tips, 0.86 alike its mirror, the bonfire's smoke over 47% above it, 7 to 9% moving, no plant over either, 0.16 ms
  (crypt) and 0.34 (forest) of a frame from beside them on the lab's desktop GPU.
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
- `practice`: casting in the lobby and in the runs it starts, the hero's every skill on a key with a cooldown of a
  second or more (its effect's own `fire` counted) cast, then cast again as soon as he is free (no cast, channel, aim
  or charge under way), from full energy. In the lobby as it shows, and shown again after practice, casting is free:
  both casts must be made (nothing left cooling from practice). In practice (stowed, by the control the screen shows:
  a phone's rail's Practice, or the hint over the arena that Space works), with every panel folded on a screen that
  shows them side by side (not played on one showing one at a time, where folds don't count), in a run started by the
  lobby's start the screen shows, and in a run begun in practice (a co-op guest's, as its host starts: no button of
  a stowed lobby starts one, so `#btn-start` is clicked by script), the second must be refused while the first cools,
  the HUD must count it down on its key, and the cast must spend at least half its energy as the HUD shows it. A run is
  held in its countdown with a dummy before the hero, and left from the pause menu (`lab.clickOn`: scrolled to, as a
  phone's has its Abandon below the screen's edge). On main the run begun in practice kept the lobby's free casting
  through it: every skill cast twice, no countdown, no energy spent. `--canary` plays that run again with free casting
  planted, which must be caught. Run with `--screen 832x384@3.75` for a phone's (the rail's controls).
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
  named by its key, its behaviour or its name, `--class` for whose; `--gear` and `--weapon` what he holds). The hero
  stands in each biome and view
  (`--biomes`, `--views`, `--facing` in degrees, `--at x,z`: off the dais by default; `--at 0,0` its middle) with the biome's commonest foes coming at him from 13 m ahead
  (`--foes`, 4 by default), and the key is pressed over an aim 8 m ahead: held for a held skill, drawn to full for a
  drawn shot, held 3 s for a channel. Every frame from the press until the effect is over is drawn as the game draws
  it and read back from the canvas (`page/screenCells.ts`: as stored, 0 to 255, and as light by sixteenths of the
  frame). Its light is held to the budget taken from the owner's screenshots: the frame's mean raised by 50 at most
  over the scene before the press, a sixteenth of it 150 at most and 5% of it bright (200 or more) at most, those two
  not judged where the scene alone is past them. The flashes are counted as WCAG counts a general flash
  (`page/flashes.ts`: a pair of opposing changes of a tenth of white in a sixteenth's light, the darker under 0.8),
  three in any second a problem; the changes the worst cell's worst second counted are listed, each the light it
  reached and when (its light every third frame was listed: a hand swung through the cell in a frame or two read as a
  steady fade, and what was counted could not be told), and the frame's mean
  every tenth of a second through the cast, and the blinks, listed and not judged (`page/blinks.ts`: a patch of a
  64 by 36 grid brightening by 20 or more over the frame before and back within 3 frames, an effect's own crackle
  among them; a broken prop's rubble piece drawn full size at the world's middle for a frame, beside a hero on the
  dais, was one). `--what s,x,y` says what the eye's ray meets at that moment and point of the screen (% across and
  down), nearest first (`page/whatIsAt.ts`): the runs give the same frames, so a blink one finds, the next can look
  into. It casts through each camera that drew the frame, on the layers it draws: through the eyes, the arms' own
  first, as it draws over the world's. Cast on every layer from the world's camera, it listed the hero's hidden hair at
  the eyes and missed the arms, drawn through a narrower view. The world's ray meets the foes too, by their own
  meshes, on the layer no camera draws, where their crowd draws them (the camera stood inside a husk Bull Rush threw
  ahead of it, and the ray met only the walls past it); and it says what the hero was doing then: his cast and how
  far through it, his channel, a dash, a stagger, a fall, his life. Shaders compiled after loading, and nothing cast,
  are problems too. The
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
- `hits <skills>`: each skill's blows as they land (`page/hits.ts`): foes stand dazed where it strikes (`death`'s
  stands), living past every blow, and it's cast at them on a fresh set-up as the player casts it (`cast.ts`
  `holdFor`). Every hit is caught as it lands, a blow being the hits within a frame of each other (one cut striking
  three foes): each blow's time from the press, the gaps between them, when the hero was free again and the damage a
  second till then. Striking nothing, a gap past `--apart s`, and blows no quicker than `--than`'s (held down 1.2 s
  for a row of its blows: the basic attack, `cleave`) are problems. `--canary` strikes a blow of its own 1 s after the
  first (with `--apart` or `--than`), or else keeps the foes from harm. In `check` as `hits twinFangs --than cleave
  --apart 0.2 --gear dual`: Twin Fangs' two cuts came 0.35 s apart, slower than a dual wielder's cleave at 0.30 (the
  owner's "too slow", "both hits in a rapid succession"); they're 0.15 s apart now. Its cast (`castAt`, each hit's
  type, crit and kill caught too, a canary's plant tried each frame, followed on for `lasting` s from the press for
  an effect that strikes on after the hero is free: a firestorm's ticks) is `log`'s and `tooltips`'.
- `log`: the battle log (`src/ui/battleLog.ts`) held to the hits as they land (`page/log.ts`). Each skill the hero can
  use (`--skills` for fewer), in each way of holding weapons for the warrior (`--gear` for one), is cast at foes as
  `hits` casts it, with the log cleared first, and the basic attack once more at foes it kills. Every hit caught as
  the foe takes it must be listed once and in turn: under the skill cast, on the foe it struck (its name and id), for
  what it dealt, of its type, a crit and a kill as they were; and the panel must show every line of the log, each
  row saying what its line says. Then foes of each way of attacking (three Hollow Husks striking at once, a Rift
  Witch's bolt, a Cinder Brute's slam) come at the hero for two blows each, every one listed under the foe's name and
  attack, for the life it took and what his armor, shield and ward stopped. Each row must name the hero alone on his
  side of its arrow and count no more of a foe on theirs than there were: three Mossbacks' blows on one line read
  "Mossback strike ▸ You ×3", the hero counted in their place, and no check said so (`--ab` on that commit fails
  it). Paused from its panel's button, the log must list none of the basic attack's hits, its head saying it's
  paused, and list them again once it goes on. Each cast's lines are listed as the panel shows them. `--canary`
  strikes a hit at each cast's press under a misnamed skill and a blow on the hero from no foe, counts the hero in
  the panel's first row, and lets the pause go at the press. Every hero in
  `check`, 4 to 15 s each. (The owner, testing #255: a Bull Rush cast over a charging Power Strike seemed to deal
  the lobby's dummies nothing; it had hit, its number shown a moment after Power Strike's, and was missed.) The game's
  module is found through `page/battleLog.ts` (none on an A/B's older commit: `no battle log in this tree`). The
  ways of holding weapons a class has, each as a set-up's gear, are `page/gears.ts`, `tooltips`' too.
- `tooltips`: each damage skill's tooltip held to the hits it deals (`page/tooltips.ts`, `src/ui/skillDamage.ts`,
  each skill's `hits` in `src/combat/skills`). The hero is given modifiers of every kind, his stats set (40% all
  damage, 30% arcane, 25% elemental, a 35% crit for 70% more, 20% casting speed), so a tooltip leaving one out is
  caught. First the hotbar's tooltip is hovered, the weapon's all damage raised by 30%, the hero's stats made again
  from his gear (`recomputeStats`) and hovered again: each figure must follow, by the measure's own rule. Then each
  skill he can use (`--skills` for fewer), in each way of holding weapons his class has (`--gear` for one), has its
  tooltip read as the player reads it (its text: each kind of hit's range, how often it comes, the least share it
  says a hit falls to, the crit's chance and share), and is cast at foes stood where it strikes as `hits` casts it
  (a drawn shot at full draw; a firestorm followed for as long as it lasts). Every hit that lands must be within a
  figure stated per hit (a crit's raised by the crit's share; down to its least share, and one hit at its full
  figure), and a hit dealt over time must come as often as it says (on the foe struck most, past its first three
  hits: a spin comes up to speed). Stating no damage, landing no hit, and a crit's chance not the hero's are
  problems. Last, each skill whose tooltip states what it gives the hero (the draught's Health, Iron Bellow's ward)
  is cast: what it gave must be the figure (the amounts asked of `Player.heal`, before his most Health caps them; the
  ward's). `--canary` raises all damage and his most Health by 50% once each tooltip is read, as a tooltip behind a
  change would be: its hits must be found above what it states, and what was given off it. On `--ab` against a
  commit before it, every tooltip states no damage.
  (Issue #256: the tooltips showed the base damage alone, not what the hero deals with his gear.)
- `cursor`: the cursor drawn over mouse look while Alt is held (`src/ui/altCursor.ts`, `page/cursor.ts`). In each
  close view (`--views third,first`) the battle log is filled past its height and the pointer is locked as the
  player's click takes it: the lab's browser plays the lock (`lab.pointerLock`, `noCapture` in `node/browser.mjs`),
  so while it's held every event of the mouse goes to the game's canvas, as Chrome sends it, and a click on the HUD
  lands there. The mouse moved with nothing held must turn the view (else the command stops: no mouse look to
  measure). Then Alt is held, by the keyboard and in the game's frames: the mouse moved onto the log's Pause must
  leave the view still and draw the cursor there (within 1.5 px: the mouse's events come in whole px) and lit, as the
  page's cursor is over a button; its click must pause the log and not attack (the basic attack's key not pressed in
  the game); over the hotbar's first slot its tooltip must show, and go as the cursor leaves; the wheel over the
  log's lines must scroll them, and the game must take none of it as a zoom; a click on the world must not attack.
  Alt let go, the cursor must be gone and the mouse turn the view again, and a click on the world must attack (else
  the command stops: no attack to see). The lock must be held, and the run going on, through every frame. `--canary`
  holds Ctrl instead, a key that frees nothing: the view turning and the click on Pause landing on the world must be
  found. On `origin/main` the view turned 1.62 rad as the mouse went to Pause, no cursor was drawn, the click
  attacked and the wheel zoomed. (The owner: "in 3rd and 1st person user cannot press on those battle log buttons".)
  About 2 s.
- `rush`: the foes Bull Rush sweeps up (`page/rush.ts`, `--class warrior`). The biome's commonest foes stand dazed
  in sets, each on a fresh set-up: on the charge's line, at its sides (1.2 and 1.4 m off it), a hair from death on
  it, and an elite and the biome's boss on it; the charge is cast through each set, aimed its whole range ahead, in a
  lane it finds clear of props and the wall for as far again as a throw goes (the grid's spot nearest the forest's
  open ground at -11, -12 from which a way round by 15° is clear: from that spot itself a stump a metre off blocked
  every way, and a log at the stop held two thrown foes at its side). Every foe is followed frame by frame until it
  has landed and stood still, or its body lain still: when the charge met it (its blow, so a game with no carry,
  `--ab`'s main, meets it all the same), how long it rode before the hero and its body's least gap to his, how it
  was let go (thrown, how high and how far, or shoved on) and where it ended against where he stopped. These are
  problems: a foe never met, one met and left standing, one carried more than 2 cm inside him, one that ended behind
  his middle or level with his body, a living foe left unthrown, and an elite or a boss thrown. On main every foe
  it met ended 0.8 to 5.4 m behind him. Then skills are cast with the charge (`page/rushCasts.ts`), each on a fresh
  set-up, two living foes dazed on its line (`--dummies`: the lobby's training dummies, planted, the first stopping
  the charge), the aim carried along ahead of the hero as a still mouse is: the charge alone, a Power Strike charged
  and the charge cast over it 0.35 s from its blow, a cleave and Twin Fangs pressed as the charge runs, a Power Strike
  pressed as it runs and at its stop, and the charge cast 0.4 s into Steel Tempest and into the shield raised, their
  keys held on until it's over; a combo the weapons held don't allow is left out (`check` runs the casts with a
  shield and with two weapons). Each is followed: whether each skill was cast as it was pressed, when the one looked
  at landed against the charge's run and what it struck, what the charge's own blows struck (the foes struck as its
  dash steps: every foe on its line, or a problem), the frames of its run a held skill was held in, the frames the
  skill and the charge ran together and those the charge was shown in instead (a lunge riding on the charge's dash is
  the skill), each foot where the hips have it against the charge alone's at the same point of it (more than 20 cm
  off is a problem: under a skill's crouch the knees bend to keep the feet on the floor, up to 12 cm off; a stride
  frozen by the pose's fade as a skill began or ended left a foot 39 to 45 cm off, the Tempest's wide stance under
  the charge 27 cm; through the eyes the legs aren't drawn, nor judged), and how far the charge took him. On main
  every skill pressed with the charge was refused, and #255 refused the charge over a held Tempest and Twin Fangs in
  it. (A guest's charge on both screens is `coop`'s `rush` and `strike`.) `--scenarios sets,casts` runs a part alone.
  `--view` third or first pictures what the player sees there; `--pictures` (on by default) pictures each set just
  before the charge stops, as it stops and once every foe is still, and each skill cast with it as it lands, the hero
  close from his left too, into `out/rush`. `--canary` puts the first foe thrown 2 m behind the hero as it lands,
  shows the charge in the strike's place as both run, drops the charge's legs from under the cleave (not through the
  eyes, where they aren't drawn), keeps the foes from harm as the charge alone steps, lets Steel Tempest go as the
  charge is pressed, and cuts the charge short as Twin Fangs lands in it.
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
  sides then, not one side from the cache and the other now. Then the report as the overlay copies it is read
  (`page/perfReport.ts`): its histories, 30 buckets each (frames a second, our frame's time, how late it started, the
  GPU's for our draws), and its long frames (Chrome's Long Animation Frames API: what the main thread did in each),
  where a task of 120 ms run by a message must be listed with what ran it (`--canary`: one of 30, under the
  browser's 50, must be found missing). The owner's lobby fell to 28 a second hovering items, frames late by 20 to 46
  ms where ours took 11 to 18, and the report couldn't say whether the page's thread or something outside it held
  them up. A click's long frame ends at the page's next rendering, which the lab's held frames put off past the
  read: the task is a message's.
- `programs`: the programs the boot compiled (`page/programs.ts`), read from the game's ledger of them
  (`watchPrograms` in `src/core/shaders.ts`, dev builds alone: the boot's programs are made before any command can
  watch). How many each loading step made, and how many of those a draw made rather than the warm-ups' `compile()`
  (a draw's program is linked as it's drawn, the page held up meanwhile); each kind (the material's type and its
  shader), with the fields of its key that set its programs apart (`page/programKeys.ts`: three r185's key read by
  field, the names held to three's own code by `test/programKeys.test.mjs`; `custom` is the material's own key,
  three's default left out), a kind of one with what it was made for; what uses them (the scene's top-level object
  of each object compiled or drawn with one, every foe's kind as `foes`: a program the foes alone use is one a lobby
  shown before them could compile later); the programs no draw ever used (compiled for
  nothing) and those a draw made, each with its step and what it was made for; those made after the reveal (the
  lab's set-up). #275's boot made 32 by a draw, each a first visit's wait inside it: the post chain's and the
  environment maps' (now compiled with the biome), the shadows' (`compileShadows`) and the outline's
  (`compileOutline`). Now none. It found 177 programs at boot, 92 of them lit (each for
  15 point lights), 17 of those never drawn: the crowd bodies' own materials, on a layer no pass draws (now left out
  of the warm-ups' compile; the kit's variants made uniforms, 146 were left). The lobby shows before the fight's
  programs are warm (`src/game/warm.ts`): the lab's boot asks for them at once and waits for them, listed as made
  `behind the lobby` (40 of the 146). `--cost` compiles each program again from the GLSL three gave it, alone, salted
  so no cache can answer (`page/programCost.ts`), and times it from its source to its link: the CPU a first visit's
  ANGLE spends on it; summed by kind, by what uses them, each step's by what uses them (what that step's warm-up
  waits for its links on) and by the point lights they're lit by, the longest listed with their fragment shader's
  size, and a plain lit material's compile as the scene lights it and with its point lights, environment map,
  shadows and fog each taken away. Its canary is the cache: the longest compiled again with its salt must come back
  in under a quarter of its time, and with a new salt in over half. It found the lit programs 36 of the 40 s (0.56
  s each, 16 point lights written out), 23 s once lit in a loop; and the spells' 91 programs 14.4 s, the hero's 6 s,
  the effects' samples 3.9 s, the lobby's biome 3.5 s (now compiled as the arena is built). A minute or more.
  `--canary` warms a box of a kind nothing else is (it must be listed compiled and drawn) and one on a layer no
  camera sees (it must be listed never drawn). The performance report's count of programs compiled after load (each
  a hitch, as it says) must be the ledger's made after the reveal: a new build's lobby, its fight not yet warm,
  counted every program the boot made (83, 106 in the owner's), the load marked only once the fight's were warm; run
  it `--cold` to boot as that lobby shows. Its canary draws a box of a new kind in the lobby and marks the load again
  after it, as that did: the report then misses the box's program, which must be found.
- `compiles`: whether the boot's warm-up compiled what a fight draws (`page/compiles.ts`). In each biome (`--biomes`,
  both) the hero stands in the view (`--view`, top) and a prop of every kind the biome has is worn down (its gauge
  over it, chips knocked off) and broken in turn, its rubble, debris and smoke drawn as they fly and settle; then the
  run's first wave is set off and fought as the game plays it, the hero (kept whole) casting each skill on his bar
  in turn at the nearest foe, until it's cleared or 40 s are up, its foes killed as a fight kills them (no other
  check lets a foe die of a fight); then the first biome's wave is fought again by a hero built afresh, as the
  lobby's class switch builds him. Each round counts from before its set-up, whose frames are the game's (the
  view entered, the hero rebuilt: counted from after it, the rebuilt hero's arms compiled unseen). Every program
  compiled meanwhile is a problem, said as the game's perf report says it and with the draw that first used it, its
  object, its material and its pass (the game can't name a shadow's: three keeps its shadow materials). Run it as a
  phone boots, `--boot low@518400`: a Low boot's warm-ups draw other shadows (small parts cast none there). Each
  fight's line counts the point lights each pass is lit by, as three counts them (shown, and on a layer its camera
  sees): the scene's, and through the eyes the arms', drawn by a camera of their own (the warrior's); a pass lit by
  another count than the boot's is a problem, as its programs were compiled for that count and all it draws
  compiles again. `--gear` and `--weapon` hold the hero's weapons
  (`--class warrior --view first --gear twoHanded --weapon Greataxe`: #268's report). It found #243's mid-fight
  compile, the forest's wood rubble's shadow (`steadyShadowPrograms` in `src/core/shaders.ts`), and #268's: the
  hero built afresh brought his own light in after the arms' pass had put the scene's lights on its layer, which it
  did once, and through the eyes 11 programs of his arms and the shadows compiled at the run's start (15 lights to
  14). `--switch ranger` first picks the ranger on the lobby's class card, as a player does, and waits for him (the
  lab's boot waits for every warm-up, so it says 0.0 s); the boot's class (`--class`) is another. A class's skills
  are warmed with the heroes, not the lobby, so only a switch tells whether they were: with the ranger's left out of
  `heroParts` (`src/game/warmup.ts`), `--class mage --switch ranger` found 9 programs compiled in his first wave.
  `--canary` draws a material nothing else does before the hero, which must come out as compiled, and puts a point
  light in the scene, which the count must find.
- `maps`: the game's procedural maps (`page/maps.ts`; `--maps forestFloor,steel`, every one `PRELOAD` lists in
  `src/core/pbr.ts` by default), each made on the page as a loading worker makes it, `--runs` times (its time the
  fastest, by the browser's own clock), with a digest of its pixels and of a face's grid (its head is built on it).
  A first visit makes every one before the lobby shows what it needs, so a map made faster must keep every pixel:
  with `--ab` each digest must be main's, and the times are side by side. It found the 22 maps 8.7 s in all, alone
  on one thread: the three faces 1.4 to 1.8 s each, the forest floor 1.5 s, the cobblestone 0.6 s, none of the
  rest over 0.25 s. `--canary` changes a byte of the first map's pixels once it's made: its digest must change.
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
- `eval <expression>`: an expression evaluated in the page, with `lab` in scope (`eval "lab.player.nocked"`). One that
  hasn't settled in 60 s is given up, with an error (a `requestAnimationFrame` waits on the lab's frames, `lab.step`:
  awaited, it never settled, and held up every command after it till the server was stopped; the browser's next
  frame is `window.__labClock.realFrame()`). `live eval` is given up the same way.
- `live <step>`: a page of the game kept between steps, each on the state the last one left, as a modelling
  tool's scene is kept between edits (`node/live.mjs`, `page/live.ts`; needs `lab:serve`). `live start` boots the
  hero (`--class`, the warrior by default), on `--screen`'s screen if it's given (a phone's, `832x384@3.75`: its
  layout and the touch controls' scale), and sets him up (`--view`, `--gear`, `--weapon`, `--at`, `--facing`);
  then `live picture` pictures him from `--views` (through the eyes `eyes`, else `third`, by default; `screen`
  the whole page as the player sees it, the HUD and the touch controls over the frame) in any
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
- `pwa`: a deploy as a returning player meets it, the offline worker and all, which the lab's dev server never has
  (`node/pwa.mjs`; it runs in this process, not the server). Another commit's production build (`--from[=ref]`,
  origin/main by default, exported as `--ab` exports it) and this tree's are built with Vite into `out/pwa/`, and
  served in turn on 127.0.0.1 under `/last-stand/` as Pages serves the game (`node/staticHost.mjs`: `max-age=600`,
  revalidated by ETag, what it serves swapped at once, as a deploy swaps it). A fresh browser loads the old build
  twice (its worker installed, then the page and its fonts fetched through it); then this tree's build is served in
  its place and the page reloaded as a player reloads it: under the old worker, again once the new one has taken
  over, and offline. Each load is known by the worker that served it (asked as the page starts, before a new one
  takes it over: a load under another than it's for measured nothing, a problem). Every load must show the game's
  fonts (a face of Cinzel and of Alegreya Sans loaded), every load after the swap this tree's build (its entry
  script: a plain reload must show a new deploy), and each of this tree's loads the labels' lining twin
  (`overlay/paint.ts`).
  `--canary` serves a stale page on the first reload after the swap and the font stylesheet's address broken after
  it: both must be found. About 35 s (the canary's two minutes: its waits run out). (The owner, of #263's preview:
  the page's font stylesheet had been asked for with CORS, and the previous deploy's worker answered with the copy
  it kept from a request without, which can't answer one with; the stylesheet failed, and the lobby showed the
  system's fonts, wider, its links wrapping: "increasing font size had unintended side effects".)
- `check`: the checks of a change to how the heroes move, run side by side: the gait (its steps listed, no films), the
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
  every hero's hits in the battle log (`log`) (`--classes`, `--commands` for fewer), each in a session of its own
  (`--jobs n`, a core in three by default, at most 8), the longest first as they last took, each report in
  `out/check/<command>-<hero>.txt` and its pictures in a folder beside it. With `--ab`, the other commit is exported
  once before the sessions start, and its side read back from the cache once it has run (below). The gait runs a
  scenario a job, each on a page booted for it, and each hero's scenarios are put back together
  (`out/check/gait-<hero>.txt`, each under its name): one after another on one page, each was set up from where the
  last had left the hero and the clock, and main's own gallops were 18, 23 and 17 a hero with films and 13, 14 and 16
  without. Each gait scenario runs from three starts (`--starts n`, at most 5): its first move 0, 7 and 13 frames
  longer (`gait --offset`), so every later turn and stop comes at another point of a stride. Run once from one start,
  a frame's change anywhere sent every later stride elsewhere, and a change's gallops came out 2 or 3 either way over
  a check's gait scenarios by chance; stood a few frames first instead, nothing changed (the set-off is the same from
  any moment of the idle). What a command counts (`countsOf`: the gait's gallops, hops and short steps) is added up
  over a hero's jobs, each side's, in its line of the log and at the head of its report with each scenario's (`hops 2
  (048deb5 9)`: this tree's, then the other's), so a check's verdict needs no script of its own to read it. It runs in
  the command line's own process, not the server's. One command at a time, both sides every time, the mage's cape
  stepped throughout and each gait scenario run again for its film, the same check took 31 to 35 minutes a round; the
  harness is run hundreds of times, so keep every check that runs often to minutes: profile it (`--profile`), cut what
  its measures don't read, and run side by side what doesn't depend on each other.

Options every command run on a page takes:

- a probe or command that doesn't compile says where and why (`.tmp/x.ts:3:10 doesn't compile: Unterminated
  string`), not the browser's "Failed to fetch dynamically imported module";
- the set-up (sheet, carry, probe): `--view top|third|first`, `--at x,z`, `--facing rad` (held in every view: the
  close views' camera turned to it, as through the eyes the hero faces where it looks), `--nocked[=false]`,
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
- `--tune name.field=v,...;...`: the game's tunable values (`src/core/tuning.ts`) set before the set-up;
  `name.field[i,j]=v` sets those numbers of a list alone, the rest as they are (a swing's keys, six numbers each:
  `warriorSwings.twoBack[41,47,53]=40` the roll of its last three keys);
- `--sweep target=a|b|c[;target=...]` (`node/sweep.mjs`, on the lab's server: `npm run lab:serve`): the command run
  once for each value of a target, a `--tune` path or some of its numbers, and for every combination of several, each
  set over the `--tune` given; each run's problems listed in full under it, then the runs with the fewest, exiting 0
  when one had none (keys tried a dozen ways by hand, each run's output filtered for its problems, missed the speed's
  three failures on the runs the filter called best);
- `--randoms`: what drew the page's random numbers as the command ran (`node/randoms.mjs`): the draws in all and the
  busiest callers, each at its line, and with `--ab` the callers whose draws differ between the sides, the smallest
  differences first. An A/B's pictures of anything random (particles, sparks, motes) differ after the first draw one
  side made and the other didn't: drawn in crowds, the foes' skeletons never made the bone textures three makes as a
  skinned mesh is first drawn, four numbers each for their ids, and every mote after them lay elsewhere;
- `--layers`: the page's composited layers at each screen picture, as Chrome drew them (`node/layers.mjs`): each
  layer's element, its box and why Chrome made it a layer, and with `--ab` the layers the sides didn't share, picture
  by picture. Two sides whose pictures differ only in how bright the UI's thin lines are, nothing moved, were
  rastered two ways;
- `--watch`: run it again each time the source changes, on the page booted for the change, until Ctrl+C.

A misspelt option or a bad value stops the command before anything boots (`carry takes no --canry (did you mean
canary?)`). The exit status is 1 when the command failed or found a problem: an error in the page, or a problem its
result reports (a canary the measure missed).

