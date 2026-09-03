import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AlbumHeader } from "@/components/listening/AlbumHeader";
import { EntityKpis } from "@/components/listening/EntityKpis";
import { Heatmap } from "@/components/listening/Heatmap";
import { SourceLinks } from "@/components/listening/SourceLinks";
import { TrackTimeline } from "@/components/listening/TrackTimeline";
import { TopBar } from "@/components/TopBar";
import {
  type AlbumTrack,
  getAlbumHeatmap,
  getAlbumOverview,
  getAlbumTimeline,
  getAlbumTracks,
} from "@/lib/db/album-stats";
import { createMetadata } from "@/lib/metadata";

export const revalidate = 3600;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ albumId: string }>;
}): Promise<Metadata> {
  const { albumId } = await params;
  if (!UUID_RE.test(albumId)) return createMetadata({ title: "Album", path: "/listening" });
  const overview = await getAlbumOverview(albumId);
  if (!overview) return createMetadata({ title: "Album", path: "/listening" });
  const primary = overview.artists[0]?.name;
  return createMetadata({
    title: primary ? `${overview.name} · ${primary}` : overview.name,
    description: `My listening history for ${overview.name}`,
    path: `/listening/albums/${albumId}`,
  });
}

export default async function AlbumPage({ params }: { params: Promise<{ albumId: string }> }) {
  const { albumId } = await params;
  if (!UUID_RE.test(albumId)) notFound();

  const overview = await getAlbumOverview(albumId);
  if (!overview) notFound();

  const [timeline, heatmap, tracks] = await Promise.all([
    getAlbumTimeline(albumId, "month"),
    getAlbumHeatmap(albumId),
    getAlbumTracks(albumId),
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
        <AlbumHeader
          name={overview.name}
          imageUrl={overview.imageUrl}
          spotifyUrl={overview.spotifyUrl}
          releaseDate={overview.releaseDate}
          artists={overview.artists}
        />

        <EntityKpis
          totalPlays={overview.totalPlays}
          totalDurationMs={overview.totalDurationMs}
          firstPlayedAt={overview.firstPlayedAt}
          lastPlayedAt={overview.lastPlayedAt}
          distinctDays={overview.distinctDays}
          extras={[
            {
              label: "Tracks played",
              value: `${overview.distinctTracks} / ${overview.totalTracks}`,
            },
          ]}
        />

        <TrackTimeline
          endpoint={`/api/listening/albums/${albumId}/timeline`}
          initialBuckets={timeline}
          initialGranularity="month"
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          <Heatmap cells={heatmap} />
          <TrackList tracks={tracks} />
        </div>
      </div>
    </div>
  );
}

function TrackList({ tracks }: { tracks: AlbumTrack[] }) {
  return (
    <div className="border-secondary rounded-md border bg-white p-4 dark:bg-white/5">
      <h3 className="text-tertiary mb-3 text-xs font-medium tracking-wide uppercase">Tracks</h3>
      {tracks.length === 0 ? (
        <div className="text-quaternary py-2 text-sm">No tracks</div>
      ) : (
        <ol className="space-y-1">
          {tracks.map((t, i) => (
            <li key={t.id} className="group hover:bg-secondary/60 relative rounded">
              <Link
                href={`/listening/tracks/${t.id}`}
                aria-label={t.name}
                className="absolute inset-0 z-10 rounded"
              />
              <div className="relative flex items-center gap-3 rounded px-2 py-1.5">
                <span className="text-quaternary w-4 flex-none text-right text-xs tabular-nums">
                  {i + 1}
                </span>
                {t.imageUrl ? (
                  <Image
                    src={t.imageUrl}
                    width={24}
                    height={24}
                    alt=""
                    unoptimized
                    className="size-6 flex-none rounded object-cover ring-[0.5px] ring-black/10 dark:ring-white/10"
                  />
                ) : (
                  <div className="bg-tertiary size-6 flex-none rounded" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-primary truncate text-sm font-medium">{t.name}</div>
                </div>
                <span className="text-tertiary flex-none text-xs tabular-nums">
                  {t.plays.toLocaleString()}
                </span>
                <span className="relative z-20">
                  <SourceLinks spotifyUrl={t.spotifyUrl} size={12} />
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
