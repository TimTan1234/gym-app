"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/i18n/config";
import { useLocale, useT } from "@/i18n/client";
import { setLocale } from "@/server/preferences";
import { setThemePref, useThemePref, type ThemePref } from "@/lib/theme";
import { cn } from "@/components/ui";

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
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          lang={o.lang}
          disabled={disabled}
          onClick={() => value !== o.value && onChange(o.value)}
          className={cn(
            "h-10 rounded-[10px] border text-sm font-semibold disabled:opacity-50",
            value === o.value ? "border-iron bg-iron text-iron-fg" : "border-line text-steel hover:border-iron",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Language (saved per device in a cookie) and light/dark appearance (saved per device). */
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
        <p className="text-xs text-steel">{t("settings.languageHint")}</p>
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
        <p className="text-xs text-steel">{t("settings.appearanceHint")}</p>
      </div>
    </div>
  );
}
