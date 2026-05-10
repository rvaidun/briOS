"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import * as React from "react";

import { ChevronLeft } from "@/components/icons/ChevronLeft";
import { ChevronRight } from "@/components/icons/ChevronRight";
import { Close as CloseIcon } from "@/components/icons/Close";
import type { ProcessedBlock, RichTextContent } from "@/lib/notion";
import { cn } from "@/lib/utils";

type LightboxPhoto = {
  id: string;
  src: string;
  width?: number;
  height?: number;
  caption?: RichTextContent[];
};

type BlogMediaContextValue = {
  register: (photo: LightboxPhoto) => void;
  unregister: (id: string) => void;
  open: (id: string) => void;
};

const BlogMediaContext = React.createContext<BlogMediaContextValue | null>(null);

export function BlogMediaProvider({ children }: { children: React.ReactNode }) {
  const [photoMap, setPhotoMap] = React.useState<Map<string, LightboxPhoto>>(() => new Map());
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const register = React.useCallback((photo: LightboxPhoto) => {
    setPhotoMap((prev) => {
      const existing = prev.get(photo.id);
      if (existing && existing.src === photo.src) return prev;
      const next = new Map(prev);
      next.set(photo.id, photo);
      return next;
    });
  }, []);

  const unregister = React.useCallback((id: string) => {
    setPhotoMap((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const open = React.useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const photos = React.useMemo(() => Array.from(photoMap.values()), [photoMap]);
  const activeIndex = activeId ? photos.findIndex((p) => p.id === activeId) : -1;

  const goPrev = React.useCallback(() => {
    if (photos.length === 0 || activeIndex < 0) return;
    const next = photos[(activeIndex - 1 + photos.length) % photos.length];
    setActiveId(next.id);
  }, [photos, activeIndex]);

  const goNext = React.useCallback(() => {
    if (photos.length === 0 || activeIndex < 0) return;
    const next = photos[(activeIndex + 1) % photos.length];
    setActiveId(next.id);
  }, [photos, activeIndex]);

  React.useEffect(() => {
    if (!activeId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId, goPrev, goNext]);

  const value = React.useMemo(() => ({ register, unregister, open }), [register, unregister, open]);

  const activePhoto = activeIndex >= 0 ? photos[activeIndex] : null;

  return (
    <BlogMediaContext.Provider value={value}>
      {children}
      <DialogPrimitive.Root
        open={activeId !== null}
        onOpenChange={(next) => {
          if (!next) setActiveId(null);
        }}
      >
        <AnimatePresence>
          {activePhoto ? (
            <DialogPrimitive.Portal forceMount>
              <DialogPrimitive.Overlay asChild>
                <motion.div
                  className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                />
              </DialogPrimitive.Overlay>
              <DialogPrimitive.Content
                aria-describedby={undefined}
                onOpenAutoFocus={(e) => e.preventDefault()}
                className="fixed inset-0 z-50 flex flex-col focus:outline-none"
              >
                <DialogPrimitive.Title className="sr-only">
                  Photo {activeIndex + 1} of {photos.length}
                </DialogPrimitive.Title>

                <div className="absolute inset-0" onClick={() => setActiveId(null)} aria-hidden />

                <div className="pointer-events-none absolute top-0 right-0 left-0 z-10 flex items-center justify-between p-4 text-sm text-white/70">
                  <span className="pointer-events-auto select-none">
                    {photos.length > 1 ? `${activeIndex + 1} / ${photos.length}` : ""}
                  </span>
                  <DialogPrimitive.Close asChild>
                    <button
                      type="button"
                      aria-label="Close"
                      className="pointer-events-auto rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
                    >
                      <CloseIcon size={20} />
                    </button>
                  </DialogPrimitive.Close>
                </div>

                {photos.length > 1 ? (
                  <>
                    <button
                      type="button"
                      aria-label="Previous photo"
                      onClick={(e) => {
                        e.stopPropagation();
                        goPrev();
                      }}
                      className="absolute top-1/2 left-3 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20 sm:left-6"
                    >
                      <ChevronLeft size={28} />
                    </button>
                    <button
                      type="button"
                      aria-label="Next photo"
                      onClick={(e) => {
                        e.stopPropagation();
                        goNext();
                      }}
                      className="absolute top-1/2 right-3 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20 sm:right-6"
                    >
                      <ChevronRight size={28} />
                    </button>
                  </>
                ) : null}

                {/*
                  Caption space is reserved with explicit calc() rather than
                  relying on flex-1 + min-h-0, which can fail to constrain a
                  next/image element with explicit width/height because the
                  image's intrinsic size sometimes wins over max-h-full.
                */}
                <motion.div
                  key={activePhoto.id}
                  className="pointer-events-none relative z-0 flex flex-1 flex-col items-center justify-center gap-3 overflow-hidden px-4 pt-14 pb-6"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  {activePhoto.width && activePhoto.height ? (
                    <Image
                      src={activePhoto.src}
                      alt=""
                      width={activePhoto.width}
                      height={activePhoto.height}
                      sizes="100vw"
                      priority
                      className={cn(
                        "pointer-events-auto h-auto w-auto max-w-full rounded-md object-contain",
                        activePhoto.caption?.length
                          ? "max-h-[calc(100vh-9rem)]"
                          : "max-h-[calc(100vh-5rem)]",
                      )}
                    />
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={activePhoto.src}
                      alt=""
                      className={cn(
                        "pointer-events-auto h-auto w-auto max-w-full rounded-md object-contain",
                        activePhoto.caption?.length
                          ? "max-h-[calc(100vh-9rem)]"
                          : "max-h-[calc(100vh-5rem)]",
                      )}
                    />
                  )}
                  {activePhoto.caption?.length ? (
                    <figcaption className="text-tertiary pointer-events-auto mx-auto max-w-2xl shrink-0 text-center text-sm italic">
                      {renderPlainCaption(activePhoto.caption)}
                    </figcaption>
                  ) : null}
                </motion.div>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          ) : null}
        </AnimatePresence>
      </DialogPrimitive.Root>
    </BlogMediaContext.Provider>
  );
}

function renderPlainCaption(caption: RichTextContent[]) {
  return caption.map((rt, i) => <span key={i}>{rt.text.content}</span>);
}

function useBlogMedia() {
  return React.useContext(BlogMediaContext);
}

type BlogImageProps = {
  id: string;
  src: string;
  width?: number;
  height?: number;
  caption?: RichTextContent[];
  /** When true, layout chooses a tighter, square-ish tile suitable for galleries. */
  inGallery?: boolean;
  /**
   * Hint for next/image responsive sizing. Defaults to a sensible value for
   * single images breaking out of a max-w-3xl prose column.
   */
  sizes?: string;
};

const DEFAULT_SIZES = "(min-width: 1024px) 56rem, 100vw";
const GALLERY_SIZES = "(min-width: 1024px) 28rem, 50vw";

export function BlogImage({ id, src, width, height, caption, inGallery, sizes }: BlogImageProps) {
  const ctx = useBlogMedia();

  React.useEffect(() => {
    if (!ctx) return;
    ctx.register({ id, src, width, height, caption });
    return () => ctx.unregister(id);
  }, [ctx, id, src, width, height, caption]);

  const aspect = width && height ? width / height : null;
  const isPortrait = aspect !== null && aspect < 1;
  const hasDims = Boolean(width && height);

  // Layout policy:
  // - Gallery items: square-ish tiles, fixed aspect ratio so neighbours align.
  // - Portrait single: cap height, center, narrower than column.
  // - Landscape single (or unknown): break out wider than the prose column on
  //   large screens, full-width within container on small ones.
  const figureClass = inGallery
    ? "flex flex-col gap-2"
    : isPortrait
      ? "flex flex-col items-center gap-2"
      : "flex flex-col gap-2 lg:-mx-12 xl:-mx-20";

  const buttonBaseClass =
    "group relative block w-full overflow-hidden rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary";

  const buttonClass = inGallery
    ? cn(buttonBaseClass, "aspect-[4/3]")
    : isPortrait
      ? cn(buttonBaseClass, "max-h-[80vh] w-auto")
      : buttonBaseClass;

  const handleOpen = () => ctx?.open(id);

  const resolvedSizes = sizes ?? (inGallery ? GALLERY_SIZES : DEFAULT_SIZES);

  return (
    <figure className={figureClass}>
      <button type="button" onClick={handleOpen} className={buttonClass} aria-label="Open photo">
        {hasDims ? (
          inGallery ? (
            <Image
              src={src}
              alt=""
              fill
              sizes={resolvedSizes}
              className="object-cover transition duration-300 group-hover:scale-[1.02]"
            />
          ) : isPortrait ? (
            <Image
              src={src}
              alt=""
              width={width!}
              height={height!}
              sizes={resolvedSizes}
              className="h-auto max-h-[80vh] w-auto"
            />
          ) : (
            <Image
              src={src}
              alt=""
              width={width!}
              height={height!}
              sizes={resolvedSizes}
              className="h-auto w-full"
            />
          )
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={src} alt="" loading="lazy" className="h-auto w-full" />
        )}
      </button>
      {caption?.length ? (
        <figcaption className="text-tertiary text-center text-sm italic">
          {renderPlainCaption(caption)}
        </figcaption>
      ) : null}
    </figure>
  );
}

type BlogGalleryProps = {
  blocks: ProcessedBlock[];
};

export function BlogGallery({ blocks }: BlogGalleryProps) {
  const count = blocks.length;
  // 2 photos: 2 cols. 3+: up to 3 cols on lg; 2 cols on small.
  const gridClass =
    count === 2 ? "grid grid-cols-2 gap-3" : "grid grid-cols-2 gap-3 lg:grid-cols-3";

  return (
    <div className="lg:-mx-12 xl:-mx-20">
      <div className={gridClass}>
        {blocks.map((block) => (
          <BlogImage
            key={block.id}
            id={block.id}
            src={block.content[0]?.text.content ?? ""}
            width={block.width}
            height={block.height}
            caption={block.caption}
            inGallery
          />
        ))}
      </div>
    </div>
  );
}
