"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { Run, RunPhoto } from "@/lib/db/schema";

import { deletePhoto, updateRunName, uploadPhoto } from "./actions";

export type RunAdminRow = Run & { photos: RunPhoto[] };

export function RunAdminList({ runs }: { runs: RunAdminRow[] }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-secondary text-sm">
          {runs.length} {runs.length === 1 ? "run" : "runs"}
        </p>
        <form action="/api/auth/logout" method="post">
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </div>

      {runs.length === 0 ? (
        <p className="text-quaternary text-sm">No runs yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {runs.map((run) => (
            <RunRow key={run.id} run={run} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RunRow({ run }: { run: RunAdminRow }) {
  const distanceMi = (run.distanceM / 1609.344).toFixed(2);
  const dateLabel = new Date(run.startedAt).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <li className="border-secondary flex flex-col gap-3 rounded-md border bg-white p-4 dark:bg-white/5">
      <div className="text-tertiary flex items-center justify-between text-xs">
        <span>{dateLabel}</span>
        <span className="tabular-nums">
          {distanceMi} mi · {formatDuration(run.movingTimeS)}
        </span>
      </div>

      <NameEditor runId={run.id} initialName={run.name ?? ""} />
      <PhotoManager runId={run.id} photos={run.photos} />
    </li>
  );
}

function NameEditor({ runId, initialName }: { runId: string; initialName: string }) {
  const [value, setValue] = useState(initialName);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const dirty = value.trim() !== initialName.trim();

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!dirty || pending) return;
        setSaved(false);
        startTransition(async () => {
          await updateRunName(runId, value);
          setSaved(true);
        });
      }}
    >
      <Input
        name="name"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        placeholder="Untitled run"
        className="flex-1"
      />
      <Button type="submit" size="sm" disabled={!dirty || pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      {saved && !dirty && !pending && <span className="text-xs text-emerald-600">Saved</span>}
    </form>
  );
}

function PhotoManager({ runId, photos }: { runId: string; photos: readonly RunPhoto[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((p) => (
            <div key={p.id} className="border-secondary group relative overflow-hidden rounded">
              {/* eslint-disable-next-line @next/next/no-img-element -- admin only */}
              <img src={p.url} alt="" className="h-20 w-20 object-cover" />
              <button
                type="button"
                aria-label="Delete photo"
                disabled={pending}
                onClick={() => {
                  if (!confirm("Delete this photo?")) return;
                  startTransition(async () => {
                    await deletePhoto(p.id);
                  });
                }}
                className="absolute top-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
        action={(fd) => {
          setError(null);
          fd.set("runId", runId);
          startTransition(async () => {
            try {
              await uploadPhoto(fd);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          });
        }}
      >
        <input
          type="file"
          name="file"
          accept="image/*"
          required
          className="text-secondary flex-1 text-xs file:mr-2 file:cursor-pointer file:rounded file:border file:border-neutral-300 file:bg-white file:px-2 file:py-1 file:text-xs dark:file:border-white/10 dark:file:bg-white/5"
        />
        <Input name="caption" placeholder="Caption (optional)" className="flex-1" />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Uploading…" : "Upload"}
        </Button>
      </form>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

function formatDuration(totalS: number): string {
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
