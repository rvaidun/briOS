"use client";

import { useAtomValue } from "jotai";
import dynamic from "next/dynamic";

import { placesSelectedCategoriesAtom, placesSelectedCitiesAtom } from "@/atoms/places";
import { placesViewModeAtom } from "@/atoms/places";
import { Places } from "@/components/Places";
import { PlacesPage } from "@/hooks/usePlaces";
import { usePlacesGeo } from "@/hooks/usePlacesGeo";

const PlacesGlobe = dynamic(() => import("./PlacesGlobe").then((m) => m.PlacesGlobe), {
  ssr: false,
});

interface PlacesPaneProps {
  initialData?: PlacesPage[];
}

export function PlacesPane({ initialData }: PlacesPaneProps) {
  const viewMode = useAtomValue(placesViewModeAtom);
  const selectedCities = useAtomValue(placesSelectedCitiesAtom);
  const selectedCategories = useAtomValue(placesSelectedCategoriesAtom);
  const { items: geoItems } = usePlacesGeo();

  if (viewMode === "list") {
    return <Places initialData={initialData} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div className="border-secondary flex shrink-0 items-center justify-center border-b p-4 md:flex-[3] md:border-r md:border-b-0 md:p-6">
        <div className="h-[220px] w-[220px] md:h-full md:max-h-[560px] md:w-full md:max-w-[560px]">
          <PlacesGlobe
            items={geoItems}
            selectedCities={selectedCities}
            selectedCategories={selectedCategories}
          />
        </div>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-[2]">
        <Places initialData={initialData} />
      </div>
    </div>
  );
}
