"""The face's profile in a side view, measured alike on a reference and on ours (turn.py; and any script that has a
profile): soft-tissue landmarks down it and the angles and distances anthropometry gives norms for.

A profile is `f`, how far forward the head reaches (mm, + forward of the near eye), at heights `ys` (mm above the eye),
running down; nan where nothing.
"""
import numpy as np


def row_of(ys, y):
    return int(np.argmin(np.abs(ys - y)))


def extreme(f, ys, ya, yb, fn):
    """the point between heights ya and yb (mm, either order) where the profile reaches furthest forward (max) or back (min)"""
    a, b = sorted((row_of(ys, ya), row_of(ys, yb)))
    seg = f[a:b + 1]
    if not np.isfinite(seg).any(): raise ValueError(f'nothing between {ya:.0f} and {yb:.0f} mm')
    r = a + int(fn(np.where(np.isfinite(seg), seg, -1e9 if fn is np.argmax else 1e9)))
    return np.array([f[r], ys[r]])


def points(f, ys):
    """soft-tissue landmarks down the profile, each the furthest forward or back point of its stretch: (forward, up) mm"""
    P = {}
    P['Prn'] = extreme(f, ys, -15, -75, np.argmax)                          # nose tip
    P['N'] = extreme(f, ys, P['Prn'][1] + 22, P['Prn'][1] + 48, np.argmin)  # nasion: the deepest point above it
    P['G'] = extreme(f, ys, P['N'][1] + 3, P['N'][1] + 22, np.argmax)       # glabella: the brow's most forward point
    P['Sn'] = extreme(f, ys, P['Prn'][1] - 6, P['Prn'][1] - 28, np.argmin)  # subnasale
    P['Ls'] = extreme(f, ys, P['Sn'][1] - 3, P['Sn'][1] - 20, np.argmax)    # upper lip
    P['Li'] = extreme(f, ys, P['Ls'][1] - 6, P['Ls'][1] - 26, np.argmax)    # lower lip
    P['Sto'] = extreme(f, ys, P['Ls'][1] - 1, P['Li'][1] + 1, np.argmin)    # the lips' meeting
    P['Sm'] = extreme(f, ys, P['Li'][1] - 3, P['Li'][1] - 25, np.argmin)    # the fold under the lower lip
    P['Pg'] = extreme(f, ys, P['Sm'][1] - 3, P['Sm'][1] - 32, np.argmax)    # chin
    # the chin's bottom: the lowest row still within 12 mm of the chin's front
    r = row_of(ys, P['Pg'][1])
    while r + 1 < len(f) and np.isfinite(f[r + 1]) and f[r + 1] > P['Pg'][0] - 12: r += 1
    P['Me'] = np.array([f[r], ys[r]])
    # a point on the columella (the nose's underside) halfway from the tip to the subnasale
    yc = (P['Prn'][1] + P['Sn'][1]) / 2
    P['Cm'] = np.array([f[row_of(ys, yc)], yc])
    return P


def angle(a, b, c):
    u, v = a - b, c - b
    return float(np.degrees(np.arccos(np.clip(np.dot(u, v) / np.linalg.norm(u) / np.linalg.norm(v), -1, 1))))


def eline(P, k):
    """how far a lip is behind (-) the line from the nose tip to the chin (mm)"""
    a, b, p = P['Prn'], P['Pg'], P[k]
    d = b - a; n = np.array([d[1], -d[0]]) / np.linalg.norm(d)
    if n[0] < 0: n = -n
    return float(np.dot(p - a, n))


# (name, measure, the norm for a man's face where there is one)
MEASURES = [
    ('facial convexity G-Sn-Pg (deg)', lambda P: angle(P['G'], P['Sn'], P['Pg']), '165 +- 5'),
    ('nasofrontal G-N-Prn (deg)', lambda P: angle(P['G'], P['N'], P['Prn']), '115-135'),
    ('nasolabial Cm-Sn-Ls (deg)', lambda P: angle(P['Cm'], P['Sn'], P['Ls']), '90-110'),
    ('upper lip to the E-line (mm)', lambda P: eline(P, 'Ls'), '-4'),
    ('lower lip to the E-line (mm)', lambda P: eline(P, 'Li'), '-2'),
    ('nose projection, tip ahead of Sn (mm)', lambda P: P['Prn'][0] - P['Sn'][0], '~17-20'),
    ('nose length N-Prn (mm)', lambda P: float(np.linalg.norm(P['Prn'] - P['N'])), '~50-55'),
    ('glabella ahead of the nasion (mm)', lambda P: P['G'][0] - P['N'][0], ''),
    ('chin (Pg) ahead of the nasion (mm)', lambda P: P['Pg'][0] - P['N'][0], '~0 (beard adds ~5)'),
    ('chin (Pg) ahead of the lower lip (mm)', lambda P: P['Pg'][0] - P['Li'][0], ''),
    ('mid face N-Sn (mm)', lambda P: P['N'][1] - P['Sn'][1], '~55'),
    ('lower face Sn-Me (mm)', lambda P: P['Sn'][1] - P['Me'][1], '~65-70 (beard adds ~5)'),
    ('upper lip Sn-Sto (mm)', lambda P: P['Sn'][1] - P['Sto'][1], '~20-22'),
    ('nasion above the eye (mm)', lambda P: P['N'][1], ''),
    ('nasion ahead of the eye (mm)', lambda P: P['N'][0], ''),
]


def report(fR, fO, ys, beard='the reference\'s chin and lips under its beard'):
    """the measures and the profile row by row, the reference's beside ours; and both profiles' landmarks"""
    lines = ['', f'profile (the side view, mm from the near eye; {beard}): reference, ours, norm']
    PR = PO = None
    try:
        PR, PO = points(fR, ys), points(fO, ys)
        for name, fn, norm in MEASURES: lines.append(f'  {name:40s} {fn(PR):+7.1f} {fn(PO):+7.1f}   {norm}')
    except Exception as e:  # (a profile the search can't follow: the rows below still show it)
        lines.append(f'  landmarks not found ({e})')
    lines.append('  the profile, forward of the near eye (mm) by height (mm above it): reference, ours, ours minus the reference')
    for y in range(40, -151, -10):
        a, b = fR[row_of(ys, y)], fO[row_of(ys, y)]
        lines.append(f'    {y:+5d}  {a:+7.1f} {b:+7.1f} {b - a:+6.1f}' if np.isfinite(a) and np.isfinite(b) else f'    {y:+5d}       .       .')
    return lines, PR, PO
