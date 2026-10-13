# `tools/icons`

The skill icons' tool (`README.md`): `sheet` shows every class's icons at a slot's size, `check` measures each one's fit in the round touch buttons, and `add` makes an original into an icon. What a new icon must match is the Skill icons gotcha in `src/ui/skillArt/AGENTS.md`.

The rules across the game are the [root AGENTS.md](../../AGENTS.md).

- Judge a candidate in its place before adding it: `sheet --try <impl>=<picture>`.
- `add` pads a picture exactly on a black background; an original with anything round its subject needs painting again, not cropping.
