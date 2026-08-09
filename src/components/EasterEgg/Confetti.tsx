"use client";

import { useEffect, useRef } from "react";

import { useCanvasOverlay } from "./useCanvasOverlay";
import { useEggTriggers } from "./useEggTriggers";

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rotation: number;
  rotationSpeed: number;
  life: number;
  maxLife: number;
  color: string;
};

const COLORS = ["#ff2d55", "#ffd60a", "#34c759", "#af52de", "#0a84ff", "#ff9500", "#ffffff"];

function spawnBurst(pieces: Piece[], x: number, y: number, upward: boolean) {
  const count = 80 + Math.floor(Math.random() * 40);
  for (let i = 0; i < count; i++) {
    const angle = upward
      ? -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.6
      : Math.random() * Math.PI * 2;
    const speed = upward ? 6 + Math.random() * 6 : 2 + Math.random() * 4;
    pieces.push({
      x,
      y,
      vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 0.5,
      vy: Math.sin(angle) * speed,
      w: 6 + Math.random() * 4,
      h: 3 + Math.random() * 3,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.4,
      life: 0,
      maxLife: 180 + Math.random() * 60,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    });
  }
}

export function Confetti() {
  const pieces = useRef<Piece[]>([]);

  const launchPoppers = () => {
    // Two cannons firing upward from the bottom corners.
    spawnBurst(pieces.current, window.innerWidth * 0.05, window.innerHeight * 0.95, true);
    spawnBurst(pieces.current, window.innerWidth * 0.95, window.innerHeight * 0.95, true);
  };

  useEggTriggers({
    onLaunch: launchPoppers,
    onPoint: (x, y) => spawnBurst(pieces.current, x, y, false),
  });

  useEffect(() => {
    launchPoppers();
    return () => {
      pieces.current = [];
    };
  }, []);

  const canvasRef = useCanvasOverlay((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const list = pieces.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life++;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.vx *= 0.995;
      p.rotation += p.rotationSpeed;
      const alpha = 1 - p.life / p.maxLife;
      if (alpha <= 0 || p.y > h + 40) {
        list.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
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
