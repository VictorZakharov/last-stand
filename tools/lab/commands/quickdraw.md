# `quickdraw`

Nockshot's quick arrows (#1004, `page/quickDraw.ts`; from the owner: "I think we need to shorten the draw, to allow
quick arrows"). A Hollow Husk is held 9 m before the ranger, kept from striking and from dying, and his left click is
played as the player plays it for 8 s each way, then followed 1 s:

- **tapped:** pressed and let go every other frame, so each shot is loosed at its least draw and the next is queued
  behind it (`Player.queued`);
- **full:** held until the bow is drawn full (`Player.drawnFull`), let go for a frame, held again.

Every shot the game looses is caught as it's loosed (`Player.fire`, with its draw) and every hit as it lands on the
foe (`Enemy.takeDamage`). His own chance of a critical hit is put to nothing and the arrows are aimed low on the body
(0.35 of its height), clear of the head, where an arrow is always a critical hit, so a hit is the shot's own damage.

The targets are the owner's choice of quick arrows (option C: a 0.8 s draw, loosed from 0.24 s, the next arrow in
0.6 s, the damage in step with the pull): the first tapped arrow loosed within 0.26 s of the press, a full draw within
0.82 s, a quick arrow at least 0.45 of a full one and tapping at least 0.75 of full draws' damage a second. Fewer than
3 shots, or a shot that didn't strike, measured nothing.

`--views` plays other views (over the shoulder by default). `--canary` puts back the least draw of half the draw and
the damage as the pull's square, which must both be caught. On `origin/main` (a 1.1 s draw loosed from 0.55 s) the
first tapped arrow and the full draw fail.
