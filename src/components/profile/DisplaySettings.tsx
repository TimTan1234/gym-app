"use client";

import { useRef, useState, useTransition } from "react";
import { Image as ImageIcon, Plus } from "lucide-react";
import { toast } from "sonner";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/i18n/config";
import { useLocale, useT } from "@/i18n/client";
import { setLocale } from "@/server/preferences";
import { setThemePref, useThemePref, type ThemePref } from "@/lib/theme";
import { clearBackgroundPhoto, setBackgroundPhoto, useBackgroundPhoto, type BackgroundMode } from "@/lib/background";
import { Button, cn, segmentClass, segmentTrack } from "@/components/ui";

function Segmented<V extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: V;
  options: { value: V; label: string; lang?: string }[];
  onChange: (v: V) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={segmentTrack(true)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          lang={o.lang}
          disabled={disabled}
          onClick={() => value !== o.value && onChange(o.value)}
          className={segmentClass(value === o.value, true)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Language (saved per device in a cookie), light/dark appearance and background photo (saved per device). */
export function DisplaySettings() {
  const t = useT();
  const locale = useLocale();
  const theme = useThemePref();
  const [pending, startTransition] = useTransition();

  function changeLocale(next: Locale) {
    startTransition(async () => {
      const res = await setLocale(next);
      if (!res.ok) return void toast.error(res.error);
      // Screens stay mounted in the background after navigation, so reload to
      // re-render every one of them in the new language.
      window.location.reload();
    });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-[13px] font-medium text-steel">{t("settings.language")}</p>
        <Segmented
          label={t("settings.language")}
          value={locale}
          disabled={pending}
          options={LOCALES.map((l) => ({ value: l, label: LOCALE_NAMES[l], lang: l === "zh" ? "zh-Hans" : "en" }))}
          onChange={changeLocale}
        />
      </div>
      <div className="space-y-2">
        <p className="text-[13px] font-medium text-steel">{t("settings.appearance")}</p>
        <Segmented<ThemePref>
          label={t("settings.appearance")}
          value={theme}
          options={[
            { value: "system", label: t("settings.themeSystem") },
            { value: "light", label: t("settings.themeLight") },
            { value: "dark", label: t("settings.themeDark") },
          ]}
          onChange={setThemePref}
        />
      </div>
      <BackgroundPhotos />
    </div>
  );
}

const BACKGROUND_LABELS = {
  light: { name: "settings.background.light", short: "settings.themeLight", preview: "settings.background.previewLight", remove: "settings.background.removeLight" },
  dark: { name: "settings.background.dark", short: "settings.themeDark", preview: "settings.background.previewDark", remove: "settings.background.removeDark" },
} as const;

/** One photo per theme, each previewed in its own theme; the one showing switches with the theme. */
function BackgroundPhotos() {
  const t = useT();
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-medium text-steel">{t("settings.background.title")}</p>
      <div className="grid max-w-sm grid-cols-2 gap-3">
        <BackgroundPhoto mode="light" />
        <BackgroundPhoto mode="dark" />
      </div>
    </div>
  );
}

/**
 * A small portrait of the app in this theme: the photo under the same wash the
 * page uses, a heading and a card. Tapping it picks the photo.
 */
function BackgroundPhoto({ mode }: { mode: BackgroundMode }) {
  const t = useT();
  const labels = BACKGROUND_LABELS[mode];
  const photo = useBackgroundPhoto(mode);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      await setBackgroundPhoto(mode, file);
    } catch {
      toast.error(t("settings.background.failed"));
    } finally {
      setBusy(false);
    }
  }

  const action = t(photo ? "settings.background.change" : "settings.background.choose");
  return (
    <div className="min-w-0">
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={pick} data-testid={`background-${mode}-input`} />
      <button
        type="button"
        data-mode={mode}
        disabled={busy}
        aria-label={`${t(labels.name)}: ${action}`}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "wallpaper-preview relative block aspect-[3/4] w-full overflow-hidden rounded-card border bg-(--pv-canvas) text-left transition-opacity disabled:opacity-60",
          photo ? "border-(--pv-line)" : "border-dashed border-(--pv-muted)/60",
        )}
      >
        {photo && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
            <img src={photo} alt={t(labels.preview)} className="absolute inset-0 size-full object-cover" />
            <span aria-hidden className="wallpaper-wash absolute inset-0" />
          </>
        )}
        <span aria-hidden className="absolute inset-x-2.5 top-2.5 flex items-start justify-between">
          <span className="font-serif text-xl leading-none text-(--pv-ink)">{t("nav.today")}</span>
          {photo && (
            <span className="grid size-7 place-items-center rounded-full bg-(--pv-paper) text-(--pv-ink)">
              <ImageIcon className="size-3.5" />
            </span>
          )}
        </span>
        {!photo && (
          <span className="absolute inset-x-0 top-[38%] flex justify-center px-2">
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-(--pv-paper) py-1.5 pl-2 pr-2.5 text-xs font-medium text-(--pv-ink)">
              <Plus aria-hidden className="size-3.5" /> {action}
            </span>
          </span>
        )}
        <span aria-hidden className="absolute inset-x-2.5 bottom-2.5 block space-y-1.5 rounded-[7px] bg-(--pv-paper) p-2.5">
          <span className="block font-serif text-lg leading-none text-(--pv-ink)">2,150</span>
          <span className="block h-1 w-3/4 rounded-full bg-(--pv-muted)/35" />
        </span>
      </button>
      <div className="mt-1.5 flex min-h-9 items-center justify-between gap-1">
        <p className="truncate text-[13px] font-medium">{t(labels.short)}</p>
        {photo && (
          <Button type="button" variant="ghost" size="sm" edge="end" aria-label={t(labels.remove)} onClick={() => clearBackgroundPhoto(mode)}>
            {t("settings.background.remove")}
          </Button>
        )}
      </div>
    </div>
  );
}
