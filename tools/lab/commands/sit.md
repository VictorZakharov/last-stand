# `sit`

The unobstructed front close-up hides the brazier's whole assembly, including its stepped plinth: hiding the flames
alone left the mage's lower body behind the step. The ordinary views still show the scene as played.

The mage's crystal and rings turn continuously: the held-again check compares their mount and scale, while the
frame-by-frame motion check still follows the meshes as drawn. Comparing their spin at two times reported a 140°
change even when the grip had returned.

One command of the lab in full, moved here from [`COMMANDS.md`](../COMMANDS.md) (which lists every command, and the
options every command takes) for its size.

`sit`: an idle hero's sit on a log, a stone or the floor by a fire (`page/sit.ts`; `entities/sitting.ts`, `models/sit.ts`,
`world/seats.ts`), read from what's drawn. On each seat (`--seats`: the forest's `log`, its lowest `stone`, the
crypt's fallen `column`, the floor by the forest's `fire` and the crypt's `brazier`; the set-up's `--gear`,
`--weapon` and `--tune` reach it) he's set up 3 m off it on clear floor, facing it, and left idle (the lab's set-ups
hold sitting off, `Player.sits`; this one lets him once set up) until he has walked there and sat (by 16 s): on the
spot nearest where he stood, within 5 cm; his thighs' pivot 6 to 17 cm over the seat's top as drawn under it, every
frame he sits for 7 s (by a fire, over the floor); his feet hanging (every ankle over 16 cm off the floor) on the
log and the column, down (under 13 cm) and still (3 cm at most) on the stone and the floor; every joint within its
range as `range` reads it (the drawn hand on its grip), sitting down and sat (and standing idle before it, said, not
his sit's); nothing of him drawn over 3 cm under the floor but a weapon stood on its point, as far as the model says
it's in (`userData.stuckIn`; the mage's staff went 40 cm in on the stone, then his robe 6 cm, a hidden weapon read
as one, and by a fire his book 21 cm and the shield 11), and what's stood on its end on the floor
(`userData.stoodOn`, set by `footOutOfFloor`) drawn on it, 3 cm over at most (slid by the world's rise read in the
hand's frame, the mage's staff stood 18 cm over it on the log and 77 on the stone); a glance past 15° as he sits;
every hand holding nothing (no rigid piece shown under it) resting on his legs, its palm within 6 cm of the rig's
thigh and shin capsules and no more than 3 cm into them, the clothes over them (from review: an empty hand hung
beside the knee, palm forward, touching nothing, 9 to 19 cm off; `armOffThigh` had swung it off the thigh; rested
before the look, a glance moved it 8 cm); by a fire, his hips facing it within 15° (a review read 30 to 45 off from
the above view, which stands behind him to one side). His skirts are followed as he sits, as `coat` follows them
standing (`coat.ts`'s `follow`): a point whose move a frame changes by over 1 cm jerked (`--frames` lists them), and
from 1.5 s after he's sat, once the cloth has eased into place, no point may wander over 10 cm (a hood turns with
his glance and is let be). From play, "on log cloth is jerking few times per sec": the mage's robe jumped up to 17
cm a frame on the log (162 frames in 7 s) and 54 by a fire, the drape between his raised knees going round one or
the other as his hanging feet swung and the cloth's flutter moved it a few millimetres (`Skirt.ease`). Then he's
asked to act from it, a step and an attack, tapped (3 frames) and held: he must begin getting up within 2 frames,
attack nothing before he's up, be up within the time his body and his hands take back (`riseMost`: 0.8 s and 0.4 to spare bare-handed, about 2.7 with a greatsword planted), and once up do nothing after a tap (moved 5 cm at most, no
attack: a tap isn't queued) and do a held key (walked off 0.6 m, or attacked). Pictured half way down and sat, from
the front, the left and above behind, and sat in the game's own views (`top`, `third`); by a fire from his right,
behind and above, and from ahead with the fire hidden, framed on his knees (`fromBeyond`: through the flames the
front view saw nothing of his legs, and the robe's panels standing out from his knees through his hands went unseen,
"lots clipping near fire, how did you miss it ?"). Sitting down and sat, his forearms and hands are read against
his legs' and trunk's capsules (`armsInLegs`, `armsIn`) and the weapon in his hand and the ranger's bow against his
body (`WeaponBody`), each allowed 3 cm in (`INTO_BODY`: "ranger hands clipping through legs, in sitting pose near
fire", "bow clipping through body in log sitting"), and the moment any went deepest is pictured close from his
right, ahead, his left and above, his skeleton drawn over him and his skirts, the fire, the plants and the rocks
round him hidden (`IntoBody`, `DEEPEST_VIEWS`): the depth alone didn't say which way an arm went in, and fixes tried
blind took a minute a round, two agents' worth of them, without converging on the floor pose.
The same close-up is retained for each later sit before an ask: a second sit on the stone put a greataxe's haft
15 cm into the chest even though its first sit was clear, and the temporary report discarded that picture.

What he carries is followed from his set-up until he's up again (`page/sitCarried.ts`): every rigid mesh of his model
(a weapon's, the shield's, the staff's, the bow's, the book's), grouped by the object over it hung from a joint. A
piece the pose moves (one hung from a hand that a palm is on at some frame, within 6 cm of its box, or one taken over
15 cm from where it hangs) may move only in a hand or lie still: one that went over 3 cm in all with no palm on it,
moving in the world and on the joint it hangs from, moved on its own; and any mesh turned over 25° or thrown over 12 cm
in a frame jumped. Once a tap has left him up and still, what he held before he sat must be held as it was, every
corner within 3 cm on its joint and turned under 10°. From play, both passed by every measure before: "staff dropping
in a weird way" (the mage let go of it at a fifth of the way down and it went on to the floor on its own, 8 m of
movement in all), "staff rotated when he stands up" (140° turned in his hand), "he just summons the bow into his hand
using jedi force", "when warrior sits on a log, weapons are being pulled around with jedi force too, on sit down, and
on stand up" (his sword flew 113 cm in a frame). A piece held is moved by the hand, not in it: each frame adds the
lesser of its move in the world and in the hand's frame (with the hand, it moves in the world alone; a palm moved
over a piece standing still, in the hand's frame alone), frames under 0.5° and 3 mm left out as the grip's own
fitting, and it may turn 20° and slide 5 cm (its group's origin: a grip, a bow's handle) in all while held. From
play, both passed every measure: "warrior magically rotates the sword in his hand" (the greatsword swung half round in
his fist as he lowered it, 2° a frame), "ranger uses force pull to grab his bow from seated near fire" (2.6 m through
his hand). And no arm may be held at two or more of its joints' stops at once (`page/armStrain.ts`, as `range` reads
it; pictured at its most): "if a real warrior would put a sword down like that, he would snap his arm" (by the fire,
the forearm turned to its end and the wrist bent to its). His legs are read against his skirts (`page/sitCloth.ts`): every
triangle's corners, edges' middles and middle against the thighs' and shins' capsules at their drawn radii, a point
over 1.5 cm inside one the leg through the cloth, the deepest pictured as it deepens ("knees clipping through robe
when sitting near fire": the mage's thigh 9 cm through his robe; the skirts' wander and jerks were read, never what
they cover). The first way down and the first way up are filmed (`page/sitFilm.ts`), every 5th frame in the seat's
first view and the game's third-person view, each labelled with how far down he is: the two moments pictured never
showed what moved between them. And zoomed in all the way over his shoulder (`page/sitFraming.ts`, the game's own
camera code given `Player.framedHeight`), his neck sits on the screen within 0.15 of the screen's half height of where
it sits standing: "zoom in/out with mouse wheel in 3rd person should zoom in on the seated character, not the
standing one (if seated)" (by a fire it sat 0.67 under it, the camera at a standing hero's shoulders).

