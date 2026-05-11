"use client";

import createGlobe from "cobe";
import { useSetAtom } from "jotai";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

import { placesFocusedIdAtom } from "@/atoms/places";
import type { GeoPlace } from "@/hooks/usePlacesGeo";

// Accent for active markers (matches --text-color-campsite #ff591e)
const ACCENT: [number, number, number] = [1.0, 0.349, 0.118];
const DIMMED_LIGHT: [number, number, number] = [0.7, 0.7, 0.7];
const DIMMED_DARK: [number, number, number] = [0.35, 0.35, 0.35];

// Default view centers on the contiguous US (lng ~-98, lat ~39).
const US_LNG = -98;
const INITIAL_PHI = (-US_LNG * Math.PI) / 180; // ≈ 1.71
const INITIAL_THETA = 0.35;
// Zoom level — scale > 1 magnifies the globe within the canvas, clipping the
// limb but giving more room for clustered markers.
const SCALE = 1.5;
const HIT_THRESHOLD_PX = 10;
const CLICK_MAX_DRAG_PX = 4;

interface PlacesGlobeProps {
  items: GeoPlace[];
  selectedCities: Set<string>;
  selectedCategories: Set<string>;
  className?: string;
}

// Convert lat/lng to a unit-sphere 3D point matching cobe's internal convention.
function lngLatTo3D(lat: number, lng: number): [number, number, number] {
  const r = (lat * Math.PI) / 180;
  const a = (lng * Math.PI) / 180 - Math.PI;
  const o = Math.cos(r);
  return [-o * Math.cos(a), Math.sin(r), o * Math.sin(a)];
}

// Project a marker (at base radius + elevation) to canvas-pixel screen coords.
// Mirrors cobe's internal `O()` projection so hit-testing matches the visuals.
function projectMarker(
  lat: number,
  lng: number,
  phi: number,
  theta: number,
  sizePx: number,
  scale: number,
): { x: number; y: number; visible: boolean } {
  const radius = 0.85; // base 0.8 + markerElevation default 0.05
  const [x0, y0, z0] = lngLatTo3D(lat, lng);
  const tx = x0 * radius;
  const ty = y0 * radius;
  const tz = z0 * radius;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);
  const c = cosP * tx + sinP * tz;
  const s = sinP * sinT * tx + cosT * ty - cosP * sinT * tz;
  const z = -sinP * cosT * tx + sinT * ty + cosP * cosT * tz;
  // visible if facing camera AND inside the rendered disc (r < 0.8)
  const visible = z >= 0 && c * c + s * s < 0.64;
  const px = ((c * scale + 1) / 2) * sizePx;
  const py = ((-s * scale + 1) / 2) * sizePx;
  return { x: px, y: py, visible };
}

// Easing for the zoom animation.
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// Pick the angularly-shortest phi delta so animation never spins the long way.
function shortestPhiDelta(from: number, to: number): number {
  const TAU = Math.PI * 2;
  let d = (((to - from) % TAU) + TAU) % TAU;
  if (d > Math.PI) d -= TAU;
  return d;
}

