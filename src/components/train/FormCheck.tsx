"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, SwitchCamera } from "lucide-react";
import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { PARALLEL_DEG, SquatTracker, type SquatFrame, type SquatRep, type View } from "@/lib/training/squat";
import { Button, Label, Select, cn } from "@/components/ui";
import { useT } from "@/i18n/client";
import type { MessageKey, T } from "@/i18n/translate";

type Model = "lite" | "full";
type Facing = "user" | "environment";

/** Copied from node_modules on install (scripts/copy-vendor.mjs). */
const VENDOR = "/vendor/mediapipe";

// Body only: landmarks 0–10 are the face.
const BONES: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31], [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
];
const LEG_JOINTS = [23, 24, 25, 26, 27, 28];
const LEFT_LEG = [23, 25, 27];
const RIGHT_LEG = [24, 26, 28];

async function createLandmarker(model: Model): Promise<PoseLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(VENDOR);
  const options = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: `${VENDOR}/pose_landmarker_${model}.task`, delegate },
    runningMode: "VIDEO" as const,
    numPoses: 1,
  });
  try {
    return await PoseLandmarker.createFromOptions(fileset, options("GPU"));
  } catch {
    // No usable WebGL on this device; the CPU path is slower but works everywhere.
    return PoseLandmarker.createFromOptions(fileset, options("CPU"));
  }
}

/** The depth judge's line: level with the knee, across the thigh (normalised coordinates). */
function judgingLine(pose: NormalizedLandmark[], view: View) {
  const vis = (i: number) => pose[i].visibility ?? 1;
  if (view === "front") {
    const kneeY = (pose[25].y + pose[26].y) / 2;
    return { y: kneeY, x0: Math.min(pose[25].x, pose[26].x) - 0.05, x1: Math.max(pose[25].x, pose[26].x) + 0.05 };
  }
  const [hip, knee] = Math.min(...LEFT_LEG.map(vis)) >= Math.min(...RIGHT_LEG.map(vis)) ? LEFT_LEG : RIGHT_LEG;
  return { y: pose[knee].y, x0: Math.min(pose[hip].x, pose[knee].x) - 0.05, x1: Math.max(pose[hip].x, pose[knee].x) + 0.05 };
}