Once its asks are done, each seat is sat on again by E: the mouse put over the seat's middle (on its top; a fire's
0.4 m over the floor) for 1.5 s, short of `SIT.look`, it must not be outlined and E must not set him off; held there
till `SIT.look` is past, it must be outlined white (`outlinedLook`, round its first target) and is pictured as the
player sees it (`seat: pointed at, outlined`); E then must set him off at once, the outline gone, and pressed sat, E
must get him up.

`--canary` raises his body 12 cm off the log as he sits: it must be read as sitting on air; pushes what he holds out
of his hand, 15 cm and a centimetre further each frame for half a second as he sits, read on its own by a `Carried`
of its own: at least 15 cm of it must read as moved with no hand on it; turns what he holds 0.5 rad in his hand once
he's up, read against how he held it a moment before: it must read as held otherwise; turns it 0.03 rad further in
his hand each frame for half a second, sat, which must read as turned over 40° in it; holds the right arm at its
stops (`pinnedCanary`); and reads a cloth point at his
left knee's joint, which must read 4 cm deep or more. The owner's words: "if there is a nearby log or not high stone ... and character is idle,
they need to walk up to this prop and sit on it, should sit on the closest side", "when user presses any action,
they should stand up first, then perform the action if user is still pressing it (do not queue)", "while seated,
they should continue looking left/right like now", "it should be also possible to sit near fire after idle... just
on the ground".
