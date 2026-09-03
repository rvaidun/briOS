import Image from "next/image";
import Link from "next/link";

import type { PlaylistListItem } from "@/lib/db/playlists";

import { SourceLinks } from "../listening/SourceLinks";

export function PlaylistCard({ playlist }: { playlist: PlaylistListItem }) {
  return (
    <div className="border-secondary group hover:bg-secondary/40 relative flex flex-col overflow-hidden rounded-md border bg-white transition-colors dark:bg-white/5">
      <Link
        href={`/playlists/${playlist.id}`}
        aria-label={playlist.name}
        className="absolute inset-0 z-10"
      />
      <div className="bg-tertiary relative aspect-square w-full">
        {playlist.imageUrl ? (
          <Image
            src={playlist.imageUrl}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
            alt=""
            unoptimized
            className="object-cover"
          />
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="text-primary line-clamp-1 text-sm font-semibold" title={playlist.name}>
          {playlist.name}
        </div>
        {playlist.description ? (
          <div className="text-tertiary line-clamp-2 text-xs" title={playlist.description}>
            {playlist.description}
          </div>
        ) : null}
        <div className="text-tertiary mt-auto flex items-center justify-between pt-2 text-xs">
          <span className="tabular-nums">
            {playlist.trackCount != null
              ? `${playlist.trackCount} track${playlist.trackCount === 1 ? "" : "s"}`
              : ""}
          </span>
          {/* z-20 lifts the icon link above the card-wide overlay so the
              external link still routes to Spotify. */}
          <span className="relative z-20">
            <SourceLinks spotifyUrl={playlist.spotifyUrl} />
          </span>
        </div>
      </div>
    </div>
  );
}