export function PlacesGlobe({
  items,
  selectedCities,
  selectedCategories,
  className,
}: PlacesGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const phiRef = useRef(INITIAL_PHI);
  const thetaRef = useRef(INITIAL_THETA);
  const modeRef = useRef<"idle" | "dragging" | "animating" | "focused">("idle");
  const dragRef = useRef<{ x: number; y: number; phi: number; moved: number } | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const animRef = useRef<{
    fromPhi: number;
    toPhi: number;
    fromTheta: number;
    toTheta: number;
    start: number;
    duration: number;
  } | null>(null);
  const hoveredIdRef = useRef<string | null>(null);
  const focusedIdRef = useRef<string | null>(null);

  const { resolvedTheme } = useTheme();
  const [size, setSize] = useState<number>(0);
  const [hoveredItem, setHoveredItem] = useState<GeoPlace | null>(null);
  const setFocusedId = useSetAtom(placesFocusedIdAtom);

  // Track container size for crisp canvas dims.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      const h = entry.contentRect.height;
      setSize(Math.floor(Math.min(w, h)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size <= 0) return;

    const isDark = resolvedTheme === "dark";
    const dimmed = isDark ? DIMMED_DARK : DIMMED_LIGHT;
    const filtersActive = selectedCities.size > 0 || selectedCategories.size > 0;

    // Compute marker visual state from current filters + focus.
    function buildMarkers(focusId: string | null) {
      return items.map((item) => {
        const matches =
          (!selectedCities.size || selectedCities.has(item.city)) &&
          (!selectedCategories.size || selectedCategories.has(item.category));
        const active = !filtersActive || matches;
        const focused = focusId === item.id;
        return {
          id: item.id,
          location: [item.lat, item.lng] as [number, number],
          size: focused ? 0.05 : active ? 0.022 : 0.012,
          color: active ? ACCENT : dimmed,
        };
      });
    }

    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width: size * dpr,
      height: size * dpr,
      phi: phiRef.current,
      theta: thetaRef.current,
      scale: SCALE,
      dark: isDark ? 1 : 0,
      diffuse: isDark ? 1.2 : 1.0,
      mapSamples: 16000,
      mapBrightness: isDark ? 4 : 6,
      baseColor: isDark ? [0.3, 0.3, 0.32] : [1, 1, 1],
      markerColor: ACCENT,
      glowColor: isDark ? [0.25, 0.25, 0.3] : [1, 1, 1],
      markers: buildMarkers(focusedIdRef.current),
    });

    let lastFocusForMarkers = focusedIdRef.current;
    let raf = 0;

    const tick = (now: number) => {
      // Drive animation if active.
      if (modeRef.current === "animating" && animRef.current) {
        const a = animRef.current;
        const t = Math.min(1, (now - a.start) / a.duration);
        const eased = easeOutCubic(t);
        phiRef.current = a.fromPhi + (a.toPhi - a.fromPhi) * eased;
        thetaRef.current = a.fromTheta + (a.toTheta - a.fromTheta) * eased;
        if (t >= 1) {
          animRef.current = null;
          modeRef.current = "focused";
        }
      }
      // No auto-rotation: globe holds still unless dragged or animating.

      // Hit-test under cursor each frame (so rotation moves the hover target).
      if (pointerRef.current && modeRef.current !== "dragging") {
        const px = pointerRef.current.x;
        const py = pointerRef.current.y;
        let bestId: string | null = null;
        let bestDist = HIT_THRESHOLD_PX;
        for (const item of items) {
          const p = projectMarker(
            item.lat,
            item.lng,
            phiRef.current,
            thetaRef.current,
            size,
            SCALE,
          );
          if (!p.visible) continue;
          const dx = p.x - px;
          const dy = p.y - py;
          const d = Math.hypot(dx, dy);
          if (d < bestDist) {
            bestDist = d;
            bestId = item.id;
          }
        }
        if (bestId !== hoveredIdRef.current) {
          hoveredIdRef.current = bestId;
          setHoveredItem(bestId ? items.find((it) => it.id === bestId) || null : null);
        }
      }

      // Reposition tooltip every frame to track rotation.
      if (tooltipRef.current && hoveredIdRef.current) {
        const item = items.find((it) => it.id === hoveredIdRef.current);
        if (item) {
          const p = projectMarker(
            item.lat,
            item.lng,
            phiRef.current,
            thetaRef.current,
            size,
            SCALE,
          );
          if (p.visible) {
            tooltipRef.current.style.opacity = "1";
            tooltipRef.current.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(8px, -50%)`;
          } else {
            tooltipRef.current.style.opacity = "0";
          }
        }
      } else if (tooltipRef.current) {
        tooltipRef.current.style.opacity = "0";
      }

      // Rebuild markers only when focus changes (cheap GPU buffer rebuild).
      if (focusedIdRef.current !== lastFocusForMarkers) {
        globe.update({ markers: buildMarkers(focusedIdRef.current) });
        lastFocusForMarkers = focusedIdRef.current;
      }

      globe.update({ phi: phiRef.current, theta: thetaRef.current });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      globe.destroy();
    };
  }, [items, selectedCities, selectedCategories, resolvedTheme, size]);

  // Pointer handlers
  const updatePointerPos = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    pointerRef.current = { x: clientX - rect.left, y: clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { x: e.clientX, y: e.clientY, phi: phiRef.current, moved: 0 };
    modeRef.current = "dragging";
    // cancel any in-flight animation
    animRef.current = null;
    canvasRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    updatePointerPos(e.clientX, e.clientY);
    if (dragRef.current) {
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      dragRef.current.moved = Math.max(dragRef.current.moved, Math.hypot(dx, dy));
      phiRef.current = dragRef.current.phi + dx / 150;
    }
  };

  const animateTo = (targetPhi: number, targetTheta: number, duration = 700) => {
    const startPhi = phiRef.current;
    const delta = shortestPhiDelta(startPhi, targetPhi);
    animRef.current = {
      fromPhi: startPhi,
      toPhi: startPhi + delta,
      fromTheta: thetaRef.current,
      toTheta: targetTheta,
      start: performance.now(),
      duration,
    };
    modeRef.current = "animating";
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    canvasRef.current?.releasePointerCapture(e.pointerId);

    // Click vs drag
    if (drag && drag.moved <= CLICK_MAX_DRAG_PX) {
      if (hoveredIdRef.current) {
        const item = items.find((it) => it.id === hoveredIdRef.current);
        if (item) {
          focusedIdRef.current = item.id;
          setFocusedId(item.id);
          // Bring marker to center: phi target points the marker's longitude toward camera
          const targetPhi = (-item.lng * Math.PI) / 180;
          const targetTheta = Math.max(-0.9, Math.min(0.9, (item.lat * Math.PI) / 180));
          animateTo(targetPhi, targetTheta);
          return;
        }
      }
      // Click on empty globe = clear focus, resume rotation
      if (focusedIdRef.current) {
        focusedIdRef.current = null;
        setFocusedId(null);
      }
    }

    // After drag: if we were focused, stay focused; else return to idle/rotating
    if (focusedIdRef.current) {
      modeRef.current = "focused";
    } else {
      modeRef.current = "idle";
    }
  };

  const onPointerLeave = () => {
    pointerRef.current = null;
    if (hoveredIdRef.current) {
      hoveredIdRef.current = null;
      setHoveredItem(null);
    }
  };

  return (
    <div
      ref={containerRef}
      className={
        "relative flex aspect-square w-full max-w-full items-center justify-center " +
        (className ?? "")
      }
    >
      <canvas
        ref={canvasRef}
        aria-label="Interactive globe of places"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        style={{
          width: size,
          height: size,
          cursor: hoveredItem ? "pointer" : "grab",
          touchAction: "none",
          contain: "layout paint size",
        }}
      />
      <div
        ref={tooltipRef}
        role="tooltip"
        aria-hidden={hoveredItem ? "false" : "true"}
        className="bg-elevated border-secondary text-primary pointer-events-none absolute top-0 left-0 z-10 rounded border px-2 py-1 text-xs shadow-md transition-opacity duration-150"
        style={{ opacity: 0 }}
      >
        {hoveredItem && (
          <>
            <div className="font-medium">{hoveredItem.name}</div>
            {(hoveredItem.city || hoveredItem.category) && (
              <div className="text-tertiary text-[11px]">
                {[hoveredItem.city, hoveredItem.category].filter(Boolean).join(" · ")}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
