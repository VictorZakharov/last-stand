// The music judged frame by frame (tools/lab `music`): against what the game's state asks for at each frame (the
// track heard and those kept decoded), every track's level, the buffer sources started for it and what its output
// carried when listened to. A track rising while another is wanted, a level cut rather than faded, a start anywhere
// but where the track was left (its top once it was let go, or before it ever played), a source looping off its
// track's loop, a silent track kept decoded, and one silent when it should be heard (or heard when it should be
// silent) are problems.
import type { TrackShown } from '../../../src/core/music';
import { TRACKS, type TrackId } from '../../../src/data/music';
import type { SourceStart } from './musicTap';

/** What the music should do at a frame, by the game's state: the track heard (none: silence), those kept decoded. */
export interface Wanted {
  track: TrackId | null;
  ready: TrackId[];
}

/** the shortest fade heard as one (s): a level changing faster than that in a frame is a cut */
const SHORTEST_FADE = 0.75;
/** how far from its top a fresh track may start (s) */
const TOP = 0.01;
/** how far from where it was left a track coming back may start (s) */
const LEFT_AT = 0.05;
/** the shortest loop a track plays (s) */
const SHORTEST_LOOP = 30;
/** a track up at full carries at least this (dB, RMS); one at none at most this */
const HEARD_DB = -45;
const SILENT_DB = -120;
/** the frames a silent track nothing wants may stay decoded (it's let go in the frame it falls silent) */
const RELEASE_FRAMES = 1;
const EPSILON = 1e-6;

/** A track's state at a frame. */
interface Kept {
  level: number;
  at: number;
  decoded: boolean;
}

/** What a track did through a stretch. */
interface Course {
  /** each rise from silence to full and fall from full to silence (s) */
  rises: number[];
  falls: number[];
  /** where each start began (s), and whether it came from silence */
  starts: { offset: number; fromSilence: boolean }[];
  /** the frame the rise or fall under way began on */
  risingFrom: number | null;
  fallingFrom: number | null;
  /** let go once silent */
  released: boolean;
  /** what its output carried when listened to at the stretch's end (dB) */
  heard: number | null;
}

/** A start in words (where a track came back is left out: it's where the browser's own time had taken it). */
function startWords(start: { offset: number; fromSilence: boolean }): string {
  return start.offset <= TOP ? 'in from its top' : 'back where it was left';
}

const newCourse = (): Course => ({
  rises: [], falls: [], starts: [], risingFrom: null, fallingFrom: null, released: false, heard: null,
});

/** The music's tracks judged a frame at a time, through stretches of the game named as they're played. */
export class MusicJudge {
  readonly problems: string[] = [];
  private stretch = '';
  private frames = 0;
  private courses = new Map<TrackId, Course>();
  private last = new Map<TrackId, Kept>();
  private startsSeen = 0;
  private unreleased = new Map<TrackId, number>();
  /** what was wanted at this frame and the last (the music reads the game's state as a frame starts, so a change
   *  its update made, a wave won, reaches it a frame later) */
  private wanted: Wanted = { track: null, ready: [] };
  private wantedBefore: Wanted = { track: null, ready: [] };

  /** @param dt a frame (s) */
  constructor(private readonly dt: number) {}

  /** A stretch begun, named for its lines and problems. */
  begin(name: string): void {
    this.stretch = name;
    this.frames = 0;
    this.courses = new Map();
  }

  /** A frame judged: the tracks as they are after it, what the game's state wants, every source started so far. */
  frame(shown: TrackShown[], wanted: Wanted, starts: SourceStart[]): void {
    this.frames++;
    this.wantedBefore = this.wanted;
    this.wanted = wanted;
    for (const start of starts.slice(this.startsSeen)) this.judgeStart(shown, start);
    this.startsSeen = starts.length;
    for (const track of shown) this.judgeTrack(track, wanted);
  }

  /** The tracks as they are now kept as the last seen, no frame judged (a tab hidden between frames). */
  seen(shown: TrackShown[]): void {
    for (const track of shown) {
      this.last.set(track.id, { level: track.level, at: track.at, decoded: track.buffer !== null });
    }
  }

