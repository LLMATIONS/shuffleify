# Backend Overview

What's running in the backend right now, in plain terms.

## The stack

- **Next.js 15 App Router** (Node runtime)
- **iron-session** for encrypted cookie sessions — no database, anywhere
- **zod** for strict validation of Spotify's responses
- **Web Crypto API** for PKCE — runs identically on Node, Edge, and Cloudflare Workers (keeps migration cheap later)

## What it does today

Four things:

1. Sends the user to Spotify to log in.
2. Catches the redirect back from Spotify and stores their access + refresh tokens in an encrypted cookie.
3. Lists the authenticated user's playlists, refreshing the access token first if needed.
4. Logs them out and clears the cookie.

## OAuth request flow

```
User clicks "Log in with Spotify"
        ↓
GET /shuffleify/api/auth/login
   - Generate random `state` + PKCE `code_verifier`
   - Stash both in a 10-minute encrypted handoff cookie
   - 307 redirect → accounts.spotify.com/authorize?... (with code_challenge)
        ↓
User clicks "Agree" on Spotify
        ↓
Spotify redirects to: /shuffleify/api/auth/callback?code=...&state=...
   - Read handoff cookie, then DESTROY it (single-use)
   - Verify the returned `state` matches
   - POST to accounts.spotify.com/api/token with code + code_verifier + basic auth
   - Spotify returns access_token + refresh_token + expires_in
   - Encrypt those into a 24-hour session cookie
   - 303 redirect → /shuffleify (the landing page)
        ↓
Landing page sees session.accessToken is set → shows "Log out" button
```

## Playlist fetch flow

```
Client: GET /shuffleify/api/me/playlists
        ↓
Reject cross-site requests (`Sec-Fetch-Site: cross-site` → 403 `forbidden`)
Reject any query parameters (→ 400 `unsupported_parameters`)
        ↓
ensureFreshToken(session)
   - If access token is within 60s of expiry, POST to Spotify's token endpoint
     with the stored refresh token.
   - On refresh, save the new tokens to the session cookie.
   - On missing session tokens or refresh failure → 401 `session_expired`
     (session destroyed).
        ↓
fetchUserPlaylists(accessToken)
   - GET api.spotify.com/v1/me/playlists?limit=50
   - Iterate server-side until `next` is null (safety cap: 50 pages = 2,500 playlists)
   - Refuse pagination URLs whose origin isn't api.spotify.com
   - Strict zod parse of each page; project to a minimal Playlist shape
        ↓
Response: { ok: true, data: { items: Playlist[], total: number } }
   - Cache-Control: private, no-store
   - Vary: Cookie
```

## Error envelope

Every Spotify-touching endpoint returns one of:

```
{ ok: true,  data: ... }                // success
{ ok: false, error: "<code>" }          // failure
```

Failure codes used by `/api/me/playlists`:

| Code | HTTP | When |
|---|---|---|
| `forbidden` | 403 | `Sec-Fetch-Site: cross-site` on the request. |
| `unsupported_parameters` | 400 | Any query parameters present. v0 takes none. |
| `session_expired` | 401 | Session has no tokens, refresh failed, or Spotify returned 401 after a fresh token. Session is destroyed on the way out. |
| `rate_limited` | 429 | Spotify returned 429. |
| `upstream_unavailable` | 502 | Spotify returned 5xx or some other unexpected status. |
| `upstream_invalid` | 502 | Spotify's response failed zod validation. Logged loudly; signals API drift. |
| `internal_error` | 500 | Catch-all for unexpected exceptions. |

## Files and what they do

| File | What it does |
|---|---|
| `src/app/page.tsx` | Landing page. Reads the session cookie; shows login or logout UI accordingly. |
| `src/app/api/auth/login/route.ts` | Builds the Spotify authorize URL with PKCE params and redirects there. |
| `src/app/api/auth/callback/route.ts` | OAuth return endpoint. Validates state, destroys handoff cookie, exchanges code for tokens, stores them in the session cookie. |
| `src/app/api/auth/logout/route.ts` | Destroys the session cookie (and handoff if present). |
| `src/app/api/me/playlists/route.ts` | Lists the authenticated user's playlists. Rejects cross-site requests and query parameters; returns the discriminated-union envelope. |
| `src/lib/auth/session.ts` | iron-session config. Defines what's in the session and the handoff cookies, plus their security flags. |
| `src/lib/auth/token.ts` | `ensureFreshToken(session)` — refreshes the access token if within 60s of expiry, persists the new state via `session.save()`, returns the access token. |
| `src/lib/spotify/auth.ts` | Talks to Spotify's accounts host. `exchangeCodeForTokens` (initial), `refreshAccessToken` (rotation). |
| `src/lib/spotify/playlists.ts` | Talks to Spotify's API host. `fetchUserPlaylists` — paginates server-side, strict-parses each page, projects each item to a minimal `Playlist` shape. |
| `src/lib/spotify/pkce.ts` | Generates random `state`, `code_verifier`, and the SHA-256 `code_challenge`. |
| `src/lib/spotify/scopes.ts` | The three OAuth scopes, frozen so additions show up in `git blame`. |
| `src/lib/env.ts` | Reads and validates the four required env vars. Fails loudly if any are missing. |
| `src/lib/site-config.ts` | Shared constants (basePath, cookie path, post-login redirect target). |
| `next.config.ts` | Sets `basePath: "/shuffleify"` so the app lives at `/shuffleify/...` instead of root. |

## Security posture (high level)

Full design and threat model in [`oauth.md`](./oauth.md). Headlines:

- **Tokens never reach JavaScript-readable storage.** They live in an `HttpOnly` cookie, decrypted server-side per request.
- **Two cookies, both encrypted with `SESSION_PASSWORD`:**
  - 10-minute handoff cookie carrying state + verifier — destroyed at the end of every callback hit.
  - 24-hour session cookie carrying access + refresh + expiresAt — cleared on logout.
  - In prod, both gain the `__Secure-` name prefix and the `Secure` flag. Derived from `NODE_ENV` in `src/lib/auth/session.ts`.
- **Three OAuth scopes only:** `playlist-read-private`, `playlist-modify-private`, `playlist-modify-public`. No user profile, no email, no listening history. Frozen in code; adding a fourth is a partnership conversation.
- **Spotify endpoints are hard-coded.** Token URL and API host are never built from request data. The playlist fetcher additionally refuses to follow pagination URLs whose origin isn't `api.spotify.com`, even though those URLs come from Spotify's own response.
- **Redirects use relative `Location` headers.** Never trust the request's `Host` header.
- **Strict zod parsing of Spotify token responses.** Unknown shape on the token endpoint = exchange fails closed, not open. Playlist boundary uses `.loose()` to tolerate Spotify adding metadata fields over time; the projection layer is the gatekeeper and never exposes non-whitelisted fields to clients.
- **`/api/me/playlists` rejects cross-site requests** via `Sec-Fetch-Site` and rejects any query parameters. Responses are `Cache-Control: private, no-store` with `Vary: Cookie`.

## What's NOT there yet

- **The shuffle itself.** Phase 2.
- **HTTP security headers** (HSTS, CSP, etc.) — Phase 3 hardening.
- **Reverse-proxy + edge rate limiting** — lands with the first deploy on Caddy.
- **A real database, anywhere.** None planned for v0; cookie-only state by design.
