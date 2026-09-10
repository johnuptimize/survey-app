/**
 * Loads and validates the results-screen copy (data/results.json).
 *
 * After a respondent submits, the app tallies how many of the 3 follow-up picks
 * matched the "tuned" option. 2-3 -> the "tuned" variant, 0-1 -> the "regular"
 * variant. Each variant's heading / body / call-to-action is editable content,
 * pulled from the "Results" tab of the Google Sheet.
 *
 * Importing this module runs a startup check (same rules as
 * scripts/check-content.mjs); a malformed file throws on load.
 */
import rawResults from "@/data/results.json";

export interface ResultVariant {
  heading: string;
  body: string;
  /** CTA button text. Button is shown only when both ctaLabel and ctaUrl are set. */
  ctaLabel: string;
  /** CTA button link (absolute URL). */
  ctaUrl: string;
}

export interface ResultsCopy {
  tuned: ResultVariant;
  regular: ResultVariant;
}

function validate(data: unknown): asserts data is ResultsCopy {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    throw new Error("results.json: root is not an object");
  }
  const map = data as Record<string, unknown>;

  for (const key of ["tuned", "regular"] as const) {
    const v = map[key] as Record<string, unknown> | undefined;
    if (!v || typeof v !== "object") {
      errors.push(`missing "${key}" variant`);
      continue;
    }
    for (const field of ["heading", "body"] as const) {
      if (typeof v[field] !== "string" || (v[field] as string).trim() === "") {
        errors.push(`"${key}.${field}" missing/empty`);
      }
    }
    for (const field of ["ctaLabel", "ctaUrl"] as const) {
      if (typeof v[field] !== "string") {
        errors.push(`"${key}.${field}" must be a string (may be empty)`);
      }
    }
    const hasLabel = typeof v.ctaLabel === "string" && v.ctaLabel.trim() !== "";
    const hasUrl = typeof v.ctaUrl === "string" && v.ctaUrl.trim() !== "";
    if (hasLabel !== hasUrl) {
      errors.push(
        `"${key}": set both ctaLabel and ctaUrl, or neither (got only ${
          hasLabel ? "ctaLabel" : "ctaUrl"
        })`
      );
    }
    if (hasUrl && !/^https?:\/\//i.test((v.ctaUrl as string).trim())) {
      errors.push(`"${key}.ctaUrl" must start with http:// or https://`);
    }
  }

  if (errors.length) {
    throw new Error(
      `results.json failed validation (${errors.length} problem(s)):\n` +
        errors.map((e) => `  - ${e}`).join("\n")
    );
  }
}

validate(rawResults);

export const results: ResultsCopy = rawResults as ResultsCopy;

/** Which variant to show for a given tuned-pick count (out of 3). */
export function variantForTunedCount(tunedCount: number): ResultVariant {
  return tunedCount >= 2 ? results.tuned : results.regular;
}

export function variantKeyForTunedCount(tunedCount: number): "tuned" | "regular" {
  return tunedCount >= 2 ? "tuned" : "regular";
}
