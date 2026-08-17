"use client";

import { useState } from "react";

import { ChevronDown } from "@/components/icons/ChevronDown";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import {
  DEFAULT_FILTERS,
  type Filters,
  isFiltersEmpty,
  isRangeEmpty,
  type NumericRange,
} from "@/lib/runsPreferences";

// Filter bar mirroring src/components/places/PlacesFilterBar.tsx — chip-style
// triggers with count badges + a "clear all" affordance. Numeric range
// filters share a single dropdown component so distance/time/pace/HR all
// look identical.

const CHIP_BASE =
  "inline-flex items-center gap-1 rounded border px-2 py-1 text-xs transition-colors";
const CHIP_INACTIVE = "border-secondary text-secondary hover:bg-secondary";
const CHIP_ACTIVE = "border-primary bg-tertiary text-primary font-medium";

const chipClass = (active: boolean) => `${CHIP_BASE} ${active ? CHIP_ACTIVE : CHIP_INACTIVE}`;

type Props = {
  sports: readonly string[]; // options derived from the current run list
  filters: Filters;
  onChange: (next: Filters) => void;
  totalCount: number;
  filteredCount: number;
};

export function RunsFilterBar({ sports, filters, onChange, totalCount, filteredCount }: Props) {
  const anyActive = !isFiltersEmpty(filters);

  const toggleSport = (sport: string) => {
    const set = new Set(filters.sports);
    set.has(sport) ? set.delete(sport) : set.add(sport);
    onChange({ ...filters, sports: [...set] });
  };

  const toggleHasMedals = () => onChange({ ...filters, hasMedals: !filters.hasMedals });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SportFilter
        options={sports}
        selected={new Set(filters.sports)}
        onToggle={toggleSport}
        onClear={() => onChange({ ...filters, sports: [] })}
      />

      <ToggleChip label="With medals" active={filters.hasMedals} onClick={toggleHasMedals} />

      <NumericRangeDropdown
        label="Distance"
        unit="mi"
        step={0.1}
        value={filters.distanceMi}
        onChange={(v) => onChange({ ...filters, distanceMi: v })}
      />

      <NumericRangeDropdown
        label="Time"
        unit="min"
        step={1}
        value={filters.movingMin}
        onChange={(v) => onChange({ ...filters, movingMin: v })}
      />

      <PaceRangeDropdown
        value={filters.paceSec}
        onChange={(v) => onChange({ ...filters, paceSec: v })}
      />

      <NumericRangeDropdown
        label="Avg HR"
        unit="bpm"
        step={1}
        value={filters.hr}
        onChange={(v) => onChange({ ...filters, hr: v })}
      />

      {anyActive && (
        <button
          onClick={() => onChange(DEFAULT_FILTERS)}
          className="text-tertiary hover:text-primary text-xs"
        >
          clear all
        </button>
      )}

      <div className="text-tertiary ml-auto text-xs">
        {filteredCount === totalCount ? `${totalCount} runs` : `${filteredCount} of ${totalCount}`}
      </div>
    </div>
  );
}

function ToggleChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className={chipClass(active)}>
      {label}
    </button>
  );
}

