import type { Metadata } from "next";

import { Heatmap } from "@/components/listening/Heatmap";
import { PeriodToggle } from "@/components/listening/PeriodToggle";
import { SourceSplit } from "@/components/listening/SourceSplit";
import { StatsSummary } from "@/components/listening/StatsSummary";
import { TopArtistsList } from "@/components/listening/TopArtistsList";
import { TopList } from "@/components/listening/TopList";
import { ListeningHistory } from "@/components/ListeningHistory";
import { TopBar } from "@/components/TopBar";
import { getListens } from "@/lib/db/listens";
import { getListeningStats, isPeriod, type Period } from "@/lib/db/stats";
import { createMetadata } from "@/lib/metadata";

export const metadata: Metadata = createMetadata({
  title: "Listening",
  description: "My listening history and stats",
  path: "/listening",
});

// Revalidate hourly — matches the sync cron.
export const revalidate = 3600;

export default async function ListeningPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const sp = await searchParams;
  const period: Period = isPeriod(sp.period) ? sp.period : "30d";

  const [stats, initialPage] = await Promise.all([
    getListeningStats(period),
    getListens({ limit: 20 }),
  ]);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <TopBar>
        <div className="flex-1 text-sm font-semibold">Listening</div>
        <div className="text-quaternary hidden pr-1.5 text-sm sm:visible">Synced hourly</div>
      </TopBar>

      {/*
        Desktop: single page scroll. Top section is a 60/40 two-column split
        (left: stats/source/recently-played; right: KPIs/heatmap). Below it,
        top artists/tracks go full-page-width 50/50, then top albums full
        width. Mobile: same content, single-column stack.
      */}
      <div
        data-scrollable
        className="flex flex-1 flex-col gap-4 overflow-x-hidden px-4 pt-14 pb-[calc(env(safe-area-inset-bottom)+6rem)] md:gap-6 md:overflow-x-visible md:overflow-y-auto md:px-6 md:pt-6 md:pb-6"
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
          <div className="flex flex-col gap-2 md:w-[60%] md:flex-1">
            <h2 className="text-primary text-sm font-semibold">Recently played</h2>
            <div
              data-scrollable
              className="border-secondary max-h-[320px] overflow-y-auto rounded-md border bg-white [mask-image:linear-gradient(to_bottom,black_calc(100%-2rem),transparent)] md:max-h-[520px] md:[mask-image:none] dark:bg-white/5"
            >
              <ListeningHistory initialData={[initialPage]} />
            </div>
          </div>

          <div className="flex flex-col gap-3 md:w-[40%] md:flex-1">
            <div className="flex items-center justify-between">
              <h2 className="text-primary text-sm font-semibold">Stats</h2>
              <PeriodToggle current={period} />
            </div>
            <StatsSummary summary={stats.summary} />
            <SourceSplit breakdown={stats.sourceBreakdown} />
            <Heatmap cells={stats.heatmap} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          <TopArtistsList artists={stats.topArtists} period={period} />
          <TopList
            title="Top tracks"
            showImage
            items={stats.topTracks.map((t) => ({
              primary: t.name,
              secondary: t.artist,
              imageUrl: t.imageUrl,
              href: t.url,
              plays: t.plays,
            }))}
          />
        </div>

        <TopList
          title="Top albums"
          showImage
          items={stats.topAlbums.map((a) => ({
            primary: a.album,
            secondary: a.artist,
            imageUrl: a.imageUrl,
            plays: a.plays,
          }))}
        />
      </div>
    </div>
  );
}
