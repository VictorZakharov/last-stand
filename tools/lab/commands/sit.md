# `sit`

The unobstructed front close-up hides the brazier's whole assembly, including its stepped plinth: hiding the flames
alone left the mage's lower body behind the step. The ordinary views still show the scene as played.

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
attack nothing before he's up, be up within 1.2 s, and once up do nothing after a tap (moved 5 cm at most, no
attack: a tap isn't queued) and do a held key (walked off 0.6 m, or attacked). Pictured half way down and sat, from
the front, the left and above behind, and sat in the game's own views (`top`, `third`); by a fire from his right,
behind and above, and from ahead with the fire hidden, framed on his knees (`fromBeyond`: through the flames the
front view saw nothing of his legs, and the robe's panels standing out from his knees through his hands went unseen,
"lots clipping near fire, how did you miss it ?"). `--canary` raises his body 12 cm off the log as he sits: it must
be read as sitting on air. The owner's words: "if there is a nearby log or not high stone ... and character is idle,
they need to walk up to this prop and sit on it, should sit on the closest side", "when user presses any action,
they should stand up first, then perform the action if user is still pressing it (do not queue)", "while seated,
they should continue looking left/right like now", "it should be also possible to sit near fire after idle... just
on the ground".
