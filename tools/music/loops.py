"""Where a piece can loop: two moments far apart after which it sounds the same for a while (its harmony and timbre,
frame by frame), so the music can go back from the later to the earlier one unheard. What lies between them plays
once a loop; what follows the later one (a section coming back, an ending) is cut. Each loop starts on a beat and is
lined up by its onsets where they match, or else ends a whole number of bars on, then by its waveform where its two
ends are the same samples."""
from dataclasses import dataclass

import numpy as np

from audio import Audio
from beats import Beat, beat_of, onset_lag
from match import best_lag
from period import ANALYSIS_RATE, HOP, features

# frames pooled a moment, so the search runs on about a tenth of a second each
POOL = 4
# how long both moments must sound alike after them (s), the shortest loop looked for (s), and how near the piece's
# end the later one may be (s: a crossfade from it plays that long)
WINDOW = 6.0
SHORTEST = 30.0
END_ROOM = 5.0
# loops reported apart by at least this much in either moment (s)
APART = 3.0
# how much less alike than a lag's best its start may be, taken as early as that allows (a loop starting earlier
# keeps less of what comes back)
EARLY_SLACK = 0.03
# waveforms this alike are the same samples, and lined up by them to the sample
SAME_SAMPLES = 0.5
# onsets this well lined up place the loop's end (below it, the ends' rhythms differ, and the end is the tracked beat
# a whole number of bars from the start), and a bar's beats
ONSETS_TRUSTED = 0.6
BAR = 4


@dataclass
class Loop:
    """A loop: from (s) where it starts, to (s) where the music comes back to sound as it did there, how alike the
    two sound after them (frames, cosine), how well their onsets and their waveforms line up (correlation, 1 exact),
    and its length in beats."""
    start: float
    end: float
    alike: float
    onsets: float
    waveform: float
    beats: float

    @property
    def seconds(self) -> float:
        """How long a loop plays."""
        return self.end - self.start


def pooled_frames(audio: Audio) -> tuple[np.ndarray, float]:
    """The piece's frames pooled into moments, each scaled to length 1, and a moment's length (s)."""
    frames = features(audio)
    count = len(frames) // POOL
    pooled = frames[:count * POOL].reshape(count, POOL, -1).mean(axis=1)
    pooled /= np.maximum(np.linalg.norm(pooled, axis=1, keepdims=True), 1e-9)
    return pooled, POOL * HOP / ANALYSIS_RATE


def windowed_likeness(moments: np.ndarray, lag: int, window: int) -> np.ndarray:
    """For each moment, how alike the `window` moments from it are to those `lag` moments on (mean cosine)."""
    alike = np.sum(moments[:-lag] * moments[lag:], axis=1)
    sums = np.concatenate([[0.0], np.cumsum(alike)])
    return (sums[window:] - sums[:-window]) / window


def earliest_start(likeness: np.ndarray, last: int) -> int:
    """The earliest moment as alike as the best one, or nearly (`EARLY_SLACK`)."""
    best = float(np.max(likeness[:last]))
    return int(np.argmax(likeness[:last] >= best - EARLY_SLACK))


def candidates(moments: np.ndarray, step: float, most: int, shortest_s: float) -> list[tuple[int, int, float]]:
    """The best (start, lag, likeness) in moments (`step` s each), one a lag of at least `shortest_s` s, the best
    first, `most` of them far enough apart."""
    window = int(WINDOW / step)
    shortest = int(shortest_s / step)
    room = int(END_ROOM / step)
    found = []
    for lag in range(shortest, len(moments) - window - room):
        likeness = windowed_likeness(moments, lag, window)
        last = len(moments) - lag - room
        if last <= 0:
            continue
        start = earliest_start(likeness, last)
        found.append((start, lag, float(likeness[start])))
    found.sort(key=lambda candidate: candidate[2], reverse=True)
    apart = APART / step
    kept: list[tuple[int, int, float]] = []
    for start, lag, likeness in found:
        if len(kept) == most:
            break
        if all(abs(start - other) > apart or abs(start + lag - other - other_lag) > apart
               for other, other_lag, _ in kept):
            kept.append((start, lag, likeness))
    return kept


def lined_up(audio: Audio, beat: Beat, start: float, lag: float, alike: float) -> Loop:
    """A loop from `start` with about `lag`: started on its nearest beat, its end lined up by the onsets, and by the
    waveform to the sample where its ends are the same samples."""
    start = beat.nearest(start)
    by_onsets, onsets = onset_lag(beat, start, lag)
    lag = by_onsets if onsets >= ONSETS_TRUSTED else bars_on(beat, start, lag)
    precise, waveform = best_lag(audio, start, lag)
    if waveform >= SAME_SAMPLES:
        lag = precise
    return Loop(start, start + lag, alike, onsets, waveform, lag / beat.seconds)


def bars_on(beat: Beat, start: float, lag: float) -> float:
    """The lag from the beat at `start` to the tracked beat a whole number of bars on, nearest `lag`."""
    first = int(np.argmin(np.abs(beat.beats - start)))
    bars = max(1, int(round(lag / beat.seconds / BAR)))
    last = min(first + bars * BAR, len(beat.beats) - 1)
    return float(beat.beats[last] - beat.beats[first])


def find_loops(audio: Audio, most: int = 6, shortest: float = SHORTEST) -> tuple[Beat, list[Loop]]:
    """The piece's beat and its best loops at least `shortest` s long, the most alike first."""
    moments, step = pooled_frames(audio)
    beat = beat_of(audio)
    loops = [lined_up(audio, beat, start * step, lag * step, alike)
             for start, lag, alike in candidates(moments, step, most, shortest)]
    return beat, loops


def likeness_along(audio: Audio, lag: float, every: float = 2.0) -> list[tuple[float, float]]:
    """How alike the piece sounds `lag` s on from each moment along it, every `every` s: (second, likeness)."""
    moments, step = pooled_frames(audio)
    frames = int(round(lag / step))
    likeness = windowed_likeness(moments, frames, int(WINDOW / step))
    stride = max(1, int(round(every / step)))
    return [(index * step, float(likeness[index])) for index in range(0, len(likeness), stride)]


def loop_from(audio: Audio, start: float, end: float) -> Loop:
    """The loop from about `start` to about `end` (s), lined up as `find_loops` lines up its own (how alike its ends
    sound over as much of the window as the piece has after its end)."""
    moments, step = pooled_frames(audio)
    lag = int(round((end - start) / step))
    at = int(round(start / step))
    window = max(1, min(int(WINDOW / step), len(moments) - lag - at))
    likeness = windowed_likeness(moments, lag, window)
    return lined_up(audio, beat_of(audio), start, end - start, float(likeness[min(at, len(likeness) - 1)]))
