# AGENTS.md

Guide for coding agents working on **Last Stand**, a browser 3D wave-survival ARPG (Three.js + TypeScript + Vite). `README.md` is the player/contributor overview; this file covers the things that aren't obvious from the code.

## Commands

```bash
npm install
npm run dev          # Vite dev server, http://localhost:5173
npm run typecheck    # tsc --noEmit (strict)
npm run build        # typecheck + production build into dist/
npm run check:pages  # after build: every asset path must work under the Pages base path
```

There is no test suite. Verify changes with `npm run build` and by playing the dev build in a browser.

## Workflow

- **Every change goes through a PR** from a branch off `main`; never push to `main` directly. Each PR gets a live preview at `https://victorzakharov.github.io/last-stand/pr-preview/pr-N/` (sticky PR comment), forks included: `pr-preview-build.yml` builds the PR with a read-only token, then `pr-preview.yml` (a `workflow_run`, always the copy on `main`) checks the artifact's PR number against the API and publishes it. Never run PR code in `pr-preview.yml`. Fork runs need the maintainer's approval on every push (repo setting "all external contributors"), so nothing from a fork publishes unseen. Merging to `main` deploys production (`deploy-pages.yml`).
- **`main` is protected:** PRs only, merged with a merge commit (squash and rebase merges are disabled), and the branch must be up to date. **PR branches must be linear:** `git rebase origin/main` to update, never merge `main` into a branch. The `branch-policy.yml` check fails any PR containing merge commits. Merged branches are deleted automatically.
- Pages is served from an aggregated `gh-pages` branch: production at the root, open PR previews under `pr-preview/`. Don't switch Pages to "GitHub Actions only" and don't delete that branch.
- Keep PRs focused on one feature.
- **Prompt starts with `new issue:`** (fork workflow): run `scripts/issue.sh "title" "description"` with a title and description you write from the prompt, then do the work on the branch it creates. When done, run `scripts/commit.sh "PR title" "PR description"` instead of committing yourself, and reply with the PR link.

## Product rules

- **Core loop:** after *every* wave the player chooses Bank (keep all loot, leave) or Continue (harder wave, better loot). Dying loses all unbanked loot. Don't change this without being asked.
- **Everything is procedural.** No downloaded models, textures or audio: geometry, canvas textures, rigs/animation, VFX and WebAudio sfx are generated at runtime. Don't add binary assets (screenshots in `docs/` are the exception).
- **Originality:** this is open source. Skill, item, enemy and class names must be original. No Grim Dawn (or other game) names, trademarks or assets.
- The game is class-agnostic by name ("Last Stand"). More classes are planned, so keep class-specific code in class data, models and skills, not in the shared systems.
- **The UI must fit any screen size.** Anything that overflows or overlaps at some viewport size is a bug. Scale uses `--ui` (see `src/ui/scale.ts`), and the lobby is a CSS grid `[left | center loadout | right]`. Check small (1024×700) and large (1920×1080) viewports.

## Architecture

| Path | Contents |
| --- | --- |
| `src/types.ts` | Shared types: data definitions (`SkillDef`, `ClassDef`, `EnemyDef`, `Item`...) and runtime (`Model`, `Effect`...) |
| `src/data/` | Pure tuning data typed against `types.ts`: classes & skills, enemies, items/affixes, waves, `balance.ts` (camera, arena, run constants) |
| `src/combat/skills/` | Skill behaviours, registered in `index.ts` (`SKILL_IMPLS`) and referenced from class data by `impl` name. Instant: `cast()`. Channel: `start/tick/stop` with a typed state object. Use `Needs<'field'>` to require optional `SkillDef` tuning fields |
| `src/entities/models/` | Procedural models, registered in `index.ts` (`MODELS`); `rig.ts` = shared humanoid skeleton + pose helpers |
| `src/game/run.ts` | Wave flow, scoring, loot rolls, bank / continue |
| `src/loot/` | Item generation, persistent profile (`localStorage` `last-stand.profile.v1`), spell loadout (cookie `last-stand-loadout-<classId>`) |
| `src/fx/` | CPU particle pools, a fixed pool of 8 point lights (`lights.ts`), transient effects (`effects.ts`) |
| `src/core/` | Renderer + post chain, input, audio, procedural textures & materials, game-time scheduler (`timers.ts`) |
| `src/ui/` | DOM HUD, lobby/menus, tooltips, loadout editor, item icons (inline SVG), attributes |
| `src/vendor/cape/` | Vendored cape-physics PBD solver + shims. Keep the solver files unmodified (see its README); adapt in `entities/models/cape.ts` and the shims |
| `src/state.ts` / `src/events.ts` | Typed global state `G` and a typed event bus |

