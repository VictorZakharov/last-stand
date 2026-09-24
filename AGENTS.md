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
- **The UI must fit any screen size, desktop and mobile.** Anything that overflows or overlaps at some viewport size is a bug.
  - Scale: `--ui` for the lobby and modals, `--hud` for the in-run HUD, `--touch` for the touch controls (all set in `src/ui/scale.ts`).
  - Layouts: on desktop the lobby is a CSS grid `[left | center loadout | right]`. Short screens (phones held sideways, height ≤ 520) and upright tablets show one panel at a time, picked from `#lobby-rail`, and the camera view shifts so the character stays beside the panel (`lobbyViewShift`). Phones held upright get a "turn your device" overlay.
  - Check desktop at 1024×700 and 1920×1080, a phone at 844×390 and a tablet at 1180×820 and 820×1180 (Playwright with `isMobile` + `hasTouch`).
- **Installable, offline (PWA):** `public/manifest.webmanifest` plus a build plugin (`scripts/pwa.ts`, production builds only).
  - Install: Chrome and Edge fire `beforeinstallprompt`, and the lobby's Install link opens it. Safari (iOS) and Firefox never fire it, so on phones and tablets the link is always shown (unless already running installed) and opens `#install`, the add-to-home-screen steps for that platform.
  - The plugin renders the PNG app icons from `public/icon.svg` at build time (no binary assets in the repo) and writes `dist/sw.js`, which precaches every built file.
  - The worker's cache name is a hash of the build, so each deploy installs its own cache. `src/ui/pwa.ts` registers the worker, shows the Install link and offers a reload (lobby only) when a new version is waiting.
  - The worker serves cache-first. Production's scope contains the PR previews, so it skips `pr-preview/` paths (each preview registers its own).
  - Test offline behaviour with `npm run build` + `vite preview`: the dev server has no worker.
- **Touch** (`src/ui/touch.ts`): touch mode (`body.touch`, `input.touchMode`) follows the last pointer used, and the browser's emulated mouse events are ignored in it.
  - Controls: a move stick on the left half and the skill buttons on the right. Tap casts at the nearest foe; drag aims by hand and casts on release. The basic attack and channels act while held.
  - Everything hover-only needs a touch path. Tooltips open on tap (`bindTooltip`); items open an action sheet (`openItemSheet`); skills are bound by tapping a key and then the skill. Drag and drop and Shift are desktop extras.

## Architecture

| Path | Contents |
| --- | --- |
| `src/types.ts` | Shared types: data definitions (`SkillDef`, `ClassDef`, `EnemyDef`, `Item`...) and runtime (`Model`, `Effect`...) |
| `src/data/` | Pure tuning data typed against `types.ts`: classes & skills, enemies, biomes (roster, boss per biome), items/affixes, waves, `balance.ts` (camera, arena, run constants) |
| `src/combat/skills/` | Skill behaviours, registered in `index.ts` (`SKILL_IMPLS`) and referenced from class data by `impl` name. Instant: `cast()`. Channel: `start/tick/stop` with a typed state object. Use `Needs<'field'>` to require optional `SkillDef` tuning fields |
| `src/entities/models/` | Procedural models, registered in `index.ts` (`MODELS`); `rig.ts` = shared humanoid skeleton + pose helpers |
| `src/game/run.ts` | Wave flow, scoring, loot rolls, bank / continue |
| `src/world/` | `arena.ts` builds every biome at boot and switches between them; one builder per biome (`crypt.ts`, `forest.ts`), shared pieces in `props.ts` |
| `src/loot/` | Item generation (base names and excluded stats per class), persistent profiles, one per class (`localStorage` `last-stand.profile.<classId>.v1`; the pre-class `last-stand.profile.v1` migrates to the mage), the lobby's class (cookie `last-stand-class`), skill loadout (cookie `last-stand-loadout-<classId>`; a class with gear-driven skills keeps one per weapon style, `last-stand-loadout-<classId>-<style>`) |
| `src/fx/` | CPU particle pools, a fixed pool of 8 point lights (`lights.ts`), transient effects (`effects.ts`) |
| `src/core/` | Renderer + post chain, input, audio, procedural textures & materials, game-time scheduler (`timers.ts`) |
| `src/ui/` | DOM HUD, lobby/menus, tooltips, loadout editor, item icons (inline SVG), attributes |
| `src/vendor/cape/` | Vendored cape-physics PBD solver + shims. Keep the solver files unmodified (see its README); adapt in `entities/models/cape.ts` and the shims |
| `src/state.ts` / `src/events.ts` | Typed global state `G` and a typed event bus |

