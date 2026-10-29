"use client";

import { useRef } from "react";
import { Camera, Images, X } from "lucide-react";
import { MAX_MEAL_PHOTOS } from "@/lib/ai/schemas";
import { Button, cn } from "@/components/ui";
import { useT } from "@/i18n/client";

// How the frame divides between photos, so several read as one meal:
// one fills it, two sit side by side, three are one large and two stacked, four a quarter grid.
const FRAME: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-[3fr_2fr] grid-rows-2",
  4: "grid-cols-2 grid-rows-2",
};

/**
 * The meal's photos in one frame. Empty, the frame is a dashed well that opens
 * the camera; the gallery picks several at once.
 */
export function MealPhotos({
  images,
  onPick,
  onRemove,
}: {
  images: string[];
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (index: number) => void;
}) {
  const t = useT();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const full = images.length >= MAX_MEAL_PHOTOS;
  const camera = () => cameraRef.current?.click();
  const gallery = () => galleryRef.current?.click();

  return (
    <div>
      {/* Camera: one shot straight from the camera. Gallery: pick several at once. */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPick} data-testid="meal-camera-input" />
      <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={onPick} data-testid="meal-photos-input" />

      {images.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-field border-2 border-dashed border-line bg-chalk px-4 py-5">
          <button
            type="button"
            onClick={camera}
            className="flex flex-col items-center gap-2 rounded-field px-4 py-2 text-[15px] font-semibold text-iron hover:bg-wash"
          >
            <span className="grid size-12 place-items-center rounded-full bg-iron text-iron-fg">
              <Camera className="size-5" />
            </span>
            {t("nutrition.takePhoto")}
          </button>
          <Button type="button" variant="ghost" size="sm" onClick={gallery}>
            <Images className="size-4" /> {t("nutrition.choosePhotos", { max: MAX_MEAL_PHOTOS })}
          </Button>
        </div>
      ) : (
        <>
          <ul
            className={cn("grid aspect-[4/3] gap-0.5 overflow-hidden rounded-field bg-paper", FRAME[images.length])}
            aria-label={t("nutrition.photos")}
          >
            {images.map((src, i) => (
              <li key={i} className={cn("relative min-h-0", images.length === 3 && i === 0 && "row-span-2")}>
                {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
                <img src={src} alt={t("nutrition.photoN", { n: i + 1 })} className="size-full object-cover" />
                <button
                  type="button"
                  aria-label={t("nutrition.removePhotoN", { n: i + 1 })}
                  onClick={() => onRemove(i)}
                  className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-black/60 text-white hover:bg-black/75"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-1 flex items-center gap-1">
            <Button type="button" variant="ghost" size="sm" edge="start" onClick={camera} disabled={full}>
              <Camera className="size-4" /> {t("nutrition.addPhoto")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={gallery} disabled={full} aria-label={t("nutrition.choosePhotos", { max: MAX_MEAL_PHOTOS })}>
              <Images className="size-4" /> {t("nutrition.fromPhotos")}
            </Button>
            <span className="num ml-auto text-[13px] text-steel">{t("nutrition.photoCount", { count: images.length, max: MAX_MEAL_PHOTOS })}</span>
          </div>
        </>
      )}
    </div>
  );
}