  /** Whether the track wanted, if it's at full, carried enough to be heard (dB, by id). */
  heard(levels: Map<string, number>, shown: TrackShown[]): boolean {
    const up = shown.find((track) => track.id === this.wanted.track && track.level >= 1);
    return !up || (levels.get(up.id) ?? -Infinity) >= HEARD_DB;
  }

  /**
   * What each track's output carried at the stretch's end (dB, by id), against what's wanted then; in a `hidden` tab,
   * nothing may be heard.
   */
  listened(levels: Map<string, number>, shown: TrackShown[], hidden = false): void {
    for (const track of shown) {
      const heard = levels.get(track.id) ?? -Infinity;
      this.course(track.id).heard = heard;
      if (hidden && heard > SILENT_DB) this.problem(`${track.id} carried ${heard.toFixed(1)} dB in a hidden tab`);
      const full = !hidden && track.id === this.wanted.track && track.level >= 1;
      if (full && heard < HEARD_DB) {
        this.problem(`${track.id} is up but carried ${heard.toFixed(1)} dB (heard: ${HEARD_DB} at least)`);
      }
      if (track.level === 0 && heard > SILENT_DB) {
        this.problem(`${track.id} is at none but carried ${heard.toFixed(1)} dB`);
      }
    }
  }

  /**
   * The stretch's line: what each track did. `settled`: the stretch ran long enough for every fade to end, so the
   * track wanted must be at full and every other at none.
   */
  end(shown: TrackShown[], settled: boolean): string {
    if (settled) this.judgeSettled(shown);
    const seconds = (this.frames * this.dt).toFixed(1);
    const said = shown.map((track) => this.said(track)).filter((words) => words !== '');
    const rest = said.length < shown.length ? 'the rest silent' : '';
    return `${this.stretch}, ${seconds} s: ${[...said, rest].filter(Boolean).join('; ') || 'silence'}`;
  }

  private judgeStart(shown: TrackShown[], start: SourceStart): void {
    const track = shown.find((candidate) => candidate.buffer !== null && candidate.buffer === start.buffer);
    // (the effects' sounds are buffer sources too)
    if (!track) return;
    const before = this.last.get(track.id);
    const fromSilence = !before || before.level === 0;
    // (where it was left: its top once it was let go, or before it ever played)
    const leftAt = before?.at ?? 0;
    this.course(track.id).starts.push({ offset: start.offset, fromSilence });
    if (Math.abs(start.offset - leftAt) > LEFT_AT && leftAt <= TOP) {
      this.problem(`${track.id} started ${start.offset.toFixed(2)} s in, not from its top`);
    } else if (Math.abs(start.offset - leftAt) > LEFT_AT) {
      this.problem(`${track.id} came back at ${start.offset.toFixed(2)} s, left at ${leftAt.toFixed(2)} s`);
    }
    this.judgeLoop(track.id, start);
  }

  private judgeLoop(id: TrackId, start: SourceStart): void {
    const [loopStart, loopEnd] = TRACKS[id].loop;
    const duration = start.buffer?.duration ?? 0;
    const asData = Math.abs(start.loopStart - loopStart) < EPSILON && Math.abs(start.loopEnd - loopEnd) < EPSILON;
    if (!start.loop || !asData) {
      this.problem(`${id} looped ${start.loop ? `${start.loopStart} to ${start.loopEnd}` : 'not at all'}, `
        + `not over its loop (${loopStart} to ${loopEnd})`);
    }
    if (start.loopEnd > duration || start.loopEnd - start.loopStart < SHORTEST_LOOP) {
      this.problem(`${id}'s loop (${start.loopStart} to ${start.loopEnd}) isn't within its ${duration.toFixed(2)} s `
        + `or is under ${SHORTEST_LOOP} s`);
    }
  }

