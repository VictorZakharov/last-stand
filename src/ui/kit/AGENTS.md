# `src/ui/kit`

The game's UI drawn by the engine, not the page (#973: the panels move off the page one at a time). `panel.ts` is the
kit: a `Panel` is a box in a tree, laid out as CSS's flexbox lays one out (`PanelStyle`), painted by its look
(`PanelLook`: a fill or a fill from top to bottom, a border, rounded corners, an opacity, a shadow, a scroll), holding
other panels or a line of text (`say`). The engine lays the tree out and draws it in one call over its frame, after
the world's labels (Bulwark's `ui.rs` and `gpu/panels.rs`, the page's calls in `engine/ui.ts`). Moved onto it so far:
the run's target frame (`ui/targetFrame.ts`), the wave's badge (`ui/waveBadge.ts`), the choice after a wave
(`ui/decisionPanel.ts`), the bottom bar (`ui/bottomBar.ts`, `hotbarPanel.ts`, `slotFace.ts`, `frenzyPips.ts`),
the minimap's column (`ui/minimapColumn.ts`), the training's tracker (`ui/trainingPanel.ts`), the banner
(`ui/bannerPanel.ts`), the close views' crosshair, charge ring and look hint (`ui/aimMarks.ts`), the buffs
(`ui/buffsPanel.ts`), a duel's score and result (`ui/duelPanels.ts`), the party's frames (`ui/partyPanel.ts`),
the downed and watching UI (`ui/downedPanels.ts`), the overlays down the left (`ui/diagPanels.ts`,
`netLogPanels.ts`), the chat (`ui/chatPanels.ts`), the touch controls (`ui/touchPanels.ts`) and the village's
card (`ui/villageCardPanel.ts`).
- **A screen of many elements is a typed style sheet** (`sheet.ts`, `SheetTree`): its SCSS ported rule for rule,
  each rule keyed by its own selector (matched by the page's `Element.matches`, so `:disabled`, `:has()` and
  attributes mean what they meant), the cascade the sheet's order. Text is inherited as CSS inherits it; an element
  of words or inline elements alone is a line of runs, unless a rule says it's laid out as flex (`flex`: CSS's flex
  and grid make their children boxes). A grid is ported as wrapping rows, its columns' widths given (the ledger's
  `boardWidth`). The shared controls are `ui/controlsSheet.ts`. Each frame's style is whole: a field no rule gives
  now is taken back (`whole`), or a card hidden once stayed hidden, as a style keeps the fields it isn't given.
- **A width is its whole box's, as the page's `box-sizing: border-box`**, and **a row its items fill exactly wraps
  its last by a fraction of a px**: give each item its share a hair under (`ROUNDING` in `stashSheet.ts`; the stash
  stood four to a row and the ledger's boards two where main's stood five and three).
- **A button's words are kept whole** (`whole` on `.btn` and `.seg button`): left to wrap, a segmented button's
  `1 v 1` stood on three lines where CSS's sized the row to its words.
