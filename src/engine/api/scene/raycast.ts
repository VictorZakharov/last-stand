// Where a ray meets a mesh's triangles: its bounding sphere in the world first, then each triangle drawn (its
// groups and draw range honoured) in the mesh's own space, the back faces left out where its material draws the
// front alone. An instanced mesh is each instance in turn; a skinned mesh's vertices are moved by its bones first.
// The meshes' classes are read by their flags, never imported: they import this file.
import type { Attribute, Geometry } from '../geometry/index.ts';
import { BackSide, FrontSide, type Material } from '../material/index.ts';
import { Mat4, Ray, Sphere, Vec2, Vec3 } from '../math/index.ts';
import type { InstancedMesh } from './instanced.ts';
import type { Mesh } from './mesh.ts';
import type { Hit, HitFace, Raycaster } from './raycaster.ts';
import type { SkinnedMesh } from './skinned.ts';

const scratchSphere = new Sphere();
const scratchLocalRay = new Ray();
const scratchNearRay = new Ray();
const scratchSphereAt = new Vec3();
const scratchInverse = new Mat4();
const scratchInstance = new Mat4();
const scratchInstanceWorld = new Mat4();
const scratchCornerA = new Vec3();
const scratchCornerB = new Vec3();
const scratchCornerC = new Vec3();
const scratchMet = new Vec3();
const scratchWorldMet = new Vec3();
const scratchEdge = new Vec3();
const scratchEdge2 = new Vec3();
const scratchToPoint = new Vec3();

/** A mesh as it's cast against: its own triangles placed by `world`, its vertices moved by `vertex`. */
interface Cast {
  mesh: Mesh;
  world: Mat4;
  raycaster: Raycaster;
  ray: Ray;
  hits: Hit[];
  vertex: (at: number, target: Vec3) => Vec3;
}

/** Where `raycaster`'s ray meets `mesh`, added to `hits` (unsorted: the raycaster sorts them). */
export function raycastMesh(mesh: Mesh, raycaster: Raycaster, hits: Hit[]): void {
  if ('isInstancedMesh' in mesh) {
    raycastInstances(mesh as unknown as InstancedMesh, raycaster, hits);
    return;
  }
  const skinned = 'isSkinnedMesh' in mesh ? mesh as unknown as SkinnedMesh : null;
  if (skinned?.skeleton) {
    // (a posed mesh's own bounds aren't its geometry's: tested triangle by triangle where the bones have it)
    const bound = skinnedVertex(skinned);
    castTriangles({ mesh, world: mesh.matrixWorld, raycaster, ray: localRay(mesh.matrixWorld, raycaster), hits,
      vertex: bound });
    return;
  }
  castPlaced(mesh, mesh.matrixWorld, raycaster, hits);
}

/**
 * `mesh` placed by `world`, its bounding sphere and box tested first, then its triangles. Follows three 0.187's
 * `Mesh.raycast` (the sphere from the ray moved to `near`, the far end within `far - near`).
 */
function castPlaced(mesh: Mesh, world: Mat4, raycaster: Raycaster, hits: Hit[]): void {
  const geometry = mesh.geometry;
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  scratchSphere.copy(geometry.boundingSphere!).applyMatrix4(world);
  scratchNearRay.copy(raycaster.ray).recast(raycaster.near);
  if (!scratchSphere.containsPoint(scratchNearRay.origin)) {
    if (scratchNearRay.intersectSphere(scratchSphere, scratchSphereAt) === null) return;
    const span = raycaster.far - raycaster.near;
    if (scratchNearRay.origin.distanceToSquared(scratchSphereAt) > span * span) return;
  }
  const ray = localRay(world, raycaster);
  if (geometry.boundingBox && !ray.intersectsBox(geometry.boundingBox)) return;
  castTriangles({ mesh, world, raycaster, ray, hits, vertex: plainVertex(geometry) });
}

/** The ray in the space `world` places, into a shared ray. */
function localRay(world: Mat4, raycaster: Raycaster): Ray {
  scratchInverse.copy(world).invert();
  return scratchLocalRay.copy(raycaster.ray).applyMatrix4(scratchInverse);
}

