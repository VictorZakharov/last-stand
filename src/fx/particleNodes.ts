// The particle pools' and the dazed stars' meshes: each particle an instanced quad over the pool's own attributes.
// The engine draws neither (`userData.particles`, the name 'dazed stars': engine/draws.ts): it's handed the pools
// whole as its sprites (engine/sprites.ts). The mesh stands in the scene for what reads it there (the profiler's
// parts, the warm-ups). Three's node materials that drew these on WebGPU are gone with three.
import { floats, InstancedAttribute, InstancedGeometry, Material, Mesh } from '../engine/api/index.ts';

/** A quad a particle over `attributes` (instanced, by name), drawn with `material`; its instances none until a
 *  frame sets them. */
export function particleQuads(attributes: Record<string, InstancedAttribute>,
  material: Material): Mesh<InstancedGeometry, Material> {
  const geometry = new InstancedGeometry();
  geometry.setAttribute('position', floats([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0], 3));
  geometry.setAttribute('uv', floats([0, 0, 1, 0, 0, 1, 1, 1], 2));
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  for (const [name, attribute] of Object.entries(attributes)) geometry.setAttribute(name, attribute);
  geometry.instanceCount = 0;
  return new Mesh(geometry, material);
}
