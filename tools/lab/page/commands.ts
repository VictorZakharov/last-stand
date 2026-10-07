// The lab's commands as the page runs them (tools/lab): what the session calls, by name, with the lab and the
// command's options. Each sets its fixture up afresh and checks it, so a command's result doesn't depend on the last.
import type { Lab, Fixture, ViewName } from './lab';
import type { Joints } from '../../../src/entities/models/rig';
import { sheet as pictureSheet, type Sheet } from './sheet';
import { carry as carryRound, describeCarry } from './carry';

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
}

/** `lab carry`: the carried bow against the body, as text. */
export async function carry(lab: Lab, command: CarryCommand): Promise<string> {
  const setup = await lab.setup({ ...command.fixture, nocked: true });
  const report = await carryRound(lab, { canary: command.canary });
  return `${JSON.stringify(setup)}\n${describeCarry(report)}`;
}

/** `lab probe`'s set-up before a probe module runs (a probe may set up again as it likes). */
export function setup(lab: Lab, fixture: Fixture): Promise<Record<string, unknown>> {
  return lab.setup(fixture);
}
