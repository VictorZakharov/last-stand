# `public`

Files served as they are: `manifest.webmanifest` (the installable app), `icon.svg` (the app icon, which `scripts/pwa.ts` renders to the PNG icons at build time: the repo keeps no binary icon) and `favicon.svg`. Reference them root-absolute from `index.html` (`/favicon.svg`), so Vite rewrites them for the Pages base path.

The rules across the game are the [root AGENTS.md](../AGENTS.md).