**Adding a class:** a data file in `src/data/classes/` registered in its `index.ts`, a model in `entities/models/`, and skills in `combat/skills/`.

## Gotchas

- **NaN means black lines or boxes on screen.** Bloom smears NaN/Inf pixels across the frame. Known causes: GLSL `smoothstep(a, b, x)` with `a >= b` (it's undefined, so write `1.0 - smoothstep(b, a, x)`), and `atan(0, 0)`. `renderer.ts` has a sanitize pass before bloom as a safety net; still fix the source.
- **Point lights:** use the pooled slots in `fx/lights.ts`. Never add ad-hoc `PointLight`s, because changing the light count recompiles every shader.
- **Shaders compile at load, never mid-game.** `core/shaders.ts` pins every compiled program (three.js would delete it when its last material is disposed) and `game/warmup.ts` renders one of every enemy, effect, drop and skill visual at boot. A skill with its own materials must return sample meshes from its `warm()` hook. The perf overlay (pause menu) shows `Shaders N (+M)`: M must stay 0 during play, and the copied report says what compiled late.
- **Loading screen:** `#loading` (markup, SVG logo and styles) is inline in `index.html` so it paints before the bundle. The game renders behind it but only advances once it fades (`revealed` in `main.ts`), so the lobby intro is seen. Tips are in `data/tips.ts`. Its exit (`ui/logoWind.ts`) snapshots the SVG letters (the font is inlined, since an SVG image can't load web fonts) onto the device pixel grid, turns every pixel into a WebGL point, blows them away and gathers them into the lobby logo (`#menu .logo-art`, kept hidden until then). The motion is closed-form in the vertex shader, and it falls back to a plain fade.
- **Quality presets** (`data/quality.ts`, pause menu, Auto by default) change pixel ratio, MSAA, shadow map size and which small character parts cast shadows, all live and without shader changes. Keep new settings in that category, or they cause compile hitches when switched.
- **Static shadow casters are baked:** `bakeStaticShadows()` in `world/arena.ts` merges every non-instanced arena caster into one shadow-only mesh. Arena props must not move after the arena is built.
- **Cape:** the cloth steps in a web worker (the solver's own `WebGlCapeWorkerPool`); the main thread applies the latest result, shifted onto the current neckline to hide the round trip. Without workers it steps on the main thread within a per-frame budget, so a slow frame can't snowball into more catch-up steps. `SkeletonCape.update` must call `sim.syncGeometry()` after new particle positions arrive, or the cape freezes at spawn. The floor shim imports `world/ground.ts` directly (a worker shares no state with the page). Colliders are capsules built from rig joints in `models/mage.ts`.
- **Lobby sandbox:** in the lobby `player.sandbox = true` (free casting, no costs or cooldowns). `start()` clears it.
- **Cooldowns are per skill id**, shared by every key the skill is bound to (the same spell may sit on several keys).
- **Asset paths:** Vite `base` is `./`. In `index.html` reference assets root-absolute (`/favicon.svg`) so Vite rewrites them; `check:pages` fails on paths that would break under `/last-stand/pr-preview/pr-N/`.
- Three.js 0.185: use `THREE.Timer` (not `Clock`) and `PCFShadowMap` (not `PCFSoftShadowMap`). Both old forms log deprecation warnings.
- **Dev hooks:** in dev builds, `window.__G` (game state) and `window.__dev.spawnEnemy` are exposed for scripted testing and screenshots (stripped from production). Spawn enemies well away from the player (near the arena edge) or the player dies before the shot.

## Style

- TypeScript strict. Keep data (`src/data`) separate from behaviour, and type new data against `types.ts`.
- Match surrounding code: short header comment per file, sparse comments explaining *why*, compact one-line helpers where the file already uses them.
- CSS lives in `src/ui/style.css`, and UI scales via the `--ui` variable. Honour `prefers-reduced-motion` for decorative animation.
