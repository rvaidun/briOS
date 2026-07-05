"use client";

import { useEffect, useState } from "react";

import { type EasterEggKey, getEasterEggForToday } from "@/lib/easterEggs";

import { Fireworks } from "./Fireworks";

export function EasterEgg() {
  const [egg, setEgg] = useState<EasterEggKey | null>(null);

  useEffect(() => {
    // Defer to client so the server never picks an egg based on its timezone.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEgg(getEasterEggForToday());
  }, []);

  if (!egg) return null;
  if (egg === "fireworks") return <Fireworks />;
  return null;
}
