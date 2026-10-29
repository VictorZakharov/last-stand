// The first visit's training (game/training.ts keeps it, ui/training.ts shows it): the steps a new player takes round
// the village before its portals open, each done as the player does it, in any order.

/** A step of the training. */
export type TrainingStep = 'yard' | 'dummy' | 'map' | 'stash' | 'notice';

/** The training's steps, in the order the tracker lists them: what each asks, and the key that does it with a
 *  keyboard (said beside it then; on touch, its button shows). */
export const TRAINING: readonly { id: TrainingStep; text: string; key?: string }[] = [
  { id: 'yard', text: 'Walk into the training yard' },
  { id: 'dummy', text: 'Strike a training dummy' },
  { id: 'map', text: 'Open the map', key: 'M' },
  { id: 'stash', text: 'Open the stash at the chest' },
  { id: 'notice', text: 'Read the notice board' },
];
