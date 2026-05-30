"use client";

import { useAtom } from "jotai";

import { placesViewModeAtom } from "@/atoms/places";
import { cn } from "@/lib/utils";

export function PlacesViewToggle() {
  const [viewMode, setViewMode] = useAtom(placesViewModeAtom);

  return (
    <div
      role="tablist"
      aria-label="Places view"
      className="border-secondary text-tertiary inline-flex overflow-hidden rounded border text-xs"
    >
      {(["globe", "list"] as const).map((mode) => {
        const active = viewMode === mode;
        return (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setViewMode(mode)}
            className={cn(
              "px-2.5 py-1 capitalize transition-colors",
              active
                ? "bg-tertiary text-primary font-medium"
                : "hover:bg-secondary hover:text-secondary",
            )}
          >
            {mode}
          </button>
        );
      })}
    </div>
  );
}
