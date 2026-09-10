"use client";

import Link from "next/link";
import { useState } from "react";
import type { Outcome } from "@/lib/outcomes";
import type { ResultsCopy } from "@/lib/results";
import type { Choice, Pattern } from "@/lib/patterns";
import { tallyTuned } from "@/lib/tally";
import type { LogPayload } from "@/lib/types";

interface Props {
  pattern: Pattern;
  outcome: Outcome;
  results: ResultsCopy;
}

type SubmitState = "idle" | "submitting" | "done" | "error";

export default function OutcomeClient({ pattern, outcome, results }: Props) {
  const [followups, setFollowups] = useState<(Choice | null)[]>([null, null, null]);
  const [state, setState] = useState<SubmitState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

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
        <p className="done-confirm">✓ Your responses have been recorded.</p>
        <p className="done-tally">
          You preferred the tuned response {tunedCount} of {total} times.
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
        <p>
          <Link className="link" href="/">
            Start over
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <h1>{outcome.title}</h1>
      <p className="muted">
        Below are 3 real prompts, each answered two different ways. For each
        one, read both responses and pick the one that feels more like how
        you&apos;d actually want AI to talk to you - not which one is
        &quot;better written,&quot; but which one fits you. There&apos;s no
        right answer. Go with your gut.
      </p>

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
        <Link className="link" href="/">
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
