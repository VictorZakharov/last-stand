# Provenance

Where the game's code follows someone else's. None of it is copied: Bulwark's scene API (`src/engine/api/`, #973)
is our own code written for the engine, and where a function follows another project's algorithm its doc comment
says so and it has a row here. Maths every library has (a dot product) has none.

| Project | Licence | Version | Copyright |
| --- | --- | --- | --- |
| [three.js](https://github.com/mrdoob/three.js) | MIT | 0.187.0 | Copyright © 2010-2026 three.js authors |
| [earcut](https://github.com/mapbox/earcut) | ISC | 3.0.2 | Copyright (c) 2024, Mapbox |

Both licences ask for their notice to be kept with copies of the software or substantial portions of it; ported
algorithms are credited here and in each function's comment, and the notices are below.

## Maths (`src/engine/api/math/`)

| Function | Follows | Source |
| --- | --- | --- |
| `Quat.setFromEuler` (`math/quat.ts`) | three's products of half-angle sines and cosines, one sign pattern an order | three.js 0.187.0, MIT, `src/math/Quaternion.js` |
| `Quat.setFromRotationMatrix` (`math/quat.ts`) | three's (Shoemake's): from the trace, or the largest diagonal entry | three.js 0.187.0, MIT, `src/math/Quaternion.js` |
| `Quat.setFromUnitVectors` (`math/quat.ts`) | three's, its 1e-8 epsilon and its axis for opposite ways | three.js 0.187.0, MIT, `src/math/Quaternion.js` |
| `Quat.slerp` (`math/quat.ts`) | three's, its 0.9995 threshold for blending straight and normalizing | three.js 0.187.0, MIT, `src/math/Quaternion.js` |
| `Euler.setFromRotationMatrix` (`math/euler.ts`) | three's: the middle turn by asin, the others by atan2, its 0.9999999 lock | three.js 0.187.0, MIT, `src/math/Euler.js` |
| `Vec3.applyQuaternion` (`math/vec3.ts`) | three's form of the turn (`t = 2 q × v`, `v + w t + q × t`) | three.js 0.187.0, MIT, `src/math/Vector3.js` |
| `Mat4.extractRotation` (`math/mat4.ts`) | three's, the identity for a flat matrix | three.js 0.187.0, MIT, `src/math/Matrix4.js` |
| `Mat4.lookAt` (`math/mat4.ts`) | three's, its nudges where eye and target meet or `up` lies along the look | three.js 0.187.0, MIT, `src/math/Matrix4.js` |
| `Mat4.decompose` (`math/mat4.ts`) | three's: a mirror's x scale negative, a flat matrix as no turn at scale 1 | three.js 0.187.0, MIT, `src/math/Matrix4.js` |
| `perspective`, `orthographic` (`math/mat4Ops.ts`: `Mat4.makePerspective`, `makeOrthographic`) | three's depth terms for WebGL, WebGPU and a reversed depth | three.js 0.187.0, MIT, `src/math/Matrix4.js` |
| `Frustum.setFromProjectionMatrix` (`math/frustum.ts`) | three's plane rows and order, the near plane by coordinate system and reversed depth | three.js 0.187.0, MIT, `src/math/Frustum.js` |
| `Ray.intersectBox` (`math/ray.ts`) | three's slab test, its NaN guards | three.js 0.187.0, MIT, `src/math/Ray.js` |
| `Ray.intersectTriangle` (`math/ray.ts`) | three's (Eberly's), by signed volumes against the normal | three.js 0.187.0, MIT, `src/math/Ray.js` |
| `Sphere.expandByPoint`, `Sphere.union` (`math/sphere.ts`) | three's: the middle moved half the overshoot; the union by the other sphere's two far points | three.js 0.187.0, MIT, `src/math/Sphere.js` |
| `Triangle.getBarycoord` (`math/triangle.ts`) | three's dot products, null for no area | three.js 0.187.0, MIT, `src/math/Triangle.js` |
| `Triangle.closestPointToPoint` (`math/triangle.ts`) | three's (Ericson's Voronoi regions) | three.js 0.187.0, MIT, `src/math/Triangle.js` |
| `Color.setStyle` (`math/color.ts`) | three's patterns for `rgb()`, `hsl()` and hex | three.js 0.187.0, MIT, `src/math/Color.js` |
| `srgbToLinear`, `linearToSrgb` (`math/color.ts`) | three's constants for the sRGB curves | three.js 0.187.0, MIT, `src/math/ColorManagement.js` |
| `seededRandom` (`math/maths.ts`) | three's mulberry32 and its starting seed, so a seed gives three's numbers | three.js 0.187.0, MIT, `src/math/MathUtils.js` |
| `toHalfFloat`, `fromHalfFloat` (`math/halfFloat.ts`) | three's tables, the same bits | three.js 0.187.0, MIT, `src/extras/DataUtils.js` |

