// The game's scene API as the lab's measures import it (Bulwark's, src/engine/api, VictorZakharov/last-stand#973):
// its classes and functions by their names, and its generators as `shapes` (`shapes.sphere(...)`). Every measure
// imports them from here, never from the API's folder, so an A/B's other side, a commit from before the API whose game
// is three's, can be handed three's under the same names: there the lab's Vite plugin resolves these two paths to
// `threeAsApi.js` (`exportedTreePaths` in node/commits.mjs), and a measure runs on either side as it's written.
export * from '../../../src/engine/api/index.ts';
export * as shapes from '../../../src/engine/api/shapes/index.ts';
