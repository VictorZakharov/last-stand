// What the game takes of three.js, all through this one module (VictorZakharov/last-stand#973: three leaves the game
// whole). Every file of `src` imports its `THREE` from here, never from 'three' itself (`npm run check:three` fails
// one that does), so each of three's names is moved to the engine's own one in this one place: re-exported as three
// has it till then, given an engine's class of its own after. `node tools/three/census.mjs` says what's still three's.
export * from 'three';