**Adding a class:** a data file in `src/data/classes/` registered in its `index.ts`, a model in `entities/models/`, and skills in `combat/skills/`. Class data also sets the lobby accent, the loadout panel title, the cast-point light and item base names; give new bases an icon in `ui/itemIcons.ts` and the class an equipment silhouette (`#equip .doll[data-class]` in `index.html`). Classes share no progress: each has its own profile. Switching class in the lobby rebuilds the `Player`, and `game/warmup.ts` builds every other class model at boot so that compiles nothing.

**Adding a biome:** an entry in `data/biomes.ts` (enemy pool, boss, minimap), a builder in `world/` registered in `arena.ts`, and its enemies in `data/enemies.ts` with models in `entities/models/`.

## Gotchas

- **NaN means black lines or boxes on screen.** Bloom smears NaN/Inf pixels across the frame. Known causes: GLSL `smoothstep(a, b, x)` with `a >= b` (it's undefined, so write `1.0 - smoothstep(b, a, x)`), and `atan(0, 0)`. `renderer.ts` has a sanitize pass before bloom as a safety net; still fix the source.
- **Point lights:** use the pooled slots in `fx/lights.ts`. Never add ad-hoc `PointLight`s, because changing the light count recompiles every shader.
- **Shaders compile at load, never mid-game.** `core/shaders.ts` pins every compiled program (three.js would delete it when its last material is disposed) and `game/warmup.ts` renders one of every enemy, effect, drop and skill visual at boot. A skill with its own materials must return sample meshes from its `warm()` hook. The perf overlay (pause menu) shows `Shaders N (+M)`: M must stay 0 during play, and the copied report says what compiled late.
- **Loading screen:** `#loading` (markup, SVG logo and styles) is inline in `index.html` so it paints before the bundle. The game renders behind it but only advances once it fades (`revealed` in `main.ts`), so the lobby intro is seen. Tips are in `data/tips.ts`. Its exit (`ui/logoWind.ts`) snapshots the SVG letters (the font is inlined, since an SVG image can't load web fonts) onto the device pixel grid, turns every pixel into a WebGL point, blows them away and gathers them into the lobby logo (`#menu .logo-art`, kept hidden until then). The motion is closed-form in the vertex shader. No copy of a logo is ever shown at rest, so the two never visibly swap: a point is drawn only once the wind lifts it (the real letters are clipped away just behind the front), and landing points take the colours of a snapshot of the lobby logo, which is then uncovered left to right under them. It scales to the device: touch and low-end machines get a ~120k point budget (a coarser snapshot and a 2× canvas) instead of 1.5M. A watchdog cuts it short when the first frames run under ~20 fps, and remembers that (`last-stand.logo-wind-off`). It falls back to a plain fade with reduced motion, Low graphics quality, or after the watchdog tripped.
- **Quality presets** (`data/quality.ts`, pause menu, Auto by default) change pixel ratio, MSAA, shadow map size and which small character parts cast shadows, all live and without shader changes. Keep new settings in that category, or they cause compile hitches when switched.
- **Static shadow casters are baked:** `bakeStaticShadows()` in `world/props.ts` merges every non-instanced caster of a biome into one shadow-only mesh. Arena props must not move after the arena is built.
- **Biomes:** every biome is built at boot into its own group, and switching only toggles visibility and sets the shared lights, fog and environment (`BiomeLook`), so it's instant. Each biome must add exactly **6 point lights** (a different count recompiles every lit shader; dev builds log an error), keep the central dais footprint (`world/ground.ts` is shared with the cape worker) and the four gates at the same angles. Boot warms up the lobby in every biome. The lobby choice is a cookie (`last-stand-biome`); Random rolls a biome when a run starts.
- **Cape:** the cloth steps in a web worker (the solver's own `WebGlCapeWorkerPool`); the main thread applies the latest result, shifted onto the current neckline to hide the round trip. Without workers it steps on the main thread within a per-frame budget, so a slow frame can't snowball into more catch-up steps. `SkeletonCape.update` must call `sim.syncGeometry()` after new particle positions arrive, or the cape freezes at spawn. The floor shim imports `world/ground.ts` directly (a worker shares no state with the page). Colliders are capsules built from rig joints in each class model (`models/mage.ts`, `models/warrior.ts`).
- **Lobby sandbox:** in the lobby `player.sandbox = true` (free casting, no costs or cooldowns). `start()` clears it.
- **Gear-driven skills and block:** `Player.gear` comes from the equipped items: weapon base, two-handed (`ClassDef.twoHanded`), shield (an off-hand with Block Amount), and a weapon in the off-hand (`ClassDef.dualWield`: a one-hander fits the off-hand slot, and its implicit counts at `OFFHAND_WEAPON`). Each weapon style (shield, two-handed, dual, one-handed) has its own loadout (`loot/loadout.ts` `weaponStyle`); changing style loads that style's, and a style not set up yet starts from the class defaults fitted to the gear. With two weapons the model's swings alternate hands, and `tip` moves to the swinging weapon. `Model.setGear` shows it, and `profile.equipFromStash` never lets a two-hander and an off-hand be equipped together. A skill with `needs: 'shield'` (or `'twoHanded'`) gives way to its `fallback` for the gear held (`Player.skillAt`), and the lobby dims it in the skill book while the gear doesn't allow it (`Player.usable`). Blocking is in `Player.tryBlock`: a per-hit chance with a recovery (`BLOCK` in `data/balance.ts`), or every frontal hit while a skill with `block` is channelled, until a hit bigger than that breaks the guard and staggers the player (`guardBroken`, `staggered`: move only). Melee skills draw their trail through the weapon tip (`skills/cleave.ts` `swingArc`), so keep the model's swing timing in step with it.
- **Enemy navigation** (`world/navigation.ts`): obstacles are circles (`Obstacle`). Enemies walk straight at the player while the line is clear (with `MARGIN` to spare), else along a flow field: a Dijkstra from the player over a 0.5m clearance grid, one per size class, rebuilt at most one per frame. Every movement goes through `seek` in `enemyAI.ts`, which bends it round obstacles ahead (`steerClear`), so enemies curve round props instead of touching them. Ranged enemies and bosses only fire with a clear shot and walk round the obstacle otherwise. New obstacles need nothing more than an entry in the biome's `obstacles`.
- **Views** (V, runs only, not touch): `core/renderer.ts` has top-down, third and first person, gliding between them. The close views lock the pointer for mouse look while a wave is on (`wantPointerLock` in `core/input.ts`, taken while the last key press or click still counts as a user gesture, else on a click) and aim at the crosshair (`input.centerAim`): the foe under it, else the floor, else a point `aimRange` ahead. Losing the lock mid-wave pauses. In first person the body is hidden and faces where the camera looks (`lookFacing`), so melee arcs and blocking follow the view.
- **Cooldowns are per skill id**, shared by every key the skill is bound to (the same spell may sit on several keys).
- **Asset paths:** Vite `base` is `./`. In `index.html` reference assets root-absolute (`/favicon.svg`) so Vite rewrites them; `check:pages` fails on paths that would break under `/last-stand/pr-preview/pr-N/`.
- Three.js 0.185: use `THREE.Timer` (not `Clock`) and `PCFShadowMap` (not `PCFSoftShadowMap`). Both old forms log deprecation warnings.
- **Dev hooks:** in dev builds, `window.__G` (game state) and `window.__dev.spawnEnemy` are exposed for scripted testing and screenshots (stripped from production). Spawn enemies well away from the player (near the arena edge) or the player dies before the shot.

## Style

- TypeScript strict. Keep data (`src/data`) separate from behaviour, and type new data against `types.ts`.
- Match surrounding code: short header comment per file, sparse comments explaining *why*, compact one-line helpers where the file already uses them.
- CSS lives in `src/ui/style.css`, and UI scales via the `--ui` variable. Honour `prefers-reduced-motion` for decorative animation.
