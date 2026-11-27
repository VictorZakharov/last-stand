// The cameras' projections and views, and rays from them, against numbers read once off three 0.187 (its cameras
// with `coordinateSystem = WebGPUCoordinateSystem`, the engine's clip depth).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vec2, Vec3 } from '../math/index.ts';
import { OrthoCamera, PerspectiveCamera } from './camera.ts';
import { DirectionalLight } from './lights.ts';
import { Raycaster } from './raycaster.ts';
import { near } from './testing.ts';

test('a perspective projection is three\'s for WebGPU depth, zoomed and offset', () => {
  const camera = new PerspectiveCamera(60, 1.5, 0.5, 300);
  near(camera.projectionMatrix.elements, [1.154700538, 0, 0, 0, 0, 1.732050808, 0, 0, 0, 0, -1.001669449, -1,
    0, 0, -0.500834725, 0], 1e-8, 'plain');
  camera.zoom = 2;
  camera.setViewOffset(1920, 1080, 100, 50, 1600, 900);
  assert.equal(camera.aspect, 1920 / 1080);
  near(camera.projectionMatrix.elements, [2.33826859, 0, 0, 0, 0, 4.156921938, 0, 0, -0.075, 0.088888889,
    -1.001669449, -1, 0, 0, -0.500834725, 0], 1e-8, 'offset');
  near(camera.projectionMatrixInverse.elements, [0.427666866, 0, 0, 0, 0, 0.240562612, 0, 0, 0, 0, 0, -1.996666667,
    -0.032075015, 0.021383343, -1, 2], 1e-8, 'inverse');
  camera.clearViewOffset();
  near(camera.projectionMatrix.elements, [1.948557159, 0, 0, 0, 0, 3.464101615, 0, 0, 0, 0, -1.001669449, -1,
    0, 0, -0.500834725, 0], 1e-8, 'cleared');
});

test('an ortho projection is three\'s for WebGPU depth, zoomed and offset', () => {
  const camera = new OrthoCamera(-34, 34, 34, -34, 1, 90);
  near(camera.projectionMatrix.elements, [0.029411765, 0, 0, 0, 0, 0.029411765, 0, 0, 0, 0, -0.011235955, 0,
    0, 0, -0.011235955, 1], 1e-8, 'plain');
  camera.zoom = 1.5;
  camera.setViewOffset(800, 600, 40, 30, 400, 300);
  near(camera.projectionMatrix.elements, [0.088235294, 0, 0, 0, 0, 0.088235294, 0, 0, 0, 0, -0.011235955, 0,
    0.8, -0.8, -0.011235955, 1], 1e-8, 'offset');
});

test('a camera\'s lookAt turns its −z to the target, and its view inverts its world', () => {
  const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 100);
  camera.position.set(3, 4, 5);
  camera.lookAt(0, 1, 0);
  near(camera.quaternion.toArray(), [-0.226819447, 0.259434987, 0.06282535, 0.936642622], 1e-8, 'turn');
  near(camera.getWorldDirection(new Vec3()).toArray(), [-0.457495711, -0.457495711, -0.762492852], 1e-8, 'way');
  near(camera.matrixWorldInverse.elements, [0.857492926, -0.235379601, 0.457495711, 0, 0, 0.889211828, 0.457495711,
    0, -0.514495755, -0.392299336, 0.762492852, 0, 0, -0.889211828, -7.014934235, 1], 1e-8, 'view');
  camera.position.y = 10;
  // (the view's y offset is minus its up axis (its second row) on the place: 3, 10, 5 now)
  const up = [-0.235379601, 0.889211828, -0.392299336];
  const offset = -(up[0] * 3 + up[1] * 10 + up[2] * 5);
  assert.ok(Math.abs(camera.matrixWorldInverse.elements[13] - offset) < 1e-6, 'made again after a move');
});

test('a scaled camera\'s view leaves its scale out', () => {
  const camera = new PerspectiveCamera();
  camera.position.set(1, 2, 3);
  camera.scale.set(2, 2, 2);
  camera.rotation.y = 0.3;
  near(camera.matrixWorldInverse.elements, [0.955336489, 0, 0.295520207, 0, 0, 1, 0, 0, -0.295520207, 0,
    0.955336489, 0, -0.068775869, -2, -3.161529674, 1], 1e-8);
});

test('setFromCamera casts from a perspective camera through the point, as three does', () => {
  const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 100);
  camera.position.set(3, 4, 5);
  camera.lookAt(0, 1, 0);
  const ray = new Raycaster();
  ray.setFromCamera(new Vec2(0.25, -0.4), camera);
  near(ray.ray.origin.toArray(), [3, 4, 5], 1e-9, 'origin');
  near(ray.ray.direction.toArray(), [-0.227211708, -0.600450759, -0.766703154], 1e-7, 'direction');
  assert.equal(ray.camera, camera);
});

test('setFromCamera casts from an ortho camera\'s plane along its view, as three does', () => {
  const camera = new OrthoCamera(-34, 34, 34, -34, 1, 90);
  camera.position.set(-2, 10, 3);
  camera.lookAt(1, 0, -1);
  const ray = new Raycaster();
  ray.setFromCamera(new Vec2(0.5, 0.25), camera);
  near(ray.ray.origin.toArray(), [16.161578674, 13.801315562, 7.117895101], 1e-6, 'origin');
  near(ray.ray.direction.toArray(), [0.268328157, -0.894427191, -0.357770876], 1e-7, 'direction');
});

test('a sun\'s shadow camera stands at it looking at its target, its matrix three\'s for WebGPU depth', () => {
  const sun = new DirectionalLight();
  sun.position.set(10, 20, 5);
  sun.target.position.set(1, 0, 2);
  const box = sun.shadow.camera;
  box.left = box.bottom = -34;
  box.right = box.top = 34;
  box.near = 1;
  box.far = 90;
  box.updateProjectionMatrix();
  sun.shadow.updateMatrices(sun);
  near(box.matrixWorldInverse.elements, [0.316227766, -0.857142857, 0.406578556, 0, 0, 0.428571429, 0.903507903, 0,
    -0.948683298, -0.285714286, 0.135526185, 0, 1.58113883, 1.428571429, -22.813574548, 1], 1e-7, 'view');
  near(sun.shadow.matrix.elements, [0.004650408, -0.012605042, -0.004568298, 0, 0, 0.006302521, -0.010151774, 0,
    -0.013951225, -0.004201681, -0.001522766, 0, 0.523252042, 0.521008403, 0.245096343, 1], 1e-8, 'matrix');
});
