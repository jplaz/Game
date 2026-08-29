import { format } from "date-fns";

export function formatDate(d: Date | string): string {
  return format(typeof d === "string" ? new Date(`${d}T00:00:00`) : d, "MMMM d, yyyy");
}

export function formatDateShort(d: Date | string): string {
  return format(typeof d === "string" ? new Date(`${d}T00:00:00`) : d, "MMM d");
}

export function formatMonth(d: Date | string): string {
  return format(typeof d === "string" ? new Date(`${d}T00:00:00`) : d, "MMMM yyyy");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    cents / 100
  );
}

/** Grams → "7 lb 4 oz (3.29 kg)" style display, metric-first optional later. */
export function formatWeight(grams: number): string {
  const totalOz = grams / 28.3495;
  const lb = Math.floor(totalOz / 16);
  const oz = Math.round(totalOz % 16);
  return `${lb} lb ${oz} oz`;
}

export function formatLength(mm: number): string {
  const inches = mm / 25.4;
  return `${inches.toFixed(1)} in`;
}
