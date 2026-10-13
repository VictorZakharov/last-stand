# `src/data`

Pure tuning data, typed against `types.ts`, with no behaviour: keep it so.

The rules across the game are the [root AGENTS.md](../../AGENTS.md); each directory under this one has an AGENTS.md of its own.

- `balance.ts`: the global knobs (the camera, the arena, the run, block, the damage numbers' colours).
- `classes/`: the playable classes. `enemies.ts`: the foes (`ai` picks a behaviour in `entities/enemyAI.ts`, `model` a builder in `entities/models/`; stats at wave 1, `SCALING` for their growth).
- `biomes.ts`: each biome's enemy pool, boss, minimap, surfaces and music. `waves.ts`: how a wave is made from its budget, and the loot rules.
- `items.ts`: slots, rarities, stats and affixes. `quality.ts`: the graphics presets (none changes a shader). `music.ts`: where each track loops and how the music fades. `tips.ts`: the loading screen's tips.

How a wave comes in is `src/game/AGENTS.md`; the quality presets, `src/core/AGENTS.md`; adding a class or a biome, the root's Architecture.
