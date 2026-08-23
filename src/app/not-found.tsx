import type { Metadata } from "next";

import { NotFoundGame } from "@/components/NotFoundGame";
import { TopBar } from "@/components/TopBar";
import { createMetadata } from "@/lib/metadata";

export const metadata: Metadata = createMetadata({
  title: "Not found",
  description: "This page doesn't exist.",
  path: "/404",
  noIndex: true,
});

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col">
      <TopBar>
        <div className="flex-1 text-sm font-medium">Not found</div>
      </TopBar>
      <div className="flex-1 overflow-hidden pt-11 md:pt-0">
        <NotFoundGame />
      </div>
    </div>
  );
}
