export const CAPE_PROFILE_PHASES = [
  'prediction',
  'constraints',
  'selfCollision',
  'foldGuard',
  'bodyCollision',
  'worldCollision',
  'caveCollision',
  'reconciliation',
  'anchors',
  'finalization',
] as const;

export type CapeProfilePhase = typeof CAPE_PROFILE_PHASES[number];

export interface CapePerformanceDiagnostics {
  readonly implementation: 'cpu-pbd' | 'webgpu-compute';
  readonly dispatchesPerStep?: number;
  readonly constraintColorBatches?: number;
  readonly sampleIntervalSteps: number;
  readonly totalSteps: number;
  readonly activeSteps: number;
  readonly sampledActiveSteps: number;
  readonly averageStepMilliseconds: number;
  readonly phases: Readonly<Record<CapeProfilePhase, number>>;
}

const DEFAULT_SAMPLE_INTERVAL_STEPS = 32;

function emptyPhaseRecord(): Record<CapeProfilePhase, number> {
  return {
    prediction: 0,
    constraints: 0,
    selfCollision: 0,
    foldGuard: 0,
    bodyCollision: 0,
    worldCollision: 0,
    caveCollision: 0,
    reconciliation: 0,
    anchors: 0,
    finalization: 0,
  };
}

/**
 * Samples one active simulation step out of every 32. The profiler accepts
 * already-measured durations so the hot solver loop pays no clock cost on the
 * other 31 steps.
 */
export class CapePerformanceProfiler {
  private readonly phaseTotals = emptyPhaseRecord();
  private totalSteps = 0;
  private activeSteps = 0;
  private sampledActiveSteps = 0;
  private totalMilliseconds = 0;
  private sampling = false;

  public constructor(
    private readonly sampleIntervalSteps = DEFAULT_SAMPLE_INTERVAL_STEPS,
  ) {
    if (!Number.isInteger(sampleIntervalSteps) || sampleIntervalSteps < 1) {
      throw new RangeError('Cape profile sample interval must be a positive integer.');
    }
  }

  public beginStep(active: boolean): boolean {
    this.totalSteps += 1;
    if (!active) {
      this.sampling = false;
      return false;
    }
    this.activeSteps += 1;
    this.sampling = (this.activeSteps - 1) % this.sampleIntervalSteps === 0;
    return this.sampling;
  }

  public record(phase: CapeProfilePhase, milliseconds: number): void {
    if (!this.sampling || !Number.isFinite(milliseconds)) return;
    this.phaseTotals[phase] += Math.max(0, milliseconds);
  }

  public endStep(milliseconds: number): void {
    if (!this.sampling) return;
    if (Number.isFinite(milliseconds)) {
      this.totalMilliseconds += Math.max(0, milliseconds);
    }
    this.sampledActiveSteps += 1;
    this.sampling = false;
  }

  public getDiagnostics(): CapePerformanceDiagnostics {
    const divisor = Math.max(1, this.sampledActiveSteps);
    const phases = emptyPhaseRecord();
    for (const phase of CAPE_PROFILE_PHASES) {
      phases[phase] = this.phaseTotals[phase] / divisor;
    }
    return {
      implementation: 'cpu-pbd',
      sampleIntervalSteps: this.sampleIntervalSteps,
      totalSteps: this.totalSteps,
      activeSteps: this.activeSteps,
      sampledActiveSteps: this.sampledActiveSteps,
      averageStepMilliseconds: this.totalMilliseconds / divisor,
      phases,
    };
  }
}
