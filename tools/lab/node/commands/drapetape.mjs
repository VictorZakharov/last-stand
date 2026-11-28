// `npm run lab -- drapetape`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { REPO } from '../paths.mjs';
import { asText, problemsIn } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/**
 * Each side's text under its name, and each side's tape written in `dir` as `<filePrefix><class>.drape` (a class
 * the set-up's, `hero` when none was asked for).
 */
function textWithTapes(results, dir, hero) {
  mkdirSync(dir, { recursive: true });
  const parts = [];
  for (const [side, result] of results) {
    const lines = [`${side.name}\n${asText(result)}`];
    if (result?.tape) {
      const file = join(dir, `${side.filePrefix}${hero}.drape`);
      writeFileSync(file, Buffer.from(result.tape, 'base64'));
      lines.push(`tape: ${relative(REPO, file)} (Bulwark: cargo run --profile harness --bin drape -- <tape>)`);
    }
    parts.push(lines.join('\n'));
  }
  return parts.join('\n\n');
}

/** `lab drapetape`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the hero\'s cloth drape calls written down as he walks and stands (each call\'s input and the points it '
    + 'gave back), a tape for the engine\'s own bench to replay, time and check natively',
  help: 'the hero\'s cloth drape calls (models/armor.ts Skirt.drape, the engine\'s drape_cloth) written down as he '
    + 'walks and then stands, each call\'s input and the points it gave back, into tools/lab/out/drape/<class>.drape: '
    + 'Bulwark\'s `cargo run --profile harness --bin drape -- <tape>` replays each call, holds its points to the '
    + 'page\'s and times it',
  options: {
    frames: { kind: 'number', usage: 'n', help: 'frames walking, then as many standing (120 by default)' },
    canary: {
      kind: 'switch',
      help: 'plant a fault the bench must catch: one call\'s points given back moved by a centimetre',
    },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('drapeTape', { frames: options.frames, canary: Boolean(options.canary) });
  },
  finish(results, options, session) {
    return textWithTapes(results, session.outFor('drape'), options.class ?? 'hero');
  },
  textOf: asText,
  problemsOf: problemsIn,
};
