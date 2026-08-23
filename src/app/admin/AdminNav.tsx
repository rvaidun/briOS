"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

// Cross-section admin nav rendered under the TopBar of every admin surface.
// /guestbook/admin, /runs/admin, /listening/admin live outside /admin's
// segment tree so they each import this directly (rather than inheriting via
// layout). Keep this list in sync as new admin pages land.
const items: readonly { href: string; label: string }[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/crons", label: "Crons" },
  { href: "/admin/users", label: "Users" },
  { href: "/guestbook/admin", label: "Guestbook" },
  { href: "/runs/admin", label: "Runs" },
  { href: "/listening/admin", label: "Listening" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="border-secondary flex flex-wrap items-center gap-1 border-b px-4 py-2 md:px-6">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded px-2 py-1 text-[13px] transition-colors",
              active
                ? "text-primary bg-black/[0.06] dark:bg-white/[0.08]"
                : "text-secondary hover:text-primary hover:bg-black/[0.04] dark:hover:bg-white/[0.05]",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