/**
 * Each of `mesh`'s first `count` instances cast against as a mesh of its own, the hits naming the instanced mesh
 * and the instance. Follows three 0.187's `InstancedMesh.raycast` (all the instances' sphere first).
 */
function raycastInstances(mesh: InstancedMesh, raycaster: Raycaster, hits: Hit[]): void {
  const world = mesh.matrixWorld;
  if (!mesh.boundingSphere) mesh.computeBoundingSphere();
  scratchSphere.copy(mesh.boundingSphere!).applyMatrix4(world);
  if (!raycaster.ray.intersectsSphere(scratchSphere)) return;
  for (let id = 0; id < mesh.count; id++) {
    mesh.getMatrixAt(id, scratchInstance);
    scratchInstanceWorld.multiplyMatrices(world, scratchInstance);
    const first = hits.length;
    castPlaced(mesh, scratchInstanceWorld, raycaster, hits);
    for (let i = first; i < hits.length; i++) hits[i].instanceId = id;
  }
}

/** A geometry's vertex where its position attribute has it. */
function plainVertex(geometry: Geometry): (at: number, target: Vec3) => Vec3 {
  const position = geometry.getAttribute('position')!;
  return (at, target) => target.set(position.getX(at), position.getY(at), position.getZ(at));
}

/** A mesh's vertex `at` where it's drawn in its own space (a skinned mesh's where its bones have moved it). */
export function vertexPosition(mesh: Mesh, at: number, target: Vec3): Vec3 {
  const skinned = mesh as SkinnedMesh;
  if (skinned.isSkinnedMesh && skinned.skeleton) return skinnedVertex(skinned)(at, target);
  return plainVertex(mesh.geometry)(at, target);
}

/** A skinned mesh's vertex where its bones have moved it, in the mesh's own space (`applyBoneTransform`). */
function skinnedVertex(mesh: SkinnedMesh): (at: number, target: Vec3) => Vec3 {
  const position = mesh.geometry.getAttribute('position')!;
  return (at, target) => {
    target.set(position.getX(at), position.getY(at), position.getZ(at));
    return mesh.applyBoneTransform(at, target);
  };
}

/**
 * Every triangle drawn of the cast's mesh tested, a material a group where it has several. Follows three 0.187's
 * `Mesh._computeIntersections` (each group cut to the draw range, `faceIndex` the first index over three).
 */
function castTriangles(cast: Cast): void {
  const geometry = cast.mesh.geometry;
  const index = geometry.index;
  const position = geometry.getAttribute('position');
  if (!index && !position) return;
  const count = index ? index.count : position!.count;
  const range = geometry.drawRange;
  const material = cast.mesh.material;
  const corner = index ? (at: number): number => index.getX(at) : (at: number): number => at;
  if (Array.isArray(material)) {
    for (const group of geometry.groups) {
      const groupMaterial = material[group.materialIndex];
      if (!groupMaterial) continue;
      const start = Math.max(group.start, range.start);
      const end = Math.min(count, group.start + group.count, range.start + range.count);
      castRun(cast, groupMaterial, group.materialIndex, start, end, corner);
    }
  } else {
    const start = Math.max(0, range.start);
    const end = Math.min(count, range.start + range.count);
    castRun(cast, material, 0, start, end, corner);
  }
}

/** The triangles from index `start` to `end` tested by `material`'s side. */
function castRun(cast: Cast, material: Material, materialIndex: number, start: number, end: number,
  corner: (at: number) => number): void {
  for (let i = start; i < end; i += 3) {
    const hit = castTriangle(cast, material, corner(i), corner(i + 1), corner(i + 2));
    if (!hit) continue;
    hit.faceIndex = Math.floor(i / 3);
    hit.face!.materialIndex = materialIndex;
    cast.hits.push(hit);
  }
}

/**
 * The triangle `a`, `b`, `c` tested, its hit made where it's met within the raycaster's span: three 0.187's
 * `checkGeometryIntersection` (a back side's triangle wound the other way, the uv and the normal weighed by the
 * point's barycentric weights, the normal turned toward the ray).
 */
