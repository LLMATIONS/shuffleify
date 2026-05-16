# OAuth Design

How Shuffleify authenticates with Spotify, in detail. The design covers the auth surface only — login, callback, logout, session, headers.

## Summary

Spotify Authorization Code flow with PKCE. Server-side token exchange. User tokens stored in an encrypted session cookie. No database. Three OAuth scopes locked in a frozen constant. Re-auth on every new session.

## Threat model

**In scope (defended):**

- Network attacker (passive eavesdrop, active MITM on user→site path)
- Malicious browser extension or compromised network reading the OAuth `code` in transit
- CSRF on the OAuth flow itself (attacker forges a redirect-back to the callback)
- Stored XSS attempting to read tokens via JavaScript
- Session fixation
- Open-redirect on the OAuth callback
- IDP mix-up (attacker tricks the server into talking to a fake token endpoint)
- Refresh-token replay within a stolen cookie

**Out of scope (explicitly):**

- Compromised host — root on the deploy box has plaintext tokens in process memory; this is the cost of self-hosting and is documented to users
- Spotify-side compromise of the user's account
- Physical access to the user's unlocked browser
- Side-channel attacks on the cookie encryption key

**Asset:** the user's Spotify access + refresh token, scoped to `playlist-read-private`, `playlist-modify-private`, `playlist-modify-public`. Three scopes — no read of user profile data beyond what the playlist endpoints return.

## End-to-end flow

1. User clicks **Log in with Spotify** → server generates random `state` (32 bytes via `crypto.getRandomValues`) and PKCE `code_verifier` (64 bytes), stashes both in a single short-lived signed cookie (the handoff cookie), redirects browser to Spotify with `client_id`, `redirect_uri`, scopes, `state`, and `code_challenge` (SHA-256 of verifier, base64url, via Web Crypto).
2. User sees Spotify consent screen, agrees.
3. Spotify redirects back to `/api/auth/callback?code=...&state=...`.
4. Server validates: does `state` from URL match the one in the handoff cookie? If no → reject with 400. **Handoff cookie is destroyed BEFORE the token exchange call** (single-use; a failed exchange must not leave a redeemable verifier sitting around).
5. Server exchanges `code + code_verifier + client_secret` for tokens at the **hard-coded** Spotify token endpoint (`https://accounts.spotify.com/api/token` — never built from request data, never honoring any URL query param).
6. Server receives `access_token` (1 hour TTL) + `refresh_token`. Both encrypted into the session cookie. Redirect to a server-constant relative path.
7. Subsequent API calls read tokens from cookie, call Spotify on the user's behalf.
8. Within a session: access-token expiry → refresh transparently using the refresh token. Refresh failure → clear session, redirect to login.
9. Session cookie expiry (24h max-age) → user re-auths from scratch on next visit.

## Why each piece

### Authorization Code flow (not Implicit)

Implicit flow is deprecated by the IETF. Auth Code with server-side token exchange keeps tokens off the browser entirely.

### PKCE on top of Auth Code

Defense in depth against intercepted-code attacks. RFC 9700 (OAuth 2.0 BCP, 2024) and OAuth 2.1 both recommend PKCE for **all** clients, including confidential server clients.

### `state` parameter

CSRF defense for the OAuth flow itself. Without it, an attacker could trick a victim into completing the attacker's OAuth flow. Bound to the verifier in a single cookie payload (one cookie, two values) so the two are validated together.

### Encrypted-cookie session via `iron-session` — not DB, not in-memory store

Session storage is cookie-only by design — no database, no in-memory store. `iron-session` runs identically on Node, Cloudflare Workers, and Vercel Edge, which preserves migration optionality.

### Re-auth on every new session

Intentional, not a side effect. The session cookie TTL is 24 hours; on expiry, the user re-OAuths from scratch.

### Scopes locked in one constant

