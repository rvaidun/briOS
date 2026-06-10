import Link from "next/link";

function ArrowUpRight({ size = 14 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 17L17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}

export function SourceLinks({
  spotifyUrl,
  size = 14,
}: {
  spotifyUrl?: string | null;
  size?: number;
}) {
  if (!spotifyUrl) return null;
  return (
    <span className="flex flex-none items-center gap-1.5">
      <Link
        href={spotifyUrl}
        target="_blank"
        rel="noreferrer"
        aria-label="Open in Spotify"
        title="Open in Spotify"
        className="text-tertiary hover:text-primary transition-colors"
      >
        <ArrowUpRight size={size} />
      </Link>
    </span>
  );
}
