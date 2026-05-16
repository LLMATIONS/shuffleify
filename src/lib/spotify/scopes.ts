// Spotify OAuth scopes — frozen by intent.
// Any addition here is a partnership conversation, not an implementation detail.
export const SPOTIFY_SCOPES = Object.freeze([
  "playlist-read-private",
  "playlist-modify-private",
  "playlist-modify-public",
] as const);

export const SPOTIFY_SCOPE_STRING = SPOTIFY_SCOPES.join(" ");
