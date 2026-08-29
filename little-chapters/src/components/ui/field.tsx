"use client";

import { cn } from "@/lib/cn";
import { useId } from "react";

const inputClass =
  "w-full h-11 px-4 rounded-xl border border-sand-200 bg-white text-ink-700 placeholder:text-ink-300 focus:border-clay-500 transition-colors text-base";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (id: string) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink-600">
        {label}
      </label>
      {children(id)}
      {hint ? <p className="text-xs text-ink-300">{hint}</p> : null}
    </div>
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(inputClass, "h-auto min-h-28 py-3 leading-relaxed", className)}
      {...props}
    />
  );
}

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(inputClass, "appearance-none", className)} {...props} />;
}
