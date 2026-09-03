import type { Choice, Pattern } from "@/lib/patterns";

/** Payload posted to /api/log when a respondent finishes the follow-up prompts. */
export interface LogPayload {
  /** The 5 initial A/B answers, in question order. */
  answers: Choice[];
  /** The derived 5-char pattern (equal to answers.join("")). */
  pattern: Pattern;
  /** The 3 follow-up answers, in prompt order. */
  followups: Choice[];
  /** ISO timestamp set on the client when the survey is submitted. */
  submittedAt: string;
}
