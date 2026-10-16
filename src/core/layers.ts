// The scene's layers, each a bit of an object's mask: a camera draws what shares a layer with its own. One list, so
// no two uses take the same bit (the crowds' bodies' own meshes and the arms through the eyes both took 2, and the
// arms' own camera drew every foe within its reach over the frame, huge at its narrower view: lab `draws`).

/** the world, drawn by the game's camera */
export const WORLD_LAYER = 0;
/** what no camera draws: the hero's body through the eyes, but for his arms (entities/viewModel.ts) */
export const HIDDEN_LAYER = 1;
/** the hero's arms and what they hold through the eyes, drawn by their own camera (renderer.ts `drawArms`) */
export const ARMS_LAYER = 2;
/** a crowd's bodies' own meshes, drawn by their crowd instead, kept for what reads them (entities/models/crowd.ts) */
export const CROWD_LAYER = 3;
