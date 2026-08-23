"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

// Hub-and-spoke nav shown on /admin and /admin/crons. The other admin pages
// (/admin/users, /guestbook/admin, /runs/admin, /listening/admin) don't share
// this shell — they're reached via the external links here.
const items: readonly { href: string; label: string; external?: boolean }[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/crons", label: "Crons" },
  { href: "/admin/users", label: "Users" },
  { href: "/guestbook/admin", label: "Guestbook", external: true },
  { href: "/runs/admin", label: "Runs", external: true },
  { href: "/listening/admin", label: "Listening", external: true },
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
            {item.external && <span className="text-quaternary ml-1 text-xs">↗</span>}
          </Link>
        );
      })}
    </nav>
  );
}
