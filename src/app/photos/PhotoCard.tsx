"use client";

import Image from "next/image";
import { useState } from "react";

import type { Photo } from "@/lib/google-photos/types";
import { cn } from "@/lib/utils";

interface PhotoCardProps {
  photo: Photo;
  width: number;
  height: number;
  onOpen: () => void;
}

export function PhotoCard({ photo, width, height, onOpen }: PhotoCardProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={photo.description ? `Open photo: ${photo.description}` : "Open photo"}
      className={cn(
        "group relative block cursor-zoom-in overflow-hidden rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        !loaded && "bg-tertiary animate-pulse",
      )}
      style={{ width, height, flex: `0 0 ${width}px` }}
    >
      <Image
        src={photo.baseUrl}
        width={photo.width}
        height={photo.height}
        sizes={`${Math.ceil(width)}px`}
        alt={photo.description ?? ""}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={cn(
          "h-full w-full object-cover transition-opacity duration-300 group-hover:opacity-95",
          loaded ? "opacity-100" : "opacity-0",
        )}
      />
    </button>
  );
}
