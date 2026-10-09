// tools/lab sheet: the hero in the states the player sees him in (standing, both ends of a stride's arm swing, at full
// draw), each moment pictured from the game's own views and close up, with how hard the pose is to hold beside it.
// A pose is judged here first, as a person would hold it, and only then measured (AGENTS.md, Workflow).
import * as THREE from 'three';
import type { Lab, Fixture, ViewName, Tile } from './lab';
import type { Joints } from '../../../src/entities/models/rig';
import { HELD, armComfort, describeArm } from './comfort';
import { bowOf, describeBow } from './ranger';

/** One pictured moment: its tiles and the notes read beside them. */
export interface Moment {
  state: string;
  label: string;
  tiles: Tile[];
  notes: string[];
}

export interface SheetOptions {
  states: string[];
  views: ViewName[];
  fixture: Fixture;
  focus?: keyof Joints;
}

export interface Sheet {
  setup: Record<string, unknown>;
  moments: Moment[];
}

/** A state's script: it runs the game into the state and calls `snap` at each moment to picture. */
type State = (lab: Lab, snap: (label: string) => Promise<void>) => Promise<void>;

const walking = () => ({ keys: ['w'] });
const drawing = () => ({ m0: true });

const ARM_FORWARD = 'walking, arm forward';
const ARM_BACK = 'walking, arm back';

/** how far the left hand leads the hips along the way the hero faces (m) */
function handLead(lab: Lab): number {
  const hand = lab.joints.handL.getWorldPosition(new THREE.Vector3());
  const hips = lab.joints.hips.getWorldPosition(new THREE.Vector3());
  const facing = lab.player.facing;
  return hand.sub(hips).dot(new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing)));
}

/** how far the current shot is drawn (0..1), 0 when none is */
function drawn(lab: Lab): number {
  const cast = lab.player.casting;
  if (!cast?.drawT) return 0;
  return Math.max(0, cast.t - (cast.nockT ?? 0)) / cast.drawT;
}

export const STATES: Record<string, State> = {
  async stand(lab, snap) {
    await lab.step(70);
    await snap('standing');
  },

  /** both ends of the left arm's swing, each pictured as the hand turns back */
  async walk(lab, snap) {
    await lab.step(50, walking);
    const start = lab.player.pos.clone();
    const wanted = new Set([ARM_FORWARD, ARM_BACK]);
    let previous = handLead(lab);
    let moving = 0;
    for (let f = 0; f < 150 && wanted.size > 0; f++) {
      await lab.step(1, walking);
      const lead = handLead(lab);
      const direction = Math.sign(lead - previous);
      if (moving !== 0 && direction !== 0 && direction !== moving) {
        const label = moving > 0 ? ARM_FORWARD : ARM_BACK;
        if (wanted.delete(label)) await snap(label);
      }
      if (direction !== 0) moving = direction;
      previous = lead;
    }
    if (wanted.size > 0) throw new Error(`lab: walk: the arm's swing never turned (${[...wanted].join(', ')})`);
    if (lab.player.pos.distanceTo(start) < 1) throw new Error('lab: walk: the hero never walked');
  },

  async full(lab, snap) {
    await lab.until(() => drawn(lab) >= 1, 240, 'full: the shot never came to full draw', drawing);
    await lab.step(10, drawing);
    await snap('at full draw');
    await lab.step(4);
  },
};

/** The moments of each state, pictured from `views`, with the fixture set up afresh before each state. */
export async function sheet(lab: Lab, options: SheetOptions): Promise<Sheet> {
  for (const name of options.states) {
    if (!STATES[name]) throw new Error(`lab: no state ${name} (the states: ${Object.keys(STATES).join(', ')})`);
  }
  lab.checkCapture(options.views, options.fixture.view ?? 'top', options.focus);
  const moments: Moment[] = [];
  let setup: Record<string, unknown> = {};
  // (the cape's cloth stepped: a sheet is looked at, `Fixture.capes`)
  const fixture = { nocked: !!lab.player.cls.quiver, capes: true, ...options.fixture };
  for (const name of options.states) {
    const state = STATES[name];
    setup = await lab.setup(fixture);
    await state(lab, async (label) => {
      lab.model.root.updateMatrixWorld(true);
      const tiles = lab.capture(options.views, { focus: options.focus });
      moments.push({ state: name, label, tiles, notes: notesOn(lab) });
    });
  }
  return { setup, moments };
}

/** What to read beside the pictures: each arm's load and posture, and how the bow is carried. */
function notesOn(lab: Lab): string[] {
  const held = HELD[lab.player.cls.id] ?? {};
  const notes: string[] = [];
  for (const side of ['L', 'R'] as const) {
    const kg = held[side] ?? 0;
    const name = side === 'L' ? 'left arm' : 'right arm';
    const holding = kg ? ` (${kg} kg in hand)` : '';
    notes.push(`${name}${holding}: ${describeArm(armComfort(lab.joints, side, kg))}`);
  }
  const bow = bowOf(lab);
  if (bow) notes.push(describeBow(lab, bow));
  return notes;
}
