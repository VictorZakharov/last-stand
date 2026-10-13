"""Two stretches of a piece matched by their waveforms: the lag between them, to the sample, that lines them up best."""
import numpy as np
from scipy.signal import correlate

from audio import Audio

# how far either way of a lag found by the frames its waveform is searched (s), and over how long a stretch (s)
REACH = 0.06
SPAN = 8.0


def best_lag(audio: Audio, at: float, lag: float) -> tuple[float, float]:
    """The lag near `lag` (s) at which the stretch from `at` best matches the piece that far on, and how well
    (correlation: 1 for an exact repeat, 0 for none)."""
    mono = audio.mono().astype(np.float64)
    reach = audio.at(REACH)
    span = audio.at(SPAN)
    start = audio.at(at)
    later_start = start + audio.at(lag) - reach
    piece = mono[start:start + span]
    later = mono[later_start:later_start + span + 2 * reach]
    if later_start < 0 or len(piece) < span or len(later) < span + 2 * reach:
        return lag, 0.0
    products = correlate(later, piece, mode='valid', method='fft')
    window_energy = np.convolve(later ** 2, np.ones(span), mode='valid')
    match = products / np.maximum(np.sqrt(window_energy * np.sum(piece ** 2)), 1e-12)
    best = int(np.argmax(match))
    return (later_start + best - start) / audio.rate, float(match[best])
