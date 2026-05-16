# Backend Overview

What's running in the backend right now, in plain terms.

## The stack

- **Next.js 15 App Router** (Node runtime)
- **iron-session** for encrypted cookie sessions — no database, anywhere
- **zod** for strict validation of Spotify's responses
- **Web Crypto API** for PKCE — runs identically on Node, Edge, and Cloudflare Workers (keeps migration cheap later)

## What it does today

Three things, all OAuth lifecycle:

1. Sends the user to Spotify to log in.
2. Catches the redirect back from Spotify and stores their access + refresh tokens in an encrypted cookie.
3. Logs them out and clears the cookie.

That's the entire backend right now. No playlists, no shuffle, no anything-else-yet.

## Request flow

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

## Files and what they do

| File | What it does |
|---|---|
| `src/app/page.tsx` | Landing page. Reads the session cookie; shows login or logout UI accordingly. |
| `src/app/api/auth/login/route.ts` | Builds the Spotify authorize URL with PKCE params and redirects there. |
| `src/app/api/auth/callback/route.ts` | OAuth return endpoint. Validates state, destroys handoff cookie, exchanges code for tokens, stores them in the session cookie. |
| `src/app/api/auth/logout/route.ts` | Destroys the session cookie (and handoff if present). |
| `src/lib/auth/session.ts` | iron-session config. Defines what's in the session and the handoff cookies, plus their security flags. |
| `src/lib/spotify/auth.ts` | Talks to Spotify. `exchangeCodeForTokens` (initial), `refreshAccessToken` (for expired access tokens). |
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
- **Spotify token endpoint is hard-coded.** Never built from request data — protects against IDP-mix-up attacks.
- **Redirects use relative `Location` headers.** Never trust the request's `Host` header.
- **Strict zod parsing of Spotify token responses.** Unknown shape = exchange fails closed, not open.

## What's NOT there yet

- **`/api/me/playlists`** — endpoint that fetches the user's playlists. Lands in the next PR. Will be the first place `refreshAccessToken` is actually called.
- **The shuffle itself.** Phase 2.
- **HTTP security headers** (HSTS, CSP, etc.) — Phase 3 hardening.
- **Reverse-proxy + edge rate limiting** — lands with the first deploy on Caddy.
- **A real database, anywhere.** None planned for v0; cookie-only state by design.
