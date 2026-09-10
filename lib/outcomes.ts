/**
 * Loads and validates the outcome mapping table (data/outcomes.json).
 *
 * The JSON file is the editable content layer: changing an outcome, or the
 * wording of a prompt, means editing that file only — never this module or the
 * page components.
 *
 * Importing this module runs a startup check. If any of the 32 patterns is
 * missing or malformed, it throws immediately (module load fails) rather than
 * letting the app serve a half-broken survey. The same rules run at build time
 * via scripts/check-content.mjs.
 */
import rawOutcomes from "@/data/outcomes.json";
import { allPatterns, isValidPattern, type Pattern } from "@/lib/patterns";

export interface OutcomePrompt {
  text: string;
  optionA: string;
  optionB: string;
  /** Which option ("A" or "B") is the tuned response. The other is "regular". */
  tuned: "A" | "B";
}

export interface Outcome {
  title: string;
  prompts: [OutcomePrompt, OutcomePrompt, OutcomePrompt];
}

export type OutcomeMap = Record<Pattern, Outcome>;

function validate(data: unknown): asserts data is OutcomeMap {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    throw new Error("outcomes.json: root is not an object");
  }
  const map = data as Record<string, unknown>;
  const expected = allPatterns();
  const actualKeys = Object.keys(map);

  for (const key of expected) {
    if (!(key in map)) errors.push(`missing pattern "${key}"`);
  }
  for (const key of actualKeys) {
    if (!isValidPattern(key)) errors.push(`unexpected/malformed key "${key}"`);
  }

  for (const key of actualKeys) {
    const o = map[key] as Record<string, unknown> | null;
    if (!o || typeof o !== "object") {
      errors.push(`"${key}": not an object`);
      continue;
    }
    if (typeof o.title !== "string" || o.title.trim() === "") {
      errors.push(`"${key}": missing/empty title`);
    }
    if (!Array.isArray(o.prompts) || o.prompts.length !== 3) {
      errors.push(`"${key}": prompts must be an array of exactly 3 items`);
      continue;
    }
    o.prompts.forEach((p: unknown, i: number) => {
      const at = `"${key}".prompts[${i}]`;
      if (!p || typeof p !== "object") {
        errors.push(`${at}: not an object`);
        return;
      }
      const pr = p as Record<string, unknown>;
      for (const field of ["text", "optionA", "optionB"] as const) {
        if (typeof pr[field] !== "string" || (pr[field] as string).trim() === "") {
          errors.push(`${at}: missing/empty "${field}"`);
        }
      }
      if (pr.tuned !== "A" && pr.tuned !== "B") {
        errors.push(`${at}: "tuned" must be "A" or "B"`);
      }
    });
  }

  if (errors.length) {
    throw new Error(
      `outcomes.json failed validation (${errors.length} problem(s)):\n` +
        errors.map((e) => `  - ${e}`).join("\n")
    );
  }
}

validate(rawOutcomes);

export const outcomes: OutcomeMap = rawOutcomes as OutcomeMap;

/** Look up the outcome for a pattern, or null if the pattern is not valid. */
export function getOutcome(pattern: string): Outcome | null {
  if (!isValidPattern(pattern)) return null;
  return outcomes[pattern] ?? null;
}
