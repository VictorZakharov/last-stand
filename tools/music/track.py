"""A loop of a piece made into the track the game plays: the piece from its start up to where the music comes back
(the loop's end), a crossfade from what plays there into what played at the loop's start, then a little more of
that. The game loops it from just past the crossfade (`loop_start`) to as far past the loop's end (`loop_end`), so
both sides of the seam are the same samples of the piece, and it's exact whatever delay a decoder adds at the file's
start, up to `LEAD`."""
from dataclasses import dataclass

import numpy as np

from audio import Audio

# how far past the crossfade the loop's points are (s): the most delay a decoder may add at the file's start, and how
# much of the loop's start follows the crossfade in the file (s), more than that
LEAD = 0.5
TAIL = 1.0
# waveforms this alike are the same samples, crossfaded straight (a sum of the same keeps its level); others with
# equal power (a sum of two unlike keeps it so)
SAME = 0.9


@dataclass
class Track:
    """The track's samples, and where the game loops it (s)."""
    audio: Audio
    loop_start: float
    loop_end: float


def crossfade(leaving: np.ndarray, coming: np.ndarray, same: bool) -> np.ndarray:
    """`leaving` faded out as `coming` fades in, frames by channels."""
    ramp = np.linspace(0.0, 1.0, len(leaving), endpoint=False)[:, None]
    if same:
        return leaving * (1 - ramp) + coming * ramp
    return leaving * np.cos(ramp * np.pi / 2) + coming * np.sin(ramp * np.pi / 2)


def make_track(audio: Audio, start: float, end: float, fade: float, waveform: float) -> Track:
    """The track looping the piece from `start` to `end` (s), crossfaded over `fade` s, its ends' waveforms
    `waveform` alike."""
    first = audio.at(start)
    back = audio.at(end)
    length = audio.at(fade)
    tail = audio.at(TAIL)
    samples = audio.samples
    if back + length > len(samples):
        raise ValueError(f'the piece ends {fade} s of crossfade after {end:.3f} s: loop back earlier')
    if first + length + audio.at(LEAD) >= back:
        raise ValueError('the loop is shorter than its crossfade')
    blend = crossfade(samples[back:back + length], samples[first:first + length], waveform >= SAME)
    after = samples[first + length:first + length + tail]
    track = Audio(np.concatenate([samples[:back], blend, after]).astype(np.float32), audio.rate)
    return Track(track, start + fade + LEAD, end + fade + LEAD)
