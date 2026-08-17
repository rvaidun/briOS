import React from "react";

import { FileText2 } from "@/components/icons/FileText2";
import { FountainPen } from "@/components/icons/FountainPen";
import { Headphones3 } from "@/components/icons/Headphones3";
import { Home } from "@/components/icons/Home";
import { Photo } from "@/components/icons/Photo";
import { PinOnMap } from "@/components/icons/PinOnMap";
import { Sneaker } from "@/components/icons/Sneaker";
import { IconProps } from "@/components/icons/types";
import { UserRole, type UserRoleValue } from "@/lib/db/schema";

export type NavAccess = "public" | "approved" | "owner";

export interface NavigationItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<IconProps>;
  keywords?: string[];
  isActive?: (pathname: string) => boolean;
  section?: "main" | "projects";
  // Who can see this entry in the sidebar / ⌘K. Default: "public".
  // Note: this only gates *visibility*, not access — pages enforce their own
  // auth via requireApprovedUser() / requireOwner().
  access?: NavAccess;
}

function canSee(item: NavigationItem, role: UserRoleValue | null): boolean {
  const access = item.access ?? "public";
  if (access === "public") return true;
  if (!role) return false;
  if (access === "approved") return role === UserRole.Approved || role === UserRole.Owner;
  if (access === "owner") return role === UserRole.Owner;
  return false;
}

export const navigationItems: NavigationItem[] = [
  {
    id: "home",
    label: "Home",
    href: "/",
    icon: Home,
    keywords: ["home", "dashboard"],
    isActive: (pathname) => pathname === "/",
    section: "main",
  },
  {
    id: "blog",
    label: "Blog",
    href: "/blog",
    icon: FileText2,
    keywords: ["writing", "blog", "posts"],
    isActive: (pathname) => pathname.startsWith("/blog"),
    section: "main",
  },

  {
    id: "music",
    label: "Listening",
    href: "/listening",
    icon: Headphones3,
    keywords: ["listening", "music", "audio"],
    isActive: (pathname) => pathname === "/listening",
    section: "main",
  },

  {
    id: "places",
    label: "Places",
    href: "/places",
    icon: PinOnMap,
    keywords: ["places", "travel", "favorites", "cities", "map"],
    isActive: (pathname) => pathname === "/places",
    section: "main",
  },

  {
    id: "photos",
    label: "Photos",
    href: "/photos",
    icon: Photo,
    keywords: ["photos", "pictures", "album", "gallery"],
    isActive: (pathname) => pathname === "/photos",
    section: "main",
  },

  {
    id: "runs",
    label: "Runs",
    href: "/runs",
    icon: Sneaker,
    keywords: ["runs", "running", "run", "fitness", "activity", "gps", "strava"],
    isActive: (pathname) => pathname.startsWith("/runs"),
    section: "main",
    access: "approved",
  },

  {
    id: "guestbook",
    label: "Guestbook",
    href: "/guestbook",
    icon: FountainPen,
    keywords: ["guestbook", "notes", "visitors", "sign", "draw"],
    isActive: (pathname) => pathname === "/guestbook",
    section: "main",
  },
];

// Helper functions to filter navigation items. Pass the current user role (or
// null for anonymous) so items with `access` set to "approved" / "owner" are
// filtered out for viewers who shouldn't see them.
export const getMainNavigationItems = (role: UserRoleValue | null) =>
  navigationItems.filter((item) => item.section === "main" && canSee(item, role));

export const getProjectNavigationItems = (role: UserRoleValue | null) =>
  navigationItems.filter((item) => item.section === "projects" && canSee(item, role));

export const getAllNavigationItems = (role: UserRoleValue | null) =>
  navigationItems.filter((item) => canSee(item, role));
