// The stalls' analysis and report (tools/stalls): a made-up trace and recording, each piece put on the page's clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, selfTimes, shortName } from '../analyze.mjs';
import { measureText, summaryText } from '../report.mjs';

const MARK = 'stalls:start';
/** the GPU process's main thread, and the page's renderer */
const GPU = { pid: 7, tid: 70 };
const PAGE = { pid: 9, tid: 90 };
/** a task's name as the trace has it */
const RASTER = 'virtual void __cdecl gpu::RasterDecoderImpl::DoRaster(int)';

/** A trace: the threads named, the page's mark at 1 s (trace time, µs), and a task holding one program's link. */
function trace() {
  return [
    { ph: 'M', name: 'process_name', pid: GPU.pid, args: { name: 'GPU Process' } },
    { ph: 'M', name: 'thread_name', ...GPU, args: { name: 'CrGpuMain' } },
    { ph: 'M', name: 'process_name', pid: PAGE.pid, args: { name: 'Renderer' } },
    { ph: 'M', name: 'thread_name', ...PAGE, args: { name: 'CrRendererMain' } },
    { ph: 'I', name: 'TimeStamp', ...PAGE, ts: 1_000_000, args: { data: { message: MARK } } },
    { ph: 'X', name: RASTER, ...GPU, ts: 1_150_000, dur: 400_000 },
    { ph: 'X', name: 'driver_link_program', ...GPU, ts: 1_200_000, dur: 300_000 },
  ];
}

/** The page's recording, its clock starting at 500 ms: a short frame, then one of 450 ms ending at 1100. */
function recording() {
  return {
    start: 500,
    frames: [
      { at: 600, ms: 16 },
      { at: 1100, ms: 450 },
    ],
    changes: [
      { at: 640, what: 'attr style', where: 'div#meter' },
      { at: 645, what: 'attr style', where: 'div#meter' },
    ],
  };
}

test('names a C++ function by its type and method', () => {
  assert.equal(shortName(RASTER), 'RasterDecoderImpl::DoRaster');
  assert.equal(shortName('ThreadControllerImpl::RunTask'), 'ThreadControllerImpl::RunTask');
  assert.equal(shortName('void (anonymous namespace)::Run()'), 'Run');
});

test('puts the trace on the page\'s clock and finds the program built in the stall', () => {
  const findings = analyze(recording(), trace(), MARK);
  assert.equal(findings.clockFound, true);
  assert.deepEqual(findings.frames.stalls, 1);
  assert.deepEqual(findings.programs, { count: 1, total: 300, longest: 300 });
  const [stall] = findings.stalls;
  assert.equal(stall.ms, 450);
  assert.equal(stall.at, 0.6);
  assert.equal(stall.built.length, 1);
  assert.equal(stall.built[0].at, 700);
  assert.equal(stall.built[0].thread, 'GPU Process CrGpuMain');
  assert.deepEqual(stall.built[0].heldIn, ['RasterDecoderImpl::DoRaster']);
  assert.deepEqual(stall.busy, [{ ms: 400, thread: 'GPU Process CrGpuMain', name: 'RasterDecoderImpl::DoRaster' }]);
  assert.deepEqual(stall.changes, ['2 x attr style on div#meter']);
  // (each link with when it began, in seconds of the recording)
  assert.equal(findings.built[0].at, 0.2);
});