  private judgeTrack(track: TrackShown, wanted: Wanted): void {
    const before = this.last.get(track.id) ?? { level: 0, at: 0, decoded: false };
    const change = track.level - before.level;
    const course = this.course(track.id);
    if (change > EPSILON && track.id !== wanted.track && track.id !== this.wantedBefore.track) {
      this.problem(`${track.id} rose while ${wanted.track ?? 'silence'} was wanted`);
    }
    if (Math.abs(change) > this.dt / SHORTEST_FADE + EPSILON) {
      this.problem(`${track.id}'s level went ${before.level.toFixed(2)} to ${track.level.toFixed(2)} in a frame `
        + `(faded over ${SHORTEST_FADE} s at least, it moves ${(this.dt / SHORTEST_FADE).toFixed(3)} at most)`);
    }
    this.followFade(course, before.level, track.level);
    if (before.decoded && track.buffer === null) course.released = true;
    this.judgeRelease(track, wanted);
    this.last.set(track.id, { level: track.level, at: track.at, decoded: track.buffer !== null });
  }

  /** A rise or fall's length kept as it ends. */
  private followFade(course: Course, before: number, now: number): void {
    if (before === 0 && now > 0) course.risingFrom = this.frames - 1;
    if (before === 1 && now < 1) course.fallingFrom = this.frames - 1;
    if (now === 1 && before < 1 && course.risingFrom !== null) {
      course.rises.push((this.frames - course.risingFrom) * this.dt);
      course.risingFrom = null;
    }
    if (now === 0 && before > 0 && course.fallingFrom !== null) {
      course.falls.push((this.frames - course.fallingFrom) * this.dt);
      course.fallingFrom = null;
    }
  }

  private judgeRelease(track: TrackShown, wanted: Wanted): void {
    const wantedNowOrBefore = [wanted, this.wantedBefore].some((either) => either.track === track.id
      || either.ready.includes(track.id));
    const idle = track.level === 0 && !wantedNowOrBefore;
    const kept = idle && track.buffer !== null ? (this.unreleased.get(track.id) ?? 0) + 1 : 0;
    this.unreleased.set(track.id, kept);
    if (kept === RELEASE_FRAMES + 1) this.problem(`${track.id} was kept decoded, silent and wanted nowhere`);
  }

  private judgeSettled(shown: TrackShown[]): void {
    // (against what was wanted a frame before: a stretch ending as a wave starts ends on the frame its update started
    // it, which the music hears a frame later)
    for (const track of shown) {
      const wanted = track.id === this.wantedBefore.track;
      if (wanted && track.level < 1) this.problem(`${track.id} is wanted but at ${track.level.toFixed(2)} at the end`);
      if (!wanted && track.level > 0) {
        this.problem(`${track.id} is wanted nowhere but at ${track.level.toFixed(2)} at the end`);
      }
    }
  }

  /** What a track did through the stretch, in words (none: it was silent throughout). */
  private said(track: TrackShown): string {
    const course = this.courses.get(track.id);
    if (!course) return '';
    const words: string[] = [];
    for (const start of course.starts) words.push(startWords(start));
    for (const rise of course.rises) words.push(`up over ${rise.toFixed(2)} s`);
    for (const fall of course.falls) words.push(`out over ${fall.toFixed(2)} s`);
    if (course.released) words.push('released');
    if (track.level > 0 && track.level < 1) words.push(`at ${track.level.toFixed(2)}`);
    else if (track.level === 1 && words.length === 0) words.push('playing on');
    if (course.heard !== null && track.level > 0) words.push(course.heard > SILENT_DB ? 'heard' : 'unheard');
    if (track.level > 0 && !track.playing) words.push('stopped');
    return words.length ? `${track.id} ${words.join(', ')}` : '';
  }

  /** Where each start of `id` in the stretch under way began (s). */
  startsOf(id: TrackId): number[] {
    return this.courses.get(id)?.starts.map((start) => start.offset) ?? [];
  }

  /** Whether a start at `offset` (s) was from the track's top. */
  static fromTop(offset: number): boolean {
    return offset <= TOP;
  }

  private course(id: TrackId): Course {
    let course = this.courses.get(id);
    if (!course) {
      course = newCourse();
      this.courses.set(id, course);
    }
    return course;
  }

  /** A problem found in the stretch under way. */
  problem(text: string): void {
    this.problems.push(`${this.stretch}: ${text}`);
  }
}
