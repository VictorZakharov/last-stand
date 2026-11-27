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
`netLogPanels.ts`), the chat (`ui/chatPanels.ts`) and the touch controls (`ui/touchPanels.ts`).
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
- **Check a panel against main's page with `npm run lab -- ui --states <state> --ab`**: its box's lines and its
  pictures beside main's (`ui --states target`: the frame's box 384x52 at 113 on both, its name and line read off
  the engine's frame where the tree has it, off `#target` on main's).
