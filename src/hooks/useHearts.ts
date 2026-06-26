"use client";

import useSWR, { useSWRConfig } from "swr";

import { fetcher } from "@/lib/fetcher";

type HeartResponse = { count: number };
type AllHeartsResponse = { counts: Record<string, number> };

export function useHearts(slug: string) {
  const key = slug ? `/api/blog/hearts/${slug}` : null;
  const { data, mutate, isLoading, error } = useSWR<HeartResponse>(key, fetcher);
  const { mutate: globalMutate } = useSWRConfig();

  const count = data?.count ?? 0;

  async function addHeart() {
    const optimistic = { count: count + 1 };
    const result = await mutate(
      async () => {
        const res = await fetch(`/api/blog/hearts/${slug}`, { method: "POST" });
        if (!res.ok) throw new Error("Failed to add heart");
        return res.json() as Promise<HeartResponse>;
      },
      {
        optimisticData: optimistic,
        revalidate: false,
        populateCache: true,
        rollbackOnError: true,
      },
    );

    // Sync the all-hearts cache so the listing page reflects the new count immediately.
    if (result) {
      globalMutate<AllHeartsResponse>(
        "/api/blog/hearts",
        (current) => {
          if (!current) return current;
          return { counts: { ...current.counts, [slug]: result.count } };
        },
        { revalidate: false },
      );
    }
  }

  return { count, addHeart, isLoading, isError: error };
}
