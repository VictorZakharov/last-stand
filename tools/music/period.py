"""Where a piece repeats itself: the lag at which it sounds most like itself again (its harmony and its timbre, frame
by frame), found to the sample by its waveform, and the stretch it repeats over."""
from dataclasses import dataclass

import librosa
import numpy as np

from audio import Audio
from match import best_lag

# the rate the piece is analysed at, and its frames' hop (samples)
ANALYSIS_RATE = 22050
HOP = 512
# the shortest period looked for, and the least of the piece both repeats must cover (s)
SHORTEST = 15.0
LEAST_OVERLAP = 12.0
# a frame repeats when it's at least this like the one a period on (cosine, 0 to 1)
ALIKE = 0.85


@dataclass
class Period:
    """A period of the piece: its length (s), how alike its repeats are (frames, cosine), how alike its waveform is
    (correlation, 1 an exact repeat), and the stretch that repeats (from its start, s)."""
    seconds: float
    alike: float
    waveform: float
    repeats_from: float
    repeats_to: float


def features(audio: Audio) -> np.ndarray:
    """Each frame's harmony and timbre (chroma and MFCCs, each frame of each scaled to length 1), frames by rows."""
    mono = librosa.resample(audio.mono(), orig_sr=audio.rate, target_sr=ANALYSIS_RATE)
    chroma = librosa.feature.chroma_cqt(y=mono, sr=ANALYSIS_RATE, hop_length=HOP)
    mfcc = librosa.feature.mfcc(y=mono, sr=ANALYSIS_RATE, hop_length=HOP, n_mfcc=20)[1:]
    both = np.vstack([unit(chroma), unit(mfcc - mfcc.mean(axis=1, keepdims=True))]).T
    return both / np.sqrt(2)


def unit(frames: np.ndarray) -> np.ndarray:
    """Each column scaled to length 1."""
    return frames / np.maximum(np.linalg.norm(frames, axis=0, keepdims=True), 1e-9)


def likeness_by_lag(frames: np.ndarray) -> np.ndarray:
    """For each lag (frames), how alike the piece is to itself that far on, on average over where both are."""
    count = len(frames)
    shortest = int(SHORTEST * ANALYSIS_RATE / HOP)
    overlap = int(LEAST_OVERLAP * ANALYSIS_RATE / HOP)
    likeness = np.zeros(count)
    for lag in range(shortest, count - overlap):
        likeness[lag] = np.mean(np.sum(frames[:-lag] * frames[lag:], axis=1))
    return likeness


def peaks(likeness: np.ndarray, most: int) -> list[int]:
    """The lags most alike, each a peak of its own (none within a second of a better one)."""
    apart = int(1.0 * ANALYSIS_RATE / HOP)
    order = np.argsort(likeness)[::-1]
    found: list[int] = []
    for lag in order:
        if likeness[lag] <= 0 or len(found) == most:
            break
        if all(abs(lag - other) > apart for other in found):
            found.append(int(lag))
    return found


def repeated_stretch(frames: np.ndarray, lag: int) -> tuple[float, float]:
    """The longest run of frames like the frames a period on (s from the start)."""
    alike = np.sum(frames[:-lag] * frames[lag:], axis=1)
    smooth = np.convolve(alike, np.ones(43) / 43, mode='same') >= ALIKE
    best = (0, 0)
    start = None
    for index, inside in enumerate(np.append(smooth, False)):
        if inside and start is None:
            start = index
        if not inside and start is not None:
            best = max(best, (start, index), key=lambda run: run[1] - run[0])
            start = None
    to_seconds = HOP / ANALYSIS_RATE
    return best[0] * to_seconds, best[1] * to_seconds


def find_periods(audio: Audio, most: int = 3) -> list[Period]:
    """The piece's likeliest periods, the best first."""
    frames = features(audio)
    likeness = likeness_by_lag(frames)
    to_seconds = HOP / ANALYSIS_RATE
    periods = []
    for lag in peaks(likeness, most):
        repeats_from, repeats_to = repeated_stretch(frames, lag)
        seconds, waveform = best_lag(audio, repeats_from + 1.0, lag * to_seconds)
        periods.append(Period(seconds, float(likeness[lag]), waveform, repeats_from, repeats_to))
    return periods
