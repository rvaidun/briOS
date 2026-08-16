"use client";

import useSWR from "swr";

import { fetcher } from "@/lib/fetcher";

type HeartResponse = { count: number };

export function useRunHeart(id: string, initialCount = 0) {
  const key = id ? `/api/runs/hearts/${id}` : null;
  const { data, mutate, isLoading, error } = useSWR<HeartResponse>(key, fetcher, {
    fallbackData: { count: initialCount },
    revalidateOnMount: false,
  });

  const count = data?.count ?? initialCount;

  async function addHeart() {
    await mutate(
      async () => {
        const res = await fetch(`/api/runs/hearts/${id}`, { method: "POST" });
        if (!res.ok) throw new Error("Failed to add heart");
        return res.json() as Promise<HeartResponse>;
      },
      {
        optimisticData: { count: count + 1 },
        revalidate: false,
        populateCache: true,
        rollbackOnError: true,
      },
    );
  }

  return { count, addHeart, isLoading, isError: error };
}
