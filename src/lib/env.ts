function requireEnv(name: string): string {
  // eslint-disable-next-line security/detect-object-injection -- process.env is not user-controlled.
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface Env {
  SPOTIFY_CLIENT_ID: string;
  SPOTIFY_CLIENT_SECRET: string;
  SPOTIFY_REDIRECT_URI: string;
  SESSION_PASSWORD: string;
}

export function getEnv(): Env {
  const sessionPassword = requireEnv("SESSION_PASSWORD");
  if (sessionPassword.length < 86) {
    throw new Error("SESSION_PASSWORD must be at least 86 chars (64 random bytes, base64)");
  }
  return {
    SPOTIFY_CLIENT_ID: requireEnv("SPOTIFY_CLIENT_ID"),
    SPOTIFY_CLIENT_SECRET: requireEnv("SPOTIFY_CLIENT_SECRET"),
    SPOTIFY_REDIRECT_URI: requireEnv("SPOTIFY_REDIRECT_URI"),
    SESSION_PASSWORD: sessionPassword,
  };
}
