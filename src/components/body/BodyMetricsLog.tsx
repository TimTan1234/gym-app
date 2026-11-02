"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ScanLine, Trash2 } from "lucide-react";
import { deleteBodyMetric, logBodyMetric } from "@/server/profile";
import { formatLocalDate } from "@/lib/dates";
import { cmToIn, displayWeight, inToCm, inputWeightToKg, round, weightUnit, type UnitSystem } from "@/lib/units";
import { Button, IconButton, Input } from "@/components/ui";
import { useT } from "@/i18n/client";
import { BodyFatPhoto } from "./BodyFatPhoto";
import { INTL_LOCALE } from "@/i18n/config";

const SHOWN = 5;

interface Entry {
  id: string;
  localDate: string;
  weightKg: number;
  bodyFatPct: number | null;
  bodyFatSource: "MEASURED" | "PHOTO_ESTIMATE" | null;
  waistCm: number | null;
}

export function BodyMetricsLog({ today, units, entries }: { today: string; units: UnitSystem; entries: Entry[] }) {
  const [pending, startTransition] = useTransition();
  const t = useT();
  const lenUnit = units === "IMPERIAL" ? "in" : "cm";
  // Body fat is controlled so a photo estimate can fill it; typing over it makes it a measurement again.
  const [bodyFat, setBodyFat] = useState("");
  const [fromPhoto, setFromPhoto] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const opt = (k: string) => (f.get(k) ? Number(f.get(k)) : null);
    const waist = opt("waist");
    startTransition(async () => {
      const res = await logBodyMetric({
        localDate: String(f.get("date")),
        weightKg: inputWeightToKg(Number(f.get("weight")), units),
        bodyFatPct: opt("bodyFat"),
        bodyFatSource: fromPhoto ? "PHOTO_ESTIMATE" : "MEASURED",
        waistCm: waist === null ? null : units === "IMPERIAL" ? inToCm(waist) : waist,
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(t("progress.log.saved"));
      form.reset();
      setBodyFat("");
      setFromPhoto(false);
    });
  }

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="grid grid-cols-2 items-end gap-3 sm:grid-cols-5">
        <label className="text-[11px] font-medium text-steel sm:col-span-1">
          {t("progress.log.date")}
          <Input name="date" type="date" defaultValue={today} max={today} required className="mt-0.5" />
        </label>
        <label className="text-[11px] font-medium text-steel">
          {t("progress.log.weight", { unit: weightUnit(units) })}
          <Input name="weight" type="number" step="0.1" inputMode="decimal" required className="num mt-0.5" />
        </label>
        <label className="text-[11px] font-medium text-steel">
          {t("progress.log.bodyFat")}
          <Input
            name="bodyFat"
            type="number"
            step="0.1"
            inputMode="decimal"
            placeholder={t("common.optional")}
            value={bodyFat}
            onChange={(e) => {
              setBodyFat(e.target.value);
              setFromPhoto(false);
            }}
            aria-describedby={fromPhoto ? "body-fat-source" : undefined}
            className="num mt-0.5"
          />
        </label>
        <label className="text-[11px] font-medium text-steel">
          {t("progress.log.waist", { unit: lenUnit })}
          <Input name="waist" type="number" step="0.1" inputMode="decimal" placeholder={t("common.optional")} className="num mt-0.5" />
        </label>
        <Button type="submit" disabled={pending} className="self-end">
          {t("common.save")}
        </Button>
      </form>
      {photoOpen ? (
        <BodyFatPhoto
          onUse={(pct) => {
            setBodyFat(String(pct));
            setFromPhoto(true);
            setPhotoOpen(false);
          }}
          onClose={() => setPhotoOpen(false)}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-x-3">
          <Button type="button" variant="ghost" size="sm" edge="start" onClick={() => setPhotoOpen(true)}>
            <ScanLine className="size-4" /> {t("progress.photo.open")}
          </Button>
          {fromPhoto && (
            <span id="body-fat-source" className="text-[13px] text-steel">
              ≈ {bodyFat}% · {t("progress.log.estimateTag")}
            </span>
          )}
        </div>
      )}
      {entries.length > 0 && (
        <ul className="num divide-y divide-line text-sm">
          {(showAll ? entries : entries.slice(0, SHOWN)).map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-0.5">
              <span className="w-24 text-steel">{formatLocalDate(e.localDate, undefined, INTL_LOCALE[t.locale])}</span>
              <span className="flex-1 whitespace-nowrap font-semibold">
                {displayWeight(e.weightKg, units)} {weightUnit(units)}
              </span>
              {e.bodyFatPct !== null &&
                (e.bodyFatSource === "PHOTO_ESTIMATE" ? (
                  // Short in the row: "≈" and the photo icon; the words are for screen readers.
                  <span className="flex items-center gap-1 whitespace-nowrap text-steel" title={t("progress.log.estimateTag")}>
                    ≈{e.bodyFatPct}%
                    <ScanLine className="size-3.5" aria-hidden />
                    <span className="sr-only"> · {t("progress.log.estimateTag")}</span>
                  </span>
                ) : (
                  <span className="whitespace-nowrap text-steel">{e.bodyFatPct}%</span>
                ))}
              {e.waistCm !== null && (
                <span className="text-steel">
                  {round(units === "IMPERIAL" ? cmToIn(e.waistCm) : e.waistCm, 1)} {lenUnit}
                </span>
              )}
              <IconButton
                tone="danger"
                edge="end"
                aria-label={t("progress.log.deleteEntry", { date: e.localDate })}
                disabled={pending}
                onClick={() => startTransition(async () => void (await deleteBodyMetric(e.id)))}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {/* The whole list in the page's own scroll, not a box that cuts a row in half. */}
      {entries.length > SHOWN && (
        <Button type="button" variant="ghost" size="sm" edge="start" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
          {showAll ? t("progress.log.showFewer") : t("progress.log.showAll", { count: entries.length })}
        </Button>
      )}
    </div>
  );
}
