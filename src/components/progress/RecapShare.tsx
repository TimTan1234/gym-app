"use client";

import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button, Skeleton } from "@/components/ui";
import { useT } from "@/i18n/client";

/**
 * The recap card as the server draws it, and a button to share that image. The image is fetched
 * up front so the share sheet opens straight from the tap (browsers want it inside the gesture).
 */
export function RecapShare({ alt, fileName }: { alt: string; fileName: string }) {
  const t = useT();
  const [image, setImage] = useState<{ file: File; url: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    fetch("/api/recap/image")
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setImage({ file: new File([blob], fileName, { type: "image/png" }), url });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [fileName]);

  async function share() {
    if (!image) return;
    const data = { files: [image.file], title: t("progress.recap.title") };
    if (navigator.canShare?.(data)) {
      try {
        await navigator.share(data);
      } catch (e) {
        // Closing the share sheet is not an error.
        if ((e as Error).name !== "AbortError") toast.error(t("common.somethingWrong"));
      }
      return;
    }
    const a = document.createElement("a");
    a.href = image.url;
    a.download = fileName;
    a.click();
  }

  if (failed) return <p className="text-sm text-alert">{t("progress.recap.imageError")}</p>;
  return (
    <div className="space-y-4">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- a blob of the user's own card, nothing to optimise
        <img src={image.url} alt={alt} width={1080} height={1350} className="mx-auto w-full max-w-md rounded-card border border-line" />
      ) : (
        <Skeleton className="mx-auto aspect-[4/5] w-full max-w-md" />
      )}
      <Button size="lg" className="mx-auto flex w-full max-w-md" onClick={share} disabled={!image}>
        <Share2 className="size-5" /> {t("progress.recap.share")}
      </Button>
    </div>
  );
}
