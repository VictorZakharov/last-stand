# `tools`

The game's harnesses and tools, each with a README of its own on how to run it.

The rules across the game are the [root AGENTS.md](../AGENTS.md); each directory under this one has an AGENTS.md of its own.

| Tool | What it does |
| --- | --- |
| `lab/` | Pictures and measures of the game as the player sees it, on a fixed clock: the harness every change is judged by (`npm run lab`) |
| `facelab/` | A hero's face against a reference picture (`npm run facelab`) |
| `icons/` | The skill icons: side by side, their fit in the round buttons, an original made into one (`npm run icons`) |
| `music/` | The music's tracks cut from their pieces, their seams checked (`npm run music`) |
| `stalls/` | The browser's own stalls, in the installed Chrome (`npm run stalls`) |

- **Every harness is permanent** (the root's Commands): a measure is part of a tool from its first use, never a script in `.tmp`.
- What a tool writes stays in its own `out/` (ignored by git), never the user's temp folder. Scratch files go in `.tmp` in the repo.
- The Python tools run through a Node launcher: the icons' and the music's with the system's Python (`python` on Windows, `python3` elsewhere), their packages in their `requirements.txt`; the face harness's in a venv of its own (`npm run facelab -- --setup`).
- The lab's and the stalls' Node code have unit tests (`npm run lab:test`, `npm run stalls:test`).

## Cleaning up

**This list may be incomplete:** a tool added or changed since may write elsewhere, or keep something there it needs. Check anything it doesn't name before deleting it, and check what it does name too, as the root's rule on deletions says.

- **Can go, made again on the next run** (sizes as they stood on 2026-10-14, after a few weeks' work):
  - `tools/facelab/out/`: each run's renders and sheets, about 160 MB a run (8.3 GB);
  - `tools/lab/out/` (7.2 GB): pictures, logs and the Vite servers' caches; `ab-cache/`, main's side of each A/B, run again by the next `--ab` (2.4 GB); `tmp/`, the browsers' profiles and Playwright's artifacts, which a run that was killed leaves behind (3.9 GB);
  - `tools/stalls/out/`: traces and the installed Chrome's profiles (0.5 GB);
  - `tools/music/out/`, `tools/icons/out/`: a few MB.
- A profile a browser still holds can't be deleted until that browser is closed: Chrome left running by a run that was killed holds its files for days.
- **Keep:** `tools/facelab/models/` and `tools/facelab/.venv/` (downloaded by `npm run facelab -- --setup`), and in `.tmp` what the owner handed over or an asset was made from, which can't be made again: `music-pieces/` (the music's source WAVs), `references/` (the pictures the faces were tuned against), `icon-art/` and `ranger-art/` (the icons' originals). The rest of `.tmp` is scratch, but look before deleting it: the owner saves files there to hand them over.

## Gotchas

- **Tools (`tools/`) are written to be read**, as code we'd show anyone: one statement per line, lines under 120 characters, named functions and types instead of long inline chains, small modules with one job each, and a doc comment on everything exported. No chains of statements joined by semicolons on one line, no one-letter names beyond loop indices and coordinates. A harness is how the game's quality is judged, so it is held to a higher bar than a quick script.
