"use client";

import useSWR from "swr";

import { fetcher } from "@/lib/fetcher";

type AllHeartsResponse = { counts: Record<string, number> };

export function useAllHearts() {
  const { data, isLoading, error } = useSWR<AllHeartsResponse>("/api/blog/hearts", fetcher);
  return {
    counts: data?.counts ?? {},
    isLoading,
    isError: error,
  };
}