function castTriangle(cast: Cast, material: Material, a: number, b: number, c: number): Hit | null {
  cast.vertex(a, scratchCornerA);
  cast.vertex(b, scratchCornerB);
  cast.vertex(c, scratchCornerC);
  const met = material.side === BackSide
    ? cast.ray.intersectTriangle(scratchCornerC, scratchCornerB, scratchCornerA, true, scratchMet)
    : cast.ray.intersectTriangle(scratchCornerA, scratchCornerB, scratchCornerC, material.side === FrontSide,
      scratchMet);
  if (met === null) return null;
  scratchWorldMet.copy(scratchMet).applyMatrix4(cast.world);
  const raycaster = cast.raycaster;
  const distance = raycaster.ray.origin.distanceTo(scratchWorldMet);
  if (distance < raycaster.near || distance > raycaster.far) return null;
  const weights = barycentric(scratchMet, scratchCornerA, scratchCornerB, scratchCornerC, new Vec3());
  const faceTurn = faceNormal(scratchCornerA, scratchCornerB, scratchCornerC, new Vec3());
  const face: HitFace = { a, b, c, normal: faceTurn, materialIndex: 0 };
  const hit: Hit = { distance, point: scratchWorldMet.clone(), object: cast.mesh, face, barycoord: weights };
  const geometry = cast.mesh.geometry;
  const uv = geometry.getAttribute('uv');
  if (uv) hit.uv = weighed2(uv, a, b, c, weights);
  const normal = geometry.getAttribute('normal');
  if (normal) {
    const n = weighed3(normal, a, b, c, weights);
    if (n.dot(cast.ray.direction) > 0) n.multiplyScalar(-1);
    hit.normal = n;
  }
  return hit;
}

/** The way the triangle `a`, `b`, `c` faces by its winding, into `target` (nought for a triangle of no area). */
function faceNormal(a: Vec3, b: Vec3, c: Vec3, target: Vec3): Vec3 {
  scratchEdge.subVectors(c, b);
  scratchEdge2.subVectors(a, b);
  target.crossVectors(scratchEdge, scratchEdge2);
  const length = target.length();
  return length > 0 ? target.multiplyScalar(1 / length) : target.set(0, 0, 0);
}

/** `point`'s weights on the triangle `a`, `b`, `c`'s corners, into `target` (all nought for one of no area). */
function barycentric(point: Vec3, a: Vec3, b: Vec3, c: Vec3, target: Vec3): Vec3 {
  scratchEdge.subVectors(c, a);
  scratchEdge2.subVectors(b, a);
  scratchToPoint.subVectors(point, a);
  const cc = scratchEdge.dot(scratchEdge);
  const cb = scratchEdge.dot(scratchEdge2);
  const cp = scratchEdge.dot(scratchToPoint);
  const bb = scratchEdge2.dot(scratchEdge2);
  const bp = scratchEdge2.dot(scratchToPoint);
  const denominator = cc * bb - cb * cb;
  if (denominator === 0) return target.set(0, 0, 0);
  const towardC = (bb * cp - cb * bp) / denominator;
  const towardB = (cc * bp - cb * cp) / denominator;
  return target.set(1 - towardC - towardB, towardB, towardC);
}

/** A two-number attribute at `a`, `b`, `c` weighed by `weights`. */
function weighed2(attribute: Attribute, a: number, b: number, c: number, weights: Vec3): Vec2 {
  const x = attribute.getX(a) * weights.x + attribute.getX(b) * weights.y + attribute.getX(c) * weights.z;
  const y = attribute.getY(a) * weights.x + attribute.getY(b) * weights.y + attribute.getY(c) * weights.z;
  return new Vec2(x, y);
}

/** A three-number attribute at `a`, `b`, `c` weighed by `weights`. */
function weighed3(attribute: Attribute, a: number, b: number, c: number, weights: Vec3): Vec3 {
  const x = attribute.getX(a) * weights.x + attribute.getX(b) * weights.y + attribute.getX(c) * weights.z;
  const y = attribute.getY(a) * weights.x + attribute.getY(b) * weights.y + attribute.getY(c) * weights.z;
  const z = attribute.getZ(a) * weights.x + attribute.getZ(b) * weights.y + attribute.getZ(c) * weights.z;
  return new Vec3(x, y, z);
}
