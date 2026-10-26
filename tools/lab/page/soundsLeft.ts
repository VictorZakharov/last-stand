// The tones the page leaves sounding (tools/lab): every oscillator it starts, read where it goes, and whether it was
// ever told to stop. A one-shot sound schedules its stop as it starts; a held one (a channel's hum, core/audio.ts
// `hum`) is stopped by whatever started it, and one nothing stops goes on for good: Void Lance's hum, its channel
// left open as the hall of heroes closed, played on in the lobby.

type StartMethod = AudioScheduledSourceNode['start'];
type StopMethod = AudioScheduledSourceNode['stop'];

/** Every oscillator the page starts from now on, and those not yet told to stop, kept until `remove`. */
export class OpenTones {
  /** how many were started */
  started = 0;
  private readonly open = new Set<OscillatorNode>();
  private readonly start: StartMethod;
  private readonly stop: StopMethod;

  constructor() {
    const prototype = AudioScheduledSourceNode.prototype;
    const start = prototype.start;
    const stop = prototype.stop;
    const tones = this;
    this.start = start;
    this.stop = stop;
    prototype.start = function started(this: AudioScheduledSourceNode, when?: number): void {
      if (this instanceof OscillatorNode) tones.opened(this);
      start.call(this, when);
    };
    prototype.stop = function stopped(this: AudioScheduledSourceNode, when?: number): void {
      if (this instanceof OscillatorNode) tones.open.delete(this);
      stop.call(this, when);
    };
  }

  /** how many were started and never told to stop */
  sounding(): number {
    return this.open.size;
  }

  /** The page's own `start` and `stop` put back. */
  remove(): void {
    AudioScheduledSourceNode.prototype.start = this.start;
    AudioScheduledSourceNode.prototype.stop = this.stop;
  }

  private opened(tone: OscillatorNode): void {
    this.started++;
    this.open.add(tone);
  }
}
