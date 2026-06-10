import type { HeatmapCell } from "@/lib/db/stats";
import { cn } from "@/lib/utils";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_LABELS: Record<number, string> = {
  0: "12a",
  6: "6a",
  12: "12p",
  18: "6p",
};

// Spotify green. Intensity (alpha) tracks plays relative to the busiest cell.
const SPOTIFY_RGB: [number, number, number] = [30, 215, 96];

export function Heatmap({ cells }: { cells: HeatmapCell[] }) {
  const lookup = new Map<string, number>();
  let max = 0;
  for (const c of cells) {
    lookup.set(`${c.dayOfWeek}:${c.hourOfDay}`, c.plays);
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
    </div>
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
  lookup: Map<string, number>;
  max: number;
}) {
  return (
    <>
      <div className="text-quaternary pr-1 text-right text-[10px] leading-[18px]">{day}</div>
      {Array.from({ length: 24 }, (_, h) => (
        <Cell
          key={`${dow}-${h}`}
          plays={lookup.get(`${dow}:${h}`) ?? 0}
          max={max}
          dow={dow}
          hour={h}
        />
      ))}
    </>
  );
}

function Cell({
  plays,
  max,
  dow,
  hour,
}: {
  plays: number;
  max: number;
  dow: number;
  hour: number;
}) {
  const empty = plays === 0;
  const dayLabel = DAYS[dow];
  const hourLabel =
    hour === 0 ? "12am" : hour < 12 ? `${hour}am` : hour === 12 ? "12pm" : `${hour - 12}pm`;
  const title = `${dayLabel} ${hourLabel}: ${plays} ${plays === 1 ? "play" : "plays"}`;

  let style: React.CSSProperties | undefined;
  if (!empty && max > 0) {
    const intensity = plays / max;
    style = {
      backgroundColor: `rgb(${SPOTIFY_RGB[0]} ${SPOTIFY_RGB[1]} ${SPOTIFY_RGB[2]} / ${0.15 + intensity * 0.85})`,
    };
  }

  return (
    <div
      title={title}
      className={cn("h-[18px] rounded-sm", empty && "bg-secondary/40")}
      style={style}
    />
  );
}