Principle of least privilege + change control. `src/lib/spotify/scopes.ts` exports a frozen array. Any change requires editing that file (visible in `git blame` and PR diff) **and** is a partnership conversation.

## OAuth handoff cookie

The short-lived cookie that carries `state` + `code_verifier` between the redirect to Spotify and the callback.

| Property | Value | Why |
|---|---|---|
| Name | `__Secure-shuffleify-oauth` (prod) / `shuffleify-oauth` (dev) | `__Secure-` prefix forces `Secure` flag in prod. We can't use `__Host-` because Shuffleify lives at a subpath (`/shuffleify`) — `__Host-` requires `Path=/`. See "Subdomain migration note" below. |
| Path | `/shuffleify` | Scoped to our subpath, not the whole apex domain. |
| HttpOnly | yes | JavaScript cannot read it. |
| Secure | yes in prod, no in dev | HTTPS-only in prod; dev is HTTP loopback. |
| SameSite | `Lax` | `Strict` breaks the Spotify→callback redirect on some browsers. `Lax` is the OAuth-flow-correct setting. |
| Max-Age | 600 (10 minutes) | Short replay window. Anything longer is a liability. |
| Payload | encrypted blob containing `{ state, codeVerifier }` | Single cookie, both values. |
| Lifecycle | **single-use**: destroyed on the server BEFORE the token exchange call in `/callback` | Failed exchange leaves no redeemable verifier. |

## Session cookie

| Property | Value | Why |
|---|---|---|
| Name | `__Secure-shuffleify-session` (prod) / `shuffleify-session` (dev) | Same prefix reasoning. |
| Path | `/shuffleify` | Same scoping. |
| HttpOnly | yes | XSS can't read tokens. |
| Secure | yes in prod, no in dev | Same as handoff. |
| SameSite | `Lax` | OAuth-redirect-correct. |
| Max-Age | 86400 (24h) | Hard ceiling per "user re-auths each visit." |
| Payload | encrypted blob: `{ accessToken, refreshToken, expiresAt }` | iron-session standard shape. |

### iron-session config specifics

- `cookieName`: `__Secure-shuffleify-session` (prod) or `shuffleify-session` (dev), branched on `NODE_ENV`
- `password`: `SESSION_PASSWORD` env var. **Minimum 64 random bytes**, base64-encoded (~88 chars). Generate with `openssl rand -base64 64`. The library's "32-char minimum" is a floor, not a security target — `src/lib/env.ts` enforces `>= 86` chars at runtime.
- `cookieOptions`: `{ httpOnly: true, secure: NODE_ENV === 'production', sameSite: 'lax', path: '/shuffleify', maxAge: 86_400 }`
- **Password rotation:** iron-session accepts `{ 1: 'newpw', 2: 'oldpw' }` for rotation. Procedure: add new key with higher number; cookies encrypted with old key still decrypt; new cookies use the new key; remove old key after the max-age window passes (24h). Quarterly rotation cadence at minimum — public AGPL repo means anyone reading source knows what one leaked env var unlocks.

## Token refresh logic

Lives in **one place**: `src/lib/spotify/auth.ts`. Every route handler that calls Spotify funnels through this single utility. No inline duplication.

### Pitfalls explicitly handled:

1. **Spotify sometimes returns a new `refresh_token` on refresh.** Always overwrite if the response includes one — silently keeping the old one will eventually 401 when Spotify rotates and rejects.
2. **Concurrent refresh races.** A user opens two tabs at minute 60; both fire requests; both try to refresh. With cookie-only state, the second response overwrites the first — acceptable for v0 (Spotify currently allows multiple valid access tokens). If Spotify ever moves to one-time-use refresh tokens, this design needs revisiting.
3. **Refresh failure clears the session cookie.** `Set-Cookie: __Secure-shuffleify-session=; Max-Age=0; Path=/shuffleify; Secure; HttpOnly; SameSite=Lax`. Then redirect to login.

## Logout

