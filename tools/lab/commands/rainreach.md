# `rainreach`

Hailfletch kept off the ranger and the foes striking at him (`page/rainReach.ts`; from the owner: "should not be
possible to cast on himself or any foes currently attacking him... so adjust min cast distance"). The skill's area
never comes nearer him than its `minRange` (`areaAt` in `combat/skills/arrowRain.ts`): aimed closer it goes out along
the aim, and its walk after the aim is held as far out too.

One foe of every kind that strikes in melee (`ai` `melee` or `slam`, no boss: the Hollow Husk, the Voidling, the
Mossback, the Thornling, the Cinder Brute, the Barkhide Hulk) stands round him just inside the reach its blow lands
from (its `range`, his radius and enemyAI's 0.3), held there and kept from striking, and a Cinder Brute stands 13 m
ahead. The rain is held 5 s as the player holds it and followed 2 s after, aimed:

- at his feet, at the first of those foes, 4 m ahead, and swung from 12 m behind him to 12 m ahead a metre to his side
  (each must bring the game's aim inside the least distance, or it measured nothing);
- at the far foe, which must be struck (the rain fell);
- at the wall: stood facing out from the arena's middle, where the aim's way has no room that far out, so the area
  goes round the near circle;

in each view (`--views`), the close views' crosshair turned onto the aim; then top-down by touch (`--touch off` skips
it): the skill's button held without a drag (aimed at the nearest foe, one in reach) and dragged 30 px.

Every frame the area's middle (the channel's own state) must stay as far from him as the foes' numbers need: their
longest blow's reach, plus that foe's radius and the 0.3 an arrow strikes within (arrowRain's `STRIKE`), plus the
area's radius (9.25 m: the Brute's and the Hulk's blows), and no arrow may strike a foe in reach. The skill's
`minRange` under that need is a problem too, so a foe of longer reach added later fails it until the rain's least
distance is raised.

`--canary` takes the least distance to nothing: the area on him and arrows on the foes in reach must be caught. On
`origin/main` (no least distance) it fails every case aimed inside.
