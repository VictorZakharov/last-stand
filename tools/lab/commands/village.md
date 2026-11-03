# `village`

One command of the lab in full, moved here from [`COMMANDS.md`](../COMMANDS.md) (which lists every command, and the
options every command takes) for its size.

`--only names` runs the checks whose names have any of these in them (`--only lampsAlike,hallWalls`; the names are
the check functions' in `page/village.ts`): the whole takes minutes.

The chest's lid is read off the object drawn (`page/villageChestLid.ts`: from play, "stash chest should open when I
approach it, and close when I move away"): shut far off and in the hall's door beside it, open at its stand, shut once
he has walked off; `--canary` keeps him far off where it should be open.

`village`: the lobby's village as a player walks it (`page/village.ts`; `src/game/village.ts`), the run left for
the lobby. Each check in turn: every object (the portals, the chest, the hall, the campfire, the chronicle, the
notice board) used from where the hero stands to use it, and what it opens shown; the notice board and the
chronicle used by E, put away by their own button and used by E again where he stands
(`page/villageUseAgain.ts`: from play, "when I press got it, I cannot press E again until I move away", the notice
board and the campfire held as open until he walked off; `--canary` leaves the second press out); his skills armed
in the training yard and not on the square; straight walks out from the square at angles round it, and along each
way out, stopped inside the palisade or the way's walls; walks along each way at its portal, through its middle
and round its sides, stopped before it (from play: "for village portals, I should not be able to walk past
them"; the commit before its walls let six of ten past); walks on the terrace at the hall's side walls and its front
beside the door, the first surface drawn ahead of his middle at a knee's height at least 0.15 m off
(`page/villageHallSide.ts`: from
play, "can pass through textures here", the plinth course along the hall's foot drawn and not in the wall;
`--canary` counts him half a metre further); the hall's front wall's blocks of walling, their maps read at each corner
against its place, one grid at most 1% of a tile apart (`page/villageWalling.ts`: from play, "misaligned texture",
the block over the door a part course off the wings, 45%; `--canary` moves one block's map a third of a tile); at 9:30
from the middle of the hall turned to the dais, the hero hidden, at least 0.9% of the frame lit by the sun, drawn with
it and without it
(`page/villageWindows.ts`: from play, "windows need to be real, and let sun/moonlight through"; with them shut
0.58%, open 1.38%; `--canary` draws both without the sun); through
the eyes on the square, the view tilted from over level down toward the ground, the grass's rings' middle (`focusOf`
in `world/meadow.ts`) moving at most 2 m a frame (the old rule
threw it 22 m at a sight just under level: "grass a near circle that keeps updating in front of me"); over the
shoulder at noon by open meadow, the meadow's blades drawn alone twice, the rings' middle moved 2 m ahead between
(`page/villageGrassRing.ts`, `moveMeadowFocus`), each metre's band's grain (the light's step between blade pixels
side by side) changing by at most 15% (from play, "the circle of changing grass is still there... and it keeps moving
as I'm moving": the far rings' wide blades, drawn whole, changed it 30 to 33%, cut into strands 9%; `--canary` draws
them whole); sent across
each cottage to a spot behind it, and from each portal to every other object's stand, as a place picked on the map
sends him (`goTo`), there within 600 and 1500 frames (walked straight at the spot, he ran into a cottage and stood
there: "map waypoints dont work, when path is long and curved... it just runs into obstacles"); every kind of light
the village has at midnight (a street lamp's lantern, a hall torch, a cottage's window, and each of its own ten
point lights: the portals, the hall's braziers, the stair's lamps, the campfire, the chronicle's candle, the yard's; and the chronicle's book at midnight and noon, which burned white under the porch's torch),
stood by from a few metres off and looked at in each close view, its pixels read back from the frame
(`page/villageLights.ts`, each pictured in the close view in `out/village/sheet.png`): over 12% of its box blown out
(its brightest channel past 0.97) or 2% of the ring round it out to 2.5 times as far fails it as blinding (from
play: "lights too bright, can't see geometry even", "we should always check all lights for blinding": the lantern
read 18.6%; a new kind of light gets a case there); the pool's lights lit at midnight with the hero standing
still, none changing by over 1% a frame (`page/villageSteady.ts`: from play, "lamps have high frequency flicker",
every pooled light shaken by a random tenth a frame, 10.1%; a fire's own light swells with its flames and isn't
read; `--canary` shakes one by a tenth); a street lamp's ground read from one camera over it with the hero 24 m off
and 4.5 m off, the point lights' shadows held off, within 8% (`page/villageLampsAlike.ts`: from play, "I dont like
when lights change from low quality to high quality when I come close", a painted pool far off and a pooled light
close by, 45.7% apart; `--canary` puts the lamp out in the shaders' list while he's far off); the street lamps'
light summed frame by frame as the hero walks from the hall's door into it, the list's and the casting lights'
together, within 1% (`page/villageDoorLamps.ts`: from play, "lights turn off when I enter the hall", the lamps
switched over to the torches at its door; `--canary` puts one out as he goes in); the hero's shadows from each
street lamp in turn at midnight, 1.5 m and 3 m off it (from play, by the stair's lamp: "no shadows FROM LIGHT, only
from moon"), and the moon's at each: the most of a patch's light his shadow takes away from the moon, at least 5% (16
to 82%, 9% by a lamp on the grass, where its light is most of the ground's)
(the lamps' shadows held off for its readings: "moon shadow always there plus 1 or more shadows from lights"); the
most the lamps' shadows take of a patch behind him (on paving where
there's some round it) while he casts over what they take there while he doesn't, at least 15% by every lamp
(`page/villageHeroShadow.ts`: from play, "no shadows from lights", the lamps' shadows drawn once with him hidden;
0.0% before, 59 to 85% now; `--canary` stops him casting by the last lamp); his two shadows standing between two
lamps, the two nearest him (the two casting lights), the same reading behind him away from each, at least 15% each
(from play, "supposed to be 2 shadows here, right ? from both lights": 18 to 54% each; the far lamp's is the faint
one, lit by the near lamp; a pair with nowhere to stand between, the fountain, is listed but no fault; `--canary`
stops him casting for the last pair's second reading); every street lamp casting, the hero in
the hall so none holds a casting light: the ground within 3.5 m of each lamp's foot drawn from four sides 6 m off
it and 9 m up, with the lamps' shadows and held off (the shadows' map and the casting lights'), at least 1% of it
darker by 30% (`page/villageLampShadows.ts`: from play, "your light test for each light need to test SHADOW, it
was missing for half of them"; straight over a lamp the camera stood where its light does and saw every shadow
hidden behind its caster; 0.0% for every lamp without the shadows' map, 2.6 to 9.7% with it; `--canary` holds the
last lamp's shadows off for both readings); each road's tightest bend no tighter than its half width and 0.3 m
for its curb (`page/villageRoads.ts`: the yard's road's inner curb folded into slivers at its gate, 0.9 m against
1.6, now 2.9; `--canary` adds that road as it was); the props' hole (`core/seeThrough.ts`) drawn open and held
shut in one frame, the hero beside a cottage's wall over the shoulder (none of the frame outside him may change:
from play, "should not see through here, because I'm in the front", 20% did) and behind its roof from above (at
least 5% of him must open; `page/villageSeeThrough.ts`, `--canary` the round hole as it was); the hall's walls at
midnight from inside it, the frame drawn and drawn again with the camera 0.5 mm aside, at most 1.5% of it jumping
by over 8 levels (`page/villageHallSteady.ts`: from play, "this wall in hall of heroes is z-fighting /
flickering", its inner walls on the lamps' shelter's edge, 5% jumped; `--canary` reads each surface's side of the
shelter on it again, as it was); every street
lamp's ground round its foot read from over it lit and put out as the hero walks to each lamp in turn at midnight,
the casting lights handed over as his walk hands them, each lamp giving at least 30% of the light there
(`page/villageLampsCast.ts`: from play, "why this light is off", a lamp beside him lighting nothing; not reproduced,
the least 74%; `--canary` puts each lamp out for both its readings at the last stop); the frame with the sun's map
kept (`sunShadowKept`, `world/moonShadow.ts`) against it redrawn whole at one moment, at three spots, the last by the
chest: 0.00% changed (`--canary` leaves what moves out of it, 1.1 to 1.3%); every curb's top facing up (`curbsFaceUp`,
`--canary` reads them wound the other way); what the chest's hoard draws, read as the frame with it and without at one
moment, with the stash at 0, 1, 30 and 60 of 60, and the vertices it draws growing with it (its share of the frame stops growing as the chest's mouth fills: 38% at 30, 29% at 60)
(`heroChosenQuick`: another hero chosen in the hall, each frame timed by the browser's clock, the programs compiled;
`--canary` stalls a frame) (`heroFaceNotBlinding`: round his head at midnight, before each portal and under the street lamps; `--canary` puts a
light by his head) (`cameraBeforeWalls`: walked out from the square, the hall and the portico each way to what's built, his back to it
and along it, over the shoulder: the camera stands on his side of it, its near plane clear of him and his crown in the
frame, each close spot pictured; `--canary` lets it stand behind and leaves it at his shoulder) (`hallFrontFades`: the
hero stepped in from the portico, the camera out through the door: the frame against the frame with the front wall hidden,
at most 30% of its share gone in a frame and 8 to 75% left after 30; `page/villageHallFade.ts`; `--canary` hides it at
once, as it was)
(`cancelledOnHisFloor`: the hall opened on the terrace and cancelled, his body on its floor every frame back, 100 cm under it and rising before; its canary drops him.) (`hallShownAtOnce`: the hall opened, another hero picked and the hall left with motion on, as under the lab's reduced motion the camera always cut: the camera on its shot within 10 cm a frame after each, the view settled as it's left; its canary picks by a drag's glide. `heroLeftStands`: each hero left in the row at two moments of his showcase, the frames of 120 a foot is up, at most 25, 35 for the warrior before, and the warrior long at rest for a control) (`daisOpensCompileNothing`: the hall opened by E at its dais, as the village's own update hears it, every frame's point lights casting counted and the programs compiled; `--canary` leaves another pooled light casting) (`heroesSeenOnApproach`: on the stair, the heroes standing on the dais with the door in view and none with it behind him; `--canary` reads the look away as the look at the door) (`heroesStandOnBothFeet`: each hero chosen away from at moments through his showcase, both ankles at rest on the dais every frame; `--canary` lifts a foot) (`arrowsStickInGround`: an arrow standing in the yard and the meadow with either biome chosen, glancing off the square; `--canary` reads the square as ground)
(`wornStaysOn`: a worn item clicked by I stays on him, at the chest goes to the stash; `--canary` reads the chest as I)
(`grassRingsGentle`: the light changed per band in a 0.5 m stride of the rings' middle, at most 10%; `--canary` hands
over as they did) (`hoardShowsStash`: empty none at all, more as it fills; `--canary` reads
five items as empty); how to play closed by Esc with the pointer locked, the browser's letting go of the lock as Esc is
let go played by the page (`escClosesHelp`: no pause menu; `--canary` asks for the lock with Esc still down); from inside the hall of
heroes over the shoulder, turned to its door (V pressed: the village's top view is its panels'), the frame drawn
with what stands outside culled by the doorway (`world/hallPortal.ts`) and drawn whole, at midnight and noon:
the scene's draws must fall and at most 0.05% of the pixels change (`page/villageHallCull.ts`: 425 draws to
297, none changed; `--canary` culls all outside the hall, the doorway or not: 0.74% changed); the terrace's
stair walked up, the body's height on its top (`obj.position.y`:
the player's `pos.y` is always 0, and a reading of it said 0 m up); in the close view (V), mouse look asking for the
pointer on the square and letting it go once the hall of heroes is used (`pointerWanted` in `core/input.ts`: its
screen kept the lock and the mouse was gone over its cards, from play); the first visit's training begun afresh
(`restartTraining`: the lab's boots are a returning player's), each step taken as a player takes it (the yard walked
into, the middle dummy struck by the basic attack held and let go, as the ranger's bow looses only as it's let go,
M pressed, the chest and the notice board used) and ticked, the crypt's portal card warning with no Enter till it's
done, and begun again and skipped, Enter there at once; and the village held at six hours of the day, drawn, with
no program compiled (`G.renderer.info.programs`). `--canary` plants a fault for each (an object's stand moved off it,
the yard's reading taken outside it, a hero put past the palisade after a walk, one put past a portal, the rings'
middle moved 20 m in a frame, a walk round a cottage and one from a portal walked straight (`routing.on`), an orb far
past white hung in the first light, the
stair
walked at beside it, the
pointer asked of the square, the notice board never read, a new material shown at one hour), each listed and each must
be caught. It found the chest's stand off the terrace's edge, below it, where the hero could never use it.
