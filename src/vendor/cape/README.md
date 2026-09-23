# Vendored: cape-physics CPU solver

The files in this directory are copied from
[VictorZakharov/cape-physics](https://github.com/VictorZakharov/cape-physics)
(MIT License, Copyright (c) 2026 Victor Zakharov), commit
`08aa37baeb4133568c7dc40b4e9a97eed3d598b8`.

- `physics/`, `graphics/proceduralTextures.ts` and `utils/` are **unmodified** copies of the
  CPU/WebGL cape solver and its dependencies.
- `config.ts` is adapted: the cave extents are effectively infinite and the player speeds
  match the Mage. Cape parameters are unchanged.
- `world/caveProfile.ts`, `world/CaveShellSampler.ts` and `player/Character.ts` are small
  **shims** that replace the cave world with the Last Stand arena floor
  (`configureCapeEnvironment`) and provide the `CapeAnchors` type.

To update, copy the same files from a newer cape-physics revision and keep the shims.
The game-side adapter lives in `src/entities/models/cape.ts`.
