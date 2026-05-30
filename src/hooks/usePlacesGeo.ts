"use client";

import useSWR from "swr";

import type { GeoPlace } from "@/app/api/places/geo/route";
import { fetcher } from "@/lib/fetcher";

type GeoResponse = { items: GeoPlace[] };

export function usePlacesGeo() {
  const { data, error, isLoading } = useSWR<GeoResponse>("/api/places/geo", fetcher, {
    revalidateOnFocus: false,
  });

  return {
    items: data?.items ?? [],
    isLoading,
    isError: Boolean(error),
  };
}

export type { GeoPlace };
