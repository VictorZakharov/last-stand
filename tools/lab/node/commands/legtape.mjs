// `npm run lab -- legtape`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { REPO } from '../paths.mjs';
import { asText, problemsIn } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** Each side's text under its name, and each side's tape written in `dir` as `<filePrefix><class><engineSuffix>.legs`
 *  (`-engine` for a tape of the engine's port in the game). */
function textWithTapes(results, dir, hero, engineSuffix) {
  mkdirSync(dir, { recursive: true });
  const parts = [];
  for (const [side, result] of results) {
    const lines = [`${side.name}\n${asText(result)}`];
    if (result?.tape) {
      const file = join(dir, `${side.filePrefix}${hero}${engineSuffix}.legs`);
      writeFileSync(file, Buffer.from(result.tape, 'base64'));
      lines.push(`tape: ${relative(REPO, file)} (Bulwark: cargo run --profile harness --bin legs -- <tape>)`);
    }
    parts.push(lines.join('\n'));
  }
  return parts.join('\n\n');
}

/** `lab legtape`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'every leg IK call written down as the hero walks, turns and stops among walking foes (its arguments, '
    + 'the joints before and after, what it gave back), a tape Bulwark\'s port of the leg IK replays and is held to',
  help: 'every call the game makes to the leg IK (models/ik.ts LegIK) written down as the hero walks forward, round, '
    + 'back and stands among four walking foes: each call\'s arguments, the rig\'s joints before and after it and '
    + 'what it gave back, with the floor, into tools/lab/out/legs/<class>.legs: Bulwark\'s `cargo run --profile '
    + 'harness --bin legs -- <tape>` replays every body\'s calls with its port, holds its joints to the page\'s '
    + 'and times it',
  options: {
    frames: { kind: 'number', usage: 'n', help: 'frames of each leg of the walk (90 by default)' },
    canary: {
      kind: 'switch',
      help: 'plant a fault the replay must catch: one update\'s joints given back turned by 0.01',
    },
    engine: {
      kind: 'switch',
      help: 'the bodies doing their leg IK by the engine\'s port (rustLegs.ts): replayed, the tape holds what the game '
        + 'hands over and takes back to the port\'s own',
    },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('legTape', {
      frames: options.frames,
      canary: Boolean(options.canary),
      engine: Boolean(options.engine),
    });
  },
  finish(results, options, session) {
    return textWithTapes(results, session.outFor('legs'), options.class ?? 'hero', options.engine ? '-engine' : '');
  },
  textOf: asText,
  problemsOf: problemsIn,
};
