"use client";

import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePlaylistGraph } from "@/hooks/usePlaylistGraph";
import type { PlaylistGraph, PlaylistGraphNode } from "@/lib/db/playlist-graph";

// force-graph is canvas-only and touches window/document at import time; a
// dynamic import with ssr:false keeps Next's server build from choking on it.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

type ForceNode = PlaylistGraphNode & {
  degree: number;
  neighbors: Set<string>;
  brightness: number; // 0..1 — used as alpha for track nodes and their labels
  x?: number;
  y?: number;
};

type ForceEdge = { source: string | ForceNode; target: string | ForceNode };

const PLAYLIST_COLOR = "#1db954"; // Spotify green
const TRACK_COLOR = "#94a3b8"; // slate-400
const HIGHLIGHT_COLOR = "#f97316"; // orange-500
// Singletons render nearly invisible so they form spatial context rather than
// competing with the shared-song hubs. Hovering/focusing a playlist still
// pulls them into full contrast.
const MIN_TRACK_BRIGHTNESS = 0.08;

export function PlaylistForceGraph({ initialData }: { initialData: PlaylistGraph }) {
  const { data } = usePlaylistGraph(initialData);
  const graph = data ?? initialData;

  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [hovered, setHovered] = useState<ForceNode | null>(null);
  // Click a node to "focus" — everything outside its 1-hop neighborhood fades
  // to a faint haze so you can inspect a single cluster without the hairball.
  // Click empty space to reset.
  const [focused, setFocused] = useState<ForceNode | null>(null);
  // Percent of tracks (by degree, highest first) that get permanent labels.
  // Default 1 → only the true mega-hubs are labeled at first paint; slider
  // lets you push toward "label everything".
  const [labelPct, setLabelPct] = useState(1);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  // Safari (desktop + iOS) has a much tighter per-tab memory ceiling than
  // Chromium/Gecko; eagerly decoding ~1.7k remote album covers OOM-kills the
  // tab. Gate image loading below to hub tracks only when we detect Safari.
  const isSafari = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent;
    return /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(ua);
  }, []);
  const labelColor = isDark ? "#f5f5f5" : "#111";
  const labelDimColor = isDark ? "rgba(200,200,200,0.35)" : "rgba(100,100,100,0.4)";
  const strokeColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Precompute per-node neighbor sets, degree, and brightness. Brightness is
  // normalized across track nodes so the most-shared song is fully bright and
  // singletons fade toward MIN_TRACK_BRIGHTNESS — the graph reads as a
  // heatmap of "which songs are load-bearing across playlists."
  //
  // Also stash the sorted track degrees so the label-threshold memo (below)
  // can pick a percentile cutoff without re-walking the whole graph on each
  // slider tick.
  const { forceData, sortedTrackDegrees } = useMemo(() => {
    const nodeMap = new Map<string, ForceNode>();
    for (const n of graph.nodes)
      nodeMap.set(n.id, { ...n, neighbors: new Set(), degree: 0, brightness: 1 });
    for (const e of graph.edges) {
      nodeMap.get(e.source)?.neighbors.add(e.target);
      nodeMap.get(e.target)?.neighbors.add(e.source);
    }
    let trackMax = 1;
    const trackDegrees: number[] = [];
    for (const n of nodeMap.values()) {
      n.degree = n.neighbors.size;
      if (n.type === "track") {
        if (n.degree > trackMax) trackMax = n.degree;
        trackDegrees.push(n.degree);
      }
    }
    for (const n of nodeMap.values()) {
      if (n.type === "track") {
        // log scale so a track in 20 playlists doesn't crush the rest to zero.
        const t = Math.log2(1 + n.degree) / Math.log2(1 + trackMax);
        n.brightness = MIN_TRACK_BRIGHTNESS + (1 - MIN_TRACK_BRIGHTNESS) * t;
      }
    }
    trackDegrees.sort((a, b) => a - b);

    // Sort so high-degree tracks render last (on top of the singleton haze).
    const nodes = Array.from(nodeMap.values()).sort((a, b) => {
      if (a.type !== b.type) return a.type === "playlist" ? 1 : -1;
      return a.degree - b.degree;
    });
    const links = graph.edges.map((e) => ({ source: e.source, target: e.target }));

    return {
      forceData: { nodes, links },
      sortedTrackDegrees: trackDegrees,
    };
  }, [graph]);

  // Derive the "always label" threshold from the slider — the (100 - labelPct)
  // percentile of the sorted degree array. Floored at 1 so labelPct=100 truly
  // labels every track including singletons.
  const alwaysLabelTrackDegree = useMemo(() => {
    if (sortedTrackDegrees.length === 0) return Number.POSITIVE_INFINITY;
    const cutoffIdx = Math.floor(sortedTrackDegrees.length * (1 - labelPct / 100));
    const clamped = Math.min(Math.max(cutoffIdx, 0), sortedTrackDegrees.length - 1);
    return Math.max(1, sortedTrackDegrees[clamped] ?? 1);
  }, [sortedTrackDegrees, labelPct]);

  // Tune the force simulation for readability at this scale: strong repulsion
  // pushes singletons out to the margins and longer link distance separates
  // playlist clusters, turning the hairball into readable communities.
  useEffect(() => {
    const g = graphRef.current;
    if (!g?.d3Force) return;
    g.d3Force("charge")?.strength(-45).distanceMax(400);
    g.d3Force("link")?.distance(60);
    g.d3ReheatSimulation?.();
  }, [forceData]);

  // Lazily fetch album art per track. Successful loads stash the HTMLImageElement
  // on a cache the draw loop reads from — until then, the node renders as a
  // fallback dot. Failed loads mark the entry as null so we don't retry every
  // animation frame. A ref (not state) keeps the object identity stable so
  // ForceGraph2D doesn't reset on each image landing.
  const imageCacheRef = useRef<Map<string, HTMLImageElement | null>>(new Map());
  const [, forceTick] = useState(0);
  useEffect(() => {
    const cache = imageCacheRef.current;
    let cancelled = false;
    let pending = 0;
    let sinceLastFlush = 0;
    for (const n of forceData.nodes) {
      if (n.type !== "track" || !n.imageUrl) continue;
      if (cache.has(n.id)) continue;
      // On Safari, only decode covers for tracks that will actually be labeled
      // (the degree-threshold hubs). Everything else stays a colored dot —
      // otherwise decoding ~1.7k images crashes the tab. As the label slider
      // moves, this effect re-runs and pulls the newly-eligible covers in.
      if (isSafari && n.degree < alwaysLabelTrackDegree) continue;
      cache.set(n.id, null); // placeholder to avoid double-loads
      pending += 1;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (cancelled) return;
        cache.set(n.id, img);
        sinceLastFlush += 1;
        // Batch redraw triggers — one setState per animation frame is plenty
        // and avoids a re-render storm on the first paint.
        if (sinceLastFlush >= 24 || pending <= 1) {
          sinceLastFlush = 0;
          forceTick((v) => v + 1);
        }
        pending -= 1;
      };
      img.onerror = () => {
        pending -= 1;
      };
      img.src = n.imageUrl;
    }
    return () => {
      cancelled = true;
    };
  }, [forceData, isSafari, alwaysLabelTrackDegree]);

  // Focus (click) takes precedence over hover — locked-in focus persists so
  // you can hover other nodes to inspect edges without breaking the frame.
  const focalNode = focused ?? hovered;
  const highlightSet = useMemo(() => {
    if (!focalNode) return null;
    const s = new Set<string>([focalNode.id]);
    focalNode.neighbors.forEach((id) => s.add(id));
    return s;
  }, [focalNode]);

  const nodeCanvasObject = useCallback(
    (rawNode: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const node = rawNode as ForceNode;
      const isPlaylist = node.type === "playlist";
      const isHighlighted = highlightSet?.has(node.id) ?? false;
      const isDimmed = highlightSet !== null && !isHighlighted;
      // Track radius scales with degree so heavily-shared songs also read as
      // bigger anchors, not just brighter dots.
      const radius = isPlaylist ? 6 : 2 + Math.min(8, 1.6 * Math.log2(1 + node.degree));
      const x = node.x ?? 0;
      const y = node.y ?? 0;

      // Track brightness (per-node, degree-derived) is the base alpha for
      // tracks; hover state overrides it. Playlists stay solid so the
      // "anchor" nodes read clearly against the sea of songs.
      const baseAlpha = isPlaylist ? 1 : node.brightness;
      ctx.globalAlpha = isHighlighted ? 1 : isDimmed ? Math.min(baseAlpha, 0.15) : baseAlpha;

      const img = !isPlaylist ? imageCacheRef.current.get(node.id) : null;
      if (img) {
        // Clip to a circle, draw the album art, then stroke with either the
        // highlight color or a subtle border. Skip stroke when dimmed to keep
        // the fade clean.
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, x - radius, y - radius, radius * 2, radius * 2);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.lineWidth = isHighlighted ? 1.5 : 0.4;
        ctx.strokeStyle = isHighlighted ? HIGHLIGHT_COLOR : strokeColor;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.fillStyle = isHighlighted
          ? HIGHLIGHT_COLOR
          : isPlaylist
            ? PLAYLIST_COLOR
            : TRACK_COLOR;
        ctx.fill();
      }

      // Labels: always for playlists and for "hub" tracks (above-average
      // degree); for the rest only on hover or when zoomed in.
      const showLabel =
        isPlaylist ||
        isHighlighted ||
        globalScale > 3 ||
        (node.type === "track" && node.degree >= alwaysLabelTrackDegree);
      if (showLabel) {
        const label = isPlaylist
          ? node.name
          : `${node.name}${node.type === "track" && node.artist ? " — " + node.artist : ""}`;
        const fontSize = isPlaylist ? 12 / globalScale : 8 / globalScale;
        ctx.font = `${fontSize}px system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = isDimmed ? labelDimColor : labelColor;
        ctx.fillText(label, x, y + radius + 1);
      }
      ctx.globalAlpha = 1;
    },
    [highlightSet, labelColor, labelDimColor, strokeColor, alwaysLabelTrackDegree],
  );

  const restingLinkColor = isDark ? "rgba(148,163,184,0.22)" : "rgba(148,163,184,0.35)";
  const dimmedLinkColor = isDark ? "rgba(148,163,184,0.05)" : "rgba(148,163,184,0.08)";
  const linkColor = useCallback(
    (rawLink: object) => {
      const l = rawLink as ForceEdge;
      if (!highlightSet) return restingLinkColor;
      const s = typeof l.source === "string" ? l.source : l.source.id;
      const t = typeof l.target === "string" ? l.target : l.target.id;
      const touchesFocal =
        s === focalNode?.id ||
        t === focalNode?.id ||
        (highlightSet.has(s) && highlightSet.has(t));
      return touchesFocal ? "rgba(249,115,22,0.85)" : dimmedLinkColor;
    },
    [highlightSet, focalNode, restingLinkColor, dimmedLinkColor],
  );

  return (
    <div ref={containerRef} className="relative h-full w-full bg-white dark:bg-neutral-950">
      <ForceGraph2D
        width={size.width}
        height={size.height}
        graphData={forceData}
        nodeId="id"
        nodeCanvasObject={nodeCanvasObject}
        nodePointerAreaPaint={(rawNode, color, ctx) => {
          const node = rawNode as ForceNode;
          const drawRadius =
            node.type === "playlist" ? 6 : 2 + Math.min(8, 1.6 * Math.log2(1 + node.degree));
          // Inflate slightly so tiny singletons are still clickable.
          const radius = Math.max(5, drawRadius + 2);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI);
          ctx.fill();
        }}
        linkColor={linkColor}
        linkWidth={(rawLink) => {
          const l = rawLink as ForceEdge;
          if (!highlightSet) return 0.4;
          const s = typeof l.source === "string" ? l.source : l.source.id;
          const t = typeof l.target === "string" ? l.target : l.target.id;
          return s === focalNode?.id || t === focalNode?.id ? 1.2 : 0.4;
        }}
        onNodeHover={(node) => setHovered((node as ForceNode | null) ?? null)}
        onNodeClick={(node) => setFocused((node as ForceNode | null) ?? null)}
        onBackgroundClick={() => setFocused(null)}
        // Wider layout so shared-song clusters have room to separate from the
        // singleton haze. Stronger repulsion + longer link distance turn the
        // hairball into readable communities.
        d3AlphaDecay={0.015}
        d3VelocityDecay={0.35}
        cooldownTicks={200}
        ref={graphRef}
        backgroundColor="transparent"
      />
      <Legend focused={focused} onClearFocus={() => setFocused(null)} />
      <LabelPctControl value={labelPct} onChange={setLabelPct} threshold={alwaysLabelTrackDegree} />
    </div>
  );
}

function LabelPctControl({
  value,
  onChange,
  threshold,
}: {
  value: number;
  onChange: (v: number) => void;
  threshold: number;
}) {
  return (
    <div className="border-secondary text-secondary absolute top-3 right-3 flex flex-col gap-1.5 rounded-md border bg-white/90 px-3 py-2 text-xs backdrop-blur dark:bg-neutral-950/90">
      <label className="flex items-center gap-2">
        <span>Label top</span>
        <span className="text-primary min-w-[2.25rem] text-right font-semibold tabular-nums">
          {value}%
        </span>
      </label>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-40 accent-[#1db954]"
      />
      <span className="tabular-nums">
        threshold: ≥{Number.isFinite(threshold) ? threshold : "—"} playlists
      </span>
    </div>
  );
}

function Legend({
  focused,
  onClearFocus,
}: {
  focused: ForceNode | null;
  onClearFocus: () => void;
}) {
  return (
    <div className="border-secondary text-secondary absolute top-3 left-3 flex flex-col gap-1 rounded-md border bg-white/90 px-3 py-2 text-xs backdrop-blur dark:bg-neutral-950/90">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: PLAYLIST_COLOR }}
          />
          Playlist
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-neutral-400" />
          Song (brighter = shared)
        </span>
      </div>
      {focused ? (
        <button
          type="button"
          onClick={onClearFocus}
          className="text-primary text-left underline-offset-2 hover:underline"
        >
          Focused: {focused.name} — click to clear
        </button>
      ) : (
        <span className="text-secondary">Click any node to focus its cluster</span>
      )}
    </div>
  );
}
