import { z } from "zod";
import { getEnv } from "@/lib/env";
import { SPOTIFY_SCOPE_STRING } from "@/lib/spotify/scopes";
import type { SessionData } from "@/lib/auth/session";

// Hard-coded Spotify endpoints — never built from request data, never honoring URL query params.
const SPOTIFY_AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

// Cap expires_in to prevent overflow when computing absolute expiresAt.
// Spotify access tokens are 1h; 30d is a generous sanity ceiling.
const MAX_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30;

const initialTokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1),
    expires_in: z.number().int().positive().max(MAX_EXPIRES_IN_SECONDS),
    token_type: z.literal("Bearer"),
    scope: z.string().min(1),
  })
  .strict();

const refreshTokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1).optional(),
    expires_in: z.number().int().positive().max(MAX_EXPIRES_IN_SECONDS),
    token_type: z.literal("Bearer"),
    scope: z.string().min(1).optional(),
  })
  .strict();

export interface ResolvedTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}

export function buildAuthorizeUrl(state: string, codeChallenge: string): string {
  const env = getEnv();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.SPOTIFY_CLIENT_ID,
    redirect_uri: env.SPOTIFY_REDIRECT_URI,
    scope: SPOTIFY_SCOPE_STRING,
    state,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
  });
  return `${SPOTIFY_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
): Promise<ResolvedTokens> {
  const env = getEnv();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.SPOTIFY_REDIRECT_URI,
    client_id: env.SPOTIFY_CLIENT_ID,
    code_verifier: codeVerifier,
  });

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(env.SPOTIFY_CLIENT_ID, env.SPOTIFY_CLIENT_SECRET),
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Spotify token exchange failed: ${String(response.status)}`);
  }

  const json: unknown = await response.json();
  const parsed = initialTokenResponseSchema.parse(json);

  return {
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token,
    expiresAt: Date.now() + parsed.expires_in * 1000,
  };
}

export async function refreshAccessToken(currentRefreshToken: string): Promise<ResolvedTokens> {
  const env = getEnv();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: currentRefreshToken,
    client_id: env.SPOTIFY_CLIENT_ID,
  });

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(env.SPOTIFY_CLIENT_ID, env.SPOTIFY_CLIENT_SECRET),
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Spotify token refresh failed: ${String(response.status)}`);
  }

  const json: unknown = await response.json();
  const parsed = refreshTokenResponseSchema.parse(json);

  // Spotify sometimes returns a new refresh_token on refresh — overwrite if present.
  return {
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token ?? currentRefreshToken,
    expiresAt: Date.now() + parsed.expires_in * 1000,
  };
}

const ACCESS_TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

export function isAccessTokenExpired(session: SessionData): boolean {
  if (session.expiresAt === undefined) {
    return true;
  }
  return Date.now() + ACCESS_TOKEN_REFRESH_BUFFER_MS >= session.expiresAt;
}
