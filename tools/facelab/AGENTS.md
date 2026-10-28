# `tools/facelab`

The face harness: a hero's head rendered in a studio and compared with a reference picture, feature by feature (`README.md` says how to run it). What a face is tuned by, and how the tuning went wrong before, is `docs/agents/heads.md`.

The rules across the game are the [root AGENTS.md](../../AGENTS.md).

- Its Python stages run in a venv of its own (`.venv`) with the face model in `models/`, both made by `npm run facelab -- --setup` and never committed (the model is under a research licence).
- A reference picture is never committed either (pictures are only screenshots in `docs/`): pass its path.
- Shape first, then colour: tune a face's shape against clay views and several views of the reference before its colours, and turn each complaint about it into a measure here.
- A reference made for the shape alone (a clay turnaround from Codex, made from our own clay renders with the anatomy
  fixed) measures the head's shape far better than a photo: its outline has no hair over it. Ask for one when a shape
  complaint can't be read off the look reference (the mage's skull and jaw, 2026-10-27: `.tmp/references/scholar-clay`).
