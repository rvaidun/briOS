"use client";

import { useEffect, useState } from "react";

import { EASTER_EGG_KEYS, type EasterEggKey, getEasterEggForToday } from "@/lib/easterEggs";

import { Confetti } from "./Confetti";
import { Fireworks } from "./Fireworks";
import { Leaves } from "./Leaves";
import { Snow } from "./Snow";

// Debug: ?egg=fireworks|leaves|snow|confetti forces a specific egg.
// ?egg=none disables the egg for the day.
function readOverride(): EasterEggKey | "none" | null {
  const value = new URLSearchParams(window.location.search).get("egg");
  if (!value) return null;
  if (value === "none") return "none";
  if ((EASTER_EGG_KEYS as readonly string[]).includes(value)) {
    return value as EasterEggKey;
  }
  return null;
}

export function EasterEgg() {
  const [egg, setEgg] = useState<EasterEggKey | null>(null);

  useEffect(() => {
    // Defer to client so the server never picks an egg based on its timezone.
    const override = readOverride();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEgg(override === "none" ? null : (override ?? getEasterEggForToday()));
  }, []);

  if (!egg) return null;
  if (egg === "fireworks") return <Fireworks />;
  if (egg === "confetti") return <Confetti />;
  if (egg === "snow") return <Snow />;
  if (egg === "leaves") return <Leaves />;
  return null;
}
