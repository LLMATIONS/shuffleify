// PKCE helpers built on the Web Crypto API for portability across
// Node, Cloudflare Workers, and Vercel Edge.

const STATE_BYTES = 32;
const VERIFIER_BYTES = 64;

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomBase64Url(byteLength: number): string {
  const buffer = new Uint8Array(byteLength);
  crypto.getRandomValues(buffer);
  return base64UrlEncode(buffer);
}

export function generateState(): string {
  return randomBase64Url(STATE_BYTES);
}

export function generateCodeVerifier(): string {
  return randomBase64Url(VERIFIER_BYTES);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}
