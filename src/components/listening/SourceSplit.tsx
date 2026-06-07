import type { SourceBreakdown } from "@/lib/db/stats";

const SOURCE_META: Record<string, { label: string; color: string }> = {
  spotify: { label: "Spotify", color: "rgb(30 215 96)" },
  apple_music: { label: "Apple Music", color: "rgb(252 70 107)" },
};

export function SourceSplit({ breakdown }: { breakdown: SourceBreakdown[] }) {
  const total = breakdown.reduce((sum, b) => sum + b.plays, 0);
  if (total === 0) return null;

  return (
    <div className="border-secondary rounded-md border bg-white p-4 dark:bg-white/5">
      <h3 className="text-tertiary mb-3 text-xs font-medium tracking-wide uppercase">Sources</h3>
      <div className="flex h-2 overflow-hidden rounded-full">
        {breakdown.map((b) => {
          const meta = SOURCE_META[b.source] ?? { label: b.source, color: "rgb(128 128 128)" };
          return (
            <div
              key={b.source}
              style={{ width: `${(b.plays / total) * 100}%`, backgroundColor: meta.color }}
            />
          );
        })}
      </div>
      <ul className="mt-3 space-y-1">
        {breakdown.map((b) => {
          const meta = SOURCE_META[b.source] ?? { label: b.source, color: "rgb(128 128 128)" };
          const pct = Math.round((b.plays / total) * 100);
          return (
            <li key={b.source} className="text-secondary flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span
                  className="inline-block size-2 flex-none rounded-full"
                  style={{ backgroundColor: meta.color }}
                />
                {meta.label}
              </span>
              <span className="text-tertiary tabular-nums">
                {b.plays.toLocaleString()} · {pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
