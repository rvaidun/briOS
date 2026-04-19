"use client";

import { ChevronDown } from "@/components/icons/ChevronDown";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { cn } from "@/lib/utils";

type FilterProps = {
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  onClear: () => void;
};

function FilterDropdown({ label, options, selected, onToggle, onClear }: FilterProps) {
  const count = selected.size;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "border-secondary hover:bg-secondary inline-flex items-center gap-1 rounded border px-2 py-1 text-xs",
          count > 0 && "border-primary/30 text-primary font-medium",
        )}
      >
        <span>{label}</span>
        {count > 0 && (
          <span className="bg-tertiary text-secondary rounded px-1 text-[10px]">{count}</span>
        )}
        <ChevronDown className="text-tertiary size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 min-w-[220px] overflow-y-auto">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{label}</span>
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

type Props = {
  cities: string[];
  categories: string[];
  selectedCities: Set<string>;
  selectedCategories: Set<string>;
  onToggleCity: (v: string) => void;
  onToggleCategory: (v: string) => void;
  onClearCities: () => void;
  onClearCategories: () => void;
  onClearAll: () => void;
  totalCount: number;
  filteredCount: number;
};

export function PlacesFilterBar(props: Props) {
  const anySelected = props.selectedCities.size + props.selectedCategories.size > 0;

  return (
    <div className="border-secondary flex flex-wrap items-center gap-2 border-b px-4 py-2">
      <FilterDropdown
        label="City"
        options={props.cities}
        selected={props.selectedCities}
        onToggle={props.onToggleCity}
        onClear={props.onClearCities}
      />
      <FilterDropdown
        label="Category"
        options={props.categories}
        selected={props.selectedCategories}
        onToggle={props.onToggleCategory}
        onClear={props.onClearCategories}
      />
      {anySelected && (
        <button
          onClick={props.onClearAll}
          className="text-tertiary hover:text-primary text-xs"
        >
          clear all
        </button>
      )}
      <div className="text-tertiary ml-auto text-xs">
        {props.filteredCount === props.totalCount
          ? `${props.totalCount} places`
          : `${props.filteredCount} of ${props.totalCount}`}
      </div>
    </div>
  );
}
