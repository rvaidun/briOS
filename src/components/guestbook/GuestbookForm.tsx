"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

import { GuestbookCanvas, type GuestbookCanvasHandle } from "./GuestbookCanvas";
import type { GuestbookEntryView } from "./types";

export function GuestbookForm({ onPosted }: { onPosted: (entry: GuestbookEntryView) => void }) {
  const canvasRef = useRef<GuestbookCanvasHandle>(null);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError("Add your name first.");
      return;
    }
    const svg = canvasRef.current?.toSvg();
    if (!svg) {
      setError("Draw something before submitting.");
      return;
    }

    setSubmitting(true);
    // Hard timeout so a wedged fetch (e.g. an outage or a misbehaving
    // network shim) can never leave the button stuck in "Signing…".
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 15_000);
    try {
      const res = await fetch("/api/guestbook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed, drawingSvg: svg }),
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

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        maxLength={40}
        aria-label="Your name"
      />
      <GuestbookCanvas ref={canvasRef} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Signing…" : "Sign the book"}
        </Button>
        {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
      </div>
    </form>
  );
}
