import { cn } from "@/lib/cn";

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "accent" | "success" | "pending";
}) {
  const tones = {
    neutral: "bg-sand-100 text-ink-500",
    accent: "bg-clay-400/15 text-clay-700",
    success: "bg-sage-100 text-sage-600",
    pending: "bg-blush-100 text-clay-700",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "lc-card flex flex-col items-center text-center px-6 py-12 gap-3",
        className
      )}
    >
      {icon ? <div className="text-sand-400">{icon}</div> : null}
      <h3 className="text-lg text-ink-600">{title}</h3>
      {body ? <p className="text-sm text-ink-300 max-w-sm leading-relaxed">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block h-5 w-5 animate-spin rounded-full border-2 border-sand-200 border-t-clay-600",
        className
      )}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("lc-skeleton rounded-xl", className)} aria-hidden />;
}
