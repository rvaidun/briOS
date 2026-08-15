// Compact kudos + comment count. Renders nothing when both are zero so
// pre-Strava-synced rows stay clean.
export function KudosBadge({ kudos, comments }: { kudos: number | null; comments: number | null }) {
  const k = kudos ?? 0;
  const c = comments ?? 0;
  if (k === 0 && c === 0) return null;

  return (
    <div className="text-tertiary flex flex-none items-center gap-2 text-xs tabular-nums">
      {k > 0 && (
        <span className="flex items-center gap-1">
          <span aria-hidden className="text-orange-500 dark:text-orange-400">
            ♥
          </span>
          {k}
        </span>
      )}
      {c > 0 && <span>💬 {c}</span>}
    </div>
  );
}
