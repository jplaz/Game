/**
 * Grounding validation heuristics.
 *
 * Defense-in-depth behind the prompt rules: generated writing may not
 * introduce specific factual atoms (numbers, dates, capitalized names) that
 * don't appear in the source facts it was given. This can't prove semantic
 * truth, but it catches the dangerous class of hallucination — invented
 * measurements, dates, and people — cheaply and deterministically.
 */

const MONTHS =
  /january|february|march|april|may|june|july|august|september|october|november|december/i;

const COMMON_WORDS = new Set([
  "the", "a", "an", "i", "you", "your", "we", "our", "us", "and", "but", "or",
  "when", "then", "this", "that", "these", "those", "today", "every", "it",
  "he", "she", "they", "his", "her", "their", "them", "one", "first", "little",
  "big", "so", "at", "in", "on", "of", "to", "for", "with", "there", "here",
  "month", "months", "week", "weeks", "day", "days", "year", "years", "mom",
  "dad", "mama", "dada", "grandma", "grandpa", "everyone", "everything",
  "nothing", "something", "morning", "night", "watching", "looking",
]);

function extractNumbers(text: string): Set<string> {
  const out = new Set<string>();
  for (const match of text.matchAll(/\d+(?:[.,]\d+)?/g)) {
    out.add(match[0].replace(",", "."));
  }
  return out;
}

function extractNames(text: string): Set<string> {
  const out = new Set<string>();
  // words capitalized mid-sentence are name candidates
  for (const match of text.matchAll(/(?<![.!?]\s)(?<!^)\b([A-Z][a-z]{2,})\b/gm)) {
    const word = (match[1] ?? "").toLowerCase();
    if (!COMMON_WORDS.has(word) && !MONTHS.test(word)) out.add(word);
  }
  return out;
}

/**
 * Returns an error string if `generated` contains numbers or name-like tokens
 * absent from `sourceFacts`, else null.
 */
export function checkGrounding(
  sourceFacts: string,
  generated: string
): string | null {
  const allowedNumbers = extractNumbers(sourceFacts);
  const allowedNames = extractNames(sourceFacts);

  for (const num of extractNumbers(generated)) {
    if (!allowedNumbers.has(num)) {
      return `grounding: number "${num}" not present in source facts`;
    }
  }
  for (const name of extractNames(generated)) {
    if (!allowedNames.has(name)) {
      return `grounding: name "${name}" not present in source facts`;
    }
  }
  return null;
}
