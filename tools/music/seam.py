"""A track's loop as a browser plays it: decoded from its MP3, the half second before its loop's end joined to its
loop's start, against the same samples played straight (a track is cut so the two are the same, `track.py`); a
decoder's delay at the file's start shifts both alike. The seam is clean when the join differs from the straight
samples no more than the MP3's own coding does."""
from dataclasses import dataclass

import numpy as np

from audio import Audio
from track import LEAD

# the stretch either side of the seam compared (s), the delays a decoder might add at the file's start (s: none, an
# MP3's own encoder delay, 50 ms), and the most a join may differ from straight (dB under the music)
SPAN = 0.4
DELAYS = (0.0, 1105 / 44100, 0.05)
CLEAN_DB = -20.0


@dataclass
class Seam:
    """A seam as heard after a decoder's `delay` (s): how far the join differs from straight, in dB under the music
    (the lower the cleaner), and its largest step from one sample to the next against straight's."""
    delay: float
    differs_db: float
    step_ratio: float


def joined(samples: np.ndarray, start: int, end: int, span: int) -> np.ndarray:
    """The stretch before the loop's end, then the loop's start."""
    return np.concatenate([samples[end - span:end], samples[start:start + span]])


def seam_after(audio: Audio, loop_start: float, loop_end: float, delay: float) -> Seam:
    """The seam heard from `audio` played after a decoder's `delay` of silence (s)."""
    pad = np.zeros((audio.at(delay), audio.samples.shape[1]), dtype=audio.samples.dtype)
    samples = np.concatenate([pad, audio.samples]).mean(axis=1)
    span = audio.at(SPAN)
    start = audio.at(loop_start)
    end = audio.at(loop_end)
    join = joined(samples, start, end, span)
    straight = samples[start - span:start + span]
    level = np.sqrt(np.mean(straight ** 2)) + 1e-12
    differs = np.sqrt(np.mean((join - straight) ** 2)) + 1e-12
    steps = np.abs(np.diff(join)).max() / max(np.abs(np.diff(straight)).max(), 1e-12)
    return Seam(delay, 20 * np.log10(differs / level), float(steps))


def seams(audio: Audio, loop_start: float, loop_end: float) -> list[Seam]:
    """The seam after each delay a decoder might add (none past `LEAD`, which a track is cut to take)."""
    return [seam_after(audio, loop_start, loop_end, delay) for delay in DELAYS if delay < LEAD]


# the windows the level through a crossfade is taken in (s), how far either side of it the music's own windows are
# (s), and the most its windows may dip under or rise over the music's quietest or loudest (dB): music swings between
# its hits and the gaps between them, so a dip is a window quieter than any round it
LEVEL_WINDOW = 0.25
AROUND = 3.0
LEVEL_SLACK = 3.0


@dataclass
class FadeLevel:
    """The level through a crossfade (dB, its quietest and loudest windows) and the music's round it (the same)."""
    quietest: float
    loudest: float
    around_quietest: float
    around_loudest: float

    @property
    def even(self) -> bool:
        """Whether it holds within the music's own range round it, give or take `LEVEL_SLACK`."""
        return (self.quietest >= self.around_quietest - LEVEL_SLACK
                and self.loudest <= self.around_loudest + LEVEL_SLACK)


def level_db(samples: np.ndarray) -> float:
    """A stretch's level (dB, its RMS)."""
    return float(20 * np.log10(np.sqrt(np.mean(samples ** 2)) + 1e-12))


def window_levels(mono: np.ndarray, start: int, end: int, window: int) -> list[float]:
    """The level of each window from `start` to `end` (samples), as far as the samples go."""
    end = min(end, len(mono))
    return [level_db(mono[at:at + window]) for at in range(max(0, start), end - window + 1, window)]


def fade_level(audio: Audio, fade_from: float, fade: float) -> FadeLevel:
    """The level through the crossfade from `fade_from` (s) over `fade` s, against the music's `AROUND` either side."""
    mono = audio.mono()
    start = audio.at(fade_from)
    end = audio.at(fade_from + fade)
    window = audio.at(LEVEL_WINDOW)
    around = audio.at(AROUND)
    inside = window_levels(mono, start, end, window)
    outside = window_levels(mono, start - around, start, window) + window_levels(mono, end, end + around, window)
    return FadeLevel(min(inside), max(inside), min(outside), max(outside))


def clean(seam: Seam) -> bool:
    """Whether a seam is heard as none."""
    return seam.differs_db <= CLEAN_DB and seam.step_ratio <= 1.5
