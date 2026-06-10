import Image from "next/image";
import Link from "next/link";

import { ChevronLeft } from "@/components/icons/ChevronLeft";

import { SourceLinks } from "./SourceLinks";

type Props = {
  name: string;
  artist: string;
  album: string | null;
  imageUrl: string | null;
  spotifyUrl: string | null;
};

export function TrackHeader({ name, artist, album, imageUrl, spotifyUrl }: Props) {
  return (
    <div className="border-secondary rounded-md border bg-white p-4 dark:bg-white/5">
      <Link
        href="/listening"
        className="text-tertiary hover:text-primary mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ChevronLeft size={14} />
        Listening
      </Link>
      <div className="flex items-start gap-4">
        {imageUrl ? (
          <Image
            src={imageUrl}
            width={96}
            height={96}
            alt=""
            className="size-20 flex-none rounded-md object-cover ring-[0.5px] ring-black/10 md:size-24 dark:ring-white/10"
          />
        ) : (
          <div className="bg-tertiary size-20 flex-none rounded-md md:size-24" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-primary truncate text-xl font-semibold md:text-2xl">{name}</h1>
          <div className="text-secondary mt-0.5 truncate text-sm">{artist}</div>
          {album && <div className="text-tertiary mt-0.5 truncate text-xs">{album}</div>}
          <div className="mt-2">
            <SourceLinks spotifyUrl={spotifyUrl} size={16} />
          </div>
        </div>
      </div>
    </div>
  );
}
