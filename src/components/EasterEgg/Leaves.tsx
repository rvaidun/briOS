"use client";

import { useEffect, useRef } from "react";

import { useCanvasOverlay } from "./useCanvasOverlay";
import { useEggTriggers } from "./useEggTriggers";

type Leaf = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  rotationSpeed: number;
  swayPhase: number;
  swayFreq: number;
  swayAmp: number;
  color: string;
};

const COLORS = ["#b7410e", "#c46200", "#d68910", "#a04000", "#7d2b0a", "#e67e22", "#8b3a1e"];

function makeLeaf(x: number, y: number): Leaf {
  return {
    x,
    y,
    vx: (Math.random() - 0.5) * 0.4,
    vy: 0.5 + Math.random() * 1.2,
    size: 6 + Math.random() * 7,
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.06,
    swayPhase: Math.random() * Math.PI * 2,
    swayFreq: 0.02 + Math.random() * 0.02,
    swayAmp: 0.6 + Math.random() * 1.4,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  };
}

function spawnToss(leaves: Leaf[], x: number, y: number) {
  const count = 12;
  for (let i = 0; i < count; i++) {
    const leaf = makeLeaf(x, y);
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.8;
    const speed = 2 + Math.random() * 3;
    leaf.vx = Math.cos(angle) * speed;
    leaf.vy = Math.sin(angle) * speed;
    leaves.push(leaf);
  }
}

function spawnGust(leaves: Leaf[]) {
  const count = 60;
  for (let i = 0; i < count; i++) {
    const leaf = makeLeaf(-20 - Math.random() * 100, Math.random() * window.innerHeight * 0.7);
    leaf.vx = 2 + Math.random() * 3;
    leaf.vy = 0.5 + Math.random() * 1;
    leaves.push(leaf);
  }
}

const AMBIENT_DENSITY = 0.25;
// Ambient leaf-fall runs for this long after mount and after each ⌘E / shake.
// Existing leaves still finish falling; only the fresh-spawn stream stops.
const AMBIENT_WINDOW_MS = 15_000;

function drawLeaf(ctx: CanvasRenderingContext2D, leaf: Leaf) {
  ctx.save();
  ctx.translate(leaf.x, leaf.y);
  ctx.rotate(leaf.rotation);
  ctx.fillStyle = leaf.color;
  ctx.beginPath();
  ctx.ellipse(0, 0, leaf.size, leaf.size * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-leaf.size, 0);
  ctx.lineTo(leaf.size, 0);
  ctx.stroke();
  ctx.restore();
}

export function Leaves() {
  const leaves = useRef<Leaf[]>([]);
  const ambientUntil = useRef(0);

  const startAmbient = () => {
    ambientUntil.current = Date.now() + AMBIENT_WINDOW_MS;
  };

  useEggTriggers({
    onLaunch: () => {
      spawnGust(leaves.current);
      startAmbient();
    },
    onPoint: (x, y) => spawnToss(leaves.current, x, y),
  });

  useEffect(() => {
    startAmbient();
    return () => {
      leaves.current = [];
    };
  }, []);

  const canvasRef = useCanvasOverlay((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);

    if (Date.now() < ambientUntil.current && Math.random() < AMBIENT_DENSITY) {
      leaves.current.push(makeLeaf(Math.random() * w, -15));
    }

    const list = leaves.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const l = list[i];
      l.swayPhase += l.swayFreq;
      l.x += l.vx + Math.sin(l.swayPhase) * l.swayAmp * 0.3;
      l.y += l.vy;
      l.vy = Math.min(l.vy + 0.008, 1.8);
      l.rotation += l.rotationSpeed;
      if (l.y > h + 20 || l.x < -40 || l.x > w + 40) {
        list.splice(i, 1);
        continue;
      }
      drawLeaf(ctx, l);
    }
  });

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[100]"
    />
  );
}
