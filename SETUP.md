# Setup

Setup, run, and verify Shuffleify locally. `README.md` is the user-facing project description; this file is the developer's quick-start.

## Prerequisites

- **Node 24 LTS** — pinned in [`.nvmrc`](.nvmrc). Use [nvm-windows](https://github.com/coreybutler/nvm-windows) or [fnm](https://github.com/Schniz/fnm) to honor it automatically.
- **Corepack** — ships with Node. One-time setup, in an **admin** PowerShell:

  ```powershell
  corepack enable
  ```

  This activates the `pnpm` shim. No global `pnpm` install required; the exact pnpm version is pinned via the `packageManager` field in `package.json` and Corepack handles it per-repo.

## Install

```powershell
pnpm install
```

## Run the dev server

```powershell
pnpm dev
```

Open <http://localhost:3000>. You should see:

> **Shuffleify — coming soon.**

That's the v0 placeholder. Real UI lands in Phase 2.

## Build / lint / typecheck

```powershell
pnpm build       # production build (Webpack path, no Turbopack on build)
pnpm start       # serve the production build
pnpm lint        # ESLint (Next + typescript-eslint strict + security)
pnpm typecheck   # tsc --noEmit
```

All four pass green on `main`.

## What's coming next

- **PR #2** — Spotify OAuth (`/api/auth/login`, `/api/auth/callback`, `/api/auth/logout`), encrypted cookie session via `iron-session`, no DB.
- **PR #3** — playlist-fetch endpoint (`/api/me/playlists`).

Local dev for those PRs needs **HTTPS via [mkcert](https://github.com/FiloSottile/mkcert)** and a **separate Spotify Developer app** for dev (so dev creds and prod creds never share). Setup steps for both will be added here when PR #2 lands.
