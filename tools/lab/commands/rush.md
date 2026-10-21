# `rush`

One command of the lab in full, moved here from [`COMMANDS.md`](../COMMANDS.md) (which lists every command, and the
options every command takes) for its size.

`rush`: the foes Bull Rush sweeps up (`page/rush.ts`, `--class warrior`). The biome's commonest foes stand dazed
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
