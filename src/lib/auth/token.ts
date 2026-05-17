import type { IronSession } from "iron-session";
import type { SessionData } from "@/lib/auth/session";
import { isAccessTokenExpired, refreshAccessToken } from "@/lib/spotify/auth";

export class MissingSessionTokensError extends Error {
  constructor() {
    super("session missing access token, refresh token, or expiresAt");
    this.name = "MissingSessionTokensError";
  }
}

// Ensure the session carries a non-expired access token. Returns the access
// token, refreshing first if the stored token is within the 60-second expiry
// buffer (see `isAccessTokenExpired`). Persists rotated tokens via session.save()
// so the encrypted cookie reflects the new state on the next response.
export async function ensureFreshToken(
  session: IronSession<SessionData>,
): Promise<string> {
  if (
    session.accessToken === undefined ||
    session.refreshToken === undefined ||
    session.expiresAt === undefined
  ) {
    throw new MissingSessionTokensError();
  }

  if (!isAccessTokenExpired(session)) {
    return session.accessToken;
  }

  const refreshed = await refreshAccessToken(session.refreshToken);
  session.accessToken = refreshed.accessToken;
  session.refreshToken = refreshed.refreshToken;
  session.expiresAt = refreshed.expiresAt;
  await session.save();
  return session.accessToken;
}
