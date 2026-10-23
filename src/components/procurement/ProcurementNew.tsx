"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, FileText, Image as ImageIcon, Loader2, Paperclip, Sparkles, X } from "lucide-react";
import type { DraftPlan, ProcurementSource } from "@/lib/ai/schemas";
import type { CheckProfile } from "@/lib/procurement/summary";
import { resizeImageBlob } from "@/lib/image";
import { Button, Card, Label, Textarea } from "@/components/ui";
import { DraftEditor, blankDraft, editorDraft, type EditorDraft } from "./DraftEditor";
import { NumField, Segmented } from "./fields";
import { useT } from "@/i18n/client";

// Must match the server's limits in src/lib/procurement/extract.ts.
const MAX_FILES = 4;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_CHARS = 20_000;
const DOC_EXTENSIONS = ["md", "markdown", "txt", "docx", "pdf"];
const ACCEPT = `image/*,${DOC_EXTENSIONS.map((e) => `.${e}`).join(",")}`;
/** Big enough for small print on a photographed list. */
const PHOTO_MAX_DIM = 1600;

type Mode = "import" | "generate" | "blank";
type Started = { draft: EditorDraft; source: ProcurementSource };

export function ProcurementNew({
  initialMode,
  profile,
  currency,
  remaining,
}: {
  initialMode: Mode;
  profile: CheckProfile;
  currency: string;
  /** AI calls left today. */
  remaining: number;
}) {
  const t = useT();
  const [mode, setMode] = useState<Exclude<Mode, "blank">>(initialMode === "generate" ? "generate" : "import");
  const [started, setStarted] = useState<Started | null>(() =>
    initialMode === "blank" ? { draft: blankDraft(t("procurement.untitled"), currency), source: "MANUAL" } : null,
  );
  const [left, setLeft] = useState(remaining);

  if (started) {
    return <DraftEditor initial={started.draft} source={started.source} profile={profile} onDiscard={() => setStarted(null)} />;
  }

  const onDraft = (s: Started, remainingNow?: number) => {
    setStarted(s);
    if (remainingNow !== undefined) setLeft(remainingNow);
  };

  return (
    <div className="space-y-5">
      <Segmented
        label={t("procurement.howToStart")}
        value={mode}
        onChange={setMode}
        options={[
          { value: "import", label: t("procurement.import") },
          { value: "generate", label: t("procurement.generate") },
        ]}
      />
      {mode === "import" ? <ImportForm currency={currency} onDraft={onDraft} /> : <GenerateForm profile={profile} currency={currency} onDraft={onDraft} />}
      <p className="text-xs text-steel">{t("procurement.aiLeft", { count: left })}</p>
      <Button
        type="button"
        variant="ghost"
        edge="start"
        onClick={() => setStarted({ draft: blankDraft(t("procurement.untitled"), currency), source: "MANUAL" })}
      >
        {t("procurement.startBlank")}
      </Button>
    </div>
  );
}

interface Picked {
  key: string;
  blob: Blob;
  name: string;
  image: boolean;
}

let pickSeq = 0;

