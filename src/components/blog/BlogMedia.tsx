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

type LightboxState = {
  photos: LightboxPhoto[];
  activeId: string;
};

export function BlogMediaProvider({ children }: { children: React.ReactNode }) {
  // Photo registry lives in a ref so 50 BlogImage children mounting and
  // calling register() doesn't cascade into 50 provider re-renders. We
  // snapshot it into state at lightbox open time so render uses a
  // stable list.
  const photoMapRef = React.useRef<Map<string, LightboxPhoto>>(new Map());
  const [lightbox, setLightbox] = React.useState<LightboxState | null>(null);

  const register = React.useCallback((photo: LightboxPhoto) => {
    const map = photoMapRef.current;
    const existing = map.get(photo.id);
    if (existing && existing.src === photo.src) return;
    map.set(photo.id, photo);
  }, []);

  const unregister = React.useCallback((id: string) => {
    photoMapRef.current.delete(id);
  }, []);

  const open = React.useCallback((id: string) => {
    // Map preserves insertion order, so this matches DOM order.
    const photos = Array.from(photoMapRef.current.values());
    if (photos.length === 0) return;
    setLightbox({ photos, activeId: id });
  }, []);

  const close = React.useCallback(() => setLightbox(null), []);

  const goPrev = React.useCallback(() => {
    setLightbox((prev) => {
      if (!prev) return prev;
      const idx = prev.photos.findIndex((p) => p.id === prev.activeId);
      if (idx < 0) return prev;
      const next = prev.photos[(idx - 1 + prev.photos.length) % prev.photos.length];
      return { ...prev, activeId: next.id };
    });
  }, []);

  const goNext = React.useCallback(() => {
    setLightbox((prev) => {
      if (!prev) return prev;
      const idx = prev.photos.findIndex((p) => p.id === prev.activeId);
      if (idx < 0) return prev;
      const next = prev.photos[(idx + 1) % prev.photos.length];
      return { ...prev, activeId: next.id };
    });
  }, []);

  React.useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, goPrev, goNext]);

  const value = React.useMemo(() => ({ register, unregister, open }), [register, unregister, open]);

  const photos = lightbox?.photos ?? [];
  const activeIndex = lightbox ? photos.findIndex((p) => p.id === lightbox.activeId) : -1;
  const activePhoto = activeIndex >= 0 ? photos[activeIndex] : null;

  return (
    <BlogMediaContext.Provider value={value}>
      {children}
      <DialogPrimitive.Root
        open={lightbox !== null}
        onOpenChange={(next) => {
          if (!next) close();
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

                <div className="absolute inset-0" onClick={close} aria-hidden />

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
  /**
   * If true, eager-load and prioritize. Use for above-the-fold tiles so the
   * first paint isn't blank.
   */
  priority?: boolean;
};

const DEFAULT_SIZES = "(min-width: 1024px) 56rem, 100vw";
const GALLERY_SIZES = "(min-width: 1024px) 28rem, 50vw";
// Masonry tiles render small enough that q=55 is visually indistinguishable
// from q=75 but cuts payload roughly in half. Lightbox uses defaults.
const GALLERY_QUALITY = 55;

export function BlogImage({
  id,
  src,
  width,
  height,
  caption,
  inGallery,
  sizes,
  priority,
}: BlogImageProps) {
  const ctx = useBlogMedia();
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    if (!ctx) return;
    ctx.register({ id, src, width, height, caption });
    return () => ctx.unregister(id);
  }, [ctx, id, src, width, height, caption]);

  const aspect = width && height ? width / height : null;
  const isPortrait = aspect !== null && aspect < 1;
  const hasDims = Boolean(width && height);

  // Layout policy:
  // - Gallery items: natural aspect ratio, laid out in a CSS-columns masonry
  //   so photos aren't crop-mangled.
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

  // Skeleton background while gallery tiles decode — without it the page
  // looks blank for hundreds of ms after the HTML lands. Mirrors PhotoCard.
  const skeletonClass = inGallery && hasDims && !loaded ? "bg-tertiary animate-pulse" : "";

  const buttonClass = inGallery
    ? cn(buttonBaseClass, skeletonClass)
    : isPortrait
      ? cn(buttonBaseClass, "max-h-[80vh] w-auto")
      : buttonBaseClass;

  const handleOpen = () => ctx?.open(id);

  const resolvedSizes = sizes ?? (inGallery ? GALLERY_SIZES : DEFAULT_SIZES);
  const handleLoad = () => setLoaded(true);

  return (
    <figure className={figureClass}>
      <button type="button" onClick={handleOpen} className={buttonClass} aria-label="Open photo">
        {hasDims ? (
          inGallery ? (
            <Image
              src={src}
              alt=""
              width={width!}
              height={height!}
              sizes={resolvedSizes}
              quality={GALLERY_QUALITY}
              priority={priority}
              loading={priority ? "eager" : "lazy"}
              onLoad={handleLoad}
              className={cn(
                "h-auto w-full transition duration-300 group-hover:scale-[1.02]",
                loaded ? "opacity-100" : "opacity-0",
              )}
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
  /**
   * If true, eager-load the first row of tiles. Set only for the first gallery
   * on the page; otherwise tiles below the fold needlessly compete for
   * bandwidth with the actual above-the-fold content.
   */
  eager?: boolean;
};

export function BlogGallery({ blocks, eager }: BlogGalleryProps) {
  const count = blocks.length;
  // Masonry: 2 cols on small, up to 3 on lg when there are 3+ photos.
  // `gap-x` controls column gutters; vertical spacing is per-item `mb-3`
  // since CSS columns ignores vertical gap.
  const columnsClass = count === 2 ? "columns-2 gap-x-3" : "columns-2 gap-x-3 lg:columns-3";

  // Eager-load enough tiles to cover the first visible row(s) so above-the-fold
  // content doesn't wait on lazy-load to start decoding. Three cols at lg →
  // 3 covers one row, 6 covers two. Only applied when `eager` is set.
  const PRIORITY_COUNT = eager ? 6 : 0;

  return (
    <div className="lg:-mx-12 xl:-mx-20">
      <div className={columnsClass}>
        {blocks.map((block, index) => (
          <div key={block.id} className="mb-3 break-inside-avoid">
            <BlogImage
              id={block.id}
              src={block.content[0]?.text.content ?? ""}
              width={block.width}
              height={block.height}
              caption={block.caption}
              inGallery
              priority={index < PRIORITY_COUNT}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
