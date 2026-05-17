import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { ensureFreshToken, MissingSessionTokensError } from "@/lib/auth/token";
import {
  fetchUserPlaylists,
  SpotifyNetworkError,
  SpotifyRateLimitError,
  SpotifyResponseShapeError,
  SpotifyUnauthorizedError,
  SpotifyUnavailableError,
  SpotifyUnexpectedStatusError,
} from "@/lib/spotify/playlists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESPONSE_HEADERS: Record<string, string> = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
};

function jsonError(status: number, code: string): NextResponse {
  return NextResponse.json(
    { ok: false as const, error: code },
    { status, headers: RESPONSE_HEADERS },
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Browsers send Sec-Fetch-Site on fetch / XHR / navigation. Honoring it
  // here blocks any future apex-shared app from reading this response across
  // origins. Same-origin and same-site are accepted; cross-site is refused.
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite === "cross-site") {
    return jsonError(403, "forbidden");
  }

  // v0 takes no query parameters. Pagination is server-side; any query string
  // is a client passing inputs the endpoint hasn't agreed to interpret.
  const url = new URL(request.url);
  if (url.search !== "") {
    return jsonError(400, "unsupported_parameters");
  }

  const session = await getSession();

  let accessToken: string;
  try {
    accessToken = await ensureFreshToken(session);
  } catch (error) {
    if (error instanceof MissingSessionTokensError) {
      return jsonError(401, "session_expired");
    }
    console.error("[api/me/playlists] token refresh failed", {
      name: error instanceof Error ? error.name : "unknown",
      message: error instanceof Error ? error.message : String(error),
    });
    session.destroy();
    return jsonError(401, "session_expired");
  }

  try {
    const { items, total } = await fetchUserPlaylists(accessToken);
    return NextResponse.json(
      { ok: true as const, data: { items, total } },
      { headers: RESPONSE_HEADERS },
    );
  } catch (error) {
    if (error instanceof SpotifyUnauthorizedError) {
      // Spotify rejected the fresh token. Treat as session compromised:
      // destroy the cookie and force re-auth.
      session.destroy();
      return jsonError(401, "session_expired");
    }
    if (error instanceof SpotifyRateLimitError) {
      return jsonError(429, "rate_limited");
    }
    if (error instanceof SpotifyUnavailableError) {
      console.error("[api/me/playlists] spotify unavailable", { status: error.status });
      return jsonError(502, "upstream_unavailable");
    }
    if (error instanceof SpotifyUnexpectedStatusError) {
      console.error("[api/me/playlists] spotify unexpected status", { status: error.status });
      return jsonError(502, "upstream_unavailable");
    }
    if (error instanceof SpotifyNetworkError) {
      console.error("[api/me/playlists] spotify network error", { message: error.message });
      return jsonError(502, "upstream_unavailable");
    }
    if (error instanceof SpotifyResponseShapeError) {
      // Loud log: signals Spotify API drift, not user error. Worth seeing.
      console.error("[api/me/playlists] spotify response shape mismatch", {
        message: error.message,
      });
      return jsonError(502, "upstream_invalid");
    }
    console.error("[api/me/playlists] unexpected error", {
      name: error instanceof Error ? error.name : "unknown",
      message: error instanceof Error ? error.message : String(error),
    });
    return jsonError(500, "internal_error");
  }
}
