import { NextResponse } from "next/server";
import { getHandoff } from "@/lib/auth/session";
import { buildAuthorizeUrl } from "@/lib/spotify/auth";
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
} from "@/lib/spotify/pkce";

export async function GET(): Promise<NextResponse> {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const handoff = await getHandoff();
  handoff.state = state;
  handoff.codeVerifier = codeVerifier;
  await handoff.save();

  return NextResponse.redirect(buildAuthorizeUrl(state, codeChallenge));
}
