// The lab's commands as the page runs them (tools/lab): what the session calls, by name, with the lab and the
// command's options. Each sets its fixture up afresh and checks it, so a command's result doesn't depend on the last.
import type { Lab, Fixture, Report, ViewName } from './lab';
import type { Joints } from '../../../src/entities/models/rig';
import { sheet as pictureSheet, type Sheet } from './sheet';
import { carry as carryRound, describeCarry } from './carry';
import { feet as feetRound, missedCanaries, type FeetOptions } from './feet';
import { range as rangeRound, missedRangeCanary, type RangeOptions } from './range';

export interface SheetCommand {
  states: string[];
  views: ViewName[];
  fixture: Fixture;
  focus?: keyof Joints;
}

/** `lab sheet`: the pictures and their notes. */
export function sheet(lab: Lab, command: SheetCommand): Promise<Sheet> {
  return pictureSheet(lab, command);
}

export interface CarryCommand {
  fixture: Fixture;
  canary?: boolean;
  /** list every frame with a clip */
  frames?: boolean;
}

/** `lab carry`: the carried bow against the body; a canary it missed is a problem. */
export async function carry(lab: Lab, command: CarryCommand): Promise<Report> {
  const setup = await lab.setup({ ...command.fixture, nocked: true });
  const report = await carryRound(lab, { canary: command.canary, frames: command.frames });
  const problems: string[] = [];
  if (report.canary && report.canary[0] < report.canary[1]) {
    problems.push(`the canary was caught on ${report.canary[0]} of ${report.canary[1]} planted frames`);
  }
  return { text: `${JSON.stringify(setup)}\n${describeCarry(report)}`, problems };
}

/**
 * `lab feet`: the hero's feet against the ground round the dais's edges and on level ground, the worst moments
 * pictured; a canary it missed is a problem.
 */
export async function feet(lab: Lab, command: FeetOptions): Promise<Report> {
  const report = await feetRound(lab, command);
  return { text: report.lines.join('\n'), problems: missedCanaries(report), moments: report.moments };
}

/**
 * `lab range`: every joint of the hero against a body's ranges, frame by frame, over standing, walking, attacking and
 * reversals, the worst moments pictured; a canary it missed is a problem.
 */
export async function range(lab: Lab, command: RangeOptions): Promise<Report> {
  const report = await rangeRound(lab, command);
  return { text: report.lines.join('\n'), problems: missedRangeCanary(report), moments: report.moments };
}

/** `lab probe`'s set-up before a probe module runs (a probe may set up again as it likes). */
export function setup(lab: Lab, fixture: Fixture): Promise<Record<string, unknown>> {
  return lab.setup(fixture);
}
