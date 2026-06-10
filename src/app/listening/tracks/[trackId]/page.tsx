import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Heatmap } from "@/components/listening/Heatmap";
import { SourceLinks } from "@/components/listening/SourceLinks";
import { TrackHeader } from "@/components/listening/TrackHeader";
import { TrackKpis } from "@/components/listening/TrackKpis";
import { TrackTimeline } from "@/components/listening/TrackTimeline";
import { TopBar } from "@/components/TopBar";
import {
  getMoreByArtist,
  getTrackHeatmap,
  getTrackOverview,
  getTrackTimeline,
} from "@/lib/db/track-stats";
import { createMetadata } from "@/lib/metadata";

export const revalidate = 3600;

// UUID regex — bail on malformed slugs before hitting the DB.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ trackId: string }>;
}): Promise<Metadata> {
  const { trackId } = await params;
  if (!UUID_RE.test(trackId)) return createMetadata({ title: "Track", path: "/listening" });
  const overview = await getTrackOverview(trackId);
  if (!overview) return createMetadata({ title: "Track", path: "/listening" });
  return createMetadata({
    title: `${overview.name} · ${overview.artist}`,
    description: `My listening history for ${overview.name} by ${overview.artist}`,
    path: `/listening/tracks/${trackId}`,
  });
}

export default async function TrackPage({ params }: { params: Promise<{ trackId: string }> }) {
  const { trackId } = await params;
  if (!UUID_RE.test(trackId)) notFound();

  const overview = await getTrackOverview(trackId);
  if (!overview) notFound();

  const [timeline, heatmap, moreByArtist] = await Promise.all([
    getTrackTimeline(trackId, "month"),
    getTrackHeatmap(trackId),
    getMoreByArtist(trackId, overview.artist, 5),
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
        <TrackHeader
          name={overview.name}
          artist={overview.artist}
          album={overview.album}
          imageUrl={overview.imageUrl}
          spotifyUrl={overview.spotifyUrl}
        />

        <TrackKpis overview={overview} />

        <TrackTimeline trackId={trackId} initialBuckets={timeline} initialGranularity="month" />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          <Heatmap cells={heatmap} />
          {moreByArtist.length > 0 && (
            <MoreByArtist artist={overview.artist} items={moreByArtist} />
          )}
        </div>
      </div>
    </div>
  );
}

function MoreByArtist({
  artist,
  items,
}: {
  artist: string;
  items: Awaited<ReturnType<typeof getMoreByArtist>>;
}) {
  return (
    <div className="border-secondary rounded-md border bg-white p-4 dark:bg-white/5">
      <h3 className="text-tertiary mb-3 text-xs font-medium tracking-wide uppercase">
        More by {artist}
      </h3>
      <ol className="space-y-1">
        {items.map((t, i) => (
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
    </div>
  );
}
