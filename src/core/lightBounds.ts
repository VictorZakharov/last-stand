// Each point light's reach was packed for three's lit shaders' loop (its place as the camera saw it and the square of
// how far it lit, tested before the light itself was read: 13% of the scene pass on WebGL). three's shaders are gone:
// the engine lights the scene by its own loop (src/engine/lights.ts). What's left is the call
// world/arena.ts still makes.
import type { World } from '../engine/api/index.ts';

/** Kept for its caller: nothing is packed now (the bounds were three's lit shaders' alone). */
export function packWhileDrawn(_scene: World): void {}
