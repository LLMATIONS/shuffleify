import { getIronSession, type IronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";
import { COOKIE_PATH } from "@/lib/site-config";

// Bridges Next 15's ReadonlyRequestCookies and iron-session's internal CookieStore.
// Runtime compatible; both expose get/set/delete with matching call shapes. The
// types diverge under exactOptionalPropertyTypes because iron-session's `set` is
// an overload set including (name, value, cookie?) and (options), and a single
// local structural type cannot satisfy both signatures. iron-session does not
// export the type, so `as never` is the cleanest narrow cast at the boundary.
async function getCookieStore() {
  return (await cookies()) as never;
}

// `| undefined` on the optionals is intentional: iron-session populates these
// fields at decrypt time and may write `undefined` directly; under
// exactOptionalPropertyTypes the bare `?:` shape would reject those writes.
export interface SessionData {
  accessToken?: string | undefined;
  refreshToken?: string | undefined;
  expiresAt?: number | undefined;
}

export interface HandoffData {
  state?: string | undefined;
  codeVerifier?: string | undefined;
}

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24;
const HANDOFF_MAX_AGE_SECONDS = 60 * 10;

const isProduction = process.env.NODE_ENV === "production";

const SESSION_COOKIE_NAME = isProduction ? "__Secure-shuffleify-session" : "shuffleify-session";
const HANDOFF_COOKIE_NAME = isProduction ? "__Secure-shuffleify-oauth" : "shuffleify-oauth";

function baseCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: COOKIE_PATH,
    maxAge,
  };
}

function getSessionOptions(): SessionOptions {
  return {
    password: getEnv().SESSION_PASSWORD,
    cookieName: SESSION_COOKIE_NAME,
    cookieOptions: baseCookieOptions(SESSION_MAX_AGE_SECONDS),
  };
}

function getHandoffOptions(): SessionOptions {
  return {
    password: getEnv().SESSION_PASSWORD,
    cookieName: HANDOFF_COOKIE_NAME,
    cookieOptions: baseCookieOptions(HANDOFF_MAX_AGE_SECONDS),
  };
}

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await getCookieStore(), getSessionOptions());
}

export async function getHandoff(): Promise<IronSession<HandoffData>> {
  return getIronSession<HandoffData>(await getCookieStore(), getHandoffOptions());
}
