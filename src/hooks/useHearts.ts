"use client";

import useSWR from "swr";

import { fetcher } from "@/lib/fetcher";

type HeartResponse = { count: number };

export function useHearts(slug: string) {
  const key = slug ? `/api/blog/hearts/${slug}` : null;
  const { data, mutate, isLoading, error } = useSWR<HeartResponse>(key, fetcher);

  const count = data?.count ?? 0;

  async function addHeart() {
    const optimistic = { count: count + 1 };
    await mutate(
      async () => {
        const res = await fetch(`/api/blog/hearts/${slug}`, { method: "POST" });
        if (!res.ok) throw new Error("Failed to add heart");
        return res.json();
      },
      {
        optimisticData: optimistic,
        revalidate: false,
        populateCache: true,
        rollbackOnError: true,
      },
    );
  }

  return { count, addHeart, isLoading, isError: error };
}
