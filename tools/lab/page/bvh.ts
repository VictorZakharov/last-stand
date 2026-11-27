// A motion-capture clip in Biovision's BVH format, read and sampled (`lab live mocap`, mocap.ts): its skeleton (each
// joint's name, parent, offset from it and channels, its end sites as joints of their own), its frames, and each
// joint's place and turn at any moment between them. It reads and samples as three 0.187's `BVHLoader` and an
// `AnimationMixer` playing its clip did: a joint's place is its offset plus its position channels (none: its offset),
// its turn the product of its rotation channels in the order the file lists them, in degrees; a frame `frame times
// frameTime` into the clip, and a moment between two frames their places blended straight and their turns spherically.
// Unlike the mixer, a moment at the clip's very end is its last frame (looped, the mixer had it as its first).
import { Quat, Vec3 } from './sceneApi.ts';

/** A joint of the clip's skeleton: an end site is a joint with no channels named `ENDSITE`, as three's loader names it. */
export interface BvhJoint {
  name: string;
  /** its parent's index among the joints, -1 for the root */
  parent: number;
  /** where it stands from its parent at rest, in the clip's units */
  offset: Vec3;
  /** its channels in the file's order (`Xposition`, `Zrotation`...) */
  channels: string[];
  /** the index of its first channel in a frame's row */
  firstChannel: number;
}

/** A clip read: its joints, parents first, its frames' rows of numbers, and their times. */
export interface Bvh {
  joints: BvhJoint[];
  frames: number[][];
  /** seconds a frame */
  frameTime: number;
  /** its length: its last frame's time */
  seconds: number;
}

/** A joint's place under its parent and its turn there. */
export interface JointPose {
  position: Vec3;
  quaternion: Quat;
}

/** the name three's loader gives an end site */
export const END_SITE = 'ENDSITE';

/** The words of a BVH file, read in order. */
class Words {
  private readonly words: string[];
  private at = 0;

  constructor(text: string) {
    this.words = text.split(/\s+/).filter((word) => word.length > 0);
  }

  /** The next word, consumed. */
  next(): string {
    if (this.at >= this.words.length) throw new Error('bvh: the file ends early');
    return this.words[this.at++];
  }

  /** The next word, which must be `expected`. */
  expect(expected: string): void {
    const word = this.next();
    if (word !== expected) throw new Error(`bvh: read ${word} where ${expected} was expected`);
  }

  /** The next word as a number. */
  number(): number {
    const word = this.next();
    const value = Number(word);
    if (!Number.isFinite(value)) throw new Error(`bvh: read ${word} where a number was expected`);
    return value;
  }
}

/** A joint's body after its name (`{ OFFSET ... CHANNELS ... children }`), added to `joints` with its children. */
function readJoint(words: Words, name: string, parent: number, joints: BvhJoint[], channelsSoFar: number): number {
  words.expect('{');
  words.expect('OFFSET');
  const offset = new Vec3(words.number(), words.number(), words.number());
  const joint: BvhJoint = { name, parent, offset, channels: [], firstChannel: channelsSoFar };
  const index = joints.length;
  joints.push(joint);
  let channels = channelsSoFar;
  if (name !== END_SITE) {
    words.expect('CHANNELS');
    const count = words.number();
    for (let i = 0; i < count; i++) joint.channels.push(words.next());
    channels += count;
  }
  for (;;) {
    const word = words.next();
    if (word === '}') return channels;
    if (word === 'JOINT') {
      channels = readJoint(words, words.next(), index, joints, channels);
    } else if (word === 'End') {
      words.expect('Site');
      channels = readJoint(words, END_SITE, index, joints, channels);
    } else {
      throw new Error(`bvh: read ${word} in ${name}'s body`);
    }
  }
}

/** `text` read as a BVH clip. */
export function readBvh(text: string): Bvh {
  const words = new Words(text);
  words.expect('HIERARCHY');
  words.expect('ROOT');
  const joints: BvhJoint[] = [];
  const channels = readJoint(words, words.next(), -1, joints, 0);
  words.expect('MOTION');
  words.expect('Frames:');
  const count = words.number();
  words.expect('Frame');
  words.expect('Time:');
  const frameTime = words.number();
  const frames: number[][] = [];
  for (let frame = 0; frame < count; frame++) {
    const row: number[] = [];
    for (let i = 0; i < channels; i++) row.push(words.number());
    frames.push(row);
  }
  return { joints, frames, frameTime, seconds: Math.max(0, count - 1) * frameTime };
}

/** the axes a rotation channel turns about, by its first letter */
const AXES: Record<string, Vec3> = { X: new Vec3(1, 0, 0), Y: new Vec3(0, 1, 0), Z: new Vec3(0, 0, 1) };
const channelTurn = new Quat();

/** `joint` as frame `row` has it, into `out`. */
function jointInFrame(joint: BvhJoint, row: number[], out: JointPose): JointPose {
  out.position.copy(joint.offset);
  out.quaternion.set(0, 0, 0, 1);
  joint.channels.forEach((channel, i) => {
    const value = row[joint.firstChannel + i];
    const axis = channel[0];
    if (channel.endsWith('position')) {
      const component = 'XYZ'.indexOf(axis);
      out.position.setComponent(component, out.position.getComponent(component) + value);
    } else {
      out.quaternion.multiply(channelTurn.setFromAxisAngle(AXES[axis], value * Math.PI / 180));
    }
  });
  return out;
}

/** A pose for each of `bvh`'s joints, at rest. */
export function posesOf(bvh: Bvh): JointPose[] {
  return bvh.joints.map((joint) => ({ position: joint.offset.clone(), quaternion: new Quat() }));
}

const before: JointPose = { position: new Vec3(), quaternion: new Quat() };
const after: JointPose = { position: new Vec3(), quaternion: new Quat() };

/** Each of `bvh`'s joints at `seconds` into it (held to its length), into `out` (`posesOf`'s): between two frames,
 *  their places blended straight and their turns spherically. */
export function sampleBvh(bvh: Bvh, seconds: number, out: JointPose[]): JointPose[] {
  if (!bvh.frames.length) return out;
  const last = bvh.frames.length - 1;
  const at = bvh.frameTime > 0 ? Math.min(Math.max(seconds, 0) / bvh.frameTime, last) : 0;
  const frame = Math.min(Math.floor(at), last);
  const next = Math.min(frame + 1, last);
  const share = at - frame;
  bvh.joints.forEach((joint, i) => {
    jointInFrame(joint, bvh.frames[frame], before);
    jointInFrame(joint, bvh.frames[next], after);
    out[i].position.lerpVectors(before.position, after.position, share);
    out[i].quaternion.slerpQuaternions(before.quaternion, after.quaternion, share);
  });
  return out;
}
