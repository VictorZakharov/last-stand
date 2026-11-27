// A node's turn kept in step both ways, its world matrix under a moving parent, attach and lookAt, against numbers
// read once off three 0.187's `Object3D` doing the same.
import { test } from 'node:test';
import { Quat, Vec3 } from '../math/index.ts';
import { Node } from './node.ts';
import { near } from './testing.ts';

const angles = (node: Node): number[] => [node.rotation.x, node.rotation.y, node.rotation.z];

test('a turn about y set by its angle reads as three\'s quaternion', () => {
  const node = new Node();
  node.rotation.y = 0.5;
  near(node.quaternion.toArray(), [0, 0.247403959, 0, 0.968912422], 1e-9);
});

test('a quaternion set whole reads as three\'s angles', () => {
  const node = new Node();
  node.quaternion.setFromAxisAngle(new Vec3(1, 0.2, 0).normalize(), 0.8);
  near(angles(node), [0.790196824, 0.141153367, -0.058945673], 1e-8);
});

test('a quaternion set a field at a time reads as the angles it was made from', () => {
  const node = new Node();
  const q = new Quat(0.002120202, -0.220556017, 0.40630616, 0.886716331);
  node.quaternion.x = q.x;
  node.quaternion.y = q.y;
  node.quaternion.z = q.z;
  node.quaternion.w = q.w;
  near(angles(node), [0.2, -0.4, 0.9], 1e-7);
});

test('angles set a field at a time, in their own order, read as three\'s quaternion', () => {
  const node = new Node();
  node.quaternion.x = 0.002120202;
  node.rotation.order = 'YXZ';
  node.rotation.x = 0.1;
  node.rotation.y = 0.2;
  node.rotation.z = 0.3;
  near(node.quaternion.toArray(), [0.064071348, 0.091157549, 0.143572175, 0.983347443], 1e-8);
});

/** a parent placed and turned, with a child placed and scaled under it */
function family(): { parent: Node; child: Node } {
  const parent = new Node();
  parent.position.set(1, 2, 3);
  parent.rotation.set(0.1, 0.2, 0.3);
  const child = new Node();
  child.position.set(0, 1, 0);
  child.scale.set(2, 2, 2);
  parent.add(child);
  return { parent, child };
}

test('a child\'s world matrix is made again after its parent moves', () => {
  const { parent, child } = family();
  near(child.matrixWorld.elements, [1.872586727, 0.625983652, -0.318690159, 0, -0.579258955, 1.889404972,
    0.307583996, 0, 0.397338662, -0.19568679, 1.950340654, 0, 0.710370522, 2.944702486, 3.153791998, 1], 1e-8);
  parent.position.x = -4;
  parent.rotation.y = 1.2;
  near(child.matrixWorld.elements, [0.69234717, 0.765873207, -1.712919621, 0, -0.214168077, 1.846132061,
    0.738869709, 0, 1.864078172, -0.072350825, 0.72109495, 0, -4.107084038, 2.923066031, 3.369434854, 1], 1e-8);
});

test('attach keeps where a node stands in the world', () => {
  const { parent, child } = family();
  parent.position.x = -4;
  parent.rotation.y = 1.2;
  const other = new Node();
  other.position.set(5, -1, 2);
  other.rotation.set(0, -0.9, 0.4);
  other.scale.set(1, 3, 1);
  const moved = new Node();
  moved.position.set(0.5, 0.5, 0.5);
  moved.rotation.set(0.3, 0, 0);
  child.add(moved);
  near(moved.matrixWorld.elements, [0.69234717, 0.765873207, -1.712919621, 0, 0.346270188, 1.742296191,
    0.918967322, 0, 1.844112891, -0.614688712, 0.470537389, 0, -2.935955406, 4.192893252, 3.242957374, 1], 1e-8,
    'before');
  other.attach(moved);
  near(moved.position.toArray(), [-1.624665914, 2.108281644, 6.989082117], 1e-7, 'place');
  near(moved.quaternion.toArray(), [0.384014098, 0.750727285, -0.014949089, 0.538513654], 1e-7, 'turn');
  near(moved.scale.toArray(), [1.732228207, 1.622308083, 1.676885914], 1e-7, 'size');
  near(moved.matrixWorld.elements, [0.281076369, 2.596618791, -1.930974922, 0, -0.77669179, 3.533051022,
    0.042083393, 0, 1.850716597, -1.499909117, 1.193473118, 0, -2.935955406, 4.192893252, 3.242957374, 1], 1e-7,
    'after');
});

test('lookAt turns a node\'s +z to the target, under a turned parent', () => {
  const parent = new Node();
  parent.rotation.y = 0.5;
  const node = new Node();
  node.position.set(1, 1, 1);
  parent.add(node);
  node.lookAt(4, 0, -2);
  near(node.quaternion.toArray(), [0.084237907, 0.778384657, -0.106992702, 0.612840813], 1e-8);
});
