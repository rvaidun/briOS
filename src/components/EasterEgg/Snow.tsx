"use client";

import { useEffect, useRef } from "react";

import { useCanvasOverlay } from "./useCanvasOverlay";
import { useEggTriggers } from "./useEggTriggers";

type Flake = {
  x: number;
  y: number;
  vy: number;
  size: number;
  sway: number;
  phase: number;
  freq: number;
  alpha: number;
};

function makeFlake(x: number, y: number): Flake {
  return {
    x,
    y,
    vy: 0.6 + Math.random() * 1.4,
    size: 1.2 + Math.random() * 2.5,
    sway: 0.3 + Math.random() * 1.2,
    phase: Math.random() * Math.PI * 2,
    freq: 0.01 + Math.random() * 0.02,
    alpha: 0.6 + Math.random() * 0.4,
  };
}

function spawnPuff(flakes: Flake[], x: number, y: number) {
  const count = 20;
  for (let i = 0; i < count; i++) {
    const flake = makeFlake(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 30);
    flake.vy = 0.3 + Math.random() * 1.2;
    flakes.push(flake);
  }
}

function spawnBlizzard(flakes: Flake[]) {
  const count = 120;
  for (let i = 0; i < count; i++) {
    flakes.push(makeFlake(Math.random() * window.innerWidth, -Math.random() * 200));
  }
}

const AMBIENT_DENSITY = 0.6;
// Ambient snowfall runs for this long after mount and after each ⌘E / shake.
// Existing flakes still finish falling; only the fresh-spawn stream stops.
const AMBIENT_WINDOW_MS = 15_000;

export function Snow() {
  const flakes = useRef<Flake[]>([]);
  const ambientUntil = useRef(0);

  const startAmbient = () => {
    ambientUntil.current = Date.now() + AMBIENT_WINDOW_MS;
  };

  useEggTriggers({
    onLaunch: () => {
      spawnBlizzard(flakes.current);
      startAmbient();
    },
    onPoint: (x, y) => spawnPuff(flakes.current, x, y),
  });

  useEffect(() => {
    startAmbient();
    return () => {
      flakes.current = [];
    };
  }, []);

  const canvasRef = useCanvasOverlay((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);

    // Ambient spawn along the top edge, only during the active window.
    if (Date.now() < ambientUntil.current && Math.random() < AMBIENT_DENSITY) {
      flakes.current.push(makeFlake(Math.random() * w, -8));
    }

    const list = flakes.current;
    ctx.fillStyle = "#ffffff";
    for (let i = list.length - 1; i >= 0; i--) {
      const f = list[i];
      f.y += f.vy;
      f.phase += f.freq;
      f.x += Math.sin(f.phase) * f.sway * 0.3;
      if (f.y > h + 10 || f.x < -20 || f.x > w + 20) {
        list.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = f.alpha;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[100]"
    />
  );
}
