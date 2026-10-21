# `swing <name>`

One command of the lab in full, moved here from [`COMMANDS.md`](../COMMANDS.md) (which lists every command, and the
options every command takes) for its size.

`swing <name>`: a swing through the eyes keyed from a pose (`page/swing.ts`, `src/entities/viewSwing.ts`;
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
