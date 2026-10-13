"""A piece's beat: its tempo, where its beats fall, and two stretches' beats lined up by their onsets (where notes
start), for loops whose two ends sound alike but aren't the same samples."""
from dataclasses import dataclass

import librosa
import numpy as np

from audio import Audio

# the rate the onsets are found at, their hop (samples: 2.9 ms), how long a stretch is lined up (s), and how far
# either way of a lag it's searched (a share of a beat)
RATE = 22050
HOP = 64
SPAN = 8.0
REACH = 0.5


@dataclass
class Beat:
    """The piece's tempo (beats a minute), its beats (s), and its onset strength (`step` s apart)."""
    tempo: float
    beats: np.ndarray
    onsets: np.ndarray
    step: float

    @property
    def seconds(self) -> float:
        """A beat's length (s)."""
        return 60.0 / self.tempo

    def nearest(self, second: float) -> float:
        """The beat nearest `second`."""
        return float(self.beats[np.argmin(np.abs(self.beats - second))])


def beat_of(audio: Audio) -> Beat:
    """The piece's beat: its tempo by the median gap between its beats (the tracker's own estimate is rounded, 131.7
    for a piece whose 47.27 s repeat is 104 beats at 132; a line through all its beats was thrown off where they go at
    another tempo a while, and made a 149 beat loop 169)."""
    mono = librosa.resample(audio.mono(), orig_sr=audio.rate, target_sr=RATE)
    onsets = librosa.onset.onset_strength(y=mono, sr=RATE, hop_length=HOP)
    _, frames = librosa.beat.beat_track(onset_envelope=onsets, sr=RATE, hop_length=HOP)
    beats = librosa.frames_to_time(frames, sr=RATE, hop_length=HOP)
    period = float(np.median(np.diff(beats)))
    return Beat(60.0 / period, beats, onsets, HOP / RATE)


def onset_lag(beat: Beat, at: float, lag: float) -> tuple[float, float]:
    """The lag near `lag` (s, within half a beat) at which the onsets from `at` best line up with those that far on,
    and how well (correlation of their onset strength, 1 at best)."""
    span = int(SPAN / beat.step)
    reach = int(REACH * beat.seconds / beat.step)
    start = int(at / beat.step)
    later_start = start + int(round(lag / beat.step)) - reach
    piece = beat.onsets[start:start + span]
    later = beat.onsets[later_start:later_start + span + 2 * reach]
    if later_start < 0 or len(piece) < span or len(later) < span + 2 * reach:
        return lag, 0.0
    piece = piece - piece.mean()
    scores = []
    for shift in range(2 * reach + 1):
        window = later[shift:shift + span]
        window = window - window.mean()
        scores.append(np.dot(piece, window) / max(np.linalg.norm(piece) * np.linalg.norm(window), 1e-12))
    best = int(np.argmax(scores))
    return (later_start + best - start) * beat.step, float(scores[best])
