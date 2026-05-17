import { NextResponse } from "next/server";
import { getHandoff, getSession } from "@/lib/auth/session";
import { POST_LOGOUT_PATH } from "@/lib/site-config";

export async function POST(): Promise<NextResponse> {
  const session = await getSession();
  session.destroy();

  const handoff = await getHandoff();
  handoff.destroy();

  // Relative Location — see redirectTo() comment in callback route.
  // Redirects to the confirmation view rather than back to the hero so the
  // user sees something happened, and so we honor `docs/oauth.md`'s mandatory
  // disclosure that Spotify still has authorization until the user revokes it
  // on Spotify's side.
  return new NextResponse(null, {
    status: 303,
    headers: { Location: POST_LOGOUT_PATH },
  });
}
