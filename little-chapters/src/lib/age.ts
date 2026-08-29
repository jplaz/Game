import { differenceInDays, differenceInMonths, differenceInYears, addMonths } from "date-fns";

/**
 * Age math for a childhood archive spanning ages 0–18+.
 * Displayed everywhere as warm, human phrasing — never clinical.
 */

export interface Age {
  years: number;
  months: number; // months beyond full years
  days: number;   // days beyond full months
  totalMonths: number;
  totalDays: number;
}

export function computeAge(birthDate: Date, at: Date = new Date()): Age {
  if (at < birthDate) {
    return { years: 0, months: 0, days: 0, totalMonths: 0, totalDays: 0 };
  }
  const years = differenceInYears(at, birthDate);
  const totalMonths = differenceInMonths(at, birthDate);
  const months = totalMonths - years * 12;
  const monthAnchor = addMonths(birthDate, totalMonths);
  const days = differenceInDays(at, monthAnchor);
  return {
    years,
    months,
    days,
    totalMonths,
    totalDays: differenceInDays(at, birthDate),
  };
}

/** "6 months, 12 days" · "1 year, 3 months" · "8 days" · "12 years" */
export function formatAge(age: Age): string {
  const parts: string[] = [];
  if (age.years > 0) parts.push(`${age.years} ${age.years === 1 ? "year" : "years"}`);
  if (age.months > 0) parts.push(`${age.months} ${age.months === 1 ? "month" : "months"}`);
  if (age.years === 0 && (age.days > 0 || parts.length === 0)) {
    parts.push(`${age.days} ${age.days === 1 ? "day" : "days"}`);
  }
  return parts.slice(0, 2).join(", ");
}

export function formatAgeAt(birthDate: Date, at: Date): string {
  return formatAge(computeAge(birthDate, at));
}

/** Chapter title fragment: "Six Months", "One Year", "Two Years, Three Months" */
const ONES = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
  "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
  "Sixteen", "Seventeen", "Eighteen",
];

export function monthWord(n: number): string {
  return n >= 0 && n < ONES.length ? (ONES[n] as string) : String(n);
}

export function chapterAgeTitle(totalMonths: number): string {
  if (totalMonths === 0) return "The Very Beginning";
  if (totalMonths < 24) {
    if (totalMonths === 12) return "One Year";
    if (totalMonths < 19) return `${monthWord(totalMonths)} Months`;
    return `${totalMonths} Months`;
  }
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const yearPart = `${monthWord(years)} ${years === 1 ? "Year" : "Years"}`;
  return months === 0 ? yearPart : `${yearPart}, ${monthWord(months)} Months`;
}

/** Next month-birthday from a birth date ("turns 7 months on …"). */
export function nextAgeMilestone(
  birthDate: Date,
  now: Date = new Date()
): { label: string; date: Date } {
  const age = computeAge(birthDate, now);
  const nextTotalMonths = age.totalMonths + 1;
  const date = addMonths(birthDate, nextTotalMonths);
  if (nextTotalMonths % 12 === 0) {
    const years = nextTotalMonths / 12;
    return { label: `turns ${years === 1 ? "one" : monthWord(years).toLowerCase()} ${years === 1 ? "year" : "years"} old`, date };
  }
  return { label: `turns ${nextTotalMonths} months old`, date };
}
