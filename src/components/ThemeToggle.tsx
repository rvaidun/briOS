"use client";

import { useTheme } from "next-themes";
import * as React from "react";

import { Moon } from "@/components/icons/Moon";
import { Sun } from "@/components/icons/Sun";
import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === "dark";

  const handleToggle = () => {
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <IconButton
      size="sm"
      onClick={handleToggle}
      aria-label={
        mounted ? (isDark ? "Switch to light theme" : "Switch to dark theme") : "Toggle theme"
      }
      className={cn("text-quaternary group-hover/button:text-primary", className)}
    >
      {mounted ? (
        isDark ? (
          <Sun size={18} />
        ) : (
          <Moon size={18} />
        )
      ) : (
        <span className="block h-[18px] w-[18px]" />
      )}
    </IconButton>
  );
}