function SportFilter({
  options,
  selected,
  onToggle,
  onClear,
}: {
  options: readonly string[];
  selected: Set<string>;
  onToggle: (v: string) => void;
  onClear: () => void;
}) {
  const count = selected.size;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={chipClass(count > 0)}>
        <span>Sport</span>
        {count > 0 && (
          <span className="bg-primary text-primary rounded px-1 text-[10px]">{count}</span>
        )}
        <ChevronDown className="text-tertiary size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 min-w-[200px] overflow-y-auto">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Sport</span>
          {count > 0 && (
            <button
              onClick={onClear}
              className="text-tertiary hover:text-primary text-xs font-normal"
            >
              clear
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.length === 0 ? (
          <div className="text-tertiary px-2 py-1.5 text-xs">none</div>
        ) : (
          options.map((opt) => (
            <DropdownMenuCheckboxItem
              key={opt}
              checked={selected.has(opt)}
              onCheckedChange={() => onToggle(opt)}
              onSelect={(e) => e.preventDefault()}
            >
              {opt}
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Shared range dropdown for distance, time, HR. Uses local draft state so
// typing doesn't fire onChange on every keystroke; commits on blur / Enter /
// close so the parent memo only recomputes when the user's done editing.
function NumericRangeDropdown({
  label,
  unit,
  step,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  step: number;
  value: NumericRange;
  onChange: (v: NumericRange) => void;
}) {
  const [draft, setDraft] = useState<[string, string]>(rangeToDraft(value));

  const commit = () => {
    onChange([parseDraft(draft[0]), parseDraft(draft[1])]);
  };

  const active = !isRangeEmpty(value);
  const summary = active ? formatSummary(value, unit) : label;

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) setDraft(rangeToDraft(value));
        else commit();
      }}
    >
      <DropdownMenuTrigger className={chipClass(active)}>
        <span>{summary}</span>
        <ChevronDown className="text-tertiary size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[240px] p-3">
        <div className="flex items-center justify-between pb-2">
          <span className="text-primary text-xs font-medium">{label}</span>
          {active && (
            <button
              onClick={() => {
                setDraft(["", ""]);
                onChange([null, null]);
              }}
              className="text-tertiary hover:text-primary text-xs font-normal"
            >
              clear
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <RangeInput
            placeholder="min"
            value={draft[0]}
            step={step}
            onChange={(v) => setDraft([v, draft[1]])}
            onCommit={commit}
          />
          <span className="text-tertiary text-xs">to</span>
          <RangeInput
            placeholder="max"
            value={draft[1]}
            step={step}
            onChange={(v) => setDraft([draft[0], v])}
            onCommit={commit}
          />
          <span className="text-tertiary text-xs">{unit}</span>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Pace uses mm:ss inputs since users think in "8:30/mi" not "510 sec/mi".
function PaceRangeDropdown({
  value,
  onChange,
}: {
  value: NumericRange;
  onChange: (v: NumericRange) => void;
}) {
  const [draft, setDraft] = useState<[string, string]>(paceRangeToDraft(value));

  const commit = () => {
    onChange([parsePaceStr(draft[0]), parsePaceStr(draft[1])]);
  };

  const active = !isRangeEmpty(value);
  const summary = active ? formatPaceSummary(value) : "Pace";

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) setDraft(paceRangeToDraft(value));
        else commit();
      }}
    >
      <DropdownMenuTrigger className={chipClass(active)}>
        <span>{summary}</span>
        <ChevronDown className="text-tertiary size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[260px] p-3">
        <div className="flex items-center justify-between pb-2">
          <span className="text-primary text-xs font-medium">Pace (min:sec / mi)</span>
          {active && (
            <button
              onClick={() => {
                setDraft(["", ""]);
                onChange([null, null]);
              }}
              className="text-tertiary hover:text-primary text-xs font-normal"
            >
              clear
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <PaceInput
            placeholder="6:00"
            value={draft[0]}
            onChange={(v) => setDraft([v, draft[1]])}
            onCommit={commit}
          />
          <span className="text-tertiary text-xs">to</span>
          <PaceInput
            placeholder="9:00"
            value={draft[1]}
            onChange={(v) => setDraft([draft[0], v])}
            onCommit={commit}
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RangeInput({
  value,
  step,
  placeholder,
  onChange,
  onCommit,
}: {
  value: string;
  step: number;
  placeholder: string;
  onChange: (v: string) => void;
  onCommit: () => void;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      min={0}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit();
        }
      }}
      className="border-secondary text-primary w-20 rounded border bg-transparent px-2 py-1 text-xs tabular-nums focus:outline-none"
    />
  );
}

function PaceInput({
  value,
  placeholder,
  onChange,
  onCommit,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  onCommit: () => void;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit();
        }
      }}
      className="border-secondary text-primary w-20 rounded border bg-transparent px-2 py-1 text-xs tabular-nums focus:outline-none"
    />
  );
}

function rangeToDraft(r: NumericRange): [string, string] {
  return [r[0] === null ? "" : String(r[0]), r[1] === null ? "" : String(r[1])];
}

function parseDraft(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function paceRangeToDraft(r: NumericRange): [string, string] {
  return [formatPace(r[0]), formatPace(r[1])];
}

function formatPace(secPerMi: number | null): string {
  if (secPerMi === null) return "";
  const min = Math.floor(secPerMi / 60);
  const sec = Math.round(secPerMi % 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function parsePaceStr(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  // Accept "8:30", "8", or "8:5" — anything with an optional colon.
  const m = /^(\d+)(?::(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  const min = Number(m[1]);
  const sec = m[2] ? Number(m[2]) : 0;
  if (!Number.isFinite(min) || !Number.isFinite(sec)) return null;
  return min * 60 + sec;
}

function formatSummary([min, max]: NumericRange, unit: string): string {
  if (min !== null && max !== null) return `${min}–${max} ${unit}`;
  if (min !== null) return `≥${min} ${unit}`;
  if (max !== null) return `≤${max} ${unit}`;
  return unit;
}

function formatPaceSummary([min, max]: NumericRange): string {
  const lo = formatPace(min);
  const hi = formatPace(max);
  if (min !== null && max !== null) return `${lo}–${hi}/mi`;
  if (min !== null) return `≥${lo}/mi`;
  if (max !== null) return `≤${hi}/mi`;
  return "Pace";
}
