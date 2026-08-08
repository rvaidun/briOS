"use client";

import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { GuestbookCanvas, type GuestbookCanvasHandle } from "./GuestbookCanvas";
import type { GuestbookEntryView } from "./types";

const NOTE_MAX = 200;
const BRAND = "#a8492a";

export function GuestbookForm({ onPosted }: { onPosted: (entry: GuestbookEntryView) => void }) {
  const canvasRef = useRef<GuestbookCanvasHandle>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setError("Add your name first.");
      return;
    }
    const svg = canvasRef.current?.toSvg();
    if (!svg) {
      setError("Draw something before submitting.");
      return;
    }

    setSubmitting(true);
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 15_000);
    try {
      const res = await fetch("/api/guestbook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmedName, note: note.trim(), drawingSvg: svg }),
        signal: abort.signal,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Failed to save — try again.");
        return;
      }
      const body = (await res.json()) as { entry: GuestbookEntryView };
      onPosted(body.entry);
      canvasRef.current?.clear();
      setName("");
      setNote("");
      setOpen(false);
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "AbortError"
          ? "Request timed out — try again."
          : "Network hiccup — try again.",
      );
    } finally {
      clearTimeout(timer);
      setSubmitting(false);
    }
  }

  // Both button and panel stay mounted so the slide-up / slide-down runs in
  // both directions. Panel is absolutely anchored to the bottom of the wrapper
  // so it floats over the button as it slides in from below.
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ backgroundColor: BRAND }}
        aria-hidden={open}
        tabIndex={open ? -1 : 0}
        className={cn(
          "w-full cursor-pointer rounded-full px-4 py-2.5 text-center text-sm font-semibold text-white shadow-[0_8px_20px_rgba(0,0,0,0.3)] transition-all duration-200 ease-out",
          open
            ? "pointer-events-none translate-y-2 scale-95 opacity-0"
            : "opacity-100 hover:scale-[1.02] hover:-rotate-1",
        )}
      >
        ✎ leave a note
      </button>

      <div
        aria-hidden={!open}
        className={cn(
          "absolute inset-x-0 bottom-0 origin-bottom transition-all duration-300 ease-out",
          open
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-6 scale-[0.98] opacity-0",
        )}
      >
        <form onSubmit={onSubmit} className="flex w-full flex-col gap-2 text-neutral-900">
          <div className="flex items-center gap-2 rounded-md bg-neutral-900/90 px-3 py-1.5 text-[12px] leading-tight text-white">
            <span className="flex-1 text-center">leave a note. draw a doodle, write a hi.</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              tabIndex={open ? 0 : -1}
              className="text-white/70 hover:text-white"
            >
              ×
            </button>
          </div>
          <div
            style={{ backgroundColor: BRAND }}
            className="flex flex-col gap-2 rounded-lg p-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="your name"
              maxLength={40}
              aria-label="Your name"
              tabIndex={open ? 0 : -1}
              className="rounded-sm bg-white/95 px-2 py-1 text-sm text-neutral-900 placeholder:text-neutral-500 focus:outline-none"
            />
            <div className="mx-auto w-full max-w-[220px]">
              <GuestbookCanvas ref={canvasRef} />
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
              placeholder="write a short note (optional)"
              maxLength={NOTE_MAX}
              rows={2}
              aria-label="Your note"
              tabIndex={open ? 0 : -1}
              className="resize-none rounded-sm bg-white/95 px-2 py-1 text-sm text-neutral-900 placeholder:text-neutral-500 focus:outline-none"
            />
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={submitting}
                tabIndex={open ? 0 : -1}
                className="flex-1 cursor-pointer rounded-md bg-neutral-900 py-1.5 text-center text-sm font-semibold text-white lowercase transition hover:bg-neutral-800 disabled:opacity-60"
              >
                {submitting ? "submitting…" : "submit"}
              </button>
              <span className="text-[11px] text-white/80">
                {note.length}/{NOTE_MAX}
              </span>
            </div>
            {error && (
              <p className="rounded-sm bg-white/95 px-2 py-1 text-xs text-red-600">{error}</p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
