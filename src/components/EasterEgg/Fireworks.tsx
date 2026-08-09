"use client";

import { useEffect, useRef } from "react";

import { useCanvasOverlay } from "./useCanvasOverlay";
import { useEggTriggers } from "./useEggTriggers";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
};

const COLORS = ["#ff3b30", "#ffffff", "#0a84ff", "#ffd60a"];

function launchBurst(particles: Particle[], x: number, y: number) {
  const count = 60 + Math.floor(Math.random() * 30);
  const primary = COLORS[Math.floor(Math.random() * COLORS.length)];
  const secondary = COLORS[Math.floor(Math.random() * COLORS.length)];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.15;
    const speed = 2 + Math.random() * 3.5;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0,
      maxLife: 60 + Math.random() * 50,
      color: Math.random() > 0.5 ? primary : secondary,
      size: 1.5 + Math.random() * 2,
    });
  }
}

export function Fireworks() {
  const particles = useRef<Particle[]>([]);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  const launchCelebration = () => {
    const count = 4 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const t = setTimeout(() => {
        launchBurst(
          particles.current,
          window.innerWidth * (0.15 + Math.random() * 0.7),
          window.innerHeight * (0.2 + Math.random() * 0.35),
        );
      }, i * 180);
      timeouts.current.push(t);
    }
  };

  useEggTriggers({
    onLaunch: launchCelebration,
    onPoint: (x, y) => launchBurst(particles.current, x, y),
  });

  useEffect(() => {
    launchCelebration();
    const localTimeouts = timeouts.current;
    return () => {
      localTimeouts.forEach(clearTimeout);
      timeouts.current = [];
      particles.current = [];
    };
  }, []);

  const canvasRef = useCanvasOverlay((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const list = particles.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life++;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06;
      p.vx *= 0.99;
      p.vy *= 0.99;
      const alpha = 1 - p.life / p.maxLife;
      if (alpha <= 0) {
        list.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
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
