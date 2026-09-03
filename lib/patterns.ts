/**
 * Pattern helpers. A "pattern" is a 5-character string of "A"/"B", one char per
 * question, in order. There are exactly 2^5 = 32 possible patterns.
 *
 * This is the single source of truth for what a valid pattern looks like. Both
 * the runtime app and the build-time check import from here so they can never
 * disagree about the expected key set.
 */

export const QUESTION_COUNT = 5;
export const OPTIONS = ["A", "B"] as const;

export type Choice = (typeof OPTIONS)[number];
export type Pattern = string;

/** All 32 patterns, generated in stable order ("AAAAA" ... "BBBBB"). */
export function allPatterns(): Pattern[] {
  const out: Pattern[] = [];
  const total = 1 << QUESTION_COUNT; // 32
  for (let i = 0; i < total; i++) {
    let p = "";
    for (let bit = QUESTION_COUNT - 1; bit >= 0; bit--) {
      p += (i >> bit) & 1 ? "B" : "A";
    }
    out.push(p);
  }
  return out;
}

/** Set of all 32 patterns, for O(1) membership checks. */
export const PATTERN_SET: ReadonlySet<Pattern> = new Set(allPatterns());

/** True if `value` is one of the 32 valid patterns. */
export function isValidPattern(value: string): value is Pattern {
  return PATTERN_SET.has(value);
}

/** Build a pattern from an ordered list of answers. Throws if malformed. */
export function patternFromAnswers(answers: Choice[]): Pattern {
  if (answers.length !== QUESTION_COUNT) {
    throw new Error(
      `Expected ${QUESTION_COUNT} answers, got ${answers.length}`
    );
  }
  const p = answers.join("");
  if (!isValidPattern(p)) {
    throw new Error(`Answers produced an invalid pattern: ${p}`);
  }
  return p;
}