The CSS colour names (`math/cssColors.ts`) are CSS Color Module Level 4's named colours, not three's code.

## Geometry (`src/engine/api/geometry/`)

| Function | Follows | Project | Licence | Version | File |
| --- | --- | --- | --- | --- | --- |
| `normals` (`Geometry.computeVertexNormals`), `unitNormals` | `BufferGeometry.computeVertexNormals`, `normalizeNormals` | three.js | MIT | 0.187.0 | `src/core/BufferGeometry.js` |
| `Attribute`'s normalized reads and writes | `BufferAttribute`, `MathUtils.normalize` / `denormalize` | three.js | MIT | 0.187.0 | `src/core/BufferAttribute.js`, `src/math/MathUtils.js` |
| `mergeGeometries` | `mergeGeometries`, `mergeAttributes` | three.js | MIT | 0.187.0 | `examples/jsm/utils/BufferGeometryUtils.js` |
| `mergeVertices` | `mergeVertices`, `remapAttribute` | three.js | MIT | 0.187.0 | `examples/jsm/utils/BufferGeometryUtils.js` |
| `unindexed` (`Geometry.toNonIndexed`) | `BufferGeometry.toNonIndexed` | three.js | MIT | 0.187.0 | `src/core/BufferGeometry.js` |
| `convexHull`, `VertexList` | `ConvexHull` (quickhull), `ConvexGeometry` | three.js | MIT | 0.187.0 | `examples/jsm/math/ConvexHull.js`, `examples/jsm/geometries/ConvexGeometry.js` |

## Shapes and curves (`src/engine/api/shapes/`)

| Function | Follows | Project | Licence | Version | File |
| --- | --- | --- | --- | --- | --- |
| `sphere`, `capsule`, `torus`, `torusKnot` | `SphereGeometry`, `CapsuleGeometry`, `TorusGeometry`, `TorusKnotGeometry` | three.js | MIT | 0.187.0 | `src/geometries/*.js` |
| `cylinder`, `cone`, `lathe` | `CylinderGeometry`, `ConeGeometry`, `LatheGeometry` | three.js | MIT | 0.187.0 | `src/geometries/*.js` |
| `box`, `plane`, `circle`, `ring` | `BoxGeometry`, `PlaneGeometry`, `CircleGeometry`, `RingGeometry` | three.js | MIT | 0.187.0 | `src/geometries/*.js` |
| `polyhedron`, `icosahedron`, `octahedron`, `dodecahedron` | `PolyhedronGeometry` and its three | three.js | MIT | 0.187.0 | `src/geometries/*.js` |
| `tube` | `TubeGeometry` | three.js | MIT | 0.187.0 | `src/geometries/TubeGeometry.js` |
| `extrude`, `bevelVector` | `ExtrudeGeometry`, its `getBevelVec` and `WorldUVGenerator` | three.js | MIT | 0.187.0 | `src/geometries/ExtrudeGeometry.js` |
| `flat` | `ShapeGeometry` | three.js | MIT | 0.187.0 | `src/geometries/ShapeGeometry.js` |
| `roundedBox` | `RoundedBoxGeometry` | three.js | MIT | 0.187.0 | `examples/jsm/geometries/RoundedBoxGeometry.js` |
| `Curve` (arc lengths, `getUtoTmapping`, `getTangent`, `computeFrenetFrames`) | `Curve` | three.js | MIT | 0.187.0 | `src/extras/core/Curve.js` |
| `CatmullRom3` | `CatmullRomCurve3` (its `CubicPoly`) | three.js | MIT | 0.187.0 | `src/extras/curves/CatmullRomCurve3.js` |
| `Line3Curve`, `Bezier2Curve3`, `Bezier3Curve3`, `Line2Curve`, `Bezier2Curve2`, `Bezier3Curve2` | `LineCurve3`, `QuadraticBezierCurve3`, `CubicBezierCurve3`, `LineCurve`, `QuadraticBezierCurve`, `CubicBezierCurve`, `Interpolations` | three.js | MIT | 0.187.0 | `src/extras/curves/*.js`, `src/extras/core/Interpolations.js` |
| `Ellipse` | `EllipseCurve` | three.js | MIT | 0.187.0 | `src/extras/curves/EllipseCurve.js` |
| `Path`, `Outline` | `CurvePath`, `Path`, `Shape` | three.js | MIT | 0.187.0 | `src/extras/core/CurvePath.js`, `Path.js`, `Shape.js` |
| `area`, `isClockWise`, `triangulate` | `ShapeUtils` | three.js | MIT | 0.187.0 | `src/extras/ShapeUtils.js` |
| `earcut` and its rings and holes (`earcutNodes.ts`, `earcutHoles.ts`) | earcut (ear clipping, hole bridges, z-order hashing) | mapbox/earcut | ISC | 3.0.2 | `src/earcut.js` (vendored by three as `src/extras/lib/earcut.js`) |

