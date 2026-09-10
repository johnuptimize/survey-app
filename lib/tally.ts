import type { Outcome } from "@/lib/outcomes";
import type { Choice } from "@/lib/patterns";

export type PickType = "tuned" | "regular";

export interface TunedTally {
  /** Per follow-up prompt: did the respondent pick the tuned or regular option. */
  pickedTypes: PickType[];
  /** How many of the 3 picks were the tuned option (0-3). */
  tunedCount: number;
  /** Which results variant this maps to (2-3 tuned -> "tuned", else "regular"). */
  variant: PickType;
}

/**
 * Compare a respondent's follow-up picks against each prompt's `tuned` letter.
 * Shared by the results screen (app/outcome/[pattern]/OutcomeClient.tsx) and the
 * logging route (app/api/log/route.ts) so both always agree.
 */
export function tallyTuned(outcome: Outcome, followups: Choice[]): TunedTally {
  const pickedTypes: PickType[] = outcome.prompts.map((p, i) =>
    followups[i] === p.tuned ? "tuned" : "regular"
  );
  const tunedCount = pickedTypes.filter((t) => t === "tuned").length;
  return {
    pickedTypes,
    tunedCount,
    variant: tunedCount >= 2 ? "tuned" : "regular",
  };
}
