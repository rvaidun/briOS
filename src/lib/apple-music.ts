import jwt from "jsonwebtoken";

const APPLE_MUSIC_RECENT_URL = "https://api.music.apple.com/v1/me/recent/played/tracks";

// Apple caps developer token lifetime at 6 months (15,777,000 seconds).
const DEV_TOKEN_TTL_SEC = 60 * 60 * 12;

export type AppleMusicRecentlyPlayed = {
  trackId: string;
  name: string;
  artist: string;
  album: string;
  url: string | undefined;
  image: string | undefined;
  durationMs: number | undefined;
  isrc: string | undefined;
};

function getPrivateKey(): string {
  const b64 = process.env.APPLE_MUSICKIT_PRIVATE_KEY_B64;
  if (b64) return Buffer.from(b64, "base64").toString("utf8");
  const raw = process.env.APPLE_MUSICKIT_PRIVATE_KEY;
  if (raw) return raw.replace(/\\n/g, "\n");
  throw new Error("APPLE_MUSICKIT_PRIVATE_KEY_B64 (or APPLE_MUSICKIT_PRIVATE_KEY) must be set");
}

export function mintAppleDeveloperToken(): string {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_MUSICKIT_KEY_ID;
  if (!teamId || !keyId) {
    throw new Error("APPLE_TEAM_ID and APPLE_MUSICKIT_KEY_ID must be set");
  }
  const privateKey = getPrivateKey();
  return jwt.sign({}, privateKey, {
    algorithm: "ES256",
    issuer: teamId,
    expiresIn: DEV_TOKEN_TTL_SEC,
    header: { alg: "ES256", kid: keyId },
  });
}

function appleArtworkUrl(art: { url?: string } | undefined, size = 300): string | undefined {
  if (!art?.url) return undefined;
  // Apple returns a templated URL like ".../{w}x{h}bb.jpg". Render at a fixed
  // size so the image is renderable without further substitution.
  return art.url.replace("{w}", String(size)).replace("{h}", String(size));
}

type AppleRecentResponse = {
  data: {
    id: string;
    type: string;
    attributes?: {
      name: string;
      artistName: string;
      albumName?: string;
      isrc?: string;
      durationInMillis?: number;
      url?: string;
      artwork?: { url?: string };
    };
  }[];
};

export async function fetchAppleMusicRecentlyPlayed(
  limit = 30,
  offset = 0,
): Promise<AppleMusicRecentlyPlayed[]> {
  const userToken = process.env.APPLE_MUSIC_USER_TOKEN;
  if (!userToken) {
    throw new Error("APPLE_MUSIC_USER_TOKEN must be set");
  }
  const devToken = mintAppleDeveloperToken();
  const url = `${APPLE_MUSIC_RECENT_URL}?limit=${Math.min(limit, 30)}&offset=${offset}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${devToken}`,
      "Music-User-Token": userToken,
    },
  });
  if (!resp.ok) {
    throw new Error(
      `Apple Music recently-played fetch failed: ${resp.status} ${await resp.text()}`,
    );
  }
  const data = (await resp.json()) as AppleRecentResponse;
  return data.data
    .filter((d) => d.type === "songs" && d.attributes)
    .map((d) => {
      const a = d.attributes!;
      return {
        trackId: d.id,
        name: a.name,
        artist: a.artistName,
        album: a.albumName ?? "",
        url: a.url,
        image: appleArtworkUrl(a.artwork),
        durationMs: a.durationInMillis,
        isrc: a.isrc,
      };
    });
}
