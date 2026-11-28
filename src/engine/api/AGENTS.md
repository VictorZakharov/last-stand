# `src/engine/api`

Bulwark's API for the game (VictorZakharov/last-stand#973): the scene, its maths, geometry, materials and textures
as the engine holds them, in place of three.js. three is gone from the game when this lands: no `three` in
`package.json`, no translation of a three scene into the engine's records each frame. **Why**: the page walked
three's scene every frame and wrote a record a mesh (`bridge.ts`'s walk, the matrices, the materials compared),
1 ms of a desktop's frame and 3 to 5 of a phone's, and the cost grew with every mesh the game added. Here an
object is the engine's node from the moment it's in the world, and only what changed is written.

The rules across the game are the [root AGENTS.md](../../../AGENTS.md); the engine's page side is
[`../AGENTS.md`](../AGENTS.md).

## The shape of it

| Folder | What | Imports the engine |
| --- | --- | --- |
| `math/` | `Vec2`, `Vec3`, `Vec4`, `Quat`, `Euler`, `Mat3`, `Mat4`, `Color`, `Box3`, `Sphere`, `Ray`, `Plane`, `Frustum`, `Line3`, `Triangle`, `Spherical`, `Maths` (the functions) | never |
| `geometry/` | `Geometry`, `Attribute`, `InstancedAttribute`, `InstancedGeometry`; the ops (`mergeGeometries`, `mergeVertices`, `unindexed`, `normals`, `convexHull`); `boundsOf`, `growByNode` are the scene's | never |
| `shapes/` | the generators as functions (`sphere`, `box`, `cylinder`, `cone`, `torus`, `torusKnot`, `lathe`, `plane`, `circle`, `ring`, `capsule`, `icosahedron`, `octahedron`, `dodecahedron`, `tetrahedron`, `tube`, `extrude`, `flat`, `roundedBox`); the curves and outlines (`Curve`, `CatmullRom3`, `Line3Curve`, `Bezier2Curve3`, `Bezier3Curve3`, `Ellipse`, `Path`, `Outline`, `triangulate`) | never |
| `material/` | `Material`, `LitMaterial`, `UnlitMaterial`, `LookMaterial`, `PointsMaterial`, `SpriteMaterial`, `LineMaterial`; `Texture`, `CanvasTexture`, `DataTexture`, `VolumeTexture`; the constants (`constants.ts`) | never |
| `scene/` | `Node`, `Mesh`, `InstancedMesh`, `SkinnedMesh`, `Skeleton`, `Bone`, `Points`, `Sprite`, `Line`, `World`, `Fog`, the cameras, the lights, `Layers`, `Raycaster`, `boundsOf` | never: a node tells its `link` (`scene/link.ts`) |
| `../stage.ts`, `../draws.ts` (beside this folder) | the stage: the shown world's nodes as the engine's, what moved written each frame; a mesh's draws kept on its node, written again as its inputs change | yes |

