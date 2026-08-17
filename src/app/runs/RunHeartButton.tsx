"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useRunHeart } from "@/hooks/useRunHeart";
import { cn } from "@/lib/utils";

// Per-visitor once-hearted state lives client-side under a run-specific key so
// it can't collide with the blog or guestbook local hearts.
const LOCAL_KEY = "briOS:runHearts";

function readMap(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function bumpLocal(id: string): number {
  const map = readMap();
  const next = (map[id] ?? 0) + 1;
  map[id] = next;
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
  return next;
}

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
        strokeWidth="1.6"
        d="M11.995 7.23319C10.5455 5.60999 8.12832 5.17335 6.31215 6.65972C4.49599 8.14609 4.2403 10.6312 5.66654 12.3892L11.995 18.25L18.3235 12.3892C19.7498 10.6312 19.5253 8.13046 17.6779 6.65972C15.8305 5.18899 13.4446 5.60999 11.995 7.23319Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

const POP = [1, 1.5, 0.9, 1.15, 1];

type Size = "sm" | "md";

export function RunHeartButton({
  id,
  initialCount = 0,
  size = "sm",
}: {
  id: string;
  initialCount?: number;
  size?: Size;
}) {
  const { count, addHeart } = useRunHeart(id, initialCount);
  const [locallyHearted, setLocallyHearted] = useState(false);
  const [pop, setPop] = useState(0);
  const [busy, setBusy] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    setLocallyHearted((readMap()[id] ?? 0) > 0);
  }, [id]);

  const iconSize = size === "md" ? 16 : 12;
  const padding = size === "md" ? "px-2.5 py-1" : "px-1.5 py-0.5";
  const textSize = size === "md" ? "text-xs" : "text-[11px]";

  async function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    // Don't navigate the RunCard link when the heart is tapped.
    e.preventDefault();
    e.stopPropagation();
    if (busy || locallyHearted) return;
    setBusy(true);
    bumpLocal(id);
    setLocallyHearted(true);
    setPop((n) => n + 1);
    try {
      await addHeart();
    } catch {
      toast.error("Couldn't save your heart. Try again?");
    } finally {
      setTimeout(() => setBusy(false), 150);
    }
  }

  return (
    <button
      type="button"
      aria-label={locallyHearted ? "Hearted" : "Heart this run"}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border leading-none tabular-nums transition-colors",
        padding,
        textSize,
        locallyHearted
          ? "cursor-default border-red-200 bg-red-50 text-red-500 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-400"
          : "text-secondary hover:text-primary border-neutral-200 bg-white/80 hover:border-neutral-300 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20",
      )}
    >
      <motion.span
        key={pop}
        initial={reduceMotion ? false : { scale: 1 }}
        animate={reduceMotion ? undefined : { scale: POP }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="inline-flex"
      >
        <HeartShape size={iconSize} filled={locallyHearted} />
      </motion.span>
      <span>{count}</span>
    </button>
  );
}
