"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Calendar } from "@/components/icons/Calendar";
import { Check } from "@/components/icons/Check";
import { ChevronDown } from "@/components/icons/ChevronDown";
import { ChevronLeft } from "@/components/icons/ChevronLeft";
import { ChevronRight } from "@/components/icons/ChevronRight";
import { Button } from "@/components/ui/Button";
import { type Period, PERIOD_LABEL, PERIODS } from "@/lib/db/period";
import { cn } from "@/lib/utils";

const PERIOD_LABEL_SHORT: Record<Period, string> = {
  "7d": "7d",
  "30d": "30d",
  "90d": "90d",
  "1y": "1y",
  all: "All",
};

const PERIOD_DAYS: Record<Exclude<Period, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
};

type Props = {
  period: Period | null;
  from: string | null;
  to: string | null;
};

function formatDisplayDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoDateAdd(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d) + days));
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function diffDaysInclusive(fromIso: string, toIso: string): number {
  const fm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fromIso);
  const tm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(toIso);
  if (!fm || !tm) return 0;
  const f = Date.UTC(Number(fm[1]), Number(fm[2]) - 1, Number(fm[3]));
  const t = Date.UTC(Number(tm[1]), Number(tm[2]) - 1, Number(tm[3]));
  return Math.round((t - f) / 86_400_000) + 1;
}

// The current window as inclusive [start, end] ISO dates, or null if it's
// unbounded (all-time, or a partial custom range with only one endpoint).
function resolveWindow(
  period: Period | null,
  from: string | null,
  to: string | null,
): { start: string; end: string } | null {
  if (period === "all") return null;
  if (period) {
    const end = todayISO();
    const start = isoDateAdd(end, -(PERIOD_DAYS[period] - 1));
    return { start, end };
  }
  if (!from || !to) return null;
  return { start: from, end: to };
}

function shiftHref(
  period: Period | null,
  from: string | null,
  to: string | null,
  direction: -1 | 1,
): string | null {
  const win = resolveWindow(period, from, to);
  if (!win) return null;
  const size = diffDaysInclusive(win.start, win.end);
  if (size <= 0) return null;
  const newStart = isoDateAdd(win.start, direction * size);
  const newEnd = isoDateAdd(win.end, direction * size);
  if (direction === 1 && newEnd > todayISO()) return null;
  return `/listening?from=${newStart}&to=${newEnd}`;
}

