"use client";

import { useEffect, useState } from "react";

import { Heart } from "@/components/icons/Heart";
import { useAllHearts } from "@/hooks/useAllHearts";
import { getLocalHeartCount } from "@/lib/localHearts";
import { cn } from "@/lib/utils";

interface HeartCountBadgeProps {
  slug: string;
}

export function HeartCountBadge({ slug }: HeartCountBadgeProps) {
  const { counts } = useAllHearts();
  const count = counts[slug] ?? 0;
  const [hasLiked, setHasLiked] = useState(false);

  useEffect(() => {
    setHasLiked(getLocalHeartCount(slug) > 0);
  }, [slug]);

  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-sm tabular-nums",
        hasLiked ? "text-red-500" : "text-quaternary",
      )}
    >
      <Heart size={12} fill={hasLiked ? "currentColor" : "none"} />
      {count.toLocaleString()}
    </span>
  );
}
