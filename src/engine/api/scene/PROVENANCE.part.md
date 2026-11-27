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
