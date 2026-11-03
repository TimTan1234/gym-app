"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { saveCycleSettings } from "@/server/profile";
import type { ImportSummary } from "@/app/api/cycle/import/route";
import { MAX_IMPORT_BYTES } from "@/lib/cycle/luna-import";
import { Button, Input, Label, SwitchRow } from "@/components/ui";
import { useT } from "@/i18n/client";

export interface CycleSettingsValues {
  cycleTracking: boolean;
  cycleLength: number;
  periodLength: number;
  showFertileWindow: boolean;
}

export function CycleSettings({ initial }: { initial: CycleSettingsValues }) {
  const t = useT();
  const [enabled, setEnabled] = useState(initial.cycleTracking);
  const [cycleLength, setCycleLength] = useState(String(initial.cycleLength));
  const [periodLength, setPeriodLength] = useState(String(initial.periodLength));
  const [fertile, setFertile] = useState(initial.showFertileWindow);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await saveCycleSettings({
        enabled,
        cycleLength: Number(cycleLength),
        periodLength: Number(periodLength),
        showFertileWindow: fertile,
      });
      if (res.ok) toast.success(t("cycle.settings.saved"));
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-steel">{t("cycle.settings.intro")}</p>
      <SwitchRow label={t("cycle.settings.enable")} checked={enabled} onChange={setEnabled} />
      {enabled && (
        <>
          <div className="grid grid-cols-2 items-end gap-3">
            <Label>
              {t("cycle.settings.cycleLength")}
              <Input type="number" inputMode="numeric" min={20} max={40} value={cycleLength} onChange={(e) => setCycleLength(e.target.value)} className="num" />
            </Label>
            <Label>
              {t("cycle.settings.periodLength")}
              <Input type="number" inputMode="numeric" min={1} max={10} value={periodLength} onChange={(e) => setPeriodLength(e.target.value)} className="num" />
            </Label>
          </div>
          <p className="text-xs text-steel">{t("cycle.settings.lengthsHint")}</p>
          <SwitchRow label={t("cycle.settings.fertile")} hint={t("cycle.settings.fertileHint")} checked={fertile} onChange={setFertile} />
        </>
      )}
      <Button type="button" variant="secondary" disabled={pending} onClick={save}>
        {pending ? t("common.saving") : t("cycle.settings.save")}
      </Button>
      <LunaImport />
    </div>
  );
}

/** Pick a Luna export, preview what it adds, then import it. Existing GymPal records are kept. */
function LunaImport() {
  const t = useT();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(f: File, apply: boolean): Promise<ImportSummary | null> {
    const form = new FormData();
    form.set("file", f);
    if (apply) form.set("apply", "1");
    setBusy(true);
    try {
      const res = await fetch("/api/cycle/import", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as ImportSummary & { error?: string };
      if (!res.ok) throw new Error(data.error ?? t("cycle.import.errors.unreadable"));
      return data;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("cycle.import.errors.unreadable"));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > MAX_IMPORT_BYTES) return void toast.error(t("cycle.import.errors.tooLarge"));
    const summary = await send(f, false);
    if (!summary) return;
    if (summary.periods === 0 && summary.days === 0) return void toast.message(t("cycle.import.nothingNew"));
    setFile(f);
    setPreview(summary);
  }

  async function apply() {
    if (!file) return;
    const summary = await send(file, true);
    if (!summary) return;
    toast.success(t("cycle.import.done", { periods: t.plural("cycle.import.periods", summary.periods), days: t.plural("cycle.import.days", summary.days) }));
    setFile(null);
    setPreview(null);
    router.refresh();
  }

  return (
    <div className="space-y-3 border-t border-line pt-4">
      <p className="text-sm font-semibold">{t("cycle.import.title")}</p>
      <p className="text-xs text-steel">{t("cycle.import.hint")}</p>
      <input ref={fileRef} type="file" accept=".json,.csv,application/json,text/csv" className="hidden" onChange={pick} aria-label={t("cycle.import.choose")} />
      {preview ? (
        <div className="space-y-3 rounded-field border border-line bg-chalk p-3" role="status" data-testid="luna-preview">
          <p className="text-sm">
            {t("cycle.import.preview", { periods: t.plural("cycle.import.periods", preview.periods), days: t.plural("cycle.import.days", preview.days) })}
            {preview.existing > 0 && ` ${t.plural("cycle.import.existing", preview.existing)}`}
            {preview.invalid > 0 && ` ${t.plural("cycle.import.invalid", preview.invalid)}`}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={apply} disabled={busy}>
              {busy ? t("cycle.import.importing") : t("cycle.import.apply")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setFile(null);
                setPreview(null);
              }}
              disabled={busy}
            >
              {t("cycle.import.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Upload className="size-4" /> {busy ? t("cycle.import.reading") : t("cycle.import.choose")}
        </Button>
      )}
    </div>
  );
}
