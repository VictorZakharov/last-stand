"""A piece of music's samples: read from a WAV or decoded from an MP3 as a browser decodes it (ffmpeg), and encoded."""
import subprocess
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile


@dataclass
class Audio:
    """Samples, frames by channels, floats in -1..1, at `rate` a second."""
    samples: np.ndarray
    rate: int

    @property
    def seconds(self) -> float:
        """How long it plays."""
        return len(self.samples) / self.rate

    def mono(self) -> np.ndarray:
        """Its channels mixed into one."""
        return self.samples.mean(axis=1)

    def at(self, second: float) -> int:
        """The frame at `second`."""
        return int(round(second * self.rate))


def read_wav(path: Path) -> Audio:
    """A WAV's samples."""
    samples, rate = soundfile.read(str(path), dtype='float32', always_2d=True)
    return Audio(samples, rate)


def decode(path: Path, rate: int, channels: int = 2) -> Audio:
    """A compressed file decoded by ffmpeg (a browser's decoder is ffmpeg's: its delay trimmed by the LAME header)."""
    command = ['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'f32le', '-ac', str(channels), '-ar', str(rate), '-']
    raw = subprocess.run(command, capture_output=True, check=True).stdout
    samples = np.frombuffer(raw, dtype='<f4').reshape(-1, channels)
    return Audio(samples.copy(), rate)


def encode_mp3(audio: Audio, path: Path, quality: int, rate: int) -> None:
    """`audio` as an MP3: LAME's VBR `quality` (0 best, 9 smallest), at `rate`, with no metadata."""
    channels = audio.samples.shape[1]
    command = [
        'ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(audio.rate), '-ac', str(channels), '-i', '-',
        '-map_metadata', '-1', '-c:a', 'libmp3lame', '-q:a', str(quality), '-ar', str(rate), str(path),
    ]
    pcm = np.ascontiguousarray(audio.samples, dtype='<f4').tobytes()
    subprocess.run(command, input=pcm, check=True)
