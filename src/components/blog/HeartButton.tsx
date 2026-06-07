"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useHearts } from "@/hooks/useHearts";
import { getLocalHeartCount, incrementLocalHeartCount } from "@/lib/localHearts";
import { cn } from "@/lib/utils";

type Size = "sm" | "lg";

interface HeartButtonProps {
  slug: string;
  size?: Size;
}

// Inline heart SVG so we control `fill` (the shared Heart icon hardcodes fill="none").
function HeartShape({ size, filled }: { size: number; filled: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      aria-hidden
    >
      <path
        fillRule="evenodd"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M11.995 7.23319C10.5455 5.60999 8.12832 5.17335 6.31215 6.65972C4.49599 8.14609 4.2403 10.6312 5.66654 12.3892L11.995 18.25L18.3235 12.3892C19.7498 10.6312 19.5253 8.13046 17.6779 6.65972C15.8305 5.18899 13.4446 5.60999 11.995 7.23319Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

const POP_KEYFRAMES = [1, 1.7, 0.85, 1.18, 1];
const POP_TIMES = [0, 0.25, 0.55, 0.78, 1];
const POP_DURATION = 0.5;

export function HeartButton({ slug, size = "lg" }: HeartButtonProps) {
  const { count, addHeart } = useHearts(slug);
  const [localCount, setLocalCount] = useState(0);
  const [pop, setPop] = useState(0);
  const [busy, setBusy] = useState(false);
  const reduceMotion = useReducedMotion();

  // Hydrate filled state from localStorage after mount.
  useEffect(() => {
    setLocalCount(getLocalHeartCount(slug));
  }, [slug]);

  const filled = localCount > 0;

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    setLocalCount(incrementLocalHeartCount(slug));
    setPop((n) => n + 1);
    try {
      await addHeart();
    } catch {
      toast.error("Couldn't save your heart. Try again?");
    } finally {
      setTimeout(() => setBusy(false), 150);
    }
  }

  if (size === "sm") {
    return (
      <button
        type="button"
        aria-label="Heart this post"
        onClick={handleClick}
        className={cn(
          "group/heart inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm transition-colors",
          "hover:bg-black/[0.06] dark:hover:bg-white/[0.08]",
          filled ? "text-red-500" : "text-secondary hover:text-primary",
        )}
      >
        <motion.span
          key={pop}
          initial={reduceMotion ? false : { scale: 1 }}
          animate={reduceMotion ? undefined : { scale: POP_KEYFRAMES }}
          transition={{ duration: POP_DURATION, times: POP_TIMES, ease: "easeOut" }}
          className="inline-flex"
        >
          <HeartShape size={16} filled={filled} />
        </motion.span>
        <span className="tabular-nums">{count}</span>
      </button>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        aria-label="Heart this post"
        onClick={handleClick}
        className={cn(
          "group/heart relative inline-flex h-14 w-14 items-center justify-center rounded-full transition-colors",
          "border border-neutral-200 bg-white hover:bg-neutral-50",
          "dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-900",
          filled ? "text-red-500" : "text-secondary hover:text-primary",
        )}
      >
        <motion.span
          key={pop}
          initial={reduceMotion ? false : { scale: 1 }}
          animate={reduceMotion ? undefined : { scale: POP_KEYFRAMES }}
          transition={{ duration: POP_DURATION, times: POP_TIMES, ease: "easeOut" }}
          className="inline-flex"
        >
          <HeartShape size={26} filled={filled} />
        </motion.span>
        {!reduceMotion && (
          <AnimatePresence>
            <motion.span
              key={`ring-${pop}`}
              initial={{ scale: 0.6, opacity: 0.6 }}
              animate={{ scale: 2.1, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
              className="pointer-events-none absolute inset-0 rounded-full border-2 border-red-400/70"
            />
          </AnimatePresence>
        )}
      </button>
      <div className="text-tertiary text-sm tabular-nums">
        {count.toLocaleString()} {count === 1 ? "heart" : "hearts"}
      </div>
    </div>
  );
}
