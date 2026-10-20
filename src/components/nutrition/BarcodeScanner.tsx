"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImageUp, Loader2, X } from "lucide-react";
import { BARCODE_RE, type BarcodeItem } from "@/lib/nutrition/barcode";
import { Button, Card, Input } from "@/components/ui";

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"] as const;

interface Detector {
  detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]>;
}

let detectorPromise: Promise<Detector> | null = null;

/** Native BarcodeDetector where it reads EAN/UPC, else the ZXing WebAssembly ponyfill. */
function getDetector(): Promise<Detector> {
  detectorPromise ??= (async () => {
    const Native = (globalThis as { BarcodeDetector?: { new (o: object): Detector; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
    if (Native) {
      const supported = await Native.getSupportedFormats().catch((): string[] => []);
      if (FORMATS.every((f) => supported.includes(f))) return new Native({ formats: [...FORMATS] });
    }
    const { BarcodeDetector, setZXingModuleOverrides } = await import("barcode-detector/ponyfill");
    // Served from public/vendor (copied on install) rather than a CDN.
    setZXingModuleOverrides({ locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? "/vendor/zxing_reader.wasm" : prefix + path) });
    return new BarcodeDetector({ formats: [...FORMATS] });
  })();
  return detectorPromise;
}

type Camera = "starting" | "on" | "off";

export function BarcodeScanner({ onFound, onClose }: { onFound: (item: BarcodeItem) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /** True while a code is being looked up; pauses frame scanning. */
  const busyRef = useRef(false);
  /** A code that wasn't found, so the camera doesn't keep looking it up. */
  const failedRef = useRef<string | null>(null);
  const [camera, setCamera] = useState<Camera>("starting");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function lookup(value: string) {
    const digits = value.replace(/\D/g, "");
    if (!BARCODE_RE.test(digits)) {
      setError("Enter the 8 to 14 digits under the barcode");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setCode(digits);
    setError(null);
    try {
      const res = await fetch(`/api/food/barcode?code=${digits}`);
      const data = (await res.json()) as { item?: BarcodeItem; error?: string };
      if (!res.ok || !data.item) throw new Error(data.error ?? "Lookup failed");
      onFound(data.item);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
      failedRef.current = digits;
      busyRef.current = false;
      setBusy(false);
    }
  }

  // Start the rear camera and scan a frame every 300 ms until a code is read.
  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const stopCamera = () => stream?.getTracks().forEach((t) => t.stop());

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("No camera API");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        // Closed while the camera was starting: release it, or the camera light stays on.
        if (cancelled) return stopCamera();
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        const detector = await getDetector();
        if (cancelled) return;
        setCamera("on");
        const tick = async () => {
          if (cancelled) return;
          if (!busyRef.current) {
            try {
              const hit = (await detector.detect(video)).find((r) => BARCODE_RE.test(r.rawValue) && r.rawValue !== failedRef.current);
              if (hit && !busyRef.current) await lookup(hit.rawValue);
            } catch {
              // A frame that can't be read yet; try the next one.
            }
          }
          timer = setTimeout(tick, 300);
        };
        tick();
      } catch {
        if (!cancelled) setCamera("off");
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      stopCamera();
    };
    // Runs once per open; lookup only reads refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function scanPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    try {
      const bitmap = await createImageBitmap(file);
      const results = await (await getDetector()).detect(bitmap);
      bitmap.close();
      const hit = results.find((r) => BARCODE_RE.test(r.rawValue));
      if (hit) await lookup(hit.rawValue);
      else setError("No barcode found in that photo. Try a closer, sharper shot or type the number.");
    } catch {
      setError("Couldn't read that photo");
    }
  }

  // Portalled to <body> so the sheet covers the whole screen, tab bar included.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Scan a barcode" className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <Card className="w-full max-w-md space-y-4 rounded-b-none pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-[14px]">
        <div className="flex items-center justify-between">
          <h2 className="display text-[22px]">Scan a barcode</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-[8px] p-2 text-steel hover:bg-wash hover:text-iron">
            <X className="size-5" />
          </button>
        </div>

        {camera !== "off" && (
          <div className="relative aspect-[4/3] overflow-hidden rounded-[10px] bg-black">
            <video ref={videoRef} muted playsInline className="size-full object-cover" />
            {/* Aiming guide */}
            <div aria-hidden className="absolute inset-x-8 top-1/2 h-20 -translate-y-1/2 rounded-[8px] border-2 border-white/80" />
            <p className="absolute inset-x-0 bottom-0 bg-black/50 px-3 py-2 text-center text-sm text-white" aria-live="polite">
              {busy ? `Looking up ${code}…` : camera === "starting" ? "Starting camera…" : "Hold the barcode inside the box"}
            </p>
          </div>
        )}
        {camera === "off" && (
          <p className="text-sm text-steel">The camera isn&apos;t available here. Type the number under the barcode, or scan a photo of it.</p>
        )}

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            lookup(code);
          }}
        >
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
            placeholder="Barcode number"
            aria-label="Barcode number"
            maxLength={20}
            className="num"
          />
          <Button type="submit" disabled={busy} className="shrink-0">
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Look up
          </Button>
        </form>

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={scanPhoto} />
        <Button type="button" variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
          <ImageUp className="size-4" /> Scan a photo instead
        </Button>

        {error && (
          <p role="alert" className="text-sm text-alert">
            {error}
          </p>
        )}
        <p className="text-xs text-steel">Product data from Open Food Facts. Check it against the label.</p>
      </Card>
    </div>,
    document.body,
  );
}
