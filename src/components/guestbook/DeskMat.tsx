import type { PropsWithChildren } from "react";

import { cn } from "@/lib/utils";

// SVG turbulence noise, encoded once. `feTurbulence` at high baseFrequency
// gives fine paper grain; blended over the green mat it adds tactile depth
// without an image asset. Kept small (single 220px tile that repeats).
const GRAIN_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'>
       <filter id='n'>
         <feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/>
         <feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.55 0'/>
       </filter>
       <rect width='100%' height='100%' filter='url(#n)' opacity='0.55'/>
     </svg>`,
  );

// Green cutting-mat background. Layered top-to-bottom: paper grain, faint
// square grid, subtle diagonal cross-hatch, vignette, base color.
export function DeskMat({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{
        backgroundColor: "#1c5842",
        backgroundImage: [
          `url("${GRAIN_SVG}")`,
          "repeating-linear-gradient(45deg, rgba(0,0,0,0.05) 0 1px, transparent 1px 60px)",
          "repeating-linear-gradient(-45deg, rgba(0,0,0,0.05) 0 1px, transparent 1px 60px)",
          "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)",
          "linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
          "radial-gradient(ellipse at center, rgba(255,255,255,0.06), rgba(0,0,0,0.25) 90%)",
        ].join(", "),
        backgroundSize: "220px 220px, 60px 60px, 60px 60px, 24px 24px, 24px 24px, 100% 100%",
        backgroundBlendMode: "overlay, normal, normal, normal, normal, normal",
      }}
    >
      {children}
    </div>
  );
}
