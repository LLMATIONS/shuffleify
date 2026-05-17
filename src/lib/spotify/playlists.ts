import { z } from "zod";

// Hard-coded Spotify endpoint — never built from request data.
const SPOTIFY_API_ORIGIN = "https://api.spotify.com";
const SPOTIFY_PLAYLISTS_URL = `${SPOTIFY_API_ORIGIN}/v1/me/playlists`;

const PAGE_LIMIT = 50;
// Safety cap on pagination. 50 pages * 50 items = 2500 playlists, far above
// any realistic user. Guards against a malformed `next` chain looping forever.
const MAX_PAGES = 50;

// Boundary schemas use .loose() — Spotify adds fields to playlist metadata
// over time (e.g. `primary_color`) and a strict parse would fail on every
// addition. The projection helpers below are the gatekeepers: only whitelisted
// fields make it into the returned `Playlist` shape.
const spotifyImageSchema = z
  .object({
    url: z.url(),
    width: z.number().nullable().optional(),
    height: z.number().nullable().optional(),
  })
  .loose();

const spotifyPlaylistOwnerSchema = z
  .object({
    id: z.string().min(1),
    display_name: z.string().nullable().optional(),
  })
  .loose();

// Spotify deprecated the per-playlist `tracks: {href, total}` field in favor of
// `items: {href, total}` (same shape, new name). Accounts return `items`; some
// still return `tracks` alongside. Accept either; projection prefers `items`.
// Per spotify-api-reference [10.1] + live docs as of 2026-05-16.
const spotifyPlaylistTrackPaginationSchema = z
  .object({
    href: z.url().optional(),
    total: z.number().int().nonnegative(),
  })
  .loose();

const spotifyPlaylistSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    description: z.string().nullable().optional(),
    owner: spotifyPlaylistOwnerSchema,
    snapshot_id: z.string().min(1),
    collaborative: z.boolean(),
    public: z.boolean().nullable().optional(),
    items: spotifyPlaylistTrackPaginationSchema.optional(),
    tracks: spotifyPlaylistTrackPaginationSchema.optional(),
    // Docs say `images` is non-nullable array, but live API returns `null` for
    // playlists without cover art. Project null → [] at the projection layer.
    images: z.array(spotifyImageSchema).nullable(),
  })
  .loose()
  .refine(
    (raw) => raw.items !== undefined || raw.tracks !== undefined,
    { message: "playlist missing both `items` and `tracks` track-count fields" },
  );

const spotifyPlaylistsPageSchema = z
  .object({
    items: z.array(spotifyPlaylistSchema),
    next: z.string().nullable(),
  })
  .loose();

export interface PlaylistImage {
  url: string;
  width?: number;
  height?: number;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  ownerDisplayName?: string;
  trackCount: number;
  snapshotId: string;
  isCollaborative: boolean;
  isPublic?: boolean;
  images: PlaylistImage[];
}

export interface FetchUserPlaylistsResult {
  items: Playlist[];
  total: number;
}

// One error class per failure mode the route handler maps to a specific
// HTTP status + machine-readable code. Keeps the route handler's catch
// branches readable and the error vocabulary explicit.
export class SpotifyUnauthorizedError extends Error {
  constructor() {
    super("Spotify returned 401");
    this.name = "SpotifyUnauthorizedError";
  }
}

export class SpotifyRateLimitError extends Error {
  constructor() {
    super("Spotify returned 429");
    this.name = "SpotifyRateLimitError";
  }
}

export class SpotifyUnavailableError extends Error {
  public readonly status: number;
  constructor(status: number) {
    super(`Spotify returned ${String(status)}`);
    this.name = "SpotifyUnavailableError";
    this.status = status;
  }
}

export class SpotifyResponseShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpotifyResponseShapeError";
  }
}

export class SpotifyUnexpectedStatusError extends Error {
  public readonly status: number;
  constructor(status: number) {
    super(`Spotify returned unexpected status ${String(status)}`);
    this.name = "SpotifyUnexpectedStatusError";
    this.status = status;
  }
}

