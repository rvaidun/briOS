import { cn } from "@/lib/utils";

// Notion-style muted palette. Each entry pairs a light and dark variant so
// pills read well on both themes.
const PALETTE = [
  "bg-neutral-200 text-neutral-800 dark:bg-neutral-700/60 dark:text-neutral-100",
  "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100",
  "bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-100",
  "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100",
  "bg-teal-100 text-teal-900 dark:bg-teal-900/40 dark:text-teal-100",
  "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100",
  "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100",
  "bg-indigo-100 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-100",
  "bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100",
  "bg-purple-100 text-purple-900 dark:bg-purple-900/40 dark:text-purple-100",
  "bg-pink-100 text-pink-900 dark:bg-pink-900/40 dark:text-pink-100",
  "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100",
  "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100",
];

// Deterministic color-per-label: same input always hashes to the same slot.
// Uses a small FNV-like walk so spelling changes flip colors predictably.
function colorFor(label: string): string {
  let h = 2166136261;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export function Pill({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded px-1.5 py-0.5 text-xs leading-tight",
        colorFor(label),
        className,
      )}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}
