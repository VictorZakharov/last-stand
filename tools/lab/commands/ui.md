# `ui`

One command of the lab in full, moved here from [`COMMANDS.md`](../COMMANDS.md) (which lists every command, and the
options every command takes) for its size.

`behindProps`: the dummies' labels behind a prop (#288: they showed through an obelisk). A column is planted half way
along the line from the camera to each label (an obstacle, `G.arena.obstacles`, for a frame): every label must hide,
and every one show again with the columns gone. `--canary` plants each column 3 m beside its line, where at least one
label shows through, which must be caught.

`ui`: the game's UI as the player sees it, in its states (`--states lobby,tooltip,glow,help,saves,heroes,readying,
readyingHeroes,clicked,views,behindProps,logLobby,skillTipsTouch,run,scores,perf,decision,pause,summary,skillTips,log,logTouch`, every one by default:
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
How to play, the save slots, the hero selection screen over the hall of heroes (`page/uiHeroes.ts`: opened by the
lobby's Change hero clicked with the mouse and pictured once the camera has come to the hero and his showcase is over:
the screen and the hall up, the hero in focus the lobby's own, his card alone shown, the hero in the room the panel
leaves (his middle clear of the panel, the arrows and the heroes' names, head to feet within the window, 40% of its
height at the least), the screen's parts within the window and none over another, the choice within reach and its
words within its padding (on a phone the buttons' own 24 px ran past it), the hero beside him clicked and in focus,
Esc back to the lobby with its hero; `--canary` lays Back over the heroes' names, which must be found), the fight's
loading bar over the lobby as a press waiting for the fight's programs
shows it (`ui/readying.ts`, 40% along: within the window, its label on one line, its fill as far as painted;
`--canary` gives the label a letter's width, whose wrap must be found), Change hero clicked with the mouse while
the heroes' programs are kept cold (`game/warm.ts` `chill`), its bar saying it readies the heroes and every label the
bar can show (`readyingLabels`) on one line on this screen (`--canary` puts back the page's own "Readying the fight",
which a class pick once said, and it must be found; a tree from before it can't keep them cold, and says so), the
lobby's battleground button on clicked with the mouse and a key pressed after it as the browser gets them (where the
focus went and whether the browser shows its ring: a problem when the button kept it), the lobby's camera switched with V through every
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
