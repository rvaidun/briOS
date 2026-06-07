"use client";

import { Heart } from "@/components/icons/Heart";
import { useAllHearts } from "@/hooks/useAllHearts";

interface HeartCountBadgeProps {
  slug: string;
}

export function HeartCountBadge({ slug }: HeartCountBadgeProps) {
  const { counts } = useAllHearts();
  const count = counts[slug] ?? 0;
  if (count <= 0) return null;
  return (
    <span className="text-quaternary inline-flex items-center gap-1 text-sm tabular-nums">
      <Heart size={12} />
      {count.toLocaleString()}
    </span>
  );
}
