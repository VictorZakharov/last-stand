# `src/ui/kit`

The game's UI drawn by the engine, not the page (#973: the panels move off the page one at a time). `panel.ts` is the
kit: a `Panel` is a box in a tree, laid out as CSS's flexbox lays one out (`PanelStyle`), painted by its look
(`PanelLook`: a fill or a fill from top to bottom, a border, rounded corners, an opacity, a shadow, a scroll), holding
other panels or a line of text (`say`). The engine lays the tree out and draws it in one call over its frame, after
the world's labels (Bulwark's `ui.rs` and `gpu/panels.rs`, the page's calls in `engine/ui.ts`). Moved onto it so far:
the run's target frame (`ui/targetFrame.ts`).

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
- **Check a panel against main's page with `npm run lab -- ui --states <state> --ab`**: its box's lines and its
  pictures beside main's (`ui --states target`: the frame's box 384x52 at 113 on both, its name and line read off
  the engine's frame where the tree has it, off `#target` on main's).
