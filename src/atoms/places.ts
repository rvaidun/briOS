import { atom } from "jotai";
import { atomWithStorage, createJSONStorage } from "jotai/utils";

export type PlacesViewMode = "globe" | "list";

// Persist across reloads so a user who switches to List stays there.
// Defaults to "globe"; the page may flip to "list" on mobile on first load.
export const placesViewModeAtom = atomWithStorage<PlacesViewMode>(
  "places.viewMode",
  "globe",
  createJSONStorage(() => sessionStorage),
);

// Set serialization helpers — JSON can't represent Set directly, so we store
// arrays under the hood for any future persisted variants.
export const placesSelectedCitiesAtom = atom<Set<string>>(new Set<string>());
export const placesSelectedCategoriesAtom = atom<Set<string>>(new Set<string>());

// Place currently focused by the globe (last marker clicked). The list reads
// this to scroll + highlight the matching row.
export const placesFocusedIdAtom = atom<string | null>(null);
