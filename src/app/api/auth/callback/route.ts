import { NextResponse, type NextRequest } from "next/server";
import { getHandoff, getSession } from "@/lib/auth/session";
import { exchangeCodeForTokens } from "@/lib/spotify/auth";
import { POST_LOGIN_PATH } from "@/lib/site-config";

function redirectTo(path: string): NextResponse {
  // Relative Location header — avoids trusting the request Host header
  // when computing the absolute redirect URL.
  return new NextResponse(null, {
    status: 303,
    headers: { Location: path },
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const stateFromSpotify = searchParams.get("state");
  const errorFromSpotify = searchParams.get("error");

  // Always destroy the handoff cookie before any branch returns, so a stale
  // verifier never sits in the browser past one callback hit.
  let handoff;
  try {
    handoff = await getHandoff();
  } catch {
    return new NextResponse("OAuth handoff cookie unreadable", { status: 400 });
  }
  const handoffState = handoff.state;
  const codeVerifier = handoff.codeVerifier;
  handoff.destroy();

  if (errorFromSpotify !== null) {
    return redirectTo(`${POST_LOGIN_PATH}?error=spotify_denied`);
  }

  if (code === null || stateFromSpotify === null) {
    return new NextResponse("Missing code or state", { status: 400 });
  }

  if (handoffState === undefined || codeVerifier === undefined) {
    return new NextResponse("No OAuth handoff in progress", { status: 400 });
  }

  if (handoffState !== stateFromSpotify) {
    return new NextResponse("State mismatch", { status: 400 });
  }

  try {
    const tokens = await exchangeCodeForTokens(code, codeVerifier);
    const session = await getSession();
    session.accessToken = tokens.accessToken;
    session.refreshToken = tokens.refreshToken;
    session.expiresAt = tokens.expiresAt;
    await session.save();
  } catch (error: unknown) {
    // Server-side log only — never include error detail in the response,
    // never log tokens / code / verifier / state.
    console.error("[auth/callback] token exchange failed", {
      name: error instanceof Error ? error.name : "unknown",
      message: error instanceof Error ? error.message : String(error),
    });
    return redirectTo(`${POST_LOGIN_PATH}?error=auth_failed`);
  }

  return redirectTo(POST_LOGIN_PATH);
}
