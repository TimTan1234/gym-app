// Synthetic pose landmarks for the form check tests.
import { LANDMARK, type Landmark } from "@/lib/training/pose";

export type P = { x: number; y: number };
type Joints = Partial<Record<"shoulder" | "elbow" | "wrist" | "hip" | "knee" | "ankle", P>>;

export const FRAME_MS = 1000 / 30;

/** Seen from the side: the near (left) side clear, the far side behind it and barely visible. */
export function sideOn(j: Joints): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
  for (const [name, p] of Object.entries(j)) {
    const key = name.charAt(0).toUpperCase() + name.slice(1);
    lm[LANDMARK[`left${key}` as keyof typeof LANDMARK]] = { ...p, visibility: 0.9 };
    lm[LANDMARK[`right${key}` as keyof typeof LANDMARK]] = { ...p, visibility: 0.3 };
  }
  return lm;
}

/** Facing the camera: left and right mirrored `half` apart from the midline at x = 0.5. */
export function facing(j: Joints, half: Partial<Record<keyof Joints, number>>): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
  for (const [name, p] of Object.entries(j)) {
    const key = name.charAt(0).toUpperCase() + name.slice(1);
    const h = half[name as keyof Joints] ?? 0.05;
    lm[LANDMARK[`left${key}` as keyof typeof LANDMARK]] = { x: p.x + h, y: p.y, visibility: 0.9 };
    lm[LANDMARK[`right${key}` as keyof typeof LANDMARK]] = { x: p.x - h, y: p.y, visibility: 0.9 };
  }
  return lm;
}

/** `ms` of frames moving a value from `from` to `to` (excluding `from`). */
export function ramp(from: number, to: number, ms: number): number[] {
  const n = Math.round(ms / FRAME_MS);
  return Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
}

/** Point `len` from `from` at `deg` degrees from straight up, leaning toward +x. */
export function toward(from: P, len: number, degFromUp: number): P {
  const r = (degFromUp * Math.PI) / 180;
  return { x: from.x + len * Math.sin(r), y: from.y - len * Math.cos(r) };
}

/** A two-segment arm with equal halves, the wrist straight above the shoulder `height` away. */
export function arm(shoulder: P, half: number, height: number): { elbow: P; wrist: P } {
  const d = Math.min(height, 2 * half);
  const bend = Math.acos(Math.min(1, d / (2 * half)));
  return { elbow: { x: shoulder.x + half * Math.sin(bend), y: shoulder.y - half * Math.cos(bend) }, wrist: { x: shoulder.x, y: shoulder.y - d } };
}

/** Elbow angle of `arm` for a wrist `height` above the shoulder. */
export const elbowAngleFor = (half: number, height: number) => (2 * Math.asin(Math.min(1, height / (2 * half))) * 180) / Math.PI;
/** Wrist height for an elbow angle. */
export const heightForElbow = (half: number, deg: number) => 2 * half * Math.sin((deg * Math.PI) / 360);

export function run<R>(tracker: { update(lm: Landmark[] | undefined, t: number, aspect: number): { rep: R | null } }, frames: Landmark[][]): R[] {
  return frames.flatMap((lm, i) => tracker.update(lm, i * FRAME_MS, 1).rep ?? []);
}
