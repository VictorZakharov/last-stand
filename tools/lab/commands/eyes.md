# `eyes <skill>`

One command of the lab in full, moved here from [`COMMANDS.md`](../COMMANDS.md) (which lists every command, and the
options every command takes) for its size.

`eyes <skill>`: a skill cast through the eyes (`page/eyes.ts`, `--class warrior`; `--gear` and `--weapon` hold the
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
