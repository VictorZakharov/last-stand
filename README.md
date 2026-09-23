# Last Stand

[![Deploy GitHub Pages](https://github.com/VictorZakharov/last-stand/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/VictorZakharov/last-stand/actions/workflows/deploy-pages.yml)

A 3D wave-survival action RPG that runs in your browser. Hold the arena against endless waves, and after **every** wave make the call: **bank your spoils** and walk away, or **push on** for better loot — knowing that if you fall, everything you haven't banked is lost.

**[▶ Play in your browser](https://victorzakharov.github.io/last-stand/)**

Everything is procedural: models, animation, textures, VFX and sound are generated at runtime. There are no downloaded models, textures or audio files.

![Fighting in the arena](docs/screenshots/combat.png)

| Lobby: equipment, stash & spell loadout | Wave cleared: bank or continue? |
| --- | --- |
| ![Lobby](docs/screenshots/lobby.png) | ![Wave cleared](docs/screenshots/wave-cleared.png) |

## How to play

- Pick a battleground in the lobby, the **Crypt** or the **Forest** (or the dice for a random one each run). Each has its own enemies.
- Start a run at any wave up to your best one beaten in that battleground (the lobby defaults to it), so you can jump straight back to where you left off. On Random, the range is the waves beaten in every battleground.
- Survive each wave inside the arena. Every fifth wave, a boss arrives: the **Colossus** in the Crypt, the **Thornheart** in the Forest.
- After every wave, choose:
  - **Bank** — leave the arena and move everything you picked up into your stash, or
  - **Continue** — face a harder wave with better loot (you recover 25% health).
- If you die, **all unbanked spoils are lost**.
- Equip what you find between runs; items roll random affixes across five rarities.

### Controls

| Input | Action |
| --- | --- |
| `W A S D` | Move |
| Mouse | Aim |
| Left click | Splintering Bolt — seeking arcane bolts that split on impact |
| Right click | Starfall — crystal meteors crash onto the target area |
| `1` (hold) | Void Lance — channeled piercing beam |
| `2` | Glacial Nova — freeze everything around you |
| `3` | Maelstrom — roaming vortex that pulls enemies in and shocks them |
| `4` | Arcane Aegis — damage-absorbing ward |
| `Q` | Healing Draught |
| Mouse wheel | Zoom |
| Middle mouse (hold and drag) | Rotate the camera |
| `B` / `C` | Bank / Continue after a wave |
| `Esc` | Pause |

Spells can be **remapped in the lobby**: drag a spell from the spellbook onto any key (the same spell may sit on several keys), drag keys onto each other to swap. The loadout is saved in a cookie. You can also walk around and try every spell for free in the lobby.

## The Mage

The first playable class. Robes, skirt panels and staff are animated procedurally; the cape is a real position-based-dynamics cloth simulation that collides with the animated body, using the solver from [cape-physics](https://github.com/VictorZakharov/cape-physics).

## Tech

- [Three.js](https://threejs.org/) 0.185 with an HDR post-processing chain (bloom, tone mapping, grading)
- TypeScript (strict) + [Vite](https://vite.dev/)
- Procedural textures (cobblestone, slabs, runes), procedural humanoid rigs and animation, CPU particles, pooled dynamic lights
- WebAudio-synthesized sound effects

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run build      # type-check + production build into dist/
```

### Project layout

| Path | Contents |
| --- | --- |
| `src/data/` | Tuning data: classes & skills, enemies, biomes, items, waves, balance |
| `src/combat/skills/` | Skill behaviors, referenced by name from class data |
| `src/entities/` | Player, enemies, enemy AI, procedural models (`models/`) |
| `src/game/run.ts` | Wave flow, scoring, loot rolls, bank / continue |
| `src/world/` | The biome arenas (`crypt.ts`, `forest.ts`), shared props, collision |
| `src/fx/` | Particles, effects, pooled lights |
| `src/loot/` | Items, persistent profile (stash / equipment), spell loadout |
| `src/ui/` | HUD, menus, tooltips, loadout editor |
| `src/vendor/cape/` | Vendored cape-physics solver and its web worker (see its README and LICENSE) |

**Adding a class:** create a data file in `src/data/classes/`, register it in `src/data/classes/index.ts`, add a model in `src/entities/models/`, and implement any new skills in `src/combat/skills/`.

## Feedback

This is an early build — feedback, bug reports and ideas are very welcome in [Issues](https://github.com/VictorZakharov/last-stand/issues). To contribute code, see [CONTRIBUTE.md](CONTRIBUTE.md).

## License

[MIT](LICENSE). Includes the cape solver from [cape-physics](https://github.com/VictorZakharov/cape-physics) by Victor Zakharov (MIT, see [src/vendor/cape/LICENSE](src/vendor/cape/LICENSE)).
