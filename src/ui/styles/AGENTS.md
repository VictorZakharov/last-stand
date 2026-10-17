# `src/ui/styles`

The stylesheets: SCSS partials imported by `index.scss`. The loading screen's styles stay inline in `index.html`, to paint before the bundle.

The rules across the game are the [root AGENTS.md](../../../AGENTS.md).

## Gotchas

- Styles are SCSS in `src/ui/styles/`: one partial per area (`_hud.scss`, `_lobby.scss`, `_modals.scss`...), imported by `index.scss` in cascade order (later files override earlier ones; a moved rule can change what wins). Use the theme (`_theme.scss`: colours named by role, not by hue, so a theme change stays in that file; surfaces; `ui()` / `hud()` / `touch()` scale helpers) and the mixins (`_mixins.scss`: frame, gem, corner brackets, diamond rule, section heading) instead of copying values: plain colours as `var(--frame)`, translucent ones as `rgba($frame, .35)`. The loading screen's styles stay inline in `index.html`. UI scales via the `--ui` variable. Honour `prefers-reduced-motion` for decorative animation.
- **Cursors are the theme's:** `cursor: $cursor-hand` over what takes a click or a drag, `$cursor` where a control shows none (disabled), never a keyword (`pointer`, `grab`, `default`, `help`, `copy`): those show the system's cursor. Their art is inline in `index.html` (`src/ui/AGENTS.md`); a style set from code uses the property (`var(--cursor-hand)`).
- **Don't scale a centred box in or out** (the modals' `pop` is a fade alone): centred, its position falls on a fraction of a pixel, which a transform draws as it is, and as the transform ends the box jumps up to a whole pixel, a visible 1 px shift. Measure with the pause probe: the box a frame before its animation ends against it at rest.