// Raised when fetch itself fails — network error, DNS, TLS, or the
// AbortSignal.timeout below firing. Mapped to upstream_unavailable.
export class SpotifyNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpotifyNetworkError";
  }
}

function projectImage(raw: z.infer<typeof spotifyImageSchema>): PlaylistImage {
  const image: PlaylistImage = { url: raw.url };
  if (raw.width !== null && raw.width !== undefined) {
    image.width = raw.width;
  }
  if (raw.height !== null && raw.height !== undefined) {
    image.height = raw.height;
  }
  return image;
}

function projectPlaylist(raw: z.infer<typeof spotifyPlaylistSchema>): Playlist {
  // Refine on the schema guarantees at least one is defined; prefer `items`.
  const trackPagination = raw.items ?? raw.tracks;
  const playlist: Playlist = {
    id: raw.id,
    name: raw.name,
    ownerId: raw.owner.id,
    trackCount: trackPagination?.total ?? 0,
    snapshotId: raw.snapshot_id,
    isCollaborative: raw.collaborative,
    images: (raw.images ?? []).map(projectImage),
  };
  if (raw.description !== null && raw.description !== undefined && raw.description !== "") {
    playlist.description = raw.description;
  }
  if (raw.owner.display_name !== null && raw.owner.display_name !== undefined) {
    playlist.ownerDisplayName = raw.owner.display_name;
  }
  if (raw.public !== null && raw.public !== undefined) {
    playlist.isPublic = raw.public;
  }
  return playlist;
}

async function fetchPage(
  accessToken: string,
  url: string,
): Promise<z.infer<typeof spotifyPlaylistsPageSchema>> {
  // Defense: refuse to follow any pagination URL whose origin isn't Spotify's
  // API host. The first URL is hard-coded; subsequent URLs come from Spotify's
  // own response.next field. If that ever pointed elsewhere we'd refuse rather
  // than blindly issue a Bearer-token request to an arbitrary host.
  const parsedUrl = new URL(url);
  if (parsedUrl.origin !== SPOTIFY_API_ORIGIN) {
    throw new SpotifyResponseShapeError(
      `Refusing to fetch non-Spotify URL: ${parsedUrl.origin}`,
    );
  }

  // Bound wall time per page. Node's fetch has no default timeout; without
  // this a hung Spotify connection would hold the handler open until the
  // platform's request timeout fires, which on self-hosted Node is effectively
  // never.
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (fetchError) {
    throw new SpotifyNetworkError(
      fetchError instanceof Error ? fetchError.message : String(fetchError),
    );
  }

  if (response.status === 401) {
    throw new SpotifyUnauthorizedError();
  }
  if (response.status === 429) {
    throw new SpotifyRateLimitError();
  }
  if (response.status >= 500 && response.status <= 599) {
    throw new SpotifyUnavailableError(response.status);
  }
  if (!response.ok) {
    throw new SpotifyUnexpectedStatusError(response.status);
  }

  const json: unknown = await response.json();
  const parsed = spotifyPlaylistsPageSchema.safeParse(json);
  if (!parsed.success) {
    throw new SpotifyResponseShapeError(parsed.error.message);
  }
  return parsed.data;
}

export async function fetchUserPlaylists(
  accessToken: string,
): Promise<FetchUserPlaylistsResult> {
  const items: Playlist[] = [];
  let nextUrl: string | null = `${SPOTIFY_PLAYLISTS_URL}?limit=${String(PAGE_LIMIT)}`;
  let pageCount = 0;

  while (nextUrl !== null && pageCount < MAX_PAGES) {
    const page = await fetchPage(accessToken, nextUrl);
    for (const raw of page.items) {
      items.push(projectPlaylist(raw));
    }
    nextUrl = page.next;
    pageCount += 1;
  }

  return { items, total: items.length };
}