## Materials and textures (`src/engine/api/material/`)

| What | Where | Follows | Licence |
| --- | --- | --- | --- |
| The constants' values (sides, blendings, factors, equations, wraps, filters, types, formats, colour spaces, usages) | `material/constants.ts` | three.js 0.187.0, `src/constants.js`: the same numbers and strings, so the engine's readers compare them | MIT |
| Every material's and texture's defaults | `material/material.ts`, `lit.ts`, `unlit.ts`, `look.ts`, `texture.ts` | three.js 0.187.0, `src/materials/*.js`, `src/textures/*.js`: the values read off its constructors | MIT |
| A parameters object set over a material (a colour set from what's given, a vector copied, an unknown key warned of and left out) | `Material.assign` in `material/material.ts` | three.js 0.187.0, `Material.setValues` | MIT |
| A look material's uniforms copied a value at a time (cloned where they can be, arrays sliced); unlike three, a texture is shared | `copyUniforms` in `material/look.ts` | three.js 0.187.0, `cloneUniforms` in `src/renderers/shaders/UniformsUtils.js` | MIT |
| `userData` copied through JSON | `copyUserData` in `material/fields.ts` | three.js 0.187.0, `Material.copy`, `Texture.copy` | MIT |

## The scene (`src/engine/api/scene/`)

| What | Where | Follows | Licence |
| --- | --- | --- | --- |
| A perspective camera's near-plane box from its field of view, aspect, zoom and view offset | `PerspectiveCamera.updateProjectionMatrix` in `scene/camera.ts` | three.js 0.187.0, `PerspectiveCamera.updateProjectionMatrix` | MIT |
| An ortho camera's box zoomed about its middle and cut by its view offset | `OrthoCamera.updateProjectionMatrix` in `scene/camera.ts` | three.js 0.187.0, `OrthographicCamera.updateProjectionMatrix` | MIT |
| A camera's view made from its world matrix with its scale left out | `Camera.matrixWorldInverse` in `scene/camera.ts` | three.js 0.187.0, `Camera.updateMatrixWorld` | MIT |
| A light's shadow camera placed at the light, looking at its target, and its texture-space matrix | `LightShadow.updateMatrices` in `scene/lights.ts` | three.js 0.187.0, `LightShadow.updateMatrices` (WebGPU's depth) | MIT |
| The lights' and shadows' defaults (a directional and a hemisphere light over the origin, the shadows' cameras and map sizes) | `scene/lights.ts` | three.js 0.187.0, `src/lights/*.js` | MIT |
| A ray from a camera through a point of its screen (an ortho camera's from its own plane) | `Raycaster.setFromCamera` in `scene/raycaster.ts` | three.js 0.187.0, `Raycaster.setFromCamera` | MIT |
| Which nodes a ray is tested against (by layers, a `raycast` returning false stopping the descent), hits sorted by distance | `castInto` in `scene/raycaster.ts` | three.js 0.187.0, `intersect` in `Raycaster.js` | MIT |
| A mesh's ray test: the bounding sphere from the ray moved to `near`, the box, then each group's triangles in the draw range, the side's culling, the uv and normal by barycentric weights | `castPlaced`, `castTriangles`, `castTriangle` in `scene/raycast.ts` | three.js 0.187.0, `Mesh.raycast`, `Mesh._computeIntersections`, `checkGeometryIntersection` | MIT |
| An instanced mesh's ray test, instance by instance | `raycastInstances` in `scene/raycast.ts` | three.js 0.187.0, `InstancedMesh.raycast` | MIT |
| A skinned vertex moved by its four bones | `skinnedVertex` in `scene/raycast.ts` | three.js 0.187.0, `SkinnedMesh.applyBoneTransform` | MIT |

## Packages used as they are

| Package | Licence | Version | Used for |
| --- | --- | --- | --- |
| [meshoptimizer](https://github.com/zeux/meshoptimizer) (`meshoptimizer/simplifier`) | MIT | 1.1.1 | fewer triangles: a coarse hand, the Twins' bones, the heroes' shadows and far detail (`entities/models/simplifyIndex.ts`); its author's own build, the wasm three 0.187 vendored (a flag's name apart) |

## Licences

### three.js (MIT)

The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### earcut (ISC)

ISC License

Copyright (c) 2024, Mapbox

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby
granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN
AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
