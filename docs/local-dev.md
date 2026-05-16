# Local Development

How to run shuffleify on your own machine.

## Prerequisites

- **Node 24 LTS** — pinned in [`.nvmrc`](../.nvmrc). Install via [nvm-windows](https://github.com/coreybutler/nvm-windows), [fnm](https://github.com/Schniz/fnm), or your platform equivalent.
- **Corepack** ships with Node. One-time, in an **admin** shell:
  ```powershell
  corepack enable
  ```
  This activates the `pnpm` shim. The exact pnpm version is pinned via the `packageManager` field in [`package.json`](../package.json); Corepack handles it per-repo. No global pnpm install required.
- **Spotify Developer credentials** — get them from <https://developer.spotify.com/dashboard>.

## One-time setup

### 1. Clone and install

```powershell
git clone https://github.com/LLMATIONS/shuffleify.git
cd shuffleify
pnpm install
```

### 2. Register the local redirect URI

In the Spotify Developer Dashboard for your app, add this Redirect URI:

```
http://127.0.0.1:3000/shuffleify/api/auth/callback
```

Save.

### 3. Create `.env.local`

In the repo root (gitignored):

```
SPOTIFY_CLIENT_ID=<your client ID>
SPOTIFY_CLIENT_SECRET=<your client secret>
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/shuffleify/api/auth/callback
SESSION_PASSWORD=<see below>
```

Generate `SESSION_PASSWORD` (88 chars, 64 random bytes base64-encoded):

PowerShell:
```powershell
$b = New-Object byte[] 64; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

bash / zsh:
```bash
openssl rand -base64 64
```

## Run

```powershell
pnpm dev
```

Open <http://127.0.0.1:3000/shuffleify>.

> **Use `pnpm dev`, not `pnpm start`.** Production mode requires HTTPS for the cookies to be set by the browser; dev mode uses non-`Secure` cookies that work over HTTP loopback.

## Verify the auth flow

1. Landing page shows the hero and a **Log in with Spotify** button.
2. Click → Spotify consent screen.
3. Click "Agree" → redirects back to the landing page.
4. Landing page now shows a **Log out** button.
5. Click Log out → session cleared; back to the login button.

## Useful scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Development server at <http://127.0.0.1:3000/shuffleify> |
| `pnpm build` | Production build (webpack path) |
| `pnpm start` | Serve the production build (requires HTTPS for cookies) |
| `pnpm lint` | ESLint (Next + typescript-eslint strict-type-checked + security) |
| `pnpm typecheck` | `tsc --noEmit` |

All five are expected to be green on `main`.

## Common gotchas

- **"Invalid redirect URI" on Spotify's consent screen** — the URI in `.env.local` doesn't exactly match what's registered on the dashboard. Check trailing slashes, http-vs-https, port number.
- **`SESSION_PASSWORD must be at least 86 chars`** — your generated string is too short. Re-run the snippet above.
- **Cookie not set after callback** — open browser dev-tools → Application → Cookies. You should see `shuffleify-session` on `127.0.0.1` after the consent click. If not, you're probably running `pnpm start` instead of `pnpm dev`.
- **OAuth round-trip works in dev but breaks under `pnpm start`** — same cause; the `Secure` cookie flag flips on for prod builds and the browser refuses to set Secure cookies over plain HTTP.

## Coming later (not required for v0 dev)

- **HTTPS via [mkcert](https://github.com/FiloSottile/mkcert)** — when we tighten the dev posture to match prod parity. Adds `--experimental-https` to `pnpm dev` and a local cert for `127.0.0.1`. ~15 min to set up.
- **Separate Spotify Developer app for dev** — so dev creds and prod creds never share. Currently both environments use the same app with two registered redirect URIs.
