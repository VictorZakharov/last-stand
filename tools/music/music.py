"""The game's music (`src/audio/music/`): where a piece repeats, one period of it made into a seamless loop, and that
loop's seam checked as a browser decodes and loops it. Run through `npm run music -- <command>` (tools/music/README.md).
"""
import argparse
import sys
from pathlib import Path

from audio import decode, encode_mp3, read_wav
from loops import SHORTEST, WINDOW, find_loops, likeness_along, loop_from
from seam import clean, fade_level, level_db, seams
from track import make_track
from period import find_periods
from similarity import draw_map

# where the pictures go
OUT = Path(__file__).parent / 'out'
# the MP3s' quality (LAME's VBR, 0 best to 9 smallest: 5 is about 110 kbps) and rate
QUALITY = 5
RATE = 44100
# how far off its loop's end the canary puts the seam (s)
CANARY_OFF = 0.037


def show_periods(path: Path) -> None:
    """The piece's likeliest periods."""
    audio = read_wav(path)
    print(f'{path.name}: {audio.seconds:.3f} s at {audio.rate} Hz, {audio.samples.shape[1]} channels')
    for period in find_periods(audio):
        print(f'  period {period.seconds:.4f} s: frames alike {period.alike:.3f}, waveform {period.waveform:.4f}, '
              f'repeating from {period.repeats_from:.2f} s to {period.repeats_to:.2f} s')


def show_loops(path: Path, shortest: float, lag: float | None) -> None:
    """Where the piece can loop (with `lag`, how alike it sounds that far on from each moment)."""
    audio = read_wav(path)
    if lag is not None:
        print(f'{path.name}: how alike it sounds {lag:.4f} s on, the {WINDOW:.0f} s from each moment')
        for second, likeness in likeness_along(audio, lag):
            print(f'  {second:7.2f} s: {likeness:.3f} {"#" * int(max(0.0, likeness - 0.5) * 60)}')
        return
    beat, loops = find_loops(audio, shortest=shortest)
    print(f'{path.name}: {audio.seconds:.3f} s, {beat.tempo:.1f} beats a minute')
    for loop in loops:
        print(f'  from {loop.start:.3f} s to {loop.end:.4f} s ({loop.seconds:.4f} s, {loop.beats:.2f} beats): '
              f'alike {loop.alike:.3f}, onsets {loop.onsets:.3f}, waveform {loop.waveform:.3f}')


def show_seams(path: Path, loop_start: float, loop_end: float) -> bool:
    """The MP3's seam after each delay a decoder might add; whether every one is clean."""
    audio = decode(path, RATE)
    every = True
    for seam in seams(audio, loop_start, loop_end):
        verdict = 'clean' if clean(seam) else 'HEARD'
        every = every and clean(seam)
        print(f'  seam after a decoder\'s {seam.delay * 1000:.0f} ms: the join {seam.differs_db:.1f} dB under the '
              f'music, its largest step {seam.step_ratio:.2f} of straight\'s: {verdict}')
    return every


def make(path: Path, out: Path, start: float, end: float, fade: float) -> None:
    """The piece's loop from about `start` to about `end` (s) made into a track, written as an MP3 and its seam
    checked as a browser decodes it."""
    audio = read_wav(path)
    loop = loop_from(audio, start, end)
    print(f'{path.name}: the loop from {loop.start:.4f} s to {loop.end:.4f} s ({loop.seconds:.4f} s, '
          f'{loop.beats:.2f} beats): alike {loop.alike:.3f}, onsets {loop.onsets:.3f}, waveform {loop.waveform:.3f}')
    track = make_track(audio, loop.start, loop.end, fade, loop.waveform)
    out.parent.mkdir(parents=True, exist_ok=True)
    encode_mp3(track.audio, out, QUALITY, RATE)
    size = out.stat().st_size / 1024
    print(f'  {out}: {track.audio.seconds:.3f} s, {size:.0f} KB; loop it from {track.loop_start:.4f} s to '
          f'{track.loop_end:.4f} s')
    level = fade_level(decode(out, RATE), loop.end, fade)
    verdict = 'even' if level.even else 'UNEVEN'
    print(f'  the crossfade: {level.quietest:.1f} to {level.loudest:.1f} dB a quarter second, the music round it '
          f'{level.around_quietest:.1f} to {level.around_loudest:.1f}: {verdict}')
    if not show_seams(out, track.loop_start, track.loop_end) or not level.even:
        sys.exit(1)


