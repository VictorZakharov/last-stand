# `scripts`

The build's and the workflow's scripts.

The rules across the game are the [root AGENTS.md](../AGENTS.md).

- `pwa.ts`: the Vite plugin for the installable, offline game (production builds only).
- `check-pages-build.mjs`: `npm run check:pages`, after a build: every asset path in `dist/index.html` must work under the Pages base path (a preview's too).
- `issue.sh` and `commit.sh`: the fork workflow (a prompt starting `new issue:`, the root's Workflow).

## Gotchas

- **Installable, offline (PWA):** `public/manifest.webmanifest` plus a build plugin (`scripts/pwa.ts`, production builds only).
  - Install: Chrome and Edge fire `beforeinstallprompt`, and the lobby's Install link opens it. Safari (iOS) and Firefox never fire it, so on phones and tablets the link is always shown (unless already running installed) and opens `#install`, the add-to-home-screen steps for that platform.
  - The plugin renders the PNG app icons from `public/icon.svg` at build time (no binary assets in the repo) and writes `dist/sw.js`, which precaches every built file.
  - The worker's cache name is a hash of the build, so each deploy installs its own cache (fetched past the HTTP cache: Pages sends `max-age=600`) and takes over at once. It keeps the previous build's cache, so a page still running the old build can load its remaining chunks.
  - **A plain reload must show a new deploy:** the page is served network-first (the cached copy when offline or after 4s), the built files cache-first. `src/ui/pwa.ts` registers the worker (`updateViaCache: 'none'`, checking again when the tab comes back into view), shows the Install link and offers a reload in the lobby when a new build took over an open page (it asks the worker which cache it serves). Production's scope contains the PR previews, so the worker skips `pr-preview/` paths (each preview registers its own).
  - The pause menu shows the build (`__BUILD__` from `vite.config.ts`: commit, a preview's PR number, the build time in local time).
  - Test offline behaviour with `npm run build` + `vite preview`: the dev server has no worker.
