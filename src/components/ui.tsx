import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ComponentProps, ReactNode } from "react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "inverse" | "inverse-ghost";

// Iron is the only action colour; plate colours are reserved for macro data.
const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-iron text-iron-fg hover:opacity-90",
  secondary: "border border-line bg-paper text-iron hover:border-iron",
  ghost: "text-steel hover:text-iron hover:bg-wash",
  danger: "border border-alert/30 text-alert hover:bg-alert/10",
  // For use on the emphasised panel.
  inverse: "bg-panel-fg text-panel hover:opacity-90",
  "inverse-ghost": "border border-panel-fg/30 text-panel-fg hover:border-panel-fg",
};

export function buttonClass(variant: ButtonVariant = "primary", size: "sm" | "md" | "lg" = "md") {
  return cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40",
    size === "sm" && "h-9 px-3 text-sm",
    size === "md" && "h-11 px-4 text-[15px]",
    size === "lg" && "h-13 px-5 text-base",
    buttonVariants[variant],
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: "sm" | "md" | "lg" }) {
  return <button className={cn(buttonClass(variant, size), className)} {...props} />;
}

/** A raised surface. Use sparingly: most content sits in rows on the chalk background. */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-[14px] bg-paper p-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("display text-[17px] text-iron", className)} {...props} />;
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
        <h2 className="display text-[20px]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const fieldClass =
  "h-11 w-full rounded-[8px] border border-line bg-paper px-3 text-[15px] text-iron placeholder:text-steel/70 focus:border-iron focus:outline-none disabled:bg-wash disabled:text-steel";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldClass, "h-auto min-h-20 py-2.5", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(fieldClass, "pr-8", className)} {...props} />;
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
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 flex-[1_1_14rem]">
        <h1 className="display text-[32px]">{title}</h1>
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
  return <div className={cn("animate-pulse rounded-[10px] bg-wash", className)} />;
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

/** Protein / carbs / fat as plate swatches + grams. */
export function MacroLine({ p, c, f, className }: { p: number; c: number; f: number; className?: string }) {
  const r = (n: number) => Math.round(n);
  return (
    <span className={cn("num inline-flex items-center gap-2.5 text-[13px] text-steel", className)}>
      <span className="sr-only">
        Protein {r(p)} g, carbs {r(c)} g, fat {r(f)} g
      </span>
      {[
        [p, "var(--plate-blue)"],
        [c, "var(--plate-yellow)"],
        [f, "var(--plate-red)"],
      ].map(([v, color], i) => (
        <span key={i} aria-hidden className="inline-flex items-center gap-1">
          <Plate color={color as string} className="h-3 w-[5px]" />
          {r(v as number)}
        </span>
      ))}
      <span aria-hidden>g</span>
    </span>
  );
}
