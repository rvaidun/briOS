"use client";

import dynamic from "next/dynamic";
import NextImage from "next/image";
import Link from "next/link";
import { useTheme } from "next-themes";
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

// Blit a decoded image to a 32×32 offscreen canvas and return that. Safari-only:
// node radii cap at ~10px so 32px is enough for the fit-to-node render, and
// per-cover memory drops from ~1.6MB (640×640×4 decoded) to ~4KB — the
// difference between "iPhone Safari OOMs the tab" and "totally fine". The
// source Image goes out of scope after this call and gets GC'd. Chrome caches
// the full-res image instead so covers stay sharp when zoomed in.
function downscaleToThumb(img: HTMLImageElement): HTMLCanvasElement | null {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const tctx = c.getContext("2d");
  if (!tctx) return null;
  tctx.drawImage(img, 0, 0, 32, 32);
  return c;
}

export function PlaylistForceGraph({ initialData }: { initialData: PlaylistGraph }) {
  const { data } = usePlaylistGraph(initialData);
  const graph = data ?? initialData;

  const containerRef = useRef<HTMLDivElement>(null);

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
  // Playlists the user has toggled off — their node and every edge sourced
  // from them are stripped out of forceData before layout. Motivating case:
  // "Liked Songs" contains everything and dwarfs every other cluster; hiding
  // it lets the remaining playlist-to-playlist song overlaps become legible.
  const [hiddenPlaylistIds, setHiddenPlaylistIds] = useState<Set<string>>(() => new Set());
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
    // Drop hidden playlists and any edges that source from them. Tracks that
    // only appeared in a hidden playlist end up degree 0 and get filtered out
    // below so the graph actually simplifies (rather than leaving orphan
    // singletons floating around).
    const visibleEdges = graph.edges.filter((e) => !hiddenPlaylistIds.has(e.source));

    const nodeMap = new Map<string, ForceNode>();
    for (const n of graph.nodes) {
      if (n.type === "playlist" && hiddenPlaylistIds.has(n.id)) continue;
      nodeMap.set(n.id, { ...n, neighbors: new Set(), degree: 0, brightness: 1 });
    }
    for (const e of visibleEdges) {
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
    // Orphan tracks (no visible playlist owns them) — remove after degree pass
    // so trackMax reflects only what will actually render.
    for (const [id, n] of nodeMap) {
      if (n.type === "track" && n.degree === 0) nodeMap.delete(id);
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
    const links = visibleEdges.map((e) => ({ source: e.source, target: e.target }));

    return {
      forceData: { nodes, links },
      sortedTrackDegrees: trackDegrees,
    };
  }, [graph, hiddenPlaylistIds]);

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

  // Lazily fetch cover art. Chrome caches the decoded full-res HTMLImageElement
  // so covers stay sharp when the user zooms in. Safari (desktop + iOS) has a
  // much tighter per-tab memory ceiling, so its path (a) blits each cover to
  // a 32×32 offscreen canvas and caches that instead — dropping per-cover
  // memory from ~1.6MB (640×640×4 decoded) to ~4KB — (b) drains the queue
  // serially, one decode in flight so the transient spike stays low, and (c)
  // waits for the user to zoom in before starting at all (see zoomedIn state)
  // so first paint doesn't blow the budget on covers that render as sub-10px
  // dots. Both HTMLImageElement and HTMLCanvasElement are valid drawImage
  // sources so the render loop needs no change.
  const imageCacheRef = useRef<Map<string, HTMLImageElement | HTMLCanvasElement | null>>(new Map());
  const [, forceTick] = useState(0);
  const [zoomedIn, setZoomedIn] = useState(false);

  // Non-Safari: fire all image loads in parallel, batched redraws. Iterates the
  // raw `graph` (not the filtered `forceData`) so toggling playlist visibility
  // doesn't tear down in-flight loads and leave placeholder nulls that starve
  // the retry — which is what used to happen when the "Liked Songs" seed
  // fired post-mount and cancelled every in-flight cover on Chrome.
  useEffect(() => {
    if (isSafari) return;
    const cache = imageCacheRef.current;
    let cancelled = false;

    const queue: Array<{ id: string; url: string }> = [];
    for (const n of graph.nodes) {
      if (!n.imageUrl || cache.has(n.id)) continue;
      cache.set(n.id, null); // placeholder to avoid double-loads
      queue.push({ id: n.id, url: n.imageUrl });
    }

    let pending = queue.length;
    let sinceLastFlush = 0;
    for (const { id, url } of queue) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (cancelled) return;
        cache.set(id, img);
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
      img.src = url;
    }

    return () => {
      cancelled = true;
    };
  }, [graph, isSafari]);

  // Safari: drain the queue serially, and hold off until the user zooms in —
  // at low zoom every cover renders as a sub-10px dot and decoding thousands
  // of them just to draw as dots is what OOMs iPhone Safari.
  useEffect(() => {
    if (!isSafari || !zoomedIn) return;
    const cache = imageCacheRef.current;
    let cancelled = false;

    const queue: Array<{ id: string; url: string }> = [];
    for (const n of graph.nodes) {
      if (!n.imageUrl || cache.has(n.id)) continue;
      cache.set(n.id, null);
      queue.push({ id: n.id, url: n.imageUrl });
    }

    const loadNext = () => {
      if (cancelled) return;
      const next = queue.shift();
      if (!next) return;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (cancelled) return;
        cache.set(next.id, downscaleToThumb(img));
        forceTick((v) => v + 1);
        // Yield a tick between decodes so GC can reclaim the full-size Image
        // before we allocate the next one.
        setTimeout(loadNext, 20);
      };
      img.onerror = () => {
        if (cancelled) return;
        setTimeout(loadNext, 20);
      };
      img.src = next.url;
    };
    loadNext();

    return () => {
      cancelled = true;
    };
  }, [graph, isSafari, zoomedIn]);

  // Seed the hidden set with "Liked Songs" on first mount. It contains every
  // saved track and dwarfs every other cluster in the layout — hiding it by
  // default lets the actual playlist-to-playlist overlaps read cleanly. Run
  // in an effect (not a useState initializer) so SSR and client agree on the
  // initial `PlaylistToggleControl` text and don't trigger a hydration
  // mismatch.
  const likedSongsSeededRef = useRef(false);
  useEffect(() => {
    if (likedSongsSeededRef.current) return;
    likedSongsSeededRef.current = true;
    const liked = graph.nodes.find(
      (n) => n.type === "playlist" && n.name.toLowerCase().includes("liked songs"),
    );
    // One-time seed from client-only data — the setState-in-effect warning
    // doesn't apply since this runs at most once for the lifetime of the
    // component and can't cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (liked) setHiddenPlaylistIds(new Set([liked.id]));
  }, [graph]);

  // Full playlist list for the show/hide control — sourced from the raw graph
  // so hidden playlists still appear (with their checkbox off) and can be
  // toggled back on.
  const allPlaylists = useMemo(
    () =>
      graph.nodes
        .filter((n): n is Extract<PlaylistGraphNode, { type: "playlist" }> => n.type === "playlist")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [graph],
  );

  const togglePlaylistHidden = useCallback((id: string) => {
    setHiddenPlaylistIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // If the toggled playlist was the current focus, drop it so the legend
    // doesn't keep advertising a node that's no longer in the graph.
    setFocused((cur) => (cur && cur.id === id ? null : cur));
  }, []);
  const showAllPlaylists = useCallback(() => setHiddenPlaylistIds(new Set()), []);

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

      const img = imageCacheRef.current.get(node.id);
      if (img) {
        // Clip to a circle, draw the cover art, then stroke. Playlists get
        // a thicker Spotify-green ring so anchor nodes still read distinctly
        // from track covers; tracks keep the subtle theme-derived border.
        // Highlight (hover/focus) overrides both.
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, x - radius, y - radius, radius * 2, radius * 2);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.lineWidth = isHighlighted ? 1.5 : isPlaylist ? 1.5 : 0.4;
        ctx.strokeStyle = isHighlighted
          ? HIGHLIGHT_COLOR
          : isPlaylist
            ? PLAYLIST_COLOR
            : strokeColor;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.fillStyle = isHighlighted ? HIGHLIGHT_COLOR : isPlaylist ? PLAYLIST_COLOR : TRACK_COLOR;
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
        s === focalNode?.id || t === focalNode?.id || (highlightSet.has(s) && highlightSet.has(t));
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
        onZoom={(t: { k: number }) => setZoomedIn((prev) => (prev ? t.k >= 1.2 : t.k >= 1.5))}
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
      {/* Stack both control panels at top-right so they're visible on mobile
          without being hidden behind Safari's bottom URL bar. */}
      <div className="absolute top-3 right-3 flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2">
        <LabelPctControl
          value={labelPct}
          onChange={setLabelPct}
          threshold={alwaysLabelTrackDegree}
        />
        <PlaylistToggleControl
          playlists={allPlaylists}
          hidden={hiddenPlaylistIds}
          onToggle={togglePlaylistHidden}
          onShowAll={showAllPlaylists}
        />
      </div>
      {focused ? <GraphNodeDetail node={focused} onClose={() => setFocused(null)} /> : null}
    </div>
  );
}