`math/`, `geometry/`, `shapes/` and `material/` import nothing of the engine or the page (a worker builds heads, hands
and simplified meshes with them: `head.worker.ts`, `simplify.worker.ts`). `index.ts` exports everything; the game
imports names (`import { Vec3, Mesh } from '../engine/api/index.ts'`) and the generators as a namespace (`import * as
shapes from '../engine/api/shapes/index.ts'`, `shapes.sphere(...)`), never a one-letter alias (from the owner: "B is a
terrible name"). No one-letter names in this code either: scratch is named in full (`scratchMatrix`); loop indices and
coordinates may stay short.

## Rules for this code

- **Our own code, written for the engine.** No file copied from three. Where an algorithm follows three's
  (a matrix's decomposition, a quaternion from Euler angles, earcut's ear clipping, the quickhull), its function's
  doc comment says so and `docs/PROVENANCE.md` has a row (three.js, MIT, 0.187.0). Maths that every library has
  (a dot product) needs no row.
- **The game's vocabulary is kept where it means the same**: the maths keep the method names the game calls
  (`set`, `copy`, `clone`, `add`, `sub`, `multiplyScalar`, `applyQuaternion`, `lerp`, `distanceTo`...; chainable,
  in place, as the game's 4,500 uses of them are written), a node keeps `position`, `quaternion`, `rotation`,
  `scale`, `add`, `remove`, `traverse`, `userData`, `visible`. What's named after three's internals or renderer
  is not kept (`BufferGeometry` is `Geometry`, `MeshStandardMaterial` is `LitMaterial`, `Object3D` and `Group`
  are `Node`, `Scene` is `World`). The rename table is below; a port is that table and the API's own changes.
- **Only what the game uses.** A method nothing calls is not written. Typecheck the game to find what's missing.
- **No GLSL, no renderer hooks.** `onBeforeCompile`, `customProgramCacheKey`, `ShaderChunk`, `ShaderLib`,
  `onBeforeRender`'s renderer argument, render targets: none. A material's own look is WGSL (`../custom.ts`,
  `../looks/`); a `LookMaterial` is drawn by its look alone.
- **Typed strictly, no `any`** but `userData` (the game's own notes on a node, geometry, material or texture, typed as
  three's); tools-style code: one statement per line, lines under 120 characters, a doc comment on every export, files
  split before 400 lines.
- **Unit tests** beside each module in `math/`, `geometry/`, `shapes/` (`*.test.ts`, `npm run api:test`: Node's own
  runner, which strips the types, so this folder's TypeScript is erasable alone: no `enum`, no parameter
  properties, no `namespace`, and every import names its file with `.ts`); each against values worked by hand or
  read off three 0.187 once (say which). `npm run api:typecheck` checks this folder alone.

## Maths (`math/`)

Value classes, in place and chainable as three's are. A crossing into the engine for each `add` would cost more
than the add: the game's own reasoning (aim, steering, IK) stays in script, and what's done for every object a
frame (world matrices, culling, skinning, bones) is the engine's.

- `Vec3` has `x, y, z` as plain fields. `WatchedVec3` (in `scene/`) is a `Vec3` whose fields are accessors that tell
  its node it moved: a node's `position` and `scale`. Same for `Quat` (`WatchedQuat`) and `Euler` (`rotation`, kept
  in step with the quaternion both ways, as three keeps them).
- `Mat4.elements` is a column-major `number[16]` (as three's), so code that reads `elements[12]` keeps working.
- `Color` is linear RGB in `r, g, b` (as three's working space); `setHex`, `setStyle`, `getHex`, `setHSL`, `getHSL`,
  `lerp`, `multiplyScalar`, `convertSRGBToLinear`, `convertLinearToSRGB`. `new Color(0xff8800)` and
  `new Color('#ff8800')` take sRGB and store linear, as three's colour management does.

## Geometry (`geometry/`, `shapes/`)

- `Geometry` holds named `Attribute`s (`position`, `normal`, `uv`, `color`, `skinIndex`, `skinWeight`, anything a
  look reads), an optional `index`, `groups`, a `drawRange`, and its bounds (`boundingBox`, `boundingSphere`,
  computed on asking). `translate`, `rotateX/Y/Z`, `scale`, `applyMatrix4`, `applyQuaternion`, `center`,
  `computeVertexNormals`, `computeBoundingBox`, `computeBoundingSphere`, `setAttribute`, `getAttribute`,
  `deleteAttribute`, `setIndex`, `clone`, `copy`, `dispose`.
- `Attribute(array, itemSize, normalized?)`: `array` a typed array, `count`, `getX/Y/Z/W`, `setX/Y/Z/W`,
  `setXYZ`, `setXYZW`, `getComponent`, `setUsage`, `version`; `needsUpdate = true` bumps `version` (what the stage
  reads to send it again). Built from a plain array it's a `Float32Array` (three's `Float32BufferAttribute`).
- The generators are functions returning a `Geometry`, their arguments three's in the same order
  (`sphere(radius, widthSegments, heightSegments, phiStart, phiLength, thetaStart, thetaLength)`), and the same
  vertices in the same order, so every model is the same shape to the vertex. Check each against three 0.187's
  output in a test (positions, normals, uvs, index), then drop three.
- The ops keep three's names where the game calls them by those: `mergeGeometries(geometries, groups?)`,
  `mergeVertices(geometry, tolerance)`, `unindexed(geometry)` (also `Geometry.toNonIndexed`), `convexHull(points)`
  (three's `ConvexGeometry`), `shapes.roundedBox(w, h, d, segments, radius)`. The simplifier is the `meshoptimizer`
  package's (MIT, its author's own build, the one three vendored), never three's copy.

## Materials and textures (`material/`)

Data the engine reads, nothing compiled on the page.

- `Material`: `opacity`, `transparent`, `alphaTest`, `side`, `blending` (with `blendSrc`, `blendDst`,
  `blendEquation` for `CustomBlending`), `depthWrite`, `depthTest`, `colorWrite`, `polygonOffset`,
  `polygonOffsetFactor`, `polygonOffsetUnits`, `visible`, `name`, `userData`, `version`, `needsUpdate` (bumps it),
  `clone`, `dispose`. A field that changes how it's drawn is an accessor that bumps `version`; the stage sends a
  material again only when its version moved (materials are hundreds, not thousands: a field read is cheap).
- `LitMaterial` (three's `MeshStandardMaterial` and `MeshPhysicalMaterial`): `color`, `map`, `roughness`,
  `metalness`, `roughnessMap`, `metalnessMap`, `normalMap`, `normalScale`, `bumpMap`, `bumpScale`, `emissive`,
  `emissiveIntensity`, `emissiveMap`, `alphaMap`, `flatShading`, `clearcoat`, `clearcoatRoughness`, `sheen`,
  `sheenColor`, `sheenRoughness`, `sheenColorMap`, `envMapIntensity`, `vertexColors`.
- `UnlitMaterial` (three's `MeshBasicMaterial`): `color`, `map`, `alphaMap`, `vertexColors`, `fog`.
- `LookMaterial` (three's `ShaderMaterial`): `uniforms` (`{ name: { value } }`, as the looks read them), `defines`,
  drawn by its look (`rustLook`) alone.
- `PointsMaterial`, `SpriteMaterial`, `LineMaterial`: `color`, `map`, `size`, `sizeAttenuation`, `rotation`.
- `Texture`: `image` (a canvas, an image, an `ImageBitmap`, or `{ data, width, height, depth }`), `wrapS`, `wrapT`,
  `repeat`, `offset`, `rotation`, `center`, `magFilter`, `minFilter`, `generateMipmaps`, `anisotropy`,
  `colorSpace`, `flipY`, `format`, `type`, `version`, `needsUpdate`, `clone`, `dispose`. `CanvasTexture(canvas)`,
  `DataTexture(data, width, height, format?, type?)`, `VolumeTexture(data, width, height, depth)` (three's
  `Data3DTexture`).
- `constants.ts`: the sides, blendings, factors, equations, wraps, filters, formats, types, colour spaces and
  usages the game names, as numbers equal to three's (the engine's readers compare them).

## The scene (`scene/`) and the stage

- `Node`: `id` (the engine's node, or `NONE` while it isn't in a shown world), `name`, `parent`, `children`,
  `position`, `quaternion`, `rotation`, `scale`, `visible`, `castShadow`, `receiveShadow`, `frustumCulled`,
  `renderOrder`, `layers`, `userData`, `matrix`, `matrixWorld`, `matrixAutoUpdate`, `add`, `remove`,
  `removeFromParent`, `attach`, `clear`, `traverse`, `traverseVisible`, `traverseAncestors`, `getObjectByName`,
  `getWorldPosition`, `getWorldQuaternion`, `getWorldScale`, `getWorldDirection`, `localToWorld`, `worldToLocal`,
  `lookAt`, `rotateX/Y/Z`, `rotateOnAxis`, `translateX/Y/Z`, `updateMatrix`, `updateMatrixWorld`,
  `updateWorldMatrix`, `clone`, `copy`, `isNode`, the hooks `onAdded`, `onRemoved`.
- **`matrixWorld` is made when it's read** (a getter): a node knows the move it was last made for (`stamp`), and
  every move anywhere advances the world's move count; read after a move, it's made again from its parent's (made
  the same way) and its own. `updateMatrixWorld()` is kept for the game's calls and does nothing more than make
  them now. Freezing a node (`matrixAutoUpdate`, `matrixWorldAutoUpdate` set false) makes its matrix (and its world
  matrix) as it stands first: frozen unmade, the parts `standStill` froze stood at the world's middle
  (`node.test.ts`). The engine makes its own matrices for drawing (`place_nodes`); nothing is read back each frame.
- **A node's watched vectors are a second shape to V8, and the two ways round it were worse** (#973, 2026-11-28):
  a maths call site that meets a node's `position` beside a plain `Vec3` goes polymorphic, 1.5 times slower in a
  microbenchmark. Accessors on every vector, one shape for all (b6bf0b6df), made the IK twice as slow. Plain vectors
  with moves found by comparing a node's numbers as it's read (f06a65e23) made `makeWorld` 7 times slower. Both were
  reverted: measure a new design with `lab perf --wave 36 --throttle 4 --ab --profile=update` before keeping it. A
  method writing every field of a watched turn skips making it fresh first (`put` in `watched.ts`): the node's
  `touched` drops that side's staleness.
- **A node is in the engine while it's under a shown world** (`World.shown`, the stage's): added under one, it and
  everything under it get nodes and draws; taken out, they're let go. A node elsewhere (a template a model clones,
  a warm-up's sample not yet shown) costs the engine nothing.
- **What moved is written, nothing else**: a watched field written marks its node (`stage.moved`, a list, a node
  once), and the frame writes those nodes' ten numbers and shown byte. A node placed by its matrix
  (`matrixAutoUpdate = false`) writes its matrix decomposed when `updateMatrix` or a write to `matrix` says so.
  `standStill` (world/props.ts) needs nothing of its own any more: what doesn't move is never written.
- `Mesh(geometry, material)`, `material` one or an array (by `groups`): its draws are the engine's as it's added
  under a shown world, a draw a material, each told again when its geometry's or material's version moves,
  or its flags (`castShadow`, `receiveShadow`, `renderOrder`, `layers`, `frustumCulled`, `visible`) change.
- `InstancedMesh(geometry, material, count)`: `instanceMatrix` (an `InstancedAttribute`), `instanceColor`, `count`,
  `setMatrixAt`, `getMatrixAt`, `setColorAt`; sent again as their versions move.
- `SkinnedMesh`, `Skeleton(bones, inverses?)`, `Bone`: a bone is a node; the skin is the engine's (`add_skin`),
  its bones made by it from their nodes; `bind`, `bindMatrix`, `bindMatrixInverse`, `bindMode`, `pose`,
  `calculateInverses`, `boneMatrices` made on asking (a cloth or IK reads them).
- `Points`, `Sprite`, `Line`, `LineSegments`: drawn as the engine's sprites and lines (`../sprites.ts`).
- Cameras: `Camera`, `PerspectiveCamera(fov, aspect, near, far)`, `OrthoCamera(left, right, top, bottom, near, far)`;
  `projectionMatrix`, `projectionMatrixInverse`, `matrixWorldInverse` (made when read), `updateProjectionMatrix`,
  `zoom`, `view` (`setViewOffset`).
- Lights: `PointLight(color, intensity, distance, decay)` with `shadow` (`mapSize`, `camera.near`, `camera.far`,
  `bias`, `normalBias`, `radius`, `needsUpdate`), `DirectionalLight` with `target` and `shadow` (an `OrthoCamera`),
  `HemisphereLight`, `AmbientLight`. The pooled point lights (`fx/lights.ts`) stay the game's rule.
- `World` (three's `Scene`): a `Node` with `fog`, `background`; `Fog(color, near, far)`, `FogExp2(color, density)`.
- `Layers`: `mask`, `set`, `enable`, `disable`, `toggle`, `test`, `isEnabled`, `enableAll`, `disableAll`.
- `Raycaster(origin?, direction?, near?, far?)`: `ray`, `near`, `far`, `layers`, `set`, `setFromCamera`,
  `intersectObject(s)` against meshes (triangles, with a mesh's bounding sphere first) and instanced meshes, giving
  `Hit`s (`distance`, `point`, `face`, `faceIndex`, `object`, `instanceId`, `uv`).

## Renamed from three

| three | here |
| --- | --- |
| `Vector2`, `Vector3`, `Vector4`, `Quaternion`, `Matrix3`, `Matrix4`, `MathUtils` | `Vec2`, `Vec3`, `Vec4`, `Quat`, `Mat3`, `Mat4`, `Maths` |
| `Object3D`, `Group` | `Node` |
| `Scene` | `World` |
| `OrthographicCamera` | `OrthoCamera` |
| `Intersection` | `Hit` |
| `BufferGeometry`, `BufferAttribute`, `Float32BufferAttribute` (and the other typed ones) | `Geometry`, `Attribute`, `Attribute` (from its typed array) |
| `InstancedBufferAttribute`, `InstancedBufferGeometry` | `InstancedAttribute`, `InstancedGeometry` |
| `XGeometry` (`SphereGeometry`, `BoxGeometry`...) | `x(...)` (`sphere`, `box`...) |
| `ShapeGeometry`, `ExtrudeGeometry`, `TubeGeometry` | `flat`, `extrude`, `tube` |
| `Shape`, `Path`, `ShapeUtils.triangulateShape` | `Outline`, `Path`, `triangulate` |
| `CatmullRomCurve3`, `LineCurve3`, `QuadraticBezierCurve3`, `CubicBezierCurve3`, `EllipseCurve` | `CatmullRom3`, `Line3Curve`, `Bezier2Curve3`, `Bezier3Curve3`, `Ellipse` |
| `BufferGeometryUtils.mergeGeometries`, `.mergeVertices`, `.toNonIndexed` (method) | the same, `unindexed` (and the method) |
| `ConvexGeometry`, `RoundedBoxGeometry` | `convexHull`, `shapes.roundedBox` |
| `Box3.setFromObject`, `.expandByObject` | `boundsOf(node, box)`, `growByNode(box, node)` |
| `DataUtils.toHalfFloat`, `.fromHalfFloat` | `toHalfFloat`, `fromHalfFloat` |
| `MeshStandardMaterial`, `MeshPhysicalMaterial`, `MeshPhongMaterial`, `MeshLambertMaterial` | `LitMaterial` |
| `MeshBasicMaterial`, `ShaderMaterial` (and `RawShaderMaterial`) | `UnlitMaterial`, `LookMaterial` |
| `PointsMaterial`, `SpriteMaterial`, `LineBasicMaterial` | the same, `LineMaterial` |
| `Data3DTexture` | `VolumeTexture` |
| `X.isMesh`, `instanceof THREE.X` | `instanceof X` (the `isX` flags are kept on the classes the game tests: `isMesh`, `isSkinnedMesh`, `isInstancedMesh`, `isPoints`, `isSprite`, `isLight`, `isPointLight`, `isCamera`, `isBone`, `isNode`) |
| `THREE.Timer` | the game's own clock (`core/clock.ts`) |
| node materials (`three/webgpu`, `three/tsl`) | gone: what a node material drew is its look's (`../looks/`) |
