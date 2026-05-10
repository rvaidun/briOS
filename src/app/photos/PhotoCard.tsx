"use client";

import Image from "next/image";

import type { Photo } from "@/lib/google-photos/types";

interface PhotoCardProps {
  photo: Photo;
  colStart: number;
  colSpan: number;
  onOpen: () => void;
}

export function PhotoCard({ photo, colStart, colSpan, onOpen }: PhotoCardProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={photo.description ? `Open photo: ${photo.description}` : "Open photo"}
      className="group block cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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
        className="h-full w-full object-cover transition-opacity group-hover:opacity-90"
      />
    </button>
  );
}
