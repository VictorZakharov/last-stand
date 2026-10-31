# WebGPURenderer and the meshlet pipeline: what a move would take

Asked when three r187 (#330) brought GPU-driven meshlet drawing (`MeshletDrawingPipeline`,
`VisibilityBufferDrawingPipeline`, mrdoob/three.js#35191, merged 2026-10-29). These pipelines run only on
`WebGPURenderer`. Its WebGL backend falls back to the standard pipeline. It began as an estimate (three 0.185.1
on `main`, 2026-10-30), and the port began the same evening on #330's three 0.187.

## Load times against WebGL (2026-10-31)

The aim: a WebGPU boot as quick as WebGL's, or quicker. `npm run stalls -- --scenario boot --rounds 2 --url
"this?renderer=webgpu,this"` (the same build both ways, in turns, the forest; the machine the agent's alone):

| Forest, mage, two rounds (median, range) | WebGPU | WebGL |
| --- | --- | --- |
| A first visit: the lobby shown | 9.10 s (9.10–9.94) | 9.01 s (9.01–10.50) |
| A first visit: the fight warm | 15.20 s, behind the lobby | 19.15 s, after Start (its bar 1.75 s) |
| A first visit: the lobby's fewest frames a second | 30 (30–34) | 67 (67–93) |
| A return: the lobby shown | 6.92 s (6.92–6.94) | 5.21 s (5.21–5.72) |
| A return: its "Conjuring spells" step | 2.26 s | 1.10 s |
| A return: the fight warm | 12.26 s | 9.88 s |
| A return: the lobby's fewest frames a second | 41 (41–43) | 104 (104–122) |
| The lobby's frame, JS (`--scenario lobby --js`, 15 s) | about 10 ms | about 5.7 ms |
| The lobby's draws a frame | 288 | about 300 |

A first visit's lobby shows as soon as WebGL's, and its fight is warm behind the lobby where WebGL's waits for
Start; a return still trails by 1.7 s, its compiles Chrome's DXC working again through every shader (below), and
the lobby's frames a second stay low while the fight compiles behind it.

**Where a WebGPU boot's time went:** Chrome's DXC compiling WGSL that three wrote out large, and the pipelines made
one slice at a time. `--dawn` (stalls) traces Dawn's own work by step: `CompileShaderDXC`, Tint's HLSL writer,
`CreatePipelineAsyncEvent`.

- **The point lights in one loop** (`DynamicLighting`, `core/webgpu.ts`): three wrote each point light casting no
  shadow out in full in every lit shader, the physical model's every term eight times over: 55 kB of WGSL a lit
  fragment shader, 3.5 MB of the 4.6 MB the boot made. three's `DynamicLighting` lights them in a loop over a
  uniform array, as WebGL's `loopPointLights` does. A first visit's lobby 11.2 to 8.9 s, its fight's bar 6.9 to
  3.2 s. `?lights=each` for three's own.
- **One rig of point lights** (`rigPointLights`): WebGPU keys every lit pipeline by its lights' ids, so each biome
  and the hall had a copy of every lit pipeline. The biomes' lights are hidden and a rig of ten mirrors the shown
  biome's each frame. The hero's lights are kept for good (`heroLights`).
- **Chrome forgets the shaders between visits.** It keeps about 6 MB of a page's compiled WebGPU shaders in memory
  and drops the oldest first: `npm run stalls -- --scenario webgpu-cache` (a page of the tool's own, made again on
  every reload) had 8 pipelines served from the cache on a return, 40 or more none. The game made 29 MB of them,
  so a return compiled everything again. So the fight is compiled as the loading screen leaves on every visit, and
  the levers are ours: fewer shaders, and compiled faster.
- **Fewer shaders:** the crowd's material reads where its looks and glow lie in a body's row from uniforms, not
  constants (`crowdNodes.ts`): 43 vertex shaders alike but for them are one, the boot's distinct vertex shaders 170
  to 98.
- **Longer compile slices while loading:** three's async compile works 8 ms before it yields a frame, which left
  Chrome's compilers a third busy (raising its 16 pipelines in flight to 64 changed nothing). A Vite transform of
  its one line (`vite.config.ts`, production builds) reads the slice from the game (`compileSlice`): 40 ms under the
  loading screen and the fight's loading bar, 8 in the lobby. A return's lobby 7.1 to 6.6 s, its fight's bar 2.1 to
  1.3 s.

**A return's lobby compile** (`npm run stalls -- --scenario boot --dawn`, its "Conjuring spells" step, 2.06 s): 66
shaders compiled by DXC again (4.0 s of the GPU process's threads, about two at a time, 61 ms each), 0.39 s of them
on its main thread (pipelines made at a draw, not by `compileAsync`), and about 1.5 s of three building nodes on the
page's main thread with 0.6 s of collecting garbage. WebGL's step is 1.10 s, its programs read back from ANGLE's
cache. The other biomes already compile behind the lobby; what's left before it shows is the shown biome, the
hero, and every skill effect and drop, which the lobby's free casting may draw at once. Tried: the samples (the
shots' cores, the drops, the swing trail, the hero's skills) warmed as the fight's first part instead, as the loading
screen left. The return's step read 2.36 s (2.26 before; WebGL's 1.26, 10% over its last run), so they aren't
what it compiles, and the change went: what is, is listed below (`--builds`).

**What a boot compiles** (`npm run stalls -- --scenario boot --builds --url "this?renderer=webgpu"`: each step's node
builds, new shaders and WGSL, from a record the game keeps behind `?builds`). A return's "Conjuring spells" made
1,338 node builds, 83 new shaders and 927 kB of WGSL in 478 ms of JS: the lit materials' fragment shaders, about
16 kB each, one pair for each combination of what sets a material apart (its maps, skinned, instanced, its colours,
its sides, transparent, alpha test, flat, shadows received; `features` in the record). The mage's 13 shaders (191
kB) and the forest's 12 (180 kB) led. Giving every lit material the same maps (a 1 px white one where it has none, a
flat normal) would merge only 5 or 6 of the boot's 38 lit pairs. After the reveal the fight's compile makes about
1,300 builds more, about 1 s of the page's JS while the lobby runs; its draws' builds are 115 ms of it.

**The lobby's frame** (`npm run stalls -- --scenario lobby --seconds 15 --js`): WebGPU's JS was 8.3 ms a frame to
WebGL's 5.1, its render 6.7 ms to 3.4 (on another day's run 10 ms to 5.7), at about the same draws once the
shadow-only casters cast (below). three's
WebGPU path costs about twice WebGL's CPU an object drawn: its render objects' updates, uniforms' buffers
(`writeBuffer`) and bindings. Broken down (`npm run stalls -- --scenario lobby --js-under _renderObjectDirect`), the
frame's objects took 5 ms in all, about 20 µs each: the bindings 1.45 ms (an object's uniform group is updated at
every draw by design: `NodeManager.updateGroup` returns true for it), the node uniforms 0.87, the draw 0.70, the
render object's lookup 0.43, its geometry 0.35 and pipeline 0.29. None of it is the game's to cut but by drawing
fewer objects (the mage alone is 66 of the main pass's 154). Render bundles (`BundleGroup`, the biomes' still parts recorded once) were tried and
saved nothing measurable.

## Where the port stands (2026-10-30, evening)

The day-count estimate further down (55–85 agent-days) was far too high, by about ten times. The owner pointed out
the whole game took about a month, and the first session of the port, under two hours, got this far. At that
pace, what's left to reach WebGL's look (the shaders, the kit's looks, the grade, the overlays, the warm-up, the
lab) is days of work, not months: about 5–10 agent-days. Where it lands depends most on the ~30 shaders, and on
whether the CPU cost below can be brought down.

**First play of the preview (the owner's, 2026-10-30):**

- **The loading screen froze:** 10–15 s on "Conjuring spells" and 5–10 s in the logo's exit. With no
  `compileAsync`, every pipeline was made at its first draw, on the main thread: the lobby's warm-up and, behind
  the lobby, the fight's.
- **The lobby's frame cost 11–13 ms of CPU** (74–82 fps), almost all of it render. That needs the WebGL frame on
  the same machine to compare against.
- **The perf overlay's draw count kept growing.** Under WebGPU three's `info.render.calls` counts render calls
  since the page started; the frame's draws are `drawCalls`. Fixed.

**The warm-up compiled ahead** (`npm run stalls -- --scenario boot --url "this?renderer=webgpu"`, a busy machine):

| | before | after |
| --- | --- | --- |
| A first visit's lobby revealed | 34.3 s | 19.1 s |
| A return's lobby revealed | 16.1 s | 9.8 s |
| A return's loading screen, held up at most | 2.3 s | 0.67 s |
| A return's logo exit, held up at most | 1.6 s | 0.03 s |
| The lobby warm-up's draw | 1.3–2.3 s | 0.18–0.3 s |

- **The warm-ups' compiles are three's `compileAsync`** (`core/webgpu.ts`), started where the WebGL code compiles,
  into the scene pass's own target (`sceneTarget`): its pipelines are made on the GPU's threads and its node builds
  a slice a frame. With `compile` a no-op, every pipeline was made at its first draw, on the main thread.
- **The warm-up compiles the scene as it will draw it** (`warmUpWebGPU` in `core/shaders.ts`): its objects in, its
  layer, unculled, the other biomes out. three keys a pipeline by its lights and target, so each root compiled the
  WebGL way was built again at the draw.
- **Shadows are drawn inside the compile.** r187's `compileAsync` draws no shadow map, and a shadow is drawn once a
  render, by number, which a compile's queue works through under the last frame's. So each caster's shadow
  pipeline was made at its first shadow, synchronously, and that jammed the GPU process's main thread. The logo's
  WebGL exit waited behind it (`fit` 5.5–8.8 s).
- **The fight's foes are seated for the compile's walk alone** (`WarmUp.hide`): a crowd with no foe draws nothing,
  so its compile saw nothing.

**A first visit's freeze** (the hall of heroes, which a first visit opens on): the loading screen's last step held
the page up 5.3 to 6.1 s, the logo's WebGL exit waiting in `fit` on the GPU's process, busy making the pipelines
the hall's first frames built, cold. A WebGPU pipeline is keyed by the scene's environment node and its lights by
id (`NodeManager.getCacheKey`), and three makes each environment map a node of its own:

- **One environment node for good** (`oneEnvironment` in `core/webgpu.ts`, from the arena's `setLook`), its map
  swapped as the look changes: each biome's map and the hall's had a copy of every lit pipeline.
- **The hall warmed in its own look** (`Swap.look`, `hallLook` in `game/warmup.ts`), all the scene compiled and
  drawn in it: the hall has lights of its own.
- Found with `npm run stalls -- --read`: the node builds a draw made, by mesh, camera and key, recorded by a
  temporary probe (`&builds`, since dropped; in this PR's history).

| A first visit | before | after |
| --- | --- | --- |
| The lobby revealed | 18.7 s | 15.6 s |
| The loading screen's last step | 5.9 s, held up 4.0 s | 1.9 s, held up 1.1 s |
| The logo's exit, held up at most | 0.04 s | 0.01 s |
| Node builds at a draw before the reveal | 1.10 s | 0.76 s |

**Working:**

- **The game boots and plays on `WebGPURenderer` behind `?renderer=webgpu`.** WebGL stays the default, unchanged
  (`?renderer=webgpu-gl` is three's WebGL 2 backend). In a forest run on WebGPU:
  - the hall of heroes, the lobby in both biomes, and a run in the forest all draw
  - the heroes, props, trees, shadows and bloom
  - the foes walking and fighting
- **The renderer** (`core/webgpu.ts`): made and given what the WebGL code around it asks of a `WebGLRenderer`;
  its post chain is a node pipeline (the scene's pass plus `bloom()`, tone mapped on the way out).
- **The crowds are ported to TSL** (`entities/models/crowdNodes.ts`): each body is skinned from its row of the
  float texture by `instanceIndex`, its normals with it, and each material's glow is the body's own. The kit's
  looks come from the same row: dissolve with its glowing edge, frost, char and hit flash. They were checked by
  setting them on a wave's foes and looking.
- **The particle pools draw as instanced quads** (`fx/particleNodes.ts`, three's sprite path of
  `PointsNodeMaterial`), since WebGPU draws points a pixel wide. They keep the same size in the scene's pixels,
  the same soft disc, the fade near the lens, and the near glow for the additive pool. They were checked with
  bursts and a smoke puff spawned by hand: casting from the pane didn't reach the game.
- **The WebGL-only machinery is skipped under WebGPU:** program pinning, link waits and fences, the env maps'
  compiles, the shadow map's wrap, the perf overlay's GPU timers, HDR.
- **Three's meshlet pipeline is behind `&meshlets=1`.** In the forest lobby it takes the static props: the
  stumps (460k triangles over two frames' passes), logs, roots, the gates' roots and arches, bonfire stones and
  the heroes' rigid pieces. Skinned meshes and every `ShaderMaterial` stay on the standard path.

- **The floors' looks are TSL nodes** set on the plain materials, which three copies onto the node material it
  makes of each (`world/forestNodes.ts`, `world/cryptNodes.ts`): the forest's moss patches (`colorNode`) and its
  grass's wind (`positionNode`, after three places the instance: a tuft's place read as the point's offset from its
  own), the crypt's damp, drift, moss by the wall and earth round the dead trees (`colorNode`, `roughnessNode`), and
  what lies past its wall darkened in the top-down view (`outputNode`, so after the fog, where the GLSL dims before
  it). Checked against WebGL's pictures of each biome (`stalls --scenario boot --biome`, its end picture).

**Not verified:**

- Whether the meshlet pipeline really draws those props as clusters: its own statistics (`info.clusters`) read 0,
  and `renderer.info` shows the same 436k triangles and 379 draws with and without it.
- No timing is trustworthy: the machine was busy with other work. Under the standard pipeline the GPU's
  timestamps read about 1.2 ms for the lobby, which looks low enough to question.

**Not ported yet** (each shows as missing, not broken):

- **Every other `ShaderMaterial`** (about 30): fires, skill effects (firestorm, rift bolts, void lance...), the
  gates' membranes, aim lasers, swing trails, the dazed stars, foliage. `glslFn` doesn't run on WebGPU.
- **The world's overlays** (damage numbers, bars, names) and the outline:
  - A first try is in the history (commit, then revert).
  - Its render after the pipeline blacked out the frame.
  - The atlas's canvas reached the GPU as a 1 px wide texture.
- **The kit's looks off the crowds** (the heroes, dummies, props), all GLSL `onBeforeCompile`:
  - dissolve, frost, char, hit flash, near glow, rim, see-through
  - the floors' relief, and the crypt's earth's own normals (the floors' looks are ported, below)
  - the dais draws darker than on WebGL in both biomes, a plain standard material with no hook of its own: not
    yet found (it casts and receives the sun's shadow; the harness boots a production build, which can't be
    reached into to try)
  - triplanar, fur sway, dual-quaternion hands
- **The grade:** exposure areas, glare, low Health, HDR, sanitize.
- **Other gaps:**
  - The warm-up compiles by `compileAsync` now (below), but the fight's crowds are still rebuilt at their draw
    under the fight's loading bar (2.6 s).
  - The perf overlay's GPU timing.
  - The lab.
- **The shadow-only casters** (`world/culling.ts` `shadowsAsRenders`): WebGPU draws each shadow map as a render of
  the scene by the light's camera, nested in the frame's, with no shadow map's `render` to wrap. So the casters only
  the shadow map draws (a biome's bake, the trees' shadow copies, a hero cast as one) are shown, and the work round
  a shadow's draw run, between the scene's `onBeforeRender` and `onAfterRender` round such a render. Hidden before,
  the bake and the trees cast nothing, and each piece of the hero cast alone: the sun's shadow drew 173 times a lobby
  frame, now 134, the frame's 416 draws 288 (WebGL's about 300). Its JS stayed 2.1 ms: three's cost is per object
  it walks as much as per draw. The culled meshes are packed for the views alone now: packed for each shadow camera
  too, the frame's view drew the instances packed for the sun's box.
- **Bundle size:** a WebGL page loads none of the WebGPU code. Checked on the production build: its page fetches
  `index` and `three` (737 kB) alone.
  - Three's WebGPU build (751 kB), the meshlet pipeline (138 kB) and the bloom node are chunks of their own,
    fetched by `?renderer=webgpu`. That takes rolldown's chunk groups, not `manualChunks`, which pulled the
    WebGPU build into `three`.
  - The offline worker leaves them out of its precache (`webgpuOnlyChunks` in `scripts/pwa.ts`: three's WebGPU
    build, every chunk importing it and what only those import), so an install downloads none of them; a WebGPU page
    fetches them from the network.

## The short answer (the estimate as first written)

- **A full move to `WebGPURenderer` + TSL is about 55–85 agent-days** (about 67 expected). It would be a rewrite
  of every shader we own, the post chain, the warm-up and a quarter of the lab. (Far too high: the section above
  says how far a first session got.)
- **The meshlet pipeline would buy little on a desktop frame today.**
  - The 38-foe forest frame is 2.07 M triangles. Its GPU time barely follows them: taking the 38 foes out
    removes 1.2 M triangles and saves 1.4 ms of the 10.4 ms GPU frame.
  - The largest geometry, the crowd, is skinned, and the meshlet pipeline doesn't take skinned or
    vertex-animated meshes.
- **Phones are where geometry costs.** threejs-nanites measured its Adreno phone as vertex-bound (halving its
  pixels saved 9%). We haven't measured ours that way yet, and that is the first thing to do (below).
- **Recommended first step:** don't port. Measure the phone. Then give the mossback's body a distance LOD in
  `crowd.ts` (WebGL, a few days). Only if a static-geometry gain still matters, run a 3–4 day WebGPU spike of
  the forest's static props behind a lab flag.

## What the meshlet pipeline does, and doesn't take

From the PR (#35191):

- **How it draws:**
  - Geometries are split into clusters of 64 triangles, with simplified LODs chosen by screen-space error.
  - Culling runs per cluster on the GPU (frustum, normal cone, two-phase occlusion against a depth pyramid).
  - Draws are indirect.
  - The visibility-buffer variant also rasterizes small triangles in compute.
- **What it supports:** `Mesh`, `InstancedMesh`, `LOD`, material groups, static `BundleGroup`, shadow maps,
  clipping, alpha test, and node materials (`colorNode`, `normalNode`, `emissiveNode`, `opacityNode`, and
  `positionNode` "with fitted bounds").
- **What falls back to the standard pipeline:** anything unsupported, which includes `SkinnedMesh`, plus the
  whole WebGL backend.
- **Its own numbers** (RTX 4070, 1080p):

  | Scene | Standard | Meshlet |
  | --- | --- | --- |
  | Raw instanced high-poly | 230 ms | 3 ms |
  | City | 5.3 ms | 2.4 ms |
  | Sponza (fragment-bound) | 0.60 ms GPU | 0.73 ms GPU (but 3.2x less CPU) |

  The PR says the gains are largest where a scene is bound by vertices: many high-poly meshes with no LODs or
  culling of their own. "Scenes that are bound by fragment shading, or that are already optimized with their
  own LODs and culling, will see smaller gains."

We already cull: `world/culling.ts` packs each instanced mesh's in-view cells per pass, so only 47k of the
forest's 1.85 M triangles lie outside the view of the pass that draws them.

## Where our triangles and GPU time go

`npm run lab -- draws --biome forest` (ranger, 38 foes, top view):

- **Totals:** 179 scene draws and 137 shadow draws, 1.85 M triangles in the scene and its shadows, 47k of them
  outside the view.
- **The crowd: about 1.11 M triangles, 60% of the frame.** One instanced draw per material, scene and shadow:

  | Mossback material | Triangles per draw | Draws |
  | --- | --- | --- |
  | body `#5e4a38` | 260,528 | scene + shadow |
  | `#33561a` | 93,480 | scene + shadow |
  | `#241a12` | 76,076 | scene + shadow |
  | `#3f7a2a` | 72,504 | scene only |
  | others | 9–41k each | |

  A few high-poly instanced draws with nothing of their own to cull are the case where clusters cut the most (back faces,
  sub-pixel triangles at the far edge). But the crowd is skinned by a row texture in an `onBeforeCompile` patch,
  so a meshlet port would have to express that skinning as a `positionNode` with bounds wide enough for every
  pose, and would get no LOD from it.
- **The hero (ranger):** a 32k-triangle piece, plus 62k in its single shadow caster. These are `SkinnedMesh`
  objects: no meshlets.
- **Static props that would take meshlets:**
  - stumps: 6.1k and 6.7k triangles, each drawn twice
  - thicket: 18k
  - the ez-trees: 22–23k bark and leaves in the shadow map alone
  - the static shadow caster: 16k
  - pebbles, grass and ferns: thousands each, already cell-culled

  Together they are roughly 0.7 M triangles.

`npm run lab -- perf nockShot --screen …` in the same forest (standing phase, median, GPU by pass; this desktop,
`EXT_disjoint_timer_query_webgl2`):

| Case | Triangles | Scene pass | Shadow pass | GPU | Render (CPU) |
| --- | --- | --- | --- | --- | --- |
| 1920x1080, 38 foes | 2.07 M | 8.27 ms | 2.45 ms | 10.4 ms | 6.3 ms |
| 960x540, 38 foes | 2.07 M | 5.30 ms | 2.25 ms | 6.8 ms | 6.4 ms |
| 1920x1080, no foes | 0.87 M | 7.67 ms | 1.62 ms | 10.2 ms | 7.2 ms |

(The lab printed "Nockshot was pressed and never cast": with no target nothing was cast. Only the standing
phase is used here.)

What the table says:

- **Pixels:** a 4x cut in pixels takes 3 ms off the scene pass (about 1.9 ms per Mpx). The shadow pass doesn't
  follow pixels at all.
- **Triangles:** 1.2 M more triangles add about 0.6 ms to the scene and 0.8 ms to the shadow: about
  1.2 ms per million triangles on this GPU.
- **The rest doesn't follow pixels or triangles:** about 4.3 ms of the scene pass. The lab's note on `perf`
  applies: on a desktop a pass's GPU time includes waiting for the page's commands. Here the render alone is
  6–7 ms of CPU for about 360 draws.

So the desktop frame is fed by the CPU and split between pixels and fixed cost. Geometry is the smaller part.
Cutting every triangle the meshlet pipeline could reach would save on the order of 1 ms of GPU on this
machine. The PR's CPU numbers (3.2x less on Sponza) hint the bigger desktop win could be the CPU side, not the
GPU side. That is unmeasured for our scene, and `WebGPURenderer`'s own per-draw CPU cost is unmeasured too.

**Phones are different.** threejs-nanites measured its Adreno 8xx (Galaxy S25 Edge) as vertex-bound:
- halving the pixels saved 9%
- 553k impostors cost 35 ms of GPU

Our phones run Low quality with fewer pixels, and the 1.1 M-triangle crowd stays the same size whatever the
quality. Measure before deciding (the first step below). That is where a cheaper crowd would show.

## Browser reach

| Browser | WebGPU | Under a WebGPU-first build |
| --- | --- | --- |
| Chrome / Edge, desktop | since 113 | WebGPU |
| Chrome, Android | 12+ on stable (121+) | WebGPU, minus some older GPUs and drivers |
| Samsung Internet | 24+ | WebGPU |
| Safari, macOS | 26, partial on caniuse | WebGPU, with care (below) |
| Safari, iOS / iPadOS | 26 | WebGPU; older iOS falls back to WebGL 2 |
| Firefox, Windows | 141+ | WebGPU |
| Firefox, macOS | 145+ (macOS 26), 147+ (all) | WebGPU |
| Firefox, Linux / Android | nightly or flag only | WebGL 2 fallback |

caniuse puts WebGPU at about 88% of global use (86% full, 2% partial). Sources:
[caniuse](https://caniuse.com/webgpu),
[gpuweb implementation status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status),
[web.dev](https://web.dev/blog/webgpu-supported-major-browsers),
[Firefox 141](https://simonwillison.net/2025/Jul/16/webgpu-firefox).

**What the fallback means:**

- **WebGL players aren't lost.** `WebGPURenderer` runs the same TSL materials on its WebGL 2 backend, so about
  12% of players get a WebGL frame either way.
- **The fallback is a second renderer to test, not the one we have now.**
  - It's three's node backend, not `WebGLRenderer`.
  - It has no compute, so no meshlets, occlusion or culling passes.
  - threejs-nanites found it slower to warm: each program compiles on the main thread, and ANGLE rebuilt every
    program at first draw into an MRT target despite `compileAsync`, freezing 1–1.7 s.
- **Keeping `WebGLRenderer` for the fallback isn't an option.** It would mean keeping two copies of every shader.

**Other browser notes:**

- **Mac:** threejs-nanites found Mac GPU timestamps untrustworthy, and a Mac allowing fewer than 8 storage
  buffers a shader. Its cluster passes failed there and only impostors drew. The meshlet pipeline's compute
  passes need checking on Apple GPUs.
- **HDR:** `core/hdr.ts` already starts a WebGPU device, purely to present HDR beside the WebGL canvas.
  Under `WebGPURenderer`, HDR output would be the renderer's own canvas, which simplifies that file.

## Inventory: what is WebGL-specific, and the port by system

Counted on `main` (55.6k lines of `src/`):

- 20 `onBeforeCompile` patches in 14 files
- 32 `ShaderMaterial`s
- about 1,500 lines of GLSL in template literals across 30 files
- 3 `ShaderChunk` rewrites
- the `EffectComposer` chain
- raw WebGL 2 calls in 5 files

**GLSL can't be carried over.** TSL's `glslFn` runs only on the WebGL backend; WebGPU needs WGSL (`wgslFn`) or
TSL. Every shader is rewritten, not wrapped.

| System | What it is today | Lines (GLSL) | Port | Days |
| --- | --- | --- | --- | --- |
| Renderer and post chain | `core/renderer.ts` (846): `EffectComposer`, `UnrealBloomPass`, sanitize `ShaderPass`, `AreaPass` (exposure, its own render targets), grade shader, 4x-MSAA HalfFloat scene target, `WEBGL_provoking_vertex` | 94 | Medium. TSL `RenderPipeline`/`pass()`, `bloom()` node (tuned again to match), sanitize, area and grade rewritten in TSL. The grade is our look, so it needs frame-by-frame parity (`lab light`, `lab haze`). | 5 |
| Lit-shader chunk edits | `loopPointLights`, `shadeEnvironment` (renderer.ts) | 60 | Hard. No shader chunks in node materials. The ambient and environment dimmed in the sun's shadow becomes a custom lighting model. The looped point lights were a fix for ANGLE's D3D compile time, which WGSL→HLSL compiles may or may not share: measure. | 4 |
| `onBeforeCompile` families | `nearGlow`, `dimOutside` (`core/materials.ts`, 25 uses), `seeThrough`, `parallax`, `triplanar`, dual-quaternion skinning, `furSway`, `head`'s normals, `hands`, `shapes`' twins, the crypt and forest floors, fire | ~400 | Medium–hard. Each becomes `colorNode`/`emissiveNode`/`positionNode`/`normalNode`. Dual-quaternion skinning becomes a custom skinning node, the riskiest of them. | 10 |
| Our own `ShaderMaterial`s | VFX (`fx/`: firestorm, riftBolts, aimLaser, dazed, vine, sporeOrb, glintMotes, swingTrail, particles), skills (voidLance, slash, ironBellow, raiseShield, projectiles), world (volumetric fire 213 lines, props 92, crypt, foliage) | ~900 | Medium, but long. Plus `gl_PointSize` particles (`fx/particles.ts`, `fx/dazed.ts`): WebGPU draws points 1 px wide, so the pools become instanced quads or sprites, and their fill measure changes. | 14 |
| Crowds | `entities/models/crowd.ts` (387): skinning from a float row texture, flat varyings, a screen door near the camera, a patched depth material for shadows | 45 | Medium. `positionNode` + `textureLoad`, `varying().setInterpolation('flat')`, a shadow `positionNode`. Then meshlets on top: hard, see above. | 4 |
| Program pinning and warm-up | `core/shaders.ts` (579): `renderer.info.programs`, `KHR_parallel_shader_compile`, the programs' own `gl` reads; `game/warmup.ts` (435), `game/warm.ts` (118), `whenWarm`, the perf overlay's `Shaders N (+M)` | 0 | Hard, and the biggest risk. All of it is `WebGLProgram`-specific. WebGPU has async pipelines (`compileAsync`), but threejs-nanites found pipeline creation runs one at a time in the GPU process: about 10 s of a 17 s load until warmed by hand, and a lit PBR floor with shadows took 1.5 s alone. Our boot took months to get under 5 s (#275–#277); a new backend resets that. | 6 |
| World overlays | `ui/overlay/` (`layer.ts`, `outline.ts` with `FullScreenQuad` and a mask target, `atlas.ts` render target, `bars.ts`, `paint.ts`) | 45 | Medium | 3 |
| Perf overlay and HDR | `ui/perfHud.ts`: `EXT_disjoint_timer_query_webgl2`, `WEBGL_debug_renderer_info`; `core/hdr.ts`: `drawingBufferStorage` + WebGPU presenter | 0 | Easy–medium. Timestamp queries via `resolveTimestampsAsync`. HDR gets simpler. | 2 |
| World | `world/props.ts`'s still shadows (a baked target, PMREM compiles ahead), `world/arena.ts` env maps, `world/culling.ts` (CPU, keeps working; its `onBeforeRender` packing must be checked against the new projection), 4 `onBeforeRender` hooks, 6 custom depth materials | — | Medium | 3 |
| The lab | 39 of 156 `tools/lab/page` modules read WebGL internals: `draws.ts` (its draw recording), `compiles.ts`, `programs.ts`, `programCost.ts`, `fireCost.ts`, `gridSums.ts`, read-backs | — | Medium–hard, and needed first: every other row is verified with it. | 8 |
| Parity and browsers | every biome, hero and skill against `main` (`lab light`, `cast`, `ui --screens`, `compiles`, `stalls --scenario boot`), on WebGPU and on the WebGL 2 backend, on a phone, an iPhone, a Mac | — | — | 8 |
| `ui/logoWind.ts` | its own WebGL 2 canvas for the logo | 121 | Can stay as it is | 0 |
| **Total** | | ~1,500 | | **~67 (55–85)** |

The days assume one agent with the owner reviewing pictures, at the pace of past PRs. The lab rows (draws,
compiles, light parity) gate everything else.

## Risks

- **Load time:** pipeline compiles are serial in the GPU process. We have about 40 programs per biome plus
  every hero and skill. The `+0 compiled in play` rule and the < 5 s first visit both start over.
- **Look parity:** bloom, the grade and the shadow-darkened ambient are tuned by hand against measured frames.
  The node versions differ in their maths (`UnrealBloomPass` vs `BloomNode` mips). Expect a retuning round per
  biome.
- **Two backends:** about 12% of players (older iOS, Firefox on Linux and Android) get the node-WebGL backend,
  which has its own compile behaviour (ANGLE MRT recompiles) and no compute.
- **The crowd and the heroes don't take meshlets:** they are skinned, and they are where the triangles are.
- **three's WebGPU side moves fast:** threejs-nanites keeps a `three-gaps.ts` of typing and behaviour
  workarounds, and hit TSL bugs (a variable first set inside `If`/`select` read unset outside it; named
  `toVar`s turned black).
- **Mac:** untrustworthy timestamps, and storage-buffer limits that broke compute culling.

## Recommended first step

1. **Measure the phone first (no port, about an hour).** Run
   `npm run lab -- perf nockShot --screen 832x384@3.75 --boot low@518400 --throttle 4 --foes 38` against
   `--foes 0`, and once at half the pixels. Ideally read it on a real phone with the perf overlay's report too.
   If the phone frame follows triangles, the crowd is the target. If it follows pixels, meshlets won't help.
2. **If triangles matter, cut the crowd in WebGL (2–4 days).**
   - The mossback body is 260k triangles in a draw and has no LOD.
   - Give `crowd.ts` a far slot: the same rows, a body simplified with meshoptimizer (as threejs-nanites does),
     chosen by distance per body.
   - This is what the meshlet pipeline would do for static meshes, done where we can: on skinned bodies, on every
     browser.
3. **Only then, if static geometry still matters, a WebGPU spike behind a lab flag (3–4 days).**
   - A `?renderer=webgpu` lab-only page.
   - The forest's static props (stumps, ez-trees, thicket, rocks) as `MeshStandardNodeMaterial`.
   - Measured under `StandardDrawingPipeline` vs `MeshletDrawingPipeline` with the GPU by pass, and the time to
     first frame.
   - That answers what meshlets buy us, and what WebGPU's pipeline compiles cost us, before committing to a
     two-to-three-month port.

## What threejs-nanites already learned

`G:\Git\threejs-nanites` (three 0.186.1) uses its own cluster pipeline, not three's:

- **What it builds:**
  - a meshoptimizer cluster DAG (128-triangle clusters, groups simplified by half with borders locked)
  - compute instance and cluster culling with two-phase HZB occlusion
  - indirect draws with vertex pulling
  - a software rasterizer for tiny clusters
  - impostors, TAA upscaling
  - a WebGL 2 mode via `forceWebGL`
- **Numbers that bear on us:**
  - On an RTX 4070 Ti at 1080p, the forest runs 2.4–10.3 ms of GPU for 0.8–16 M triangles.
  - Without its Nanite path, a 2,000-tree subset took 7.4 ms against 3.0.
  - The desktop isn't vertex-bound except at a 14 M-leaf canopy zoom.
  - The phone is vertex-bound.
- **The warm-up is the main lesson:**
  - `compileAsync` each mesh as its material is final.
  - `compileComputeAsync` from dry runs, then a warm-up draw into a 1x1 copy of the scene target, since compiles
    read the current target's formats.
  - Fewer pipelines, with what varies passed as uniforms.
  - Load went 17.4 s → 4.1 s on a desktop, 43 s → 16.8 s at phone pace.
- **Other lessons:**
  - Batch compute passes (36 small ones cost 0.4–0.8 ms that the timers don't show).
  - Never await `onSubmittedWorkDone` a frame (+4 ms).
  - 4x MSAA cost about 2.5 ms at 1080p on WebGPU and was replaced by TAA. We use 4x MSAA.
- **Reusable:** its harness (`tools/harness.ts`: real-GPU headless WebGPU timing, phone sizes, `--load` cold-boot
  timelines) and `src/three-gaps.ts` for a spike.
- **Not covered there:** skinning, point lights and bloom, three things we rely on.
