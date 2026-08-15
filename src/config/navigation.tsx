import React from "react";

import { FileText2 } from "@/components/icons/FileText2";
import { FountainPen } from "@/components/icons/FountainPen";
import { Headphones3 } from "@/components/icons/Headphones3";
import { Home } from "@/components/icons/Home";
import { Photo } from "@/components/icons/Photo";
import { PinOnMap } from "@/components/icons/PinOnMap";
import { Sneaker } from "@/components/icons/Sneaker";
import { IconProps } from "@/components/icons/types";

export interface NavigationItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<IconProps>;
  keywords?: string[];
  isActive?: (pathname: string) => boolean;
  section?: "main" | "projects";
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
    id: "strava",
    label: "Strava",
    href: "/strava",
    icon: Sneaker,
    keywords: ["strava", "running", "runs", "fitness", "activity", "gps"],
    isActive: (pathname) => pathname.startsWith("/strava"),
    section: "main",
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

// Helper functions to filter navigation items
export const getMainNavigationItems = () =>
  navigationItems.filter((item) => item.section === "main");

export const getProjectNavigationItems = () =>
  navigationItems.filter((item) => item.section === "projects");

export const getAllNavigationItems = () => navigationItems;
