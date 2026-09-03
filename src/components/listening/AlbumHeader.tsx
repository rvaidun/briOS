import Image from "next/image";
import Link from "next/link";

import { ChevronLeft } from "@/components/icons/ChevronLeft";

import { SourceLinks } from "./SourceLinks";

type ArtistRef = { id: string; name: string };

type Props = {
  name: string;
  imageUrl: string | null;
  spotifyUrl: string | null;
  releaseDate: string | null;
  artists: ArtistRef[];
};

function formatReleaseDate(iso: string | null): string | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  // Fold placeholder days back into year-only / year-month display.
  if (mo === "01" && d === "01") return y!;
  if (d === "01") {
    const dt = new Date(`${iso}T00:00:00Z`);
    return dt.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  }
  const dt = new Date(`${iso}T00:00:00Z`);
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function AlbumHeader({ name, imageUrl, spotifyUrl, releaseDate, artists }: Props) {
  const release = formatReleaseDate(releaseDate);
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
            unoptimized
            className="size-20 flex-none rounded-md object-cover ring-[0.5px] ring-black/10 md:size-24 dark:ring-white/10"
          />
        ) : (
          <div className="bg-tertiary size-20 flex-none rounded-md md:size-24" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-primary truncate text-xl font-semibold md:text-2xl">{name}</h1>
          {artists.length > 0 && (
            <div className="text-secondary mt-0.5 truncate text-sm">
              {artists.map((a, i) => (
                <span key={a.id}>
                  {i > 0 && ", "}
                  <Link
                    href={`/listening/artists/${a.id}`}
                    className="hover:text-primary hover:underline"
                  >
                    {a.name}
                  </Link>
                </span>
              ))}
            </div>
          )}
          {release && <div className="text-tertiary mt-0.5 truncate text-xs">{release}</div>}
          <div className="mt-2">
            <SourceLinks spotifyUrl={spotifyUrl} size={16} />
          </div>
        </div>
      </div>
    </div>
  );
}