export function PeriodPicker({ period, from, to }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Local state for the custom range inputs while the popover is open.
  // Re-seeded from props whenever the popover opens (see handleOpenChange).
  const [fromInput, setFromInput] = useState(from ?? "");
  const [toInput, setToInput] = useState(to ?? todayISO());

  function handleOpenChange(next: boolean) {
    if (next) {
      setFromInput(from ?? "");
      setToInput(to ?? todayISO());
    }
    setOpen(next);
  }

  const isCustom = period === null;
  const triggerLabel = isCustom
    ? from && to
      ? `${formatDisplayDate(from)} – ${formatDisplayDate(to)}`
      : from
        ? `From ${formatDisplayDate(from)}`
        : to
          ? `Until ${formatDisplayDate(to)}`
          : "Custom"
    : PERIOD_LABEL[period];
  const triggerLabelShort = isCustom ? "Custom" : PERIOD_LABEL_SHORT[period];

  function selectPreset(p: Period) {
    setOpen(false);
    router.push(p === "30d" ? "/listening" : `/listening?period=${p}`, { scroll: false });
  }

  function applyCustom() {
    if (!fromInput && !toInput) return;
    const params = new URLSearchParams();
    if (fromInput) params.set("from", fromInput);
    if (toInput) params.set("to", toInput);
    setOpen(false);
    router.push(`/listening?${params.toString()}`, { scroll: false });
  }

  const customDisabled = !fromInput && !toInput;
  const customInvalid =
    fromInput && toInput && new Date(fromInput).getTime() > new Date(toInput).getTime();

  const prevHref = shiftHref(period, from, to, -1);
  const nextHref = shiftHref(period, from, to, 1);

  function navigateShift(href: string | null) {
    if (!href) return;
    router.push(href, { scroll: false });
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <div className="border-secondary inline-flex items-stretch overflow-hidden rounded-md border bg-white dark:bg-white/5">
        <button
          type="button"
          onClick={() => navigateShift(prevHref)}
          disabled={!prevHref}
          aria-label="Previous range"
          title="Previous range"
          className={cn(
            "hover:bg-secondary/60 text-tertiary hover:text-primary flex items-center px-1.5 transition-colors",
            "disabled:text-tertiary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
          )}
        >
          <ChevronLeft className="size-3.5" />
        </button>
        <div className="border-secondary border-l" />
        <PopoverPrimitive.Trigger
          className={cn(
            "hover:bg-secondary/60 text-primary inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors",
            "data-[state=open]:bg-secondary/60",
          )}
        >
          <Calendar className="text-tertiary size-3.5" />
          <span className="hidden sm:inline">{triggerLabel}</span>
          <span className="sm:hidden">{triggerLabelShort}</span>
          <ChevronDown className="text-tertiary size-3" />
        </PopoverPrimitive.Trigger>
        <div className="border-secondary border-l" />
        <button
          type="button"
          onClick={() => navigateShift(nextHref)}
          disabled={!nextHref}
          aria-label="Next range"
          title="Next range"
          className={cn(
            "hover:bg-secondary/60 text-tertiary hover:text-primary flex items-center px-1.5 transition-colors",
            "disabled:text-tertiary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
          )}
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={6}
          className={cn(
            "border-secondary bg-primary text-primary z-50 overflow-hidden rounded-md border shadow-lg",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[side=bottom]:slide-in-from-top-2",
            "w-[min(420px,calc(100vw-2rem))]",
          )}
        >
          <div className="flex flex-col sm:flex-row">
            {/* Presets */}
            <div className="border-secondary flex flex-col gap-0.5 border-b p-2 sm:w-[140px] sm:border-r sm:border-b-0">
              <div className="text-tertiary px-2 pt-1 pb-1.5 text-[10px] font-semibold tracking-wide uppercase">
                Quick ranges
              </div>
              {PERIODS.map((p) => {
                const active = p === period;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => selectPreset(p)}
                    className={cn(
                      "hover:bg-secondary/60 flex items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm transition-colors",
                      active && "bg-secondary text-primary font-medium",
                    )}
                  >
                    <span>{PERIOD_LABEL[p]}</span>
                    {active && <Check className="size-3.5" />}
                  </button>
                );
              })}
            </div>

            {/* Custom range */}
            <div className="flex flex-1 flex-col gap-3 p-3">
              <div className="text-tertiary text-[10px] font-semibold tracking-wide uppercase">
                Absolute range
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-tertiary text-xs">From</span>
                <input
                  type="date"
                  value={fromInput}
                  max={toInput || todayISO()}
                  onChange={(e) => setFromInput(e.target.value)}
                  className="border-secondary bg-secondary/40 text-primary rounded-md border px-2 py-1.5 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:outline-none dark:bg-white/5"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-tertiary text-xs">To</span>
                <input
                  type="date"
                  value={toInput}
                  min={fromInput || undefined}
                  max={todayISO()}
                  onChange={(e) => setToInput(e.target.value)}
                  className="border-secondary bg-secondary/40 text-primary rounded-md border px-2 py-1.5 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:outline-none dark:bg-white/5"
                />
              </label>
              {customInvalid && (
                <div className="text-xs text-red-500">From must be on or before To.</div>
              )}
              <Button
                type="button"
                size="sm"
                onClick={applyCustom}
                disabled={customDisabled || Boolean(customInvalid)}
              >
                Apply range
              </Button>
            </div>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
