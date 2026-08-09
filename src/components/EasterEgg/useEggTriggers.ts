"use client";

import { useEffect, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";

type Handlers = {
  onLaunch: () => void;
  onPoint: (x: number, y: number) => void;
};

export function useEggTriggers(handlers: Handlers) {
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  });

  useHotkeys(
    "mod+e",
    () => {
      handlersRef.current.onLaunch();
    },
    { enableOnFormTags: true, preventDefault: true },
  );

  useEffect(() => {
    // Throttle: only every Nth click fires a burst, so normal browsing
    // isn't hijacked but engaged users still stumble on the reward.
    const CLICK_INTERVAL = 10;
    let clickCount = 0;
    const handleClick = (e: MouseEvent) => {
      clickCount++;
      if (clickCount % CLICK_INTERVAL !== 0) return;
      handlersRef.current.onPoint(e.clientX, e.clientY);
    };
    document.addEventListener("click", handleClick);

    // Shake-to-launch on devices that expose devicemotion without a
    // permission prompt. iOS 13+ requires requestPermission() from a
    // user gesture; we skip that dialog and fall back to tap.
    let lastX = 0;
    let lastY = 0;
    let lastZ = 0;
    let lastShake = 0;
    const SHAKE_THRESHOLD = 22;
    const SHAKE_COOLDOWN = 700;
    const handleMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc || acc.x == null || acc.y == null || acc.z == null) return;
      const delta = Math.hypot(acc.x - lastX, acc.y - lastY, acc.z - lastZ);
      lastX = acc.x;
      lastY = acc.y;
      lastZ = acc.z;
      const now = Date.now();
      if (delta > SHAKE_THRESHOLD && now - lastShake > SHAKE_COOLDOWN) {
        lastShake = now;
        handlersRef.current.onLaunch();
      }
    };
    const DME = (window as unknown as { DeviceMotionEvent?: unknown }).DeviceMotionEvent as
      | (typeof DeviceMotionEvent & {
          requestPermission?: () => Promise<"granted" | "denied">;
        })
      | undefined;
    const needsMotionPermission = typeof DME?.requestPermission === "function";
    if (!needsMotionPermission) {
      window.addEventListener("devicemotion", handleMotion);
    }

    return () => {
      document.removeEventListener("click", handleClick);
      if (!needsMotionPermission) {
        window.removeEventListener("devicemotion", handleMotion);
      }
    };
  }, []);
}