- **A page's control laid out by the page and drawn by the kit is a ghost** (`.kit-ghost`, `_base.scss`): laid out
  and taking the pointer (a finger's capture, two fingers, a press held), painting nothing by `filter: opacity(0)`,
  never `opacity: 0`, which the lab's and the game's `checkVisibility` read as hidden (`lab ui` found no pause
  button). Its panel stands at its box, read each frame. A page's SVG icon is drawn as styled (`svgArt`).
- **A press can leave the focus where it is** (`Pressable.keepsFocus`, `textField`'s last argument): the canvas
  takes every press, and its `mousedown` blurred the chat's field, whose blur shut the box under the press.
- **A button held, not clicked, says so** (`Pressable.held`: told as a press on it begins and as it ends, wherever
  it's let go): the touch revive. **A placement past the screen's safe area reads it** (`safeInsets`, `safeArea.ts`).
- **A gap of two values is `[across, down]`** (`gap: [8, 0]`), the reverse of CSS's `gap: row column`: Mini's
  `gap: 0 8px` written as `[0, 8]` gave its parts no room between them.
- **A line of styled runs** (`RunLine`, `runsOf` in `runs.ts`: the page's inline `b`, `em`, `small` in a line of
  words) is a wrapping row of a panel a word, each run's style given by the port; a run of `white-space: nowrap`
  is kept whole (`whole`), and a smaller inline run keeps its paragraph's line height. The overlays' monospaced
  text is the `mono` face (`overlay/paint.ts`).
- **A new state of `lab ui` runs on main's side only with `--fresh`** the first time: an A/B's kept side was run
  with the states of its day, and says nothing of one added since.

The rules across the game are the [root AGENTS.md](../../../AGENTS.md).

- **A panel's sizes are px of the UI's reference layout**, as the page's CSS has them, at its scale (`scaled`: the
  HUD's or the lobby's, `ui/scale.ts`): every px of its style and look is written times that scale, and written
  again when it changes. Port a panel from its SCSS rule for rule: `hud(88px)` is `88`, `margin: 0 auto` in a column
  is `alignItems: 'center'` on its parent, `position: absolute; inset: 0` is `{ position: 'absolute', inset: 0 }`.
- **What CSS lays out apart from the box, the kit lays out apart too.** A text's shadows reach past its line box
  without moving anything (`say`'s picture bleeds past its box by their reach); a ring drawn by `box-shadow: 0 0 0
  1px` is a panel round it with a border and a margin of -1 (`targetFrame.ts`); an empty `div` is no line, its margin
  kept (`say('')` drops the text: shown hidden, the frame's bar stood 4 px higher than main's).
- **Text is a label of the overlay's** (`overlay/layer.ts`'s `Label`, never shown in the world): painted into its
  atlas with the canvas as the world's labels are, painted again when the atlas is emptied (a new ratio, a repack),
  and its slot handed to the engine as the panel's picture. Its box is its text's line box, as the page's.
- **Grid and block are laid out as flex** (Bulwark builds taffy's flexbox alone: its grid and block were 207 KB more of
  the wasm): a panel ported from a CSS grid is rows and columns of flex.
- **The page's own elements are over the engine's canvas**, so over every panel: a panel moved off the page goes
  under whatever of the page still overlaps it, until that moves too.
- **A change sends only what changed** (`style` and `look` compare the fields given): a look changed is painted
  again in the engine, a layout changed laid out again. Set a width each frame and the tree is laid out each frame
  it moves (the target frame's bar does, a microsecond a slot: `lab panels` in Bulwark).
- **A panel that takes presses stands for a button of the page's, kept out of sight** (`press.ts`, `.kit-mirror` in
  `_base.scss`): the engine's canvas takes the press, one let go on the panel it began on clicks the page's button,
  so its handler, its keyboard focus, its name for a screen reader and its `disabled` are the panel's, and the
  game's code and the lab press it as they did. A press on any panel that takes the pointer is never the world's
  (`overPanels` in `core/input.ts`: no attack, no look by a finger's drag; a right press still is, as over the
  page's HUD). A panel drawn in place of an element of the page's says so (`standIn`): `drawnAt` gives its box, and
  the lab's `boxOf` and `middleOf` (`tools/lab/page/lab.ts`) read and press it there.
- **A panel moved off the page can follow the page's element each frame** (`onFrame`): the choice and the badge read
  their words and classes off their hidden elements, so whatever writes those (the run, a duel, co-op) is as it was.
  Their CSS animations are stepped there (`motion.ts`: the page's clock, CSS's easing curves and keyframes, still
  under reduced motion, which the lab runs with: a fold read as not begun there left the choice's details at
  nought). The lab finishes them as it finishes the page's (`finishMotion`, `unfolded` in `uiDecision.ts`).
- **A text's line is as tall as the page's** (`lineHeight.ts`): its `line` times its size, or the font's normal line
  height read off a hidden element of the page's once a font; the canvas's box leaves out the line gap, and the
  choice's chips stood 4 px short. **A panel's words are drawn across its box**: a line wider than its words (a
  row's whole width, a key cap's least) holds them in a panel of their own, centred, or they stretch.
- **Lengths are laid out to fractions of a px** (Bulwark's taffy tree, rounding off): rounded, a 1 px border at a
  HUD's scale of 0.6 lost its top side. **A fill may go round a centre** (`radial`: CSS's `radial-gradient(circle
  at 50% y, a, b stop)`, sized by the box inside its border, as CSS sizes a background): the badge's gem.
- **A panel shows a picture painted with the canvas** (`picture(key, w, h, paint)`: a skill's icon in its slot, a
  bar's fill, the Frenzy's pips), painted again only as its key changes, so paint what changes rarely and lay out
  what changes each frame (a fill's width, a cooldown's sweep) as panels. **Paint in px of the art**: the atlas's
  context is scaled to the screen already, `scale` only for what its transform doesn't scale (a shadow's blur and
  offset); scaled again, the icons were drawn 1.28 times too large, cut at their foot. A picture stretched across a
  wider box blends its ends with the atlas's empty pixels beside it: paint it its box's size (the bars' fills were
  4 px across, faded at both ends). A picture is rounded by its panel's corners (Bulwark), and a box can be swept
  round from the top (`sweep`: CSS's `conic-gradient(c p, transparent 0)`, a cooldown's shade).
- **A panel that only shows a tip takes no press** (`tips` in `press.ts`: the skill bar's slots, whose press is
  the world's): the mouse over it is told to its page element as the mouse's own enter, move and leave, which the
  tooltip listens to. The Alt cursor over mouse look hovers and presses what a panel stands for
  (`standsForAt`: `elementFromPoint` finds the canvas), and the tutorial's ring rings a drawn box (`shownBox`).
- **A panel taken away is forgotten by the presses, tips and stand-ins** (`Panel.gone`): its id is the next panel's,
  and a bar rebuilt for touch otherwise kept the desktop's skill bar standing in for `#hotbar`. Taking it away again
  does nothing (`remove` on a panel gone): the tracker inside the minimap's column went with the column rebuilt for
  a phone's screen, and its own `remove` after took away the new column's minimap, whose id it had become.
- **A text's words are drawn across its box, so a text in a column stands at its start** (`alignSelf: 'start'`): left
  to stretch across the column, the training's and the objectives' titles were drawn twice as wide.
- **A panel's own shadow is drawn under its fill too** (CSS's `box-shadow` is outside the box alone): a see-through
  box with one reads dark; give it a ring round it instead (the training's ticked boxes).
- **CSS's `zoom` is the port's to carry**: a panel scales by the HUD's or the lobby's scale alone, so a part the page
  zoomed (the minimap's column at 0.85 on the shortest screens) multiplies its lengths and its text's sizes itself
  (`minimapZoom`, `zoomed` in `minimapColumn.ts`), offsets inside it too, as CSS zooms them.
- **What the page's CSS laid over its neighbours, the kit draws after them**: the skill bar is laid over the bottom
  bar's row in a room of its own size (as its z-index drew it over the bars' shadows), and the Frenzy over it.
- **Text wraps at its panel's width** (`say(text, style, align)`, `wrap.ts`): broken at spaces as CSS breaks it,
  each line under the last at its line height, standing left, centred or right. Its width is its parent's to give (a
  width, a share of a row, or stretched across a column): a wrapped text asks for no width of its own, as a width
  asked would hold its panel from narrowing with the window, so in a row with nothing to size it, it's 0 wide. It's
  broken again as that width changes (read after the layout, in the same frame). Left unwrapped, a line too long
  for its panel is squeezed across it (its words drawn across its box), never spilt past it: `lab kit` counts the
  lines. Its panel takes no padding of its own (put it on the parent): the picture is drawn across the box.
- **A panel scrolls** (`scrolls(panel)`, `scroll.ts`): its overflow `scroll`, so the engine clips what's inside it
  to its box and draws it moved up by its look's `scroll`; the mouse's wheel over it (never the world's zoom then)
  and a finger's drag on it move that, held within what's inside it, as CSS's flexbox reaches (each child's margin
  under it and the panel's own padding at its foot counted: without the last row's margin it stopped 10 px short).
  A finger that dragged presses nothing as it lifts (`pressDragged`).
- **A text field** (`textField(panel, input, style, placeholder)`, `field.ts`): the page's input stays on the page
  out of sight (`.kit-mirror`), holding the focus, the keys, a phone's keyboard and its name for a screen reader; a
  press on the panel focuses it at its end (`Pressable.press`, which a click of an input wouldn't), and each frame
  the panel shows its value (a password's as dots, its placeholder dimmed while it's empty) and a caret where the
  input's is while it has the focus, its words at its left half way down it.
- **A sheet's tree follows its page only when told** (`sheetDirty.ts`): a mutation in it (or of any screen's own
  element), the window, the scales, the accent, the focus, an input, a load, the hover; and the frames after one that
  sent the engine anything, till one sends nothing. Ticks and sliders follow every frame. Followed every frame, the
  pause menu cost 6.2 ms of the main thread here standing still; now every state is 0.1 to 0.2 ms
  (`npm run lab -- ui --cost`, its canary a 3 ms tick). A measure that changes the page then reads the kit steps two
  or three frames first.
- **A text not seen gives its atlas slot back** (`Panel.refreshTree`, `Label.release`): holding every text's slot,
  shown or not, the atlas was full after the bug report opened twice (the engine's fault banner).
- **A flex box is a column unless a rule says `direction`**: CSS's row's `align-items: flex-start` (its top) is
  `justify: 'start'` here. Written as `alignItems`, a modal typed into on a phone stood against the window's left edge.
- **A lifted box is hit before everything else of its screen** (`lift`, `SheetTree.elementAt`): drawn over the whole
  screen, it was tried among its siblings alone, and a later column's box under it took its press (the bug report's
  picture's tick on a phone).
- **The page's elements left on it lie over every screen the kit draws** (the village's crest): hide them while a kit
  screen or modal shows (`_base.scss`), as main's page covered them; the ghosts and the stick take no pointer there.
- **A wrapped text asks for no width** (above), so in a wrapping row beside boxes it lets them squeeze: keep it whole
  where CSS sizes it to its words (the save slots' state, Privacy), or give the row its items' drawn widths
  (`rowOf` in `cloudSheet.ts`: taffy sizes a wrapping row narrower than its items on one line).
- **An empty field lays out no line**: give it the height its words' line would (`#sd-input`), or it's a strip.
- **Runs**: a `<br>` ends its line (a word of no width, `block`); `anywhere` breaks a long word after its dots and
  signs too (CSS's `overflow-wrap: anywhere`: an email address). `b` isn't bold of itself: its rule says so.
- **A picture of the page's SVG takes its opacity from the page's style** (`svgArt`): a rule's own opacity on top
  squares it (the save slots' gear placeholders were near unseen).
- **A mark can be a bar** (`Mark.bar`: a side's border of another colour, `border-left: 3px solid var(--cc)`), and a
  screen can have a scale of its own (`uiScales.panes`: the save slots' `--z`, the lobby's times 0.8 on an upright
  tablet). A panel's width in its own px is `rect().w / uiScales[panel.scaled]` (`savesGrid.ts`).
- **The lab's node side clicks where the kit draws** (`clickDrawn`, `middleDrawn` in `node/cloudDevice.mjs`):
  Playwright's own click waits on a page element the kit keeps out of sight (`.kit-mirror` takes no pointer).
- **A tree's panels are at the tree's scale, whatever its room's** (`SheetTree.make`): a panel takes its parent's
  scale where none is given, and a bare layer's is the HUD's. The lobby's panels and the hero selection, made in a
  layer, were drawn at the HUD's scale, which is the lobby's everywhere but an upright tablet: there, at about half.
- **An element whose children are boxes is `flex`**: without it its children are runs of its words, and a picture
  or a box in it is lost (the hero selection's arrows, a name's number in its rhombus, Back's key).
- **A control takes the pointer where its rule says `hits`**, or where a box round it does: the hero selection's
  room takes none (its backdrop's beneath), so its link, arrows, names and Back each say so.
- **A picture of the page's SVG loads on the browser's time** (`svgArt`): the trees follow again as it loads, and
  the lab waits for any still loading before picturing the screen (`picturesLoaded`, `lab.screen`): a tree at rest
  never drew the hero's name or the arrows.
- **Marks can be the rule's to work out** (`marks: (element) => [...]`: a cold hero's bar, filled to his share) and a
  bar a height (a tab's line along its top, the panel's corner brackets in the hero's colour); a painted picture can
  be painted small and stretched (`Painted.size`: the hero selection's shade over the whole screen, 1/8 its size).
- **A canary planted on an element the kit draws goes through the kit** (`tools/lab/page/kitPlant.ts`, `plantLayout`):
  the kit reads no inline style and no stylesheet of the lab's, so the talk's card made twice the window's height and
  its Leave stood off the window went unseen; it lays the plant on the panel drawn for the element (`drawnFor`).
- **A list scrolled to its end by the page is held there by the kit** (`scrollToEnd` in `drawn.ts`): the page's
  `scrollTop` reached the panel a frame before its new lines were laid out, and the talk's newest line stood below
  its edge.
- **A world's pick by the canvas asks `overPanels` first** (`bindPointer` in `game/village.ts`, the floor's names,
  the keeper's mugs): a button the page drew took the press, but a drawn one leaves its target the canvas, and the
  ale's Put down over Bertram opened his talk as it put the mug down (`lab tavern --parts touch`). A page's element
  the screens are drawn over (`seeThrough`: the touch stick's pad) is the canvas's to the lab's `elementUnder` too.
- **The tooltip pinned on touch takes the pointer over a drawn modal** (`_base.scss`): a ghost under a modal takes
  none, and the trade's Offer in a pinned tooltip's foot, drawn over the window, took no tap.
- **A page's grid of areas is wrapped in the markup** (Odo's columns: `.mc-left`, `.mc-right`, `display: contents`
  on the page, whose grid takes their children as its own) and laid out as flex here.
- **A length in `vh` inside a zoomed box is the window's share in the box's own px** (Odo's stash, `40vh`): divided
  by the scale as a share of the window is elsewhere, it stood two rows short of main's.
- **A list the page scrolls to its top or end is scrolled where the kit draws it** (`scrollToTop`, `scrollToEnd`
  in `drawn.ts`): Odo's stash after Auto-fill stood scrolled past its new end, empty. The lab's `clickOn` scrolls
  where the kit draws (`revealOf`): the page's `scrollIntoView` moved nothing, and a piece below the fold lay off
  the screen.
- **What the page moves by a transform the kit reads off its style** (the map's panels' `translate` and `scaleX`,
  the hero's arrow's `rotate`, painted in steps of 3°) and its names' boxes off the page's own layout, laid out by
  `layNames` as before. A large picture is the atlas's too (the map's four panels, each its canvas): its edge blends
  with the atlas's empty pixels, so a panel's picture bleeds a pixel of its own edge past its box.
- **A canary of a style the game writes each frame refuses the write** (`uiVillageMap.ts`): a lab step runs the
  game's frame and the kit's in one task, and an observer that took the write away never ran between them.
- **A line of runs is one panel and one picture** (`RunLine`, `runLayout.ts`): its words broken at its width as CSS
  breaks a paragraph, each in its run's style, drawn as one label. A panel a word, a guide's hero page was 2,000
  panels and labels, its first frame 300 to 500 ms. The line asks its one line's width (CSS's max-content) and holds
  its widest word (min-content); the sheet gives the text's own box `maxWidth: '100%'` and its line's least width
  plus its padding and border (`acrossOf` in `sheet.ts`), or a column centring it never narrowed it (the talk's
  name plate) and a row never shrank it (a guide entry's words), and a tab shrank into its padding. A line is as tall
  as its line height, never its font's box (the name plate's two lines stood 4 px apart too far).
- **Margins collapse where a rule says `blocks`** (`sheetFlow.ts`, `marginCollapse.ts`, unit tests in
  `tools/lab/test`): the kit lays a block out as a flex column, whose margins add, and a guide page of paragraphs
  stood a sixth taller than main's. Inside such a panel each element's CSS display is read once off the page
  (`getComputedStyle`), siblings stand the larger margin apart and a first or last child's goes through a block
  nothing keeps it in. Its collapsed margins are given before the frame's style is sent, so a frame that changes
  nothing sends nothing. Only the guide's page asks for it: the other screens were ported with their margins as
  their flex layout adds them.
- **A long page is made in steps where its rule says `inSteps`** (`FIRST_A_FRAME` in `sheet.ts`, 80 elements a
  frame, its top first, beginning the frame after the panel's own first): only where what's above doesn't move as
  it fills. Over every scrolling panel, the pause menu, centred on its contents, moved for three frames as it
  filled. **At most 150 texts are painted a frame** (`PAINTS_A_FRAME` in `kitCounts.ts`), the rest the frames
  after; the lab waits for both before it reads a screen (`lab.madeWhole`, `stillMaking` in `drawn.ts`): read
  mid-build, the pause menu's buttons stood 26 px off where they're drawn.
- **A sheet's rules are found by an index** (`ruleIndex.ts`): by the last part of each selector (its id, a class,
  its tag), so an element is tested against the rules that could match it alone; the same rules as testing every
  one over 13,216 elements. A box read while a tree follows its page is as last laid out (`holdLayout` in
  `engine/ui.ts`): each read after a change laid the whole tree out again, 143 ms of a guide page's first frame.
- **A page's box not laid out yet is asked for again** (`readUnlaid`, `takeUnlaid` in `sheetDirty.ts`): a width
  read off a box the engine hasn't laid out is 0, and the tree follows again the next frame (the guide's tiles stood
  0 px wide after a page opened).
- **An SVG's paint is written on its clone, each element's as computed, but a gradient's** (`paintOn` in
  `svgArt.ts`): computed, `url(#id)` names the page's whole address, which an image drawn alone can't reach, and the
  pause menu's title lost its steel, its glow drawn alone.
- **A rule's match is cached by its element's key and its parents'** (`rulesOf` in `sheet.ts`): a `:has()` on
  what's inside a kept element (`.modal-box:has(.coop-pages)`) keeps the answer it first had, and Play together's
  box filled the window in a room. Ask such a question in a box function (`box: (element) => ...`, a
  `querySelector` inside), which runs each frame. **The later rule wins, never the more specific**: order a port's
  rules as CSS's specificity orders them (the room's code in its head stood at the plain code's size).
- **A word box holds its widest word** (`sayWords`: `minWidth` its line's least, `maxWidth: '100%'`): beside a link
  in a wrapping row, an intro's words ran past their column. A line of a lone `&nbsp;` trims to nothing and lays out
  no height: give it its line's (`.coop-friend-note`), or what's under it moves as it fills.
- **A lab canary plants rules in a sheet's tree** (`SheetTree.plant(rules)`, which returns the call that takes them
  out; every element matched afresh): Play together's are `plantInCoop` (`ui/coopSheet.ts`, found by the lab by its
  path, `tools/lab/page/coopPlant.ts`).
- **Check a panel against main's page with `npm run lab -- ui --states <state> --ab`**: its box's lines and its
  pictures beside main's (`ui --states target`: the frame's box 384x52 at 113 on both, its name and line read off
  the engine's frame where the tree has it, off `#target` on main's).
