// What the music sends to WebAudio, read where it goes (tools/lab `music`): every buffer source the page starts, as
// it starts it (its buffer, where in it, its loop), and what each track's output node carries, by an analyser on it.
// The track's own bookkeeping (core/music.ts) is what's being checked, so neither reads it.

/** A buffer source started: on what, from where (s) and looping over what. */
export interface SourceStart {
  buffer: AudioBuffer | null;
  offset: number;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
}

/** Alters a start's offset before it's passed on (a canary's fault), given the offset asked for. */
export type OffsetFault = (offset: number) => number;

type StartMethod = AudioBufferSourceNode['start'];

/** Every buffer source the page starts from now on, kept until `remove`. */
export class SourceLog {
  readonly starts: SourceStart[] = [];
  /** a canary's fault in what's passed on, none by default */
  fault: OffsetFault | null = null;
  private readonly original: StartMethod;

  constructor() {
    const prototype = AudioBufferSourceNode.prototype;
    const original = prototype.start;
    const log = this;
    this.original = original;
    prototype.start = function start(this: AudioBufferSourceNode, when = 0, offset = 0, duration?: number): void {
      const passed = log.fault ? log.fault(offset) : offset;
      log.starts.push({
        buffer: this.buffer,
        offset: passed,
        loop: this.loop,
        loopStart: this.loopStart,
        loopEnd: this.loopEnd,
      });
      if (duration === undefined) original.call(this, when, passed);
      else original.call(this, when, passed, duration);
    };
  }

  /** The page's own `start` put back. */
  remove(): void {
    AudioBufferSourceNode.prototype.start = this.original;
  }
}

/** the samples an analyser reads its level over (at 48 kHz, 0.17 s) */
const LISTEN_SAMPLES = 8192;
/** the level read from nothing at all (dB) */
const SILENCE_DB = -200;

/** `analyser` taken off `node`, unless the track did it first (a track let go disconnects its node from all). */
function disconnect(node: GainNode, analyser: AnalyserNode): void {
  try {
    node.disconnect(analyser);
  } catch {
    // (no longer connected)
  }
}

/** An analyser on one output node, moved to a new node when its track makes one (it does each time it's decoded). */
class Ear {
  private node: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private readonly samples = new Float32Array(LISTEN_SAMPLES);

  /** Listening to `node` (none: to nothing). */
  attach(node: GainNode | null): void {
    if (node === this.node) return;
    if (this.node && this.analyser) disconnect(this.node, this.analyser);
    this.node = node;
    this.analyser = null;
    if (!node) return;
    this.analyser = node.context.createAnalyser();
    this.analyser.fftSize = LISTEN_SAMPLES;
    node.connect(this.analyser);
  }

  /** The level of what it carried over its last samples (dB, RMS; nothing: `SILENCE_DB`). */
  level(): number {
    if (!this.analyser) return SILENCE_DB;
    this.analyser.getFloatTimeDomainData(this.samples);
    let sum = 0;
    for (const sample of this.samples) sum += sample * sample;
    const rms = Math.sqrt(sum / this.samples.length);
    return rms > 0 ? 20 * Math.log10(rms) : SILENCE_DB;
  }

  /** Not listening any more. */
  detach(): void {
    this.attach(null);
  }
}

/** An ear on each track's output, by its id. */
export class Ears {
  private readonly ears = new Map<string, Ear>();

  /** Each track listened to through its output now (a track with none: to nothing). */
  follow(outputs: { id: string; output: GainNode | null }[]): void {
    for (const { id, output } of outputs) {
      let ear = this.ears.get(id);
      if (!ear) {
        ear = new Ear();
        this.ears.set(id, ear);
      }
      ear.attach(output);
    }
  }

  /** The level each track's output carried over its last samples (dB), by id. */
  levels(): Map<string, number> {
    return new Map([...this.ears].map(([id, ear]) => [id, ear.level()]));
  }

  /** Every analyser taken off. */
  remove(): void {
    for (const ear of this.ears.values()) ear.detach();
  }
}

/** Resolves after `ms` of the browser's own time (the lab's clock stands still meanwhile: no frame runs). */
export function realWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
