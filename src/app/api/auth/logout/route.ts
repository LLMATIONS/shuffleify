import { NextResponse } from "next/server";
import { getHandoff, getSession } from "@/lib/auth/session";
import { POST_LOGIN_PATH } from "@/lib/site-config";

export async function POST(): Promise<NextResponse> {
  const session = await getSession();
  session.destroy();

  const handoff = await getHandoff();
  handoff.destroy();

  // Relative Location — see redirectTo() comment in callback route.
  return new NextResponse(null, {
    status: 303,
    headers: { Location: POST_LOGIN_PATH },
  });
}
