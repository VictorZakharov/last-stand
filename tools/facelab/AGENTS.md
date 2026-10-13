# `tools/facelab`

The face harness: a hero's head rendered in a studio and compared with a reference picture, feature by feature (`README.md` says how to run it). What a face is tuned by, and how the tuning went wrong before, is `docs/agents/heads.md`.

The rules across the game are the [root AGENTS.md](../../AGENTS.md).

- Its Python stages run in a venv of its own (`.venv`) with the face model in `models/`, both made by `npm run facelab -- --setup` and never committed (the model is under a research licence).
- A reference picture is never committed either (pictures are only screenshots in `docs/`): pass its path.
- Shape first, then colour: tune a face's shape against clay views and several views of the reference before its colours, and turn each complaint about it into a measure here.
