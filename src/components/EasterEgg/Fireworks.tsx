"use client";

import { useEffect, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const batchTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const launchCelebration = () => {
    const count = 4 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const t = setTimeout(() => {
        launchBurst(
          particlesRef.current,
          window.innerWidth * (0.15 + Math.random() * 0.7),
          window.innerHeight * (0.2 + Math.random() * 0.35),
        );
      }, i * 180);
      batchTimeoutsRef.current.push(t);
    }
  };

  useHotkeys(
    "mod+e",
    () => {
      launchCelebration();
    },
    { enableOnFormTags: true, preventDefault: true },
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const handleClick = (e: MouseEvent) => {
      launchBurst(particlesRef.current, e.clientX, e.clientY);
    };
    document.addEventListener("click", handleClick);

    // Shake-to-launch on devices that expose devicemotion without
    // needing an explicit permission prompt (Android, older iOS).
    // iOS 13+ requires DeviceMotionEvent.requestPermission() from a
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
      const dx = acc.x - lastX;
      const dy = acc.y - lastY;
      const dz = acc.z - lastZ;
      const delta = Math.sqrt(dx * dx + dy * dy + dz * dz);
      lastX = acc.x;
      lastY = acc.y;
      lastZ = acc.z;
      const now = Date.now();
      if (delta > SHAKE_THRESHOLD && now - lastShake > SHAKE_COOLDOWN) {
        lastShake = now;
        launchCelebration();
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

    // Kick off with a welcome batch so the egg announces itself.
    launchCelebration();

    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life++;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.06;
        p.vx *= 0.99;
        p.vy *= 0.99;
        const alpha = 1 - p.life / p.maxLife;
        if (alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      batchTimeoutsRef.current.forEach(clearTimeout);
      batchTimeoutsRef.current = [];
      window.removeEventListener("resize", resize);
      document.removeEventListener("click", handleClick);
      if (!needsMotionPermission) {
        window.removeEventListener("devicemotion", handleMotion);
      }
      particlesRef.current = [];
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[100]"
    />
  );
}
