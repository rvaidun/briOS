"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const BALL_COLORS = [
  "#0ea5e9", // sky
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ef4444", // red
];

export function NotFoundGame() {
  const arenaRef = useRef<HTMLDivElement>(null);
  const homeRef = useRef<HTMLSpanElement>(null);
  const ballRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({
    x: 0,
    y: 0,
    vx: 2.2,
    vy: 1.7,
    ballW: 0,
    ballH: 0,
    arenaW: 0,
    arenaH: 0,
    paused: true,
    colorIndex: 0,
  });

  const [released, setReleased] = useState(false);

  const measure = useCallback(() => {
    const arena = arenaRef.current;
    const ball = ballRef.current;
    if (!arena || !ball) return;
    stateRef.current.arenaW = arena.clientWidth;
    stateRef.current.arenaH = arena.clientHeight;
    stateRef.current.ballW = ball.offsetWidth;
    stateRef.current.ballH = ball.offsetHeight;
  }, []);

  const snapBallToHome = useCallback(() => {
    const arena = arenaRef.current;
    const ball = ballRef.current;
    const home = homeRef.current;
    if (!arena || !ball || !home) return;
    const arenaRect = arena.getBoundingClientRect();
    const homeRect = home.getBoundingClientRect();
    stateRef.current.x = homeRect.left - arenaRect.left;
    stateRef.current.y = homeRect.top - arenaRect.top;
    stateRef.current.ballW = ball.offsetWidth;
    stateRef.current.ballH = ball.offsetHeight;
    ball.style.transform = `translate3d(${stateRef.current.x}px, ${stateRef.current.y}px, 0)`;
  }, []);

  useEffect(() => {
    measure();
    snapBallToHome();

    const onResize = () => {
      measure();
      if (stateRef.current.paused) snapBallToHome();
    };
    window.addEventListener("resize", onResize);

    // Let the page read as "404" for a beat before the 0 flies off.
    const releaseTimer = window.setTimeout(() => {
      measure();
      snapBallToHome();
      const angle = (Math.random() * Math.PI) / 2 + Math.PI / 6;
      const speed = 3;
      const dir = Math.random() < 0.5 ? -1 : 1;
      stateRef.current.vx = Math.cos(angle) * speed * dir;
      stateRef.current.vy = Math.sin(angle) * speed;
      stateRef.current.paused = false;
      setReleased(true);
    }, 1400);

    let raf = 0;
    const step = () => {
      const s = stateRef.current;
      const ball = ballRef.current;
      if (!s.paused && ball && s.arenaW > 0 && s.arenaH > 0) {
        s.x += s.vx;
        s.y += s.vy;

        let hit = false;

        if (s.x <= 0) {
          s.x = 0;
          s.vx = Math.abs(s.vx);
          hit = true;
        } else if (s.x + s.ballW >= s.arenaW) {
          s.x = s.arenaW - s.ballW;
          s.vx = -Math.abs(s.vx);
          hit = true;
        }

        if (s.y <= 0) {
          s.y = 0;
          s.vy = Math.abs(s.vy);
          hit = true;
        } else if (s.y + s.ballH >= s.arenaH) {
          s.y = s.arenaH - s.ballH;
          s.vy = -Math.abs(s.vy);
          hit = true;
        }

        if (hit) {
          s.colorIndex = (s.colorIndex + 1) % BALL_COLORS.length;
          ball.style.color = BALL_COLORS[s.colorIndex];
        }

        ball.style.transform = `translate3d(${s.x}px, ${s.y}px, 0)`;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    return () => {
      window.clearTimeout(releaseTimer);
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [measure, snapBallToHome]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6">
      <div
        ref={arenaRef}
        className="relative flex min-h-[280px] w-full max-w-3xl flex-1 items-center justify-center select-none"
      >
        <div className="text-primary flex items-center justify-center font-serif text-[clamp(6rem,22vw,14rem)] leading-none tracking-tight">
          <span>4</span>
          <span
            ref={homeRef}
            className="inline-block px-1 transition-opacity duration-200"
            style={{ opacity: released ? 0 : 1 }}
            aria-hidden={released}
          >
            0
          </span>
          <span>4</span>
        </div>

        <div
          ref={ballRef}
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 inline-flex font-serif text-[clamp(6rem,22vw,14rem)] leading-none tracking-tight will-change-transform"
          style={{
            color: BALL_COLORS[0],
            padding: "0 0.25rem",
            opacity: released ? 1 : 0,
            transition: "opacity 200ms ease-out",
          }}
        >
          0
        </div>
      </div>

      <div className="flex flex-col items-center pb-16">
        <Link
          href="/"
          className="border-primary text-primary hover:bg-tertiary rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
        >
          ← Take me home
        </Link>
      </div>
    </div>
  );
}
