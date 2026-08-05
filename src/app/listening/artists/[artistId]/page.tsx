import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ArtistHeader } from "@/components/listening/ArtistHeader";
import { EntityKpis } from "@/components/listening/EntityKpis";
import { Heatmap } from "@/components/listening/Heatmap";
import { TopList } from "@/components/listening/TopList";
import { TrackTimeline } from "@/components/listening/TrackTimeline";
import { TopBar } from "@/components/TopBar";
import {
  getArtistHeatmap,
  getArtistOverview,
  getArtistTimeline,
  getTopAlbumsByArtist,
} from "@/lib/db/artist-stats";
import { getTopTracksByArtist, resolveRange } from "@/lib/db/stats";
import { createMetadata } from "@/lib/metadata";

export const revalidate = 3600;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ artistId: string }>;
}): Promise<Metadata> {
  const { artistId } = await params;
  if (!UUID_RE.test(artistId)) return createMetadata({ title: "Artist", path: "/listening" });
  const overview = await getArtistOverview(artistId);
  if (!overview) return createMetadata({ title: "Artist", path: "/listening" });
  return createMetadata({
    title: overview.name,
    description: `My listening history for ${overview.name}`,
    path: `/listening/artists/${artistId}`,
  });
}

export default async function ArtistPage({ params }: { params: Promise<{ artistId: string }> }) {
  const { artistId } = await params;
  if (!UUID_RE.test(artistId)) notFound();

  const overview = await getArtistOverview(artistId);
  if (!overview) notFound();

  const { range } = resolveRange({});

  const [timeline, heatmap, topTracks, topAlbums] = await Promise.all([
    getArtistTimeline(artistId, "month"),
    getArtistHeatmap(artistId),
    getTopTracksByArtist(artistId, range, 10),
    getTopAlbumsByArtist(artistId, 10),
  ]);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <TopBar>
        <div className="flex-1 truncate text-sm font-semibold">{overview.name}</div>
      </TopBar>

      <div
        data-scrollable
        className="flex flex-1 flex-col gap-4 overflow-x-hidden px-4 pt-14 pb-[calc(env(safe-area-inset-bottom)+6rem)] md:gap-6 md:overflow-x-visible md:overflow-y-auto md:px-6 md:pt-6 md:pb-6"
      >
        <ArtistHeader
          name={overview.name}
          imageUrl={overview.imageUrl}
          spotifyUrl={overview.spotifyUrl}
        />

        <EntityKpis
          totalPlays={overview.totalPlays}
          totalDurationMs={overview.totalDurationMs}
          firstPlayedAt={overview.firstPlayedAt}
          lastPlayedAt={overview.lastPlayedAt}
          distinctDays={overview.distinctDays}
          extras={[
            { label: "Distinct tracks", value: overview.distinctTracks.toLocaleString() },
            { label: "Distinct albums", value: overview.distinctAlbums.toLocaleString() },
          ]}
        />

        <TrackTimeline
          endpoint={`/api/listening/artists/${artistId}/timeline`}
          initialBuckets={timeline}
          initialGranularity="month"
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          <Heatmap cells={heatmap} />
          <TopList
            title="Top tracks"
            showImage
            items={topTracks.map((t) => ({
              primary: t.name,
              secondary: t.artist,
              imageUrl: t.imageUrl,
              spotifyUrl: t.spotifyUrl,
              href: `/listening/tracks/${t.id}`,
              plays: t.plays,
            }))}
          />
        </div>

        <TopList
          title="Top albums"
          showImage
          items={topAlbums.map((a) => ({
            primary: a.name,
            imageUrl: a.imageUrl,
            spotifyUrl: a.spotifyUrl,
            href: `/listening/albums/${a.id}`,
            plays: a.plays,
          }))}
        />
      </div>
    </div>
  );
}
