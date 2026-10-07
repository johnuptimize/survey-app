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
  /** From Prolific's PROLIFIC_PID/STUDY_ID/SESSION_ID URL params, if present. */
  prolificPid?: string;
  studyId?: string;
  sessionId?: string;
}

/** Payload posted to /api/cta when someone clicks the results-page CTA button. */
export interface CtaClickPayload {
  pattern: Pattern;
  /** The 3 follow-up answers — the server re-derives the tuned/regular result from them. */
  followups: Choice[];
  /** ISO timestamp set on the client at click time. */
  clickedAt: string;
  prolificPid?: string;
  studyId?: string;
  sessionId?: string;
}
