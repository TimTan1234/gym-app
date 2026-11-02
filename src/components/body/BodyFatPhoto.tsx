"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, Lock, ScanLine, X } from "lucide-react";
import { MAX_BODY_PHOTOS, type BodyFatEstimate } from "@/lib/ai/schemas";
import { resizeImage } from "@/lib/image";
import { Button } from "@/components/ui";
import { useT } from "@/i18n/client";

/**
 * Body fat from photos: the guidance and privacy note first, then up to three
 * photos, then the estimate as a range. Photos live only in this component's
 * state and the one request; "Use" hands back just the number.
 */
export function BodyFatPhoto({ onUse, onClose }: { onUse: (pct: number) => void; onClose: () => void }) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [estimate, setEstimate] = useState<BodyFatEstimate | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    const room = MAX_BODY_PHOTOS - images.length;
    if (files.length > room) toast.error(t("progress.photo.tooManyPhotos", { max: MAX_BODY_PHOTOS }));
    const added: string[] = [];
    for (const file of files.slice(0, Math.max(0, room))) {
      try {
        added.push(await resizeImage(file));
      } catch {
        toast.error(t("nutrition.imageReadError"));
      }
    }
    if (added.length) {
      setImages((cur) => [...cur, ...added].slice(0, MAX_BODY_PHOTOS));
      setEstimate(null);
    }
  }

  async function analyse() {
    if (images.length === 0) return void toast.error(t("progress.photo.needPhoto"));
    setBusy(true);
    try {
      const res = await fetch("/api/ai/bodyfat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ images }) });
      const data = (await res.json()) as { estimate?: BodyFatEstimate; error?: string };
      if (!res.ok || !data.estimate) throw new Error(data.error ?? t("progress.photo.failed"));
      setEstimate(data.estimate);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("progress.photo.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="body-fat-photo-title" className="space-y-3 rounded-card bg-paper p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 id="body-fat-photo-title" className="flex items-center gap-2 text-sm font-semibold">
          <ScanLine className="size-4 text-steel" aria-hidden /> {t("progress.photo.title")}
        </h3>
        <button type="button" onClick={onClose} aria-label={t("progress.photo.cancel")} className="-mr-1.5 -mt-1 grid size-8 place-items-center rounded-full text-steel active:bg-wash">
          <X className="size-4" />
        </button>
      </div>
      <p className="text-sm text-steel">{t("progress.photo.guide")}</p>
      <p className="flex items-start gap-2 text-sm text-steel">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t("progress.photo.privacy")}
      </p>

      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={onPick} data-testid="body-photos-input" />
      {images.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {images.map((src, i) => (
            <li key={i} className="relative aspect-[3/4] overflow-hidden rounded-field bg-wash">
              {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
              <img src={src} alt={t("progress.photo.photoN", { n: i + 1 })} className="size-full object-cover" />
              <button
                type="button"
                aria-label={t("progress.photo.removeN", { n: i + 1 })}
                onClick={() => {
                  setImages((cur) => cur.filter((_, j) => j !== i));
                  setEstimate(null);
                }}
                className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-black/60 text-white"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {estimate?.usable && estimate.estimatePct !== null ? (
        <div className="space-y-3 border-t border-line pt-3" aria-live="polite">
          <p>
            <span className="score block text-[40px]">{t("progress.photo.result", { pct: estimate.estimatePct })}</span>
            <span className="num mt-1 block text-sm text-steel">{t("progress.photo.range", { low: estimate.lowPct ?? "", high: estimate.highPct ?? "" })}</span>
          </p>
          {estimate.cues.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-sm">
              {estimate.cues.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
          <p className="text-xs text-steel">{t("progress.photo.caveat")}</p>
          <div className="flex gap-2">
            <Button type="button" onClick={() => onUse(estimate.estimatePct!)}>
              {t("progress.photo.use", { pct: estimate.estimatePct })}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("progress.photo.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()} disabled={images.length >= MAX_BODY_PHOTOS || busy}>
            <ImagePlus className="size-4" /> {t("progress.photo.add")}
          </Button>
          <Button type="button" onClick={analyse} disabled={busy || images.length === 0}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? t("progress.photo.analysing") : t("progress.photo.analyse")}
          </Button>
          <span className="num ml-auto text-[13px] text-steel">{t("progress.photo.count", { count: images.length, max: MAX_BODY_PHOTOS })}</span>
        </div>
      )}
    </section>
  );
}