def seam_check(path: Path, loop_start: float, loop_end: float, canary: bool) -> None:
    """An MP3's seam checked (with `canary`, put off its loop's end, which the check must hear)."""
    off = CANARY_OFF if canary else 0.0
    every = show_seams(path, loop_start, loop_end + off)
    if canary:
        print(f'  canary, the seam {off * 1000:.0f} ms off: {"missed" if every else "caught"}')
        every = not every
    if not every:
        sys.exit(1)


def show_levels(paths: list[Path]) -> None:
    """Each track's loudness (its RMS, dB) and the gain that plays it as loud as the first."""
    levels = [level_db(decode(path, RATE).mono()) for path in paths]
    for path, level in zip(paths, levels):
        gain = 10 ** ((levels[0] - level) / 20)
        print(f'  {path.name}: {level:.1f} dB; as loud as {paths[0].name} at a gain of {gain:.3f}')


def show_map(path: Path) -> None:
    """The piece's self-similarity pictured."""
    picture = OUT / f'{path.stem.strip("- ")}-map.png'
    draw_map(read_wav(path), picture)
    print(f'{path.name}: its self-similarity in {picture}')


def main() -> None:
    parser = argparse.ArgumentParser(prog='npm run music --')
    commands = parser.add_subparsers(dest='command', required=True)
    period = commands.add_parser('period', help='where a piece repeats itself')
    period.add_argument('wav', type=Path)
    loops = commands.add_parser('loops', help='where a piece can loop')
    loops.add_argument('wav', type=Path)
    loops.add_argument('--shortest', type=float, default=SHORTEST, help='the shortest loop looked for (s)')
    loops.add_argument('--lag', type=float, help='how alike it sounds this far on (s), along the piece')
    picture = commands.add_parser('map', help="the piece's self-similarity pictured: tools/music/out")
    picture.add_argument('wav', type=Path)
    track = commands.add_parser('make', help='a loop made into an MP3 track, its seam checked')
    track.add_argument('wav', type=Path)
    track.add_argument('mp3', type=Path)
    track.add_argument('--from', dest='start', type=float, required=True, help='about where the loop starts (s)')
    track.add_argument('--to', dest='end', type=float, required=True, help='about where the music comes back (s)')
    track.add_argument('--crossfade', type=float, default=2.0, help='how long the crossfade into the loop is (s)')
    levels = commands.add_parser('levels', help='how loud each track is, and the gain matching the first')
    levels.add_argument('tracks', type=Path, nargs='+')
    seam = commands.add_parser('seam', help="an MP3's loop seam as a browser decodes and loops it")
    seam.add_argument('wav', type=Path, help='the MP3')
    seam.add_argument('--start', type=float, required=True, help='its loop start (s)')
    seam.add_argument('--end', type=float, required=True, help='its loop end (s)')
    seam.add_argument('--canary', action='store_true', help='the seam put 37 ms off: the check must hear it')
    args = parser.parse_args()
    if args.command == 'levels':
        show_levels(args.tracks)
        return
    if not args.wav.exists():
        sys.exit(f'no such file: {args.wav}')
    if args.command == 'make':
        make(args.wav, args.mp3, args.start, args.end, args.crossfade)
    if args.command == 'seam':
        seam_check(args.wav, args.start, args.end, args.canary)
    if args.command == 'period':
        show_periods(args.wav)
    if args.command == 'loops':
        show_loops(args.wav, args.shortest, args.lag)
    if args.command == 'map':
        show_map(args.wav)


if __name__ == '__main__':
    main()