function draw(canvas: HTMLCanvasElement, width: number, height: number, pose: NormalizedLandmark[] | undefined, frame: SquatFrame) {
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, width, height);
  if (!pose) return;
  const unit = Math.max(2, width / 240);
  const at = (i: number) => [pose[i].x * width, pose[i].y * height] as const;
  const seen = (i: number) => (pose[i].visibility ?? 1) >= 0.3;
  ctx.lineCap = "round";
  ctx.globalAlpha = frame.tracking ? 1 : 0.45;

  // White skeleton on a dark underlay so it reads on any background.
  for (const [color, w] of [["rgba(0,0,0,0.35)", unit * 2.4], ["#ffffff", unit]] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    for (const [a, b] of BONES) {
      if (!seen(a) || !seen(b)) continue;
      ctx.beginPath();
      ctx.moveTo(...at(a));
      ctx.lineTo(...at(b));
      ctx.stroke();
    }
  }
  ctx.fillStyle = "#ffffff";
  for (const i of LEG_JOINTS) {
    if (!seen(i)) continue;
    ctx.beginPath();
    ctx.arc(...at(i), unit * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Dashed until the hip drops to the knee line, then solid: what a depth judge watches for.
  if (frame.tracking && frame.thighAngleDeg !== null) {
    const line = judgingLine(pose, frame.view);
    const deep = frame.thighAngleDeg <= PARALLEL_DEG;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = deep ? unit * 1.6 : unit;
    ctx.setLineDash(deep ? [] : [unit * 3, unit * 2.5]);
    ctx.beginPath();
    ctx.moveTo(line.x0 * width, line.y * height);
    ctx.lineTo(line.x1 * width, line.y * height);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = 1;
}

// Referee lights, as at a powerlifting meet: one per check, white for a pass, red for a fail.
// A check that can't be judged from this camera angle stays dark.
type LightState = "white" | "red" | "off";
const CHECKS = [
  { key: "depth", label: "train.formCheck.lightDepth" },
  { key: "knees", label: "train.formCheck.lightKnees" },
  { key: "torso", label: "train.formCheck.lightTorso" },
] as const satisfies readonly { key: string; label: MessageKey }[];
type Lights = Record<(typeof CHECKS)[number]["key"], LightState>;
const STATE_KEY: Record<LightState, MessageKey> = { white: "train.formCheck.lightWhite", red: "train.formCheck.lightRed", off: "train.formCheck.lightOff" };

function judge(rep: SquatRep): Lights {
  const light = (judged: boolean, failed: boolean): LightState => (!judged ? "off" : failed ? "red" : "white");
  return {
    depth: light(true, rep.faults.includes("shallow")),
    knees: light(rep.kneeRatio !== null, rep.faults.includes("kneesCave")),
    torso: light(rep.torsoLeanDeg !== null, rep.faults.includes("forwardLean")),
  };
}

const UNLIT: Lights = { depth: "off", knees: "off", torso: "off" };

/** `stage` sits on the dark camera view; `inline` brings its own dark housing so white reads on any page. */
function LightRow({ lights, variant, showLabels }: { lights: Lights; variant: "stage" | "inline"; showLabels?: boolean }) {
  const t = useT();
  return (
    <span className={cn("flex shrink-0", variant === "stage" ? "gap-3 sm:gap-4" : "gap-1.5 rounded-full bg-panel px-2 py-1.5")}>
      {CHECKS.map(({ key, label }) => {
        const state = lights[key];
        return (
          <span key={key} className="flex flex-col items-center gap-1.5">
            <span
              role="img"
              aria-label={t("train.formCheck.lightAria", { check: t(label), state: t(STATE_KEY[state]) })}
              className={cn(
                "block rounded-full",
                variant === "stage" ? "size-11 sm:size-14" : "size-3.5",
                state === "white" && "bg-[#f7f7f2]",
                state === "red" && "bg-[#e5372f]",
                variant === "stage" && state === "white" && "shadow-[0_0_22px_rgba(247,247,242,0.55)]",
                variant === "stage" && state === "red" && "shadow-[0_0_22px_rgba(229,55,47,0.6)]",
                state === "off" && (variant === "stage" ? "border-2 border-white/25" : "border border-white/30"),
              )}
            />
            {showLabels && <span className="text-[12px] font-medium text-white/75">{t(label)}</span>}
          </span>
        );
      })}
    </span>
  );
}

function depthText(t: T, deg: number) {
  const d = Math.round(deg);
  if (d > 2) return t("train.formCheck.aboveParallel", { deg: d });
  if (d < -2) return t("train.formCheck.belowParallel", { deg: -d });
  return t("train.formCheck.atParallel");
}

function verdict(t: T, rep: SquatRep) {
  if (rep.faults.length === 0) return t("train.formCheck.goodLift");
  const lower = (s: string, i: number) => (i > 0 && t.locale === "en" ? s.charAt(0).toLowerCase() + s.slice(1) : s);
  return rep.faults.map((f, i) => lower(t(`train.formCheck.faults.${f}`), i)).join(t("train.formCheck.listSeparator"));
}

const VIEW_KEY: Record<View, MessageKey> = { side: "train.formCheck.viewSide", front: "train.formCheck.viewFront", unclear: "train.formCheck.viewUnclear" };

interface Hud {
  tracking: boolean;
  view: View;
  thighAngleDeg: number | null;
  fps: number;
}

export function FormCheck() {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const trackerRef = useRef(new SquatTracker());
  const [model, setModel] = useState<Model>("lite");
  const [modelState, setModelState] = useState<"loading" | "ready" | "error">("loading");
  const [facing, setFacing] = useState<Facing>("user");
  const [camera, setCamera] = useState<"starting" | "on" | "off">("starting");
  const [hud, setHud] = useState<Hud>({ tracking: false, view: "unclear", thighAngleDeg: null, fps: 0 });
  const [reps, setReps] = useState<SquatRep[]>([]);

  // Load (or swap) the pose model.
  useEffect(() => {
    let cancelled = false;
    let created: PoseLandmarker | null = null;
    createLandmarker(model)
      .then((l) => {
        if (cancelled) return l.close();
        created = l;
        landmarkerRef.current = l;
        setModelState("ready");
      })
      .catch(() => {
        if (!cancelled) setModelState("error");
      });
    return () => {
      cancelled = true;
      if (landmarkerRef.current === created) landmarkerRef.current = null;
      created?.close();
    };
  }, [model]);

  // Start the chosen camera; same lifecycle as the barcode scanner.
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    const stopCamera = () => stream?.getTracks().forEach((track) => track.stop());
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("No camera API");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 960 } }, audio: false });
        // Closed while the camera was starting: release it, or the camera light stays on.
        if (cancelled) return stopCamera();
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        if (!cancelled) setCamera("on");
      } catch {
        if (!cancelled) setCamera("off");
      }
    })();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [facing]);

  // Run the pose model on each new video frame.
  useEffect(() => {
    let raf = 0;
    let lastVideoTime = -1;
    let lastTs = 0;
    let frames = 0;
    let windowStart = performance.now();
    let fps = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const landmarker = landmarkerRef.current;
      if (!video || !canvas || !landmarker || video.readyState < 2 || video.currentTime === lastVideoTime) return;
      lastVideoTime = video.currentTime;
      // The landmarker needs strictly increasing timestamps.
      const ts = Math.max(performance.now(), lastTs + 1);
      lastTs = ts;
      let pose: NormalizedLandmark[] | undefined;
      try {
        pose = landmarker.detectForVideo(video, ts).landmarks[0];
      } catch {
        return;
      }
      const frame = trackerRef.current.update(pose, ts, video.videoWidth / video.videoHeight);
      draw(canvas, video.videoWidth, video.videoHeight, pose, frame);
      const rep = frame.rep;
      if (rep) setReps((r) => [rep, ...r]);
      frames++;
      if (ts - windowStart >= 500) {
        fps = Math.round((frames * 1000) / (ts - windowStart));
        frames = 0;
        windowStart = ts;
      }
      // React only needs the readout a few times a second.
      if (frames % 6 === 0 || rep) setHud({ tracking: frame.tracking, view: frame.view, thighAngleDeg: frame.thighAngleDeg, fps });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  function reset() {
    trackerRef.current = new SquatTracker();
    setReps([]);
  }

  const status =
    modelState === "error"
      ? t("train.formCheck.modelError")
      : camera === "off"
        ? t("train.formCheck.noCamera")
        : modelState === "loading"
          ? t("train.formCheck.loadingModel")
          : camera === "starting"
            ? t("train.formCheck.startingCamera")
            : !hud.tracking
              ? t("train.formCheck.notInView")
              : null;
  const busy = (modelState === "loading" && camera !== "off") || (camera === "starting" && modelState !== "error");
  const last = reps[0];
  const running = modelState === "ready" && camera === "on";

  return (
    <div className="space-y-6">
      {/* On phones the whole stage fits on screen under the page header, so the lights stay visible mid-set. */}
      <div className="relative h-[min(133vw,calc(100dvh-15rem))] min-h-80 overflow-hidden rounded-[14px] bg-black sm:aspect-video sm:h-auto sm:min-h-0">
        {/* Selfie view is mirrored; the overlay is mirrored with it so the two line up. */}
        <div className={cn("absolute inset-0", facing === "user" && "-scale-x-100")}>
          <video ref={videoRef} muted playsInline className="absolute inset-0 size-full object-contain" />
          <canvas ref={canvasRef} aria-hidden className="absolute inset-0 size-full object-contain" />
        </div>

        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 text-[13px] font-semibold text-white">
          {running && hud.tracking ? <span className="rounded-full bg-black/55 px-2.5 py-1">{t(VIEW_KEY[hud.view])}</span> : <span />}
          {running && (
            <span className="flex items-center gap-2">
              {hud.thighAngleDeg !== null && (
                <span className="num rounded-full bg-black/55 px-2.5 py-1">{t("train.formCheck.thighNow", { deg: Math.round(hud.thighAngleDeg) })}</span>
              )}
              <span className="num px-1 text-white/60">{t("train.formCheck.fps", { fps: hud.fps })}</span>
            </span>
          )}
        </div>

        {status && (
          <p className="absolute inset-x-6 top-1/2 flex -translate-y-1/2 items-center justify-center gap-2 rounded-[10px] bg-black/60 px-3 py-2 text-center text-sm text-white" aria-live="polite">
            {busy && <Loader2 className="size-4 shrink-0 animate-spin" />}
            {status}
          </p>
        )}

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-4 pb-4 pt-12 text-white">
          <div>
            <p className="text-[13px] text-white/75">{t("train.formCheck.reps")}</p>
            <p className="score text-[80px] sm:text-[96px]">{reps.length}</p>
          </div>
          <div className="flex flex-col items-end gap-2" aria-live="polite">
            {/* Keyed by rep so the three lights switch on together for each new rep. */}
            <span key={last?.index ?? 0} className={cn("block", last && "animate-[light-on_220ms_ease-out]")}>
              <LightRow lights={last ? judge(last) : UNLIT} variant="stage" showLabels />
            </span>
            {last && <p className="text-right text-[15px] font-semibold">{verdict(t, last)}</p>}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Label className="min-w-40 flex-1">
          {t("train.formCheck.model")}
          <Select
            value={model}
            onChange={(e) => {
              setModelState("loading");
              setModel(e.target.value as Model);
            }}
          >
            <option value="lite">{t("train.formCheck.modelLite")}</option>
            <option value="full">{t("train.formCheck.modelFull")}</option>
          </Select>
        </Label>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setCamera("starting");
            setFacing((f) => (f === "user" ? "environment" : "user"));
          }}
        >
          <SwitchCamera className="size-4" /> {t("train.formCheck.switchCamera")}
        </Button>
        <Button type="button" variant="secondary" onClick={reset} disabled={reps.length === 0}>
          <RotateCcw className="size-4" /> {t("train.formCheck.reset")}
        </Button>
      </div>

      <section aria-labelledby="form-check-setup" className="space-y-3">
        <div>
          <h2 id="form-check-setup" className="display text-[19px]">{t("train.formCheck.setupTitle")}</h2>
          <p className="mt-1 max-w-[62ch] text-sm text-steel">{t("train.formCheck.setupPlace")}</p>
        </div>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {[
            { title: t("train.formCheck.sideTitle"), judges: t("train.formCheck.sideJudges"), lights: { depth: "white", knees: "off", torso: "white" } as Lights },
            { title: t("train.formCheck.frontTitle"), judges: t("train.formCheck.frontJudges"), lights: { depth: "white", knees: "white", torso: "off" } as Lights },
          ].map((v) => (
            <div key={v.title} className="flex items-center gap-3">
              <LightRow lights={v.lights} variant="inline" />
              <div>
                <dt className="font-semibold">{v.title}</dt>
                <dd className="text-steel">{v.judges}</dd>
              </div>
            </div>
          ))}
        </dl>
      </section>

      {reps.length === 0 ? (
        <p className="border-t border-line pt-4 text-sm text-steel">{t("train.formCheck.noReps")}</p>
      ) : (
        <ol className="divide-y divide-line border-y border-line">
          {reps.map((rep) => (
            <li key={rep.index} className="grid grid-cols-[2.75rem_1fr] items-baseline gap-x-2 py-3">
              <span className="score text-[30px]">
                <span className="sr-only">{t("train.formCheck.repTitle", { n: rep.index })}</span>
                <span aria-hidden>{rep.index}</span>
              </span>
              <span className="min-w-0 space-y-1">
                <span className="flex items-center gap-2.5">
                  <LightRow lights={judge(rep)} variant="inline" />
                  <span className={cn("text-sm font-semibold", rep.faults.length === 0 ? "text-good" : "text-alert")}>{verdict(t, rep)}</span>
                </span>
                <span className="num block text-[13px] text-steel">
                  {[
                    depthText(t, rep.thighAngleDeg),
                    rep.torsoLeanDeg !== null && t("train.formCheck.torsoLean", { deg: Math.round(rep.torsoLeanDeg) }),
                    rep.kneeRatio !== null && t("train.formCheck.kneeWidth", { pct: Math.round(rep.kneeRatio * 100) }),
                    t("train.formCheck.duration", { s: (rep.durationMs / 1000).toFixed(1) }),
                  ]
                    .filter(Boolean)
                    .join(t("train.formCheck.listSeparator"))}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}

      <p className="text-xs text-steel">{t("train.formCheck.disclaimer")}</p>
    </div>
  );
}