function ImportForm({ currency, onDraft }: { currency: string; onDraft: (s: Started, remaining?: number) => void }) {
  const t = useT();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Picked[]>([]);
  const [text, setText] = useState("");
  const [days, setDays] = useState(7);
  const [people, setPeople] = useState(1);
  const [reading, setReading] = useState(false);

  async function addFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const list = [...(e.target.files ?? [])];
    e.target.value = "";
    const room = MAX_FILES - files.length;
    if (list.length > room) toast.error(t("procurement.errors.tooManyFiles"));
    const added: Picked[] = [];
    for (const file of list.slice(0, Math.max(0, room))) {
      const ext = file.name.toLowerCase().split(".").pop() ?? "";
      const base = file.name.replace(/\.[^.]+$/, "") || "photo";
      if (file.type.startsWith("image/")) {
        try {
          const blob = await resizeImageBlob(file, PHOTO_MAX_DIM, 0.85);
          added.push({ key: `f${++pickSeq}`, blob, name: `${base}.jpg`, image: true });
        } catch {
          toast.error(t("nutrition.imageReadError"));
        }
      } else if (!DOC_EXTENSIONS.includes(ext)) {
        toast.error(t("procurement.errors.fileType"));
      } else if (file.size > MAX_FILE_BYTES) {
        toast.error(t("procurement.errors.fileTooLarge"));
      } else {
        added.push({ key: `f${++pickSeq}`, blob: file, name: file.name, image: false });
      }
    }
    setFiles((cur) => [...cur, ...added]);
  }

  async function read() {
    if (files.length === 0 && !text.trim()) return void toast.error(t("procurement.addSomething"));
    const form = new FormData();
    for (const f of files) form.append("files", f.blob, f.name);
    form.set("text", text);
    form.set("days", String(days));
    form.set("people", String(people));
    setReading(true);
    try {
      const res = await fetch("/api/ai/procurement/import", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { draft?: DraftPlan; source?: ProcurementSource; remaining?: number; error?: string };
      if (!res.ok || !data.draft || !data.source) throw new Error(data.error ?? t("procurement.errors.readFailed"));
      onDraft({ draft: editorDraft(data.draft, { days, people, budget: null, currency }), source: data.source }, data.remaining);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("procurement.errors.readFailed"));
    } finally {
      setReading(false);
    }
  }

  return (
    <Card className="space-y-4">
      <p className="text-sm text-steel">{t("procurement.importHint")}</p>
      <div className="flex flex-wrap gap-2">
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={addFiles} />
        <input ref={fileRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={addFiles} />
        <Button type="button" variant="secondary" onClick={() => cameraRef.current?.click()} disabled={files.length >= MAX_FILES}>
          <Camera className="size-4" /> {t("procurement.takePhoto")}
        </Button>
        <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()} disabled={files.length >= MAX_FILES}>
          <Paperclip className="size-4" /> {t("procurement.chooseFiles")}
        </Button>
      </div>
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t("procurement.attached")}>
          {files.map((f) => (
            <li key={f.key} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-chalk py-1 pl-3 pr-1 text-sm">
              {f.image ? <ImageIcon className="size-3.5 shrink-0 text-steel" aria-hidden /> : <FileText className="size-3.5 shrink-0 text-steel" aria-hidden />}
              <span className="truncate">{f.name}</span>
              <button
                type="button"
                className="grid size-6 shrink-0 place-items-center rounded-full text-steel hover:bg-wash hover:text-iron"
                aria-label={t("procurement.removeNamed", { name: f.name })}
                onClick={() => setFiles((cur) => cur.filter((x) => x.key !== f.key))}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Label>
        {t("procurement.pasteLabel")}
        <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_TEXT_CHARS} placeholder={t("procurement.pastePlaceholder")} className="min-h-28" />
      </Label>
      <div className="grid grid-cols-2 items-end gap-2">
        <NumField label={t("procurement.fields.days")} value={days} min={1} max={31} step="1" onChange={(v) => setDays(Math.round(v ?? 1))} />
        <NumField label={t("procurement.fields.people")} value={people} min={1} max={12} step="1" onChange={(v) => setPeople(Math.round(v ?? 1))} />
      </div>
      <Button type="button" className="w-full" onClick={read} disabled={reading}>
        {reading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {reading ? t("procurement.reading") : t("procurement.readPlan")}
      </Button>
    </Card>
  );
}

function GenerateForm({ profile, currency, onDraft }: { profile: CheckProfile; currency: string; onDraft: (s: Started, remaining?: number) => void }) {
  const t = useT();
  const [days, setDays] = useState(7);
  const [people, setPeople] = useState(1);
  const [budget, setBudget] = useState<number | null>(null);
  const [preferences, setPreferences] = useState("");
  const [generating, setGenerating] = useState(false);

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/ai/procurement/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days, people, budget: budget || null, preferences, currency }),
      });
      const data = (await res.json().catch(() => ({}))) as { draft?: DraftPlan; remaining?: number; error?: string };
      if (!res.ok || !data.draft) throw new Error(data.error ?? t("procurement.errors.generateFailed"));
      onDraft({ draft: editorDraft(data.draft, { days, people, budget, currency }), source: "AI" }, data.remaining);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("procurement.errors.generateFailed"));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card className="space-y-4">
      <p className="text-sm text-steel">
        {t("procurement.generateHint", { kcal: profile.targetKcal, protein: profile.targetProteinG, carbs: profile.targetCarbsG, fat: profile.targetFatG })}
        {profile.diabetesMode && ` ${t("procurement.generateDiabetes")}`}
      </p>
      <div className="grid grid-cols-3 items-end gap-2">
        <NumField label={t("procurement.fields.days")} value={days} min={1} max={14} step="1" onChange={(v) => setDays(Math.round(v ?? 1))} />
        <NumField label={t("procurement.fields.people")} value={people} min={1} max={12} step="1" onChange={(v) => setPeople(Math.round(v ?? 1))} />
        <NumField label={t("procurement.fields.budget", { currency })} value={budget} nullable placeholder={t("common.optional")} onChange={setBudget} />
      </div>
      <Label>
        {t("procurement.preferencesLabel")}
        <Textarea value={preferences} onChange={(e) => setPreferences(e.target.value)} maxLength={500} placeholder={t("procurement.preferencesPlaceholder")} />
      </Label>
      <Button type="button" className="w-full" onClick={generate} disabled={generating}>
        {generating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {generating ? t("procurement.generating") : t("procurement.generatePlan")}
      </Button>
    </Card>
  );
}
