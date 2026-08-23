import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ChevronLeft } from "@/components/icons/ChevronLeft";
import { SourceLinks } from "@/components/listening/SourceLinks";
import { TopList } from "@/components/listening/TopList";
import { TopBar } from "@/components/TopBar";
import { getPlaylistDetail } from "@/lib/db/playlists";
import { createMetadata } from "@/lib/metadata";

export const revalidate = 3600;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return createMetadata({ title: "Playlist", path: "/playlists" });
  const detail = await getPlaylistDetail(id);
  if (!detail) return createMetadata({ title: "Playlist", path: "/playlists" });
  return createMetadata({
    title: detail.playlist.name,
    description: detail.playlist.description ?? `My Spotify playlist: ${detail.playlist.name}`,
    path: `/playlists/${id}`,
  });
}

export default async function PlaylistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const detail = await getPlaylistDetail(id);
  if (!detail) notFound();

  const { playlist, tracks } = detail;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <TopBar>
        <div className="flex-1 truncate text-sm font-semibold">{playlist.name}</div>
      </TopBar>
      <div
        data-scrollable
        className="flex flex-1 flex-col gap-4 overflow-x-hidden px-4 pt-14 pb-[calc(env(safe-area-inset-bottom)+6rem)] md:gap-6 md:overflow-x-visible md:overflow-y-auto md:px-6 md:pt-6 md:pb-6"
      >
        <div className="border-secondary rounded-md border bg-white p-4 dark:bg-white/5">
          <Link
            href="/playlists"
            className="text-tertiary hover:text-primary mb-3 inline-flex items-center gap-1 text-xs"
          >
            <ChevronLeft size={14} />
            Playlists
          </Link>
          <div className="flex items-start gap-4">
            {playlist.imageUrl ? (
              <Image
                src={playlist.imageUrl}
                width={128}
                height={128}
                alt=""
                className="size-24 flex-none rounded-md object-cover ring-[0.5px] ring-black/10 md:size-32 dark:ring-white/10"
              />
            ) : (
              <div className="bg-tertiary size-24 flex-none rounded-md md:size-32" />
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-primary truncate text-xl font-semibold md:text-2xl">
                {playlist.name}
              </h1>
              {playlist.description ? (
                <p className="text-secondary mt-1 text-sm">{playlist.description}</p>
              ) : null}
              <div className="text-tertiary mt-2 flex items-center gap-3 text-xs tabular-nums">
                <span>
                  {tracks.length} track{tracks.length === 1 ? "" : "s"}
                </span>
                {playlist.ownerName ? <span>· {playlist.ownerName}</span> : null}
                <SourceLinks spotifyUrl={playlist.spotifyUrl} size={16} />
              </div>
            </div>
          </div>
        </div>

        <TopList
          title="Tracks"
          showImage
          items={tracks.map((t) => ({
            primary: t.name,
            secondary: t.artist ?? undefined,
            imageUrl: t.imageUrl,
            spotifyUrl: t.spotifyUrl,
          }))}
        />
      </div>
    </div>
  );
}