Spotify **does not expose a token-revocation endpoint** (long-standing complaint, no fix as of 2026). Logout therefore:

1. Server clears the session cookie (`Max-Age=0`).
2. UI shows: "Logged out. **To fully revoke Shuffleify's access**, visit your Spotify [Apps page](https://www.spotify.com/account/apps/)." Link is mandatory — do not pretend logout fully revokes when it doesn't.
3. The handoff cookie is also cleared on logout (defense-in-depth; it's normally ephemeral).

## HTTP security headers (Phase 3 deferred)

To be set on every response via Next.js middleware so we can wire CSP nonces. Land in a hardening pass after the v0 happy-path ships.

| Header | Value | Why |
|---|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Forces HTTPS for 2 years. Eligible for HSTS preload. |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME sniffing. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Prevents the OAuth `code` from leaking via Referer to any third party. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(), usb=()` | Deny everything we don't use. |
| `Content-Security-Policy` | (see below) | Strong CSP with nonces. |

### CSP starter

```
default-src 'self';
script-src 'self' 'nonce-{nonce}';
style-src 'self' 'unsafe-inline';
img-src 'self' i.scdn.co data:;
connect-src 'self' https://api.spotify.com;
frame-ancestors 'none';
base-uri 'none';
form-action 'self' https://accounts.spotify.com;
```

Notes:
- Script `nonce-{nonce}` wired through Next middleware per request — **no `unsafe-inline` for scripts**, ever.
- Style `'unsafe-inline'` is a v0 compromise for Tailwind's CSS-first config. Tighten in Phase 3 hardening.
- `i.scdn.co` is Spotify's image CDN — for playlist art.
- `frame-ancestors 'none'` covers `X-Frame-Options: DENY`.

## Anti-patterns we explicitly do NOT use

- Tokens in `localStorage` or `sessionStorage` — JS-readable, XSS-exfiltratable.
- OAuth Implicit flow — deprecated.
- Logging tokens / cookie values / `code` / `state` / `verifier` — not even at debug level. Reverse-proxy access logs must strip query strings on the callback URL specifically.
- Skipping `state` for dev convenience.
- Storing the client secret anywhere a request to the browser could leak it.
- **Open redirect on `/api/auth/callback`** — never honor a `redirect_uri`-style query param; the post-login destination is a server-side constant.
- **IDP mix-up** — Spotify token endpoint URL is hard-coded, never built from request data.
- Trusting `X-Forwarded-*` blindly — once we're behind a reverse proxy, Next must trust **only** the proxy IP for those headers, otherwise `Secure` cookie checks can be bypassed in some setups.
- Using `__Host-` cookie prefix at the subpath setup (would require cookies scoped to apex domain — see subdomain migration note).

## Local development hardening

Current dev posture is intentionally lax (HTTP loopback, single Spotify app, conditional `Secure` flag) to minimize local setup. The strict targets below land when we want them — flipping to strict is roughly a 20-minute change.

- **Separate Spotify Developer app entirely for dev** — different `CLIENT_ID` and `CLIENT_SECRET` from prod. If dev creds leak, prod is unaffected. Currently both environments share one app with two registered redirect URIs.
- **Use `127.0.0.1`, not `localhost`** — Spotify accepts both `http://127.0.0.1:<port>/...` and `https://127.0.0.1:<port>/...` as redirect URIs and treats them differently from `localhost`.
- **Use HTTPS locally via mkcert** — install mkcert, generate a local cert for `127.0.0.1`, run Next behind the cert. Reason: `Secure` cookie flag stays on; the dev code path matches prod exactly.
- **`.env.local` is gitignored.** `.env.example` ships placeholder values that fail loudly if accidentally committed.

## Where each secret lives

| Secret | Storage | Sent to browser? |
|---|---|---|
| `SPOTIFY_CLIENT_ID` | Server env var | Yes — appears in OAuth redirect URL. Public-ish. |
| `SPOTIFY_CLIENT_SECRET` | Server env var | Never. Used only in server→Spotify token exchange. |
| `SESSION_PASSWORD` (≥64 random bytes, base64) | Server env var | Never. Encrypts/decrypts both cookies. |
| User access + refresh tokens | Encrypted in the session cookie on the user's browser | Encrypted blob yes; plaintext never. |

## Required env vars

```
SPOTIFY_CLIENT_ID=replace-me-from-developer-dashboard
SPOTIFY_CLIENT_SECRET=replace-me-from-developer-dashboard
SPOTIFY_REDIRECT_URI=https://swagcounty.com/shuffleify/api/auth/callback
SESSION_PASSWORD=replace-me-with-openssl-rand-base64-64-output
```

`SPOTIFY_REDIRECT_URI` is the production proxy URL once locked. Local dev uses `http://127.0.0.1:3000/shuffleify/api/auth/callback` (or `https://...` once mkcert lands). All registered redirect URIs must be on the Spotify Developer dashboard.

## Portability notes

Shuffleify v0 self-hosts behind a reverse proxy as an explicit stopgap; subsequent projects move to cloud hosting. The OAuth implementation is built to migrate with **zero code changes** — only the deployment target and the registered Spotify redirect URI change.

- **Web Crypto API** for SHA-256 hashing — runs on Node, Cloudflare Workers, Vercel Edge identically.
- **`iron-session`** — same library across runtimes.
- **Cookie-only session state** — no Redis, no DB, no in-memory store.
- **Standard `fetch()`** for the Spotify token + API endpoints.
- **All secrets via `process.env`** — universal.
- **No filesystem writes** anywhere in the auth path.
- **Do not set `export const runtime = 'edge'`** on any auth route without an explicit portability review — would change the underlying APIs and may break `iron-session` on some targets.

## Operational notes

- **gitleaks pre-commit hook** before any sensitive changes — catches accidental secret commits before they reach `main`.
- **Rate-limit `/api/auth/callback` at the edge** (reverse proxy) — cheap defense against someone hammering it with garbage `code` values.
- **TLS terminates at the reverse proxy.** Anyone with root on the deploy box sees plaintext tokens in process memory. This is the threat-model "out of scope" line — it must be explicit in user-facing copy so the cost of self-hosting is honest.
- **`SESSION_PASSWORD` rotation cadence:** quarterly minimum.
- **Cookie size:** encrypted access + refresh + metadata can push past 4KB on some Spotify token responses. Test before committing to cookie-only. Crossing 4KB silently loses the cookie on some proxies/CDNs.

## Subdomain migration note

The current URL is `swagcounty.com/shuffleify` (subpath of an existing site). This forces:

- `__Secure-` cookie prefix instead of `__Host-` (slightly weaker isolation — `__Host-` rejects cookies set by subdomains).
- `Path=/shuffleify` cookie scoping (works, but cookies are sent on any request matching the subpath).

Migration to `shuffleify.swagcounty.com` (subdomain) would unlock `__Host-` with `Path=/` — strictly stronger isolation. Worth revisiting on cloud migration; not blocking v0.

## Routing convention

| Pattern | Purpose | Examples |
|---|---|---|
| `/api/auth/*` | OAuth lifecycle | `/login`, `/callback`, `/logout` |
| `/api/me/*` | Read-only authenticated user-resource endpoints | `/playlists` |
| `/api/<action>` | Action-shaped endpoints (state-changing) | `/api/shuffle`, `/api/playlist/create` |

Pre-decided so future PRs don't re-argue route shape.

## What this doc does NOT cover

- Spotify API client implementation details (lands with the playlist-fetch endpoint).
- Frontend page copy / UX of the login button (separate lane).
- Reverse-proxy config + access-log query-string stripping (deploy lane).
- Mkcert setup steps (lands when dev posture tightens).
- Fisher-Yates shuffle algorithm (Phase 2).
