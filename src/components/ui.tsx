import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import type { ComponentProps, ReactNode } from "react";

// Knows the theme's radius names, so `rounded-full` in a className replaces a `rounded-field`.
const twMerge = extendTailwindMerge({ extend: { theme: { radius: ["field", "card"] } } });

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "inverse" | "inverse-ghost";

// Coral is the one action colour and stays scarce: one primary button per view.
// Plate colours are reserved for macro data. Pressing darkens; hover adds nothing.
const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-fg active:bg-primary-active",
  secondary: "border border-line bg-chalk text-iron active:bg-wash",
  ghost: "text-steel hover:text-iron hover:bg-wash",
  danger: "border border-alert/30 text-alert hover:bg-alert/10",
  // For use on the emphasised panel.
  inverse: "bg-panel-fg text-panel active:opacity-85",
  "inverse-ghost": "border border-panel-fg/30 text-panel-fg hover:border-panel-fg",
};

type ButtonSize = "sm" | "md" | "lg";

/**
 * Which edge of its row a borderless button sits on. It is pulled out by its own
 * padding there, so its text or icon lines up with the content around it.
 */
export type Edge = "start" | "end";

const EDGE_PULL: Record<ButtonSize, Record<Edge, string>> = {
  sm: { start: "-ml-3", end: "-mr-3" },
  md: { start: "-ml-4", end: "-mr-4" },
  lg: { start: "-ml-5", end: "-mr-5" },
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", edge?: Edge) {
  return cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-field font-medium transition-colors disabled:pointer-events-none disabled:opacity-40",
    size === "sm" && "h-9 px-3 text-sm",
    size === "md" && "h-11 px-4 text-[15px]",
    size === "lg" && "h-13 px-5 text-base",
    buttonVariants[variant],
    edge && EDGE_PULL[size][edge],
  );
}

export function Button({
  variant = "primary",
  size = "md",
  edge,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize; edge?: Edge }) {
  return <button className={cn(buttonClass(variant, size, edge), className)} {...props} />;
}

/**
 * A square, icon-only button with a 36px tap target. With `edge`, the icon (not
 * the tap target) lines up with that edge of the row.
 */
export function IconButton({
  tone = "default",
  edge,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { tone?: "default" | "danger"; edge?: Edge }) {
  return (
    <button
      type={type}
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-field text-steel transition-colors disabled:opacity-50",
        tone === "danger" ? "hover:bg-alert/10 hover:text-alert" : "hover:bg-wash hover:text-iron",
        edge === "start" && "-ml-2.5",
        edge === "end" && "-mr-2.5",
        className,
      )}
      {...props}
    />
  );
}

/**
 * A round, tinted icon button for a page's header actions (refresh, settings).
 * A class, so links can wear it too.
 */
export const tonalIconClass =
  "grid size-12 shrink-0 place-items-center rounded-full bg-wash text-iron transition-colors active:bg-line disabled:opacity-50";

/** A cream card on the canvas: depth comes from the colour step, not a shadow. */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-card bg-paper p-5", className)} {...props} />;
}

/** Card titles are sans; the serif is kept for page and section headings. */
export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("text-[17px] font-semibold text-iron", className)} {...props} />;
}

/** Heading + content without a box. */
export function Section({
  title,
  action,
  children,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="display text-[22px]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// Canvas-filled, so a field reads as an inset on the cream card; focus gets a coral edge and a soft ring.
const fieldClass =
  "h-11 w-full rounded-field border border-line bg-chalk px-3 text-[15px] text-iron placeholder:text-steel/70 focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/15 disabled:bg-wash disabled:text-steel";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  // Block, or the inline box's descender space adds a few px under it in a stack.
  return <textarea className={cn(fieldClass, "block h-auto min-h-20 py-2.5", className)} {...props} />;
}

/** The browser's own arrow is replaced (see .select), so the text lines up with an Input's. */
export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(fieldClass, "select pr-9", className)} {...props} />;
}

export function Label({ className, children, hint, ...props }: ComponentProps<"label"> & { hint?: string }) {
  return (
    <label className={cn("flex flex-col gap-1.5 text-[13px] font-medium text-steel", className)} {...props}>
      {children}
      {hint && <span className="text-xs font-normal">{hint}</span>}
    </label>
  );
}

export function Badge({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full bg-wash px-2 py-0.5 text-xs font-medium text-steel", className)}
      {...props}
    />
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    // The action wraps under the title when both don't fit, instead of squeezing a long title.
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 flex-[1_1_14rem]">
        <h1 className="display text-[34px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-steel [overflow-wrap:anywhere]">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="border-t border-line pt-4">
      <p className="font-semibold">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-steel">{children}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** A single macro-coloured plate glyph, used as the legend swatch for macros. */
export function Plate({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cn("inline-block h-3.5 w-1.5 rounded-[2px]", className)} style={{ background: color }} />;
}

export function ProgressBar({ value, max, color = "var(--iron)" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-[2px] bg-wash">
      <div className="h-full rounded-[2px] transition-[width]" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-card bg-wash", className)} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-9 w-44" />
      <Skeleton className="h-28" />
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
    </div>
  );
}
