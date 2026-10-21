// tools/lab fire's cost: what a fire's flames take of the GPU close up, where they fill much of the screen (the top-down
// view's few pixels of them cost less than the timer's noise), each render of the frame timed by a query of its own
// (EXT_disjoint_timer_query_webgl2, where the browser has it), with the flames drawn and without, in turns: the
// machine's load drifts, and two runs apart read two loads. Its canary draws the flames four times over, which must
// read as more.
import * as THREE from 'three';
import { quantile } from './timing';

/** The frame's median time on the GPU (ms) with the flames drawn and without. */
export interface FlameCost {
  shown: number;
  hidden: number;
  /** the renders each side was timed over */
  renders: number;
}

/** the rounds of renders timed, a side's in each, and the renders in a turn */
const ROUNDS = 8;
const TURN_RENDERS = 6;
/** the flames drawn this many times over by the canary, and how many times the flames' own cost it must read */
const CANARY_TIMES = 4;
export const CANARY_COST_LEAST = 2;
/** how long a query's time is waited for (ms, by the browser's clock) */
const QUERY_WAIT = 2000;

/** The GPU's timer: the context and its extension, or null where the browser has none. */
interface Timer {
  gl: WebGL2RenderingContext;
  ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };
}

/** The browser's next task: a query's time comes back only once the task that ended it is over. */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** The GPU's timer on `renderer`'s context, or null. */
function timerOf(renderer: THREE.WebGLRenderer): Timer | null {
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  return ext ? { gl, ext } : null;
}

/** `draw` timed on the GPU (ms), or null where the time was lost (the GPU's clock disjoint, or never back). */
async function timedOnGpu(timer: Timer, draw: () => void): Promise<number | null> {
  const { gl, ext } = timer;
  const query = gl.createQuery()!;
  gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
  draw();
  gl.endQuery(ext.TIME_ELAPSED_EXT);
  // (by the browser's clock: the page's stands still within a lab frame)
  const now = window.__labClock.realNow;
  const start = now();
  try {
    while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
      if (now() - start > QUERY_WAIT) return null;
      await nextTask();
    }
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) return null;
    return gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
  } finally {
    gl.deleteQuery(query);
  }
}

/** The median of `values`, or 0 with none. */
function medianOf(values: number[]): number {
  return values.length ? quantile([...values].sort((a, b) => a - b), 0.5) : 0;
}

/** `count` renders by `draw`, each timed; the times that came back. */
async function timedRenders(timer: Timer, draw: () => void, count: number): Promise<number[]> {
  const times: number[] = [];
  for (let render = 0; render < count; render++) {
    const took = await timedOnGpu(timer, draw);
    if (took !== null) times.push(took);
  }
  return times;
}

/** What `parts` take of the GPU as `draw` renders the frame, drawn and not in turns; null where the browser times
 *  nothing. `draw` renders the frame as it stands, its camera on the flames. */
export async function flameCost(renderer: THREE.WebGLRenderer, parts: THREE.Object3D[], draw: () => void):
  Promise<FlameCost | null> {
  const timer = timerOf(renderer);
  if (!timer) return null;
  const shown: number[] = [];
  const hidden: number[] = [];
  try {
    for (let round = 0; round < ROUNDS; round++) {
      for (const part of parts) part.visible = true;
      shown.push(...await timedRenders(timer, draw, TURN_RENDERS));
      for (const part of parts) part.visible = false;
      hidden.push(...await timedRenders(timer, draw, TURN_RENDERS));
    }
  } finally {
    for (const part of parts) part.visible = true;
  }
  if (!shown.length || !hidden.length) return null;
  return { shown: medianOf(shown), hidden: medianOf(hidden), renders: Math.min(shown.length, hidden.length) };
}

/** The canary's flames: `parts` drawn `CANARY_TIMES` over (copies sharing their geometry and material, so nothing
 *  compiles), timed as `flameCost` times them; what they took over the frame without them, or null. */
export async function canaryCost(renderer: THREE.WebGLRenderer, parts: THREE.Object3D[], draw: () => void):
  Promise<number | null> {
  const copies = parts.flatMap((part) => Array.from({ length: CANARY_TIMES - 1 }, () => {
    const copy = part.clone();
    part.parent!.add(copy);
    return copy;
  }));
  try {
    const cost = await flameCost(renderer, [...parts, ...copies], draw);
    return cost ? cost.shown - cost.hidden : null;
  } finally {
    for (const copy of copies) copy.removeFromParent();
  }
}
