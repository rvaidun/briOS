"use client";

import Image from "next/image";
import { useState } from "react";

import type { Photo } from "@/lib/google-photos/types";
import { cn } from "@/lib/utils";

interface PhotoCardProps {
  photo: Photo;
  colStart: number;
  colSpan: number;
  onOpen: () => void;
}

export function PhotoCard({ photo, colStart, colSpan, onOpen }: PhotoCardProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={photo.description ? `Open photo: ${photo.description}` : "Open photo"}
      className={cn(
        "group relative block cursor-zoom-in overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        !loaded && "bg-tertiary animate-pulse",
      )}
      style={{
        gridColumn: `${colStart} / span ${colSpan}`,
        aspectRatio: `${photo.width} / ${photo.height}`,
      }}
    >
      <Image
        src={photo.baseUrl}
        width={photo.width}
        height={photo.height}
        sizes="(max-width: 640px) 92vw, (max-width: 1024px) 60vw, 50vw"
        alt={photo.description ?? ""}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={cn(
          "h-full w-full object-cover transition-opacity duration-300 group-hover:opacity-90",
          loaded ? "opacity-100" : "opacity-0",
        )}
      />
    </button>
  );
}