function GraphNodeDetail({ node, onClose }: { node: ForceNode; onClose: () => void }) {
  const isPlaylist = node.type === "playlist";
  return (
    <div className="border-secondary text-secondary absolute right-3 bottom-3 flex w-72 max-w-[calc(100vw-1.5rem)] flex-col gap-3 rounded-md border bg-white/95 p-3 text-xs backdrop-blur dark:bg-neutral-950/95">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close details"
        className="text-tertiary hover:text-primary absolute top-1.5 right-2 text-base leading-none transition-colors"
      >
        ×
      </button>
      <div className="flex items-start gap-3">
        {node.imageUrl ? (
          <NextImage
            src={node.imageUrl}
            width={56}
            height={56}
            alt=""
            unoptimized
            className={`size-14 flex-none object-cover ring-[0.5px] ring-black/10 dark:ring-white/10 ${
              isPlaylist ? "rounded-md" : "rounded"
            }`}
          />
        ) : (
          <div
            className={`size-14 flex-none bg-neutral-200 dark:bg-neutral-800 ${
              isPlaylist ? "rounded-md" : "rounded"
            }`}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 pr-4">
          <div className="text-tertiary text-[10px] tracking-wide uppercase">
            {isPlaylist ? "Playlist" : "Song"}
          </div>
          <div className="text-primary truncate text-sm font-semibold" title={node.name}>
            {node.name}
          </div>
          {node.type === "track" && node.artist ? (
            <div className="text-secondary truncate" title={node.artist}>
              {node.artist}
            </div>
          ) : null}
          {node.type === "playlist" ? (
            <div className="text-secondary truncate">
              {node.trackCount != null ? `${node.trackCount} tracks` : null}
              {node.trackCount != null && node.ownerName ? " · " : null}
              {node.ownerName ?? null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-tertiary tabular-nums">
          {node.degree} {node.degree === 1 ? "connection" : "connections"}
        </span>
        <div className="flex items-center gap-2">
          {node.type === "playlist" ? (
            <Link
              href={`/playlists/${node.id}`}
              className="text-primary rounded border border-neutral-200 px-2 py-0.5 hover:bg-neutral-100 dark:border-neutral-800 dark:hover:bg-neutral-900"
            >
              View details
            </Link>
          ) : null}
          {node.spotifyUrl ? (
            <Link
              href={node.spotifyUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded px-2 py-0.5 font-medium text-white"
              style={{ backgroundColor: PLAYLIST_COLOR }}
            >
              Open in Spotify
            </Link>
          ) : null}
        </div>
      </div>
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
    <div className="border-secondary text-secondary flex flex-col gap-1.5 rounded-md border bg-white/90 px-3 py-2 text-xs backdrop-blur dark:bg-neutral-950/90">
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

function PlaylistToggleControl({
  playlists,
  hidden,
  onToggle,
  onShowAll,
}: {
  playlists: Extract<PlaylistGraphNode, { type: "playlist" }>[];
  hidden: Set<string>;
  onToggle: (id: string) => void;
  onShowAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const hiddenCount = hidden.size;
  return (
    <div className="border-secondary text-secondary flex w-64 max-w-full flex-col rounded-md border bg-white/90 text-xs backdrop-blur dark:bg-neutral-950/90">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between gap-3 px-3 py-2"
      >
        <span className="text-primary font-medium">Playlists</span>
        <span className="tabular-nums">
          {hiddenCount > 0 ? `${hiddenCount} hidden` : `${playlists.length} shown`}
          <span className="ml-2 opacity-60">{open ? "▾" : "▸"}</span>
        </span>
      </button>
      {open ? (
        <div className="border-secondary flex max-h-64 flex-col overflow-y-auto border-t p-1">
          {hiddenCount > 0 ? (
            <button
              type="button"
              onClick={onShowAll}
              className="text-primary mb-1 rounded px-2 py-1 text-left hover:bg-neutral-100 dark:hover:bg-neutral-900"
            >
              Show all
            </button>
          ) : null}
          {playlists.map((p) => {
            const isHidden = hidden.has(p.id);
            return (
              <label
                key={p.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-900"
              >
                <input
                  type="checkbox"
                  checked={!isHidden}
                  onChange={() => onToggle(p.id)}
                  className="accent-[#1db954]"
                />
                <span className="text-primary flex-1 truncate" title={p.name}>
                  {p.name}
                </span>
                {p.trackCount != null ? (
                  <span className="tabular-nums opacity-60">{p.trackCount}</span>
                ) : null}
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
