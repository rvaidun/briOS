import React from "react";

// Column stack so <TopBar> and the page content sit above one another.
// Without this the shell's flex-row main content puts them side-by-side —
// TopBar collapsed to its intrinsic width and the mat starting at y=0.
export default function GuestbookLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-w-0 flex-1 flex-col">{children}</div>;
}
