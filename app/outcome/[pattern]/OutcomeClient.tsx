"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Outcome } from "@/lib/outcomes";
import type { ResultsCopy } from "@/lib/results";
import type { Choice, Pattern } from "@/lib/patterns";
import {
  EMPTY_PROLIFIC_PARAMS,
  prolificQueryString,
  readProlificParams,
  type ProlificParams,
} from "@/lib/prolific";
import { tallyTuned } from "@/lib/tally";
import type { LogPayload } from "@/lib/types";

interface Props {
  pattern: Pattern;
  outcome: Outcome;
  results: ResultsCopy;
  outcomeIntro: string;
}

type SubmitState = "idle" | "submitting" | "done" | "error";

// This study's Prolific completion code (Study setup -> Completion codes on
// Prolific). Only shown to respondents who arrived with a PROLIFIC_PID.
const PROLIFIC_COMPLETION_CODE = "CATAT8VK";
const PROLIFIC_COMPLETION_URL =
  "https://app.prolific.com/submissions/complete?cc=" + PROLIFIC_COMPLETION_CODE;

export default function OutcomeClient({
  pattern,
  outcome,
  results,
  outcomeIntro,
}: Props) {
  const [followups, setFollowups] = useState<(Choice | null)[]>([null, null, null]);
  const [state, setState] = useState<SubmitState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [prolific, setProlific] = useState<ProlificParams>(EMPTY_PROLIFIC_PARAMS);

  // Prolific params arrive on this page's URL, carried over by SurveyClient.
  useEffect(() => {
    setProlific(readProlificParams(window.location.search));
  }, []);

  const allAnswered = followups.every((f) => f !== null);

  function pick(promptIndex: number, choice: Choice) {
    if (state === "submitting" || state === "done") return;
    setFollowups((prev) => {
      const next = [...prev];
      next[promptIndex] = choice;
      return next;
    });
  }

  async function submit() {
    if (!allAnswered) return;
    setState("submitting");
    setErrorMsg("");

    const payload: LogPayload = {
      answers: pattern.split("") as Choice[],
      pattern,
      followups: followups as Choice[],
      submittedAt: new Date().toISOString(),
      prolificPid: prolific.prolificPid,
      studyId: prolific.studyId,
      sessionId: prolific.sessionId,
    };

    try {
      const res = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      setState("done");
    } catch (err) {
      setState("error");
      setErrorMsg(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
    }
  }

  if (state === "done") {
    const { tunedCount, variant } = tallyTuned(outcome, followups as Choice[]);
    const copy = results[variant];
    const total = outcome.prompts.length;
    const showCta = copy.ctaLabel.trim() !== "" && copy.ctaUrl.trim() !== "";

    return (
      <div className="card">
        <p className="done-confirm">
          <span className="accent-mark">✓</span> Your responses have been recorded.
        </p>
        <p className="done-tally">
          You preferred the tuned response{" "}
          <span className="accent-mark">{tunedCount}</span> of {total} times.
        </p>
        <h1>{copy.heading}</h1>
        <p className="muted">{copy.body}</p>
        {showCta && (
          <p className="done-cta">
            <a
              className="primary"
              href={copy.ctaUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {copy.ctaLabel} →
            </a>
          </p>
        )}
        {prolific.prolificPid && (
          <div className="done-prolific">
            <p className="muted">
              Thanks for taking part! Click below to return to Prolific and
              complete the study.
            </p>
            <p>
              <a className="primary" href={PROLIFIC_COMPLETION_URL}>
                Return to Prolific →
              </a>
            </p>
            <p className="muted">
              If you&apos;re not redirected, enter this completion code on
              Prolific: <span className="pattern-chip">{PROLIFIC_COMPLETION_CODE}</span>
            </p>
          </div>
        )}
        <p>
          <Link className="link" href={`/${prolificQueryString(prolific)}`}>
            Start over
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <h1>{outcome.title}</h1>
      <p className="muted">{outcomeIntro}</p>

      {outcome.prompts.map((prompt, i) => (
        <div className="prompt-block" key={i}>
          <h3>{prompt.text}</h3>
          <div className="options">
            <button
              type="button"
              className={`option${followups[i] === "A" ? " selected" : ""}`}
              onClick={() => pick(i, "A")}
              disabled={state === "submitting"}
            >
              <span className="tag">A</span>
              <span className="option-text">{prompt.optionA}</span>
            </button>
            <button
              type="button"
              className={`option${followups[i] === "B" ? " selected" : ""}`}
              onClick={() => pick(i, "B")}
              disabled={state === "submitting"}
            >
              <span className="tag">B</span>
              <span className="option-text">{prompt.optionB}</span>
            </button>
          </div>
        </div>
      ))}

      <div className="actions">
        <Link className="link" href={`/${prolificQueryString(prolific)}`}>
          ← Restart survey
        </Link>
        <button
          type="button"
          className="primary"
          onClick={submit}
          disabled={!allAnswered || state === "submitting"}
        >
          {state === "submitting" ? "Submitting…" : "Submit"}
        </button>
      </div>

      {state === "error" && (
        <p className="error-text">{errorMsg}</p>
      )}
    </div>
  );
}
