import type { HeatmapCell } from "@/lib/db/stats";
import { cn } from "@/lib/utils";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_LABELS: Record<number, string> = {
  0: "12a",
  6: "6a",
  12: "12p",
  18: "6p",
};

// Spotify green and Apple Music pink. Cells lerp between them based on which
// source dominates the cell; intensity (alpha) tracks plays relative to the
// busiest cell on the grid.
const SPOTIFY_RGB: [number, number, number] = [30, 215, 96];
const APPLE_RGB: [number, number, number] = [252, 70, 107];

type CellData = { plays: number; spotify: number; apple: number };

export function Heatmap({ cells }: { cells: HeatmapCell[] }) {
  const lookup = new Map<string, CellData>();
  let max = 0;
  for (const c of cells) {
    lookup.set(`${c.dayOfWeek}:${c.hourOfDay}`, {
      plays: c.plays,
      spotify: c.spotifyPlays,
      apple: c.applePlays,
    });
    if (c.plays > max) max = c.plays;
  }

  return (
    <div className="border-secondary rounded-md border bg-white p-4 dark:bg-white/5">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-tertiary text-xs font-medium tracking-wide uppercase">When I listen</h3>
        <span className="text-quaternary text-[10px]">local time</span>
      </div>
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          <div className="grid grid-cols-[28px_repeat(24,1fr)] gap-[2px]">
            <div />
            {Array.from({ length: 24 }, (_, h) => (
              <div
                key={`label-${h}`}
                className="text-quaternary text-center text-[9px] tabular-nums"
              >
                {HOUR_LABELS[h] ?? ""}
              </div>
            ))}
            {DAYS.map((day, dow) => (
              <Row key={day} day={day} dow={dow} lookup={lookup} max={max} />
            ))}
          </div>
        </div>
      </div>
      <div className="text-quaternary mt-3 flex items-center gap-3 text-[10px]">
        <Legend color={SPOTIFY_RGB} label="Spotify" />
        <Legend color={APPLE_RGB} label="Apple Music" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: [number, number, number]; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className="inline-block size-2 rounded-sm"
        style={{ backgroundColor: `rgb(${color[0]} ${color[1]} ${color[2]})` }}
      />
      {label}
    </span>
  );
}

function Row({
  day,
  dow,
  lookup,
  max,
}: {
  day: string;
  dow: number;
  lookup: Map<string, CellData>;
  max: number;
}) {
  return (
    <>
      <div className="text-quaternary pr-1 text-right text-[10px] leading-[18px]">{day}</div>
      {Array.from({ length: 24 }, (_, h) => (
        <Cell key={`${dow}-${h}`} cell={lookup.get(`${dow}:${h}`)} max={max} dow={dow} hour={h} />
      ))}
    </>
  );
}

function Cell({
  cell,
  max,
  dow,
  hour,
}: {
  cell: CellData | undefined;
  max: number;
  dow: number;
  hour: number;
}) {
  const plays = cell?.plays ?? 0;
  const empty = plays === 0;
  const dayLabel = DAYS[dow];
  const hourLabel =
    hour === 0 ? "12am" : hour < 12 ? `${hour}am` : hour === 12 ? "12pm" : `${hour - 12}pm`;

  let style: React.CSSProperties | undefined;
  let title = `${dayLabel} ${hourLabel}: ${plays} ${plays === 1 ? "play" : "plays"}`;

  if (!empty && cell && max > 0) {
    const total = cell.spotify + cell.apple;
    // Fraction of plays that came from Apple Music. Falls back to spotify when
    // a cell predates source tagging.
    const applePct = total > 0 ? cell.apple / total : 0;
    const r = Math.round(SPOTIFY_RGB[0] + (APPLE_RGB[0] - SPOTIFY_RGB[0]) * applePct);
    const g = Math.round(SPOTIFY_RGB[1] + (APPLE_RGB[1] - SPOTIFY_RGB[1]) * applePct);
    const b = Math.round(SPOTIFY_RGB[2] + (APPLE_RGB[2] - SPOTIFY_RGB[2]) * applePct);
    const intensity = plays / max;
    style = { backgroundColor: `rgb(${r} ${g} ${b} / ${0.15 + intensity * 0.85})` };
    title += ` · spotify ${cell.spotify}, apple ${cell.apple}`;
  }

  return (
    <div
      title={title}
      className={cn("h-[18px] rounded-sm", empty && "bg-secondary/40")}
      style={style}
    />
  );
}
