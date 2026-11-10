"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Download, Smartphone } from "lucide-react";
import { createLinkCode, revokeDevice } from "@/server/devices";
import { Button, buttonClass } from "@/components/ui";
import { useT } from "@/i18n/client";

export interface LinkedPhone {
  id: string;
  name: string;
  /** Already formatted in the user's time zone, or null before the first sync. */
  lastSync: string | null;
}

/** Link an Android phone that sends steps and sleep from Health Connect, and unlink it again. */
export function LinkedPhones({ phones, serverUrl, minutes, apk }: { phones: LinkedPhone[]; serverUrl: string; minutes: number; apk: string | null }) {
  const t = useT();
  const [code, setCode] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const secure = serverUrl.startsWith("https://");

  function link() {
    startTransition(async () => {
      const res = await createLinkCode();
      setCode(res.code);
    });
  }

  function unlink(phone: LinkedPhone) {
    if (!confirm(t("settings.phone.unlinkConfirm", { name: phone.name }))) return;
    startTransition(async () => {
      const res = await revokeDevice(phone.id);
      if (res.ok) toast(t("settings.phone.unlinked", { name: phone.name }));
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-steel">{t("settings.phone.intro")}</p>
      {apk && (
        <a href={apk} download className={buttonClass("ghost", "sm", "start")}>
          <Download className="size-4" /> {t("settings.phone.download")}
        </a>
      )}

      {phones.length > 0 && (
        <ul className="divide-y divide-line border-y border-line">
          {phones.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2.5">
              <Smartphone className="size-5 shrink-0 text-steel" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.name}</span>
                <span className="block text-[13px] text-steel">
                  {p.lastSync ? t("settings.phone.lastSync", { when: p.lastSync }) : t("settings.phone.neverSynced")}
                </span>
              </span>
              <Button variant="ghost" size="sm" edge="end" onClick={() => unlink(p)} disabled={pending} className="hover:text-alert">
                {t("settings.phone.unlink")}
                <span className="sr-only"> {p.name}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      {code ? (
        // The code is the thing to copy across: big, spaced, in the figures' face.
        <div className="space-y-3 rounded-card border border-line bg-chalk p-4" aria-live="polite">
          <p className="text-sm">{t("settings.phone.codeHelp", { minutes })}</p>
          <p className="score text-center text-[40px] tracking-[0.12em]" data-testid="link-code">
            {code.slice(0, 4)}-{code.slice(4)}
          </p>
          <dl className="text-sm">
            <dt className="text-[13px] text-steel">{t("settings.phone.server")}</dt>
            <dd className="num select-all break-all font-medium" data-testid="server-url">{serverUrl}</dd>
          </dl>
          {/* The app itself refuses http://; this says why before anyone types the address in. */}
          {!secure && <p className="text-[13px] text-alert">{t("settings.phone.needsHttps", { url: serverUrl })}</p>}
          <Button variant="secondary" size="sm" onClick={() => setCode(null)}>
            {t("common.done")}
          </Button>
        </div>
      ) : (
        <Button variant="secondary" onClick={link} disabled={pending}>
          <Smartphone className="size-4" /> {t("settings.phone.link")}
        </Button>
      )}
    </div>
  );
}
