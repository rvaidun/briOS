"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Image from "next/image";
import { useCallback, useEffect, useRef } from "react";

import type { Photo } from "@/lib/google-photos/types";

interface LightboxProps {
  photos: Photo[];
  index: number | null;
  onClose: () => void;
  onIndexChange: (next: number) => void;
}

const SWIPE_THRESHOLD = 50;

function formatPhotoDate(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function Lightbox({ photos, index, onClose, onIndexChange }: LightboxProps) {
  const open = index !== null;
  const photo = open ? photos[index!] : null;
  const prevPhoto = open && index! > 0 ? photos[index! - 1] : null;
  const nextPhoto = open && index! < photos.length - 1 ? photos[index! + 1] : null;
  const touchStartX = useRef<number | null>(null);

  const next = useCallback(() => {
    if (index === null) return;
    if (index < photos.length - 1) onIndexChange(index + 1);
  }, [index, photos.length, onIndexChange]);

  const prev = useCallback(() => {
    if (index === null) return;
    if (index > 0) onIndexChange(index - 1);
  }, [index, onIndexChange]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, prev]);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/95" />
        <Dialog.Content
          className="fixed inset-0 z-50 flex items-center justify-center focus:outline-none"
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            const start = touchStartX.current;
            touchStartX.current = null;
            if (start === null) return;
            const dx = e.changedTouches[0].clientX - start;
            if (dx > SWIPE_THRESHOLD) prev();
            else if (dx < -SWIPE_THRESHOLD) next();
          }}
        >
          <Dialog.Title className="sr-only">Photo viewer</Dialog.Title>
          {photo && (
            <div className="relative flex h-full w-full items-center justify-center p-4 sm:p-8">
              <Image
                key={photo.id}
                src={photo.baseUrl}
                width={photo.width}
                height={photo.height}
                sizes="100vw"
                alt={photo.description ?? ""}
                priority
                className="max-h-full max-w-full object-contain"
              />
              {/* Preload neighbors so arrow nav feels instant */}
              <div aria-hidden className="pointer-events-none invisible absolute h-0 w-0">
                {prevPhoto && (
                  <Image
                    key={`pre-${prevPhoto.id}`}
                    src={prevPhoto.baseUrl}
                    width={prevPhoto.width}
                    height={prevPhoto.height}
                    sizes="100vw"
                    alt=""
                    priority
                  />
                )}
                {nextPhoto && (
                  <Image
                    key={`pre-${nextPhoto.id}`}
                    src={nextPhoto.baseUrl}
                    width={nextPhoto.width}
                    height={nextPhoto.height}
                    sizes="100vw"
                    alt=""
                    priority
                  />
                )}
              </div>
            </div>
          )}
          {photo && (
            <div className="pointer-events-none absolute right-0 bottom-0 left-0 flex items-end justify-between gap-4 bg-gradient-to-t from-black/70 to-transparent p-4 pt-12 sm:p-6 sm:pt-16">
              <div className="min-w-0 text-white">
                <div className="text-xs tracking-[0.18em] text-white/60 uppercase">
                  {formatPhotoDate(photo.creationTime)}
                </div>
                {photo.description && (
                  <div className="mt-1 truncate text-sm text-white/85">{photo.description}</div>
                )}
              </div>
              <div className="shrink-0 font-mono text-xs text-white/60 tabular-nums">
                {index! + 1} / {photos.length}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 6L18 18M6 18L18 6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
          {index !== null && index > 0 && (
            <button
              type="button"
              onClick={prev}
              aria-label="Previous photo"
              className="absolute top-1/2 left-4 hidden -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 sm:block"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M15 6L9 12L15 18"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
          {index !== null && index < photos.length - 1 && (
            <button
              type="button"
              onClick={next}
              aria-label="Next photo"
              className="absolute top-1/2 right-4 hidden -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 sm:block"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M9 6L15 12L9 18"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
