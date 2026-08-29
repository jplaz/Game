import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none select-none",
  {
    variants: {
      variant: {
        primary: "bg-clay-600 text-cream-50 hover:bg-clay-700 shadow-card",
        secondary: "bg-white text-ink-700 border border-sand-200 hover:bg-cream-100",
        ghost: "text-ink-500 hover:bg-sand-100/60 hover:text-ink-700",
        danger: "bg-white text-red-700 border border-red-200 hover:bg-red-50",
      },
      size: {
        sm: "h-9 px-3.5 text-sm rounded-full",
        md: "h-11 px-5 text-sm rounded-full",
        lg: "h-13 px-7 py-3.5 text-base rounded-full",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}

export function buttonClass(opts?: VariantProps<typeof buttonVariants> & { className?: string }) {
  return cn(buttonVariants({ variant: opts?.variant, size: opts?.size }), opts?.className);
}
