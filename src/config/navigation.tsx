import React from "react";

import { FileText2 } from "@/components/icons/FileText2";
import { Headphones3 } from "@/components/icons/Headphones3";
import { Home } from "@/components/icons/Home";
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
    id: "writing",
    label: "Writing",
    href: "/writing",
    icon: FileText2,
    keywords: ["writing", "blog", "posts"],
    isActive: (pathname) => pathname.startsWith("/writing"),
    section: "main",
  },
  // {
  //   id: "stack",
  //   label: "Stack",
  //   href: "/stack",
  //   icon: Ballot,
  //   keywords: ["stack", "tools", "tech"],
  //   isActive: (pathname) => pathname.startsWith("/stack"),
  //   section: "projects",
  // },

  {
    id: "music",
    label: "Listening",
    href: "/listening",
    icon: Headphones3,
    keywords: ["listening", "music", "audio"],
    isActive: (pathname) => pathname === "/listening",
    section: "projects",
  },
];

// Helper functions to filter navigation items
export const getMainNavigationItems = () =>
  navigationItems.filter((item) => item.section === "main");

export const getProjectNavigationItems = () =>
  navigationItems.filter((item) => item.section === "projects");

export const getAllNavigationItems = () => navigationItems;
