"use client";

import Image from "next/image";
import { useState } from "react";
import useSWR from "swr";

import { ChevronDown } from "@/components/icons/ChevronDown";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { TopArtist, TopTrack } from "@/lib/db/stats";
import { fetcher } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

import { SourceLinks } from "./SourceLinks";

type Props = {
  artists: TopArtist[];
  rangeQuery: string;
};

export function TopArtistsList({ artists, rangeQuery }: Props) {
  const [openArtist, setOpenArtist] = useState<string | null>(null);
  const max = artists[0]?.plays ?? 1;

  return (
    <div className="border-secondary rounded-md border bg-white p-4 dark:bg-white/5">
      <h3 className="text-tertiary mb-3 text-xs font-medium tracking-wide uppercase">
        Top artists
      </h3>
      {artists.length === 0 ? (
        <div className="text-quaternary py-2 text-sm">No data</div>
      ) : (
        <ol className="space-y-1">
          {artists.map((a, i) => {
            const pct = Math.max((a.plays / max) * 100, 4);
            const isOpen = openArtist === a.artist;
            return (
              <li key={`${i}-${a.artist}`}>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenArtist(isOpen ? null : a.artist)}
                    aria-expanded={isOpen}
                    className="hover:bg-secondary/60 relative flex w-full items-center gap-3 overflow-hidden rounded px-2 py-1.5 text-left"
                  >
                    <span className="text-quaternary w-4 flex-none text-right text-xs tabular-nums">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-primary truncate text-sm font-medium">{a.artist}</div>
                    </div>
                    <span className="text-tertiary flex-none text-xs tabular-nums">
                      {a.plays.toLocaleString()}
                    </span>
                    <ChevronDown
                      size={14}
                      className={cn(
                        "text-tertiary flex-none transition-transform duration-200",
                        isOpen && "rotate-180",
                      )}
                    />
                  </button>
                  <div
                    aria-hidden
                    className="bg-secondary/40 absolute inset-0 -z-10 rounded"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div
                  className={cn(
                    "grid transition-[grid-template-rows] duration-200 ease-out",
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                  )}
                >
                  <div className="min-h-0 overflow-hidden">
                    <ArtistTracks artist={a.artist} rangeQuery={rangeQuery} enabled={isOpen} />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function ArtistTracks({
  artist,
  rangeQuery,
  enabled,
}: {
  artist: string;
  rangeQuery: string;
  enabled: boolean;
}) {
  const { data, error, isLoading } = useSWR<{ tracks: TopTrack[] }>(
    enabled ? `/api/listening/top-tracks?artist=${encodeURIComponent(artist)}&${rangeQuery}` : null,
    fetcher,
    { revalidateIfStale: false, revalidateOnFocus: false, revalidateOnReconnect: false },
  );

  return (
    <div className="mt-1 ml-6 border-l border-dashed border-black/10 pl-3 dark:border-white/10">
      {isLoading && (
        <div className="flex items-center justify-center py-3">
          <LoadingSpinner />
        </div>
      )}

      {error && <div className="text-secondary py-2 text-xs">Failed to load tracks</div>}

      {data && data.tracks.length === 0 && (
        <div className="text-quaternary py-2 text-xs">No tracks</div>
      )}

      {data && data.tracks.length > 0 && (
        <ol className="space-y-0.5 py-1">
          {data.tracks.map((t, i) => (
            <li key={`${i}-${t.name}`}>
              <div className="flex w-full min-w-0 items-center gap-2 rounded px-2 py-1 text-xs">
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
                  <div className="text-primary truncate text-xs font-medium">{t.name}</div>
                </div>
                <span className="text-tertiary flex-none text-xs tabular-nums">
                  {t.plays.toLocaleString()}
                </span>
                <SourceLinks spotifyUrl={t.spotifyUrl} appleUrl={t.appleUrl} size={12} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