test('says when the trace never saw the page\'s mark', () => {
  const findings = analyze(recording(), trace(), 'another mark');
  assert.equal(findings.clockFound, false);
  assert.equal(findings.stalls[0].built.length, 0);
  const text = measureText({ name: 'x base', notes: ['a fight'], findings });
  assert.match(text, /the page's mark is missing from the trace/);
});

test('lists a link\'s innermost tasks alone', () => {
  const findings = analyze(recording(), trace(), MARK);
  findings.built[0].heldIn = ['RunTask', 'Scheduler::RunTask', 'GPUTask', 'Flush', 'shader_compile', 'cache_miss'];
  const text = measureText({ name: 'x', notes: [], findings }, { links: true });
  assert.match(text, /300 ms {2}… > GPUTask > Flush > shader_compile > cache_miss/);
});

test('reports each stall with what was built and busy in it, and the measures side by side', () => {
  const findings = analyze(recording(), trace(), MARK);
  const measure = { name: 'http://x/ base', notes: ['a run started'], findings };
  const text = measureText(measure, { links: true });
  assert.match(text, /^http:\/\/x\/ base: a run started/);
  assert.match(text, /stall of 450 ms at 0\.6 s/);
  assert.match(text, /Skia program linked: 300 ms on GPU Process CrGpuMain in RasterDecoderImpl::DoRaster/);
  assert.match(text, /the longest tasks through it: 400 ms RasterDecoderImpl::DoRaster on GPU Process CrGpuMain/);
  assert.match(text, /0\.2 s {2}300 ms {2}RasterDecoderImpl::DoRaster/);
  assert.match(summaryText([measure]), /http:\/\/x\/ base {2}\s+1 stalls, 0\.5 s stalled;\s+1 programs, 300 ms/);
});

test('counts each task\'s own time, less the work the trace kept inside it', () => {
  const tasks = [
    { name: 'RunTask', ...PAGE, ts: 0, dur: 10_000 },
    { name: 'Paint', ...PAGE, ts: 1_000, dur: 4_000 },
    { name: 'Layerize', ...PAGE, ts: 2_000, dur: 1_000 },
    { name: 'Commit', ...PAGE, ts: 6_000, dur: 3_000 },
    { name: 'DrawFrame', ...GPU, ts: 1_000, dur: 5_000 },
  ];
  const own = Object.fromEntries(selfTimes(tasks).map(({ task, ms }) => [task.name, ms]));
  assert.deepEqual(own, { RunTask: 3, Paint: 3, Layerize: 1, Commit: 3, DrawFrame: 5 });
});

test('lists what each phase\'s threads spent a frame\'s time on', () => {
  const record = {
    start: 1000,
    frames: [{ at: 1010, ms: 10 }, { at: 1020, ms: 10 }],
    changes: [],
    phases: [{ name: 'sweeping', at: 1000 }],
  };
  // (the mark at 1 s of trace time is the page's 1000 ms: the work at 1.002 s is in the phase)
  const events = [
    ...trace().slice(0, 5),
    { ph: 'X', name: 'RunTask', ...PAGE, ts: 1_002_000, dur: 12_000 },
    { ph: 'X', name: 'Paint', ...PAGE, ts: 1_003_000, dur: 8_000 },
  ];
  const [phase] = analyze(record, events, MARK).phases;
  assert.deepEqual(phase.work, [
    { name: 'Paint', thread: 'Renderer CrRendererMain', ms: 4 },
    { name: 'RunTask', thread: 'Renderer CrRendererMain', ms: 2 },
  ]);
  const text = measureText({ name: 'x sweep', notes: [], findings: analyze(record, events, MARK) });
  assert.match(text, /a frame's work, ms: 4\.0 Paint on Renderer CrRendererMain; 2\.0 RunTask on Renderer/);
});

test('sums up each phase the scenario marked apart, with the share of its frames a tooltip showed in', () => {
  const record = {
    start: 0,
    frames: [
      { at: 10, ms: 7, tip: false },
      { at: 17, ms: 7, tip: false },
      { at: 40, ms: 23, tip: true },
      { at: 63, ms: 23, tip: true },
      { at: 70, ms: 7, tip: false },
    ],
    changes: [],
    phases: [{ name: 'away', at: 0 }, { name: 'over items', at: 17 }],
  };
  const { phases } = analyze(record, trace(), MARK);
  assert.deepEqual(phases.map((phase) => [phase.name, phase.count, phase.median]), [
    ['away', 2, 7],
    ['over items', 3, 23],
  ]);
  assert.equal(phases[1].tipShare, 2 / 3);
  const measure = { name: 'x hover', notes: [], findings: analyze(record, trace(), MARK) };
  assert.match(measureText(measure), /over items: 3 frames, median 23\.0 ms \(43 a second\), 90% within 23\.0 ms/);
  assert.match(measureText(measure), /a tooltip shown in 67% of them/);
  assert.match(summaryText([measure]), /median frames away 7\.0, over items 23\.0 ms/);
});
