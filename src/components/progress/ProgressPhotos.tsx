"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { deleteProgressPhoto } from "@/server/photos";
import { resizeImageBlob } from "@/lib/image";
import { PHOTO_MAX_DIM } from "@/lib/progress-photos";
import { daysBetween } from "@/lib/dates";
import { displayWeight, weightUnit, type UnitSystem } from "@/lib/units";
import { Button, EmptyState, cn } from "@/components/ui";
import { useT } from "@/i18n/client";

export interface ShownPhoto {
  id: string;
  date: string;
  /** The date as shown. */
  label: string;
  /** Weight logged on that same date. */
  weightKg: number | null;
  src: string;
}

type Side = "left" | "right";

/** The add tile, with the date it adds for as a small control under it. */
function AddPhoto({ today, photos }: { today: string; photos: ShownPhoto[] }) {
  const t = useT();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [date, setDate] = useState(today);
  const [busy, startTransition] = useTransition();

  function upload(file: File) {
    const existing = photos.find((p) => p.date === date);
    if (existing && !confirm(t("progress.photos.replaceConfirm", { date: existing.label }))) return;
    startTransition(async () => {
      let photo: Blob;
      try {
        photo = await resizeImageBlob(file, PHOTO_MAX_DIM);
      } catch {
        return void toast.error(t("progress.photos.unreadable"));
      }
      const form = new FormData();
      form.append("photo", photo, "photo.jpg");
      form.append("date", date);
      try {
        const res = await fetch("/api/progress-photos", { method: "POST", body: form });
        if (!res.ok) return void toast.error((await res.json().catch(() => null))?.error ?? t("common.somethingWrong"));
        router.refresh();
      } catch {
        toast.error(t("common.somethingWrong"));
      }
    });
  }

  return (
    <div className="flex w-24 shrink-0 flex-col gap-1.5">
      <button
        type="button"
        aria-label={t("progress.photos.add")}
        onClick={() => input.current?.click()}
        disabled={busy}
        className="grid aspect-[3/4] w-full place-items-center rounded-field border border-dashed border-steel/60 text-steel transition-colors hover:border-iron hover:text-iron disabled:opacity-50"
      >
        <Plus className={cn("size-6", busy && "animate-pulse")} />
      </button>
      <input
        type="date"
        required
        max={today}
        value={date}
        aria-label={t("progress.photos.date")}
        onChange={(e) => e.target.value && setDate(e.target.value)}
        className="num h-8 w-full rounded-[8px] border border-line bg-chalk px-1 text-[11px] text-steel focus:border-primary focus:outline-none"
      />
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        data-testid="progress-photo-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) upload(file);
        }}
      />
    </div>
  );
}

const frame = "aspect-[3/4] w-full rounded-field bg-wash object-cover";

function Compared({ photo, units, selected, onSelect }: { photo: ShownPhoto; units: UnitSystem; selected: boolean | null; onSelect?: () => void }) {
  const t = useT();
  const [busy, startTransition] = useTransition();
  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- the user's own photo, served privately; never through the shared optimiser
    <img src={photo.src} alt={t("progress.photos.alt", { date: photo.label })} className={frame} />
  );
  return (
    <figure className="min-w-0">
      {onSelect ? (
        // Picks which side the strip below fills.
        <button
          type="button"
          aria-pressed={!!selected}
          onClick={onSelect}
          className={cn("block w-full rounded-field ring-offset-2 ring-offset-chalk transition-shadow", selected && "ring-2 ring-iron")}
        >
          {img}
        </button>
      ) : (
        img
      )}
      <figcaption className="mt-2 flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-sm font-medium">{photo.label}</span>
          {photo.weightKg !== null && <span className="num block text-[13px] text-steel">{`${displayWeight(photo.weightKg, units)} ${weightUnit(units)}`}</span>}
        </span>
        <Button
          variant="ghost"
          size="sm"
          edge="end"
          className="-mt-2 text-steel hover:text-alert"
          aria-label={t("progress.photos.delete", { date: photo.label })}
          disabled={busy}
          onClick={() => {
            if (!confirm(t("progress.photos.deleteConfirm", { date: photo.label }))) return;
            startTransition(async () => {
              const res = await deleteProgressPhoto(photo.id);
              if (!res.ok) toast.error(res.error);
            });
          }}
        >
          {t("common.delete")}
        </Button>
      </figcaption>
    </figure>
  );
}

/**
 * Two photos side by side, oldest and newest to start with, and one strip of all of them under it.
 * Tap a compared photo to choose that side, then a thumbnail to put it there. `photos` is oldest first.
 */
export function ProgressPhotos({ photos, today, units }: { photos: ShownPhoto[]; today: string; units: UnitSystem }) {
  const t = useT();
  const [picked, setPicked] = useState<Record<Side, string | null>>({ left: null, right: null });
  const [side, setSide] = useState<Side>("right");
  if (photos.length === 0) return <EmptyState title={t("progress.photos.empty")} action={<AddPhoto today={today} photos={photos} />} />;

  const byId = (id: string | null) => photos.find((p) => p.id === id);
  const left = byId(picked.left) ?? photos[0];
  const right = byId(picked.right) ?? photos.at(-1)!;
  const pair = photos.length > 1 && left.id !== right.id;

  function put(photo: ShownPhoto) {
    const other: Side = side === "left" ? "right" : "left";
    // Choosing the photo already on the other side swaps the two.
    if (photo.id === (other === "left" ? left : right).id) setPicked({ [side]: photo.id, [other]: (side === "left" ? left : right).id } as Record<Side, string>);
    else setPicked({ left: left.id, right: right.id, [side]: photo.id });
  }

  const [a, b] = left.date <= right.date ? [left, right] : [right, left];
  const days = Math.abs(daysBetween(a.date, b.date));
  const change = a.weightKg !== null && b.weightKg !== null ? displayWeight(b.weightKg, units) - displayWeight(a.weightKg, units) : null;
  const apart = t.plural("progress.photos.apart", days);
  const sign = change === null || Math.abs(change) < 0.05 ? "" : change > 0 ? "+" : "−";

  return (
    <div className="space-y-6">
      {pair ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Compared photo={left} units={units} selected={side === "left"} onSelect={() => setSide("left")} />
            <Compared photo={right} units={units} selected={side === "right"} onSelect={() => setSide("right")} />
          </div>
          <p className="num text-center text-sm font-medium">
            {change === null ? apart : t("progress.photos.difference", { apart, change: `${sign}${Math.abs(change).toFixed(1)} ${weightUnit(units)}` })}
          </p>
        </div>
      ) : (
        <div className="mx-auto w-1/2 min-w-40">
          <Compared photo={photos.at(-1)!} units={units} selected={null} />
        </div>
      )}

      <div className="flex items-start justify-end gap-2">
        {/* With one photo it's already above; otherwise all of them, padded so the rings aren't clipped by the scroll edge. */}
        {pair && (
          <ol className="-m-1 flex min-w-0 flex-1 gap-2 overflow-x-auto p-1">
            {photos.map((p) => {
              const shown = p.id === left.id || p.id === right.id;
              return (
                <li key={p.id} className="w-24 shrink-0">
                  <button
                    type="button"
                    aria-label={p.label}
                    aria-pressed={shown}
                    onClick={() => put(p)}
                    className={cn("block w-full rounded-field ring-offset-2 ring-offset-chalk", shown && "ring-2 ring-iron")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- as above */}
                    <img src={p.src} alt="" loading="lazy" className={frame} />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        <AddPhoto today={today} photos={photos} />
      </div>
    </div>
  );
}
