// `npm run lab -- roomwarm`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { picturePairs, asText, problemsIn, textWithMoments } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab roomwarm`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'every warm-up that draws a place (each battleground built, the hall, each room) drawn as the game builds '
    + 'it with the hero in Odo\'s shop: the shop alone shown after it (`--canary` leaves the village shown, '
    + 'as #746 did)',
  help: "every warm-up part that draws a place in the shown one's stead (game/warmup.ts placeSwaps: each "
    + "battleground built, the hall of heroes' room, each house's room), built as the warm-ups build it and drawn "
    + "by the game's own warmUp with the hero in a house's room (Odo's shop): after it the arena's own check "
    + "(placesWrong, run every frame in dev builds) finding the shop alone (what each render showed was read off "
    + "three's scene.onBeforeRender; the engine's warm-up renders nothing on the page)",
  options: {
    canary: { kind: 'switch', help: 'the first part hides the village alone, as before #746 (the shop drawn under it), which must be caught' },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('roomwarm', { canary: Boolean(options.canary) });
  },
  // (its moments written: the shop before and after the warm-ups behind it)
  finish(results, options, session) {
    return textWithMoments(results, session.outFor('roomwarm'), session.browser);
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
