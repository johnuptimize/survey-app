"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { patternFromAnswers, type Choice } from "@/lib/patterns";

interface Question {
  id: string;
  text: string;
  optionA: string;
  optionB: string;
}

interface Props {
  intro: { title: string; description: string };
  questions: Question[];
}

export default function SurveyClient({ intro, questions }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Choice[]>([]);
  const [navigating, setNavigating] = useState(false);

  const total = questions.length;
  const current = questions[step];

  function choose(choice: Choice) {
    const next = [...answers.slice(0, step), choice];
    setAnswers(next);

    if (step < total - 1) {
      setStep(step + 1);
      return;
    }

    // Last question answered — build the pattern and route to the outcome.
    const pattern = patternFromAnswers(next);
    setNavigating(true);
    router.push(`/outcome/${pattern}`);
  }

  function back() {
    if (step === 0) return;
    setStep(step - 1);
  }

  return (
    <div className="card">
      {step === 0 && (
        <>
          <h1>{intro.title}</h1>
          <p className="muted">{intro.description}</p>
        </>
      )}

      <div className="progress">
        Question {step + 1} of {total}
      </div>
      <h2>{current.text}</h2>

      <div className="options">
        <button
          type="button"
          className={`option${answers[step] === "A" ? " selected" : ""}`}
          onClick={() => choose("A")}
          disabled={navigating}
        >
          <span className="tag">A</span>
          <span className="option-text">{current.optionA}</span>
        </button>
        <button
          type="button"
          className={`option${answers[step] === "B" ? " selected" : ""}`}
          onClick={() => choose("B")}
          disabled={navigating}
        >
          <span className="tag">B</span>
          <span className="option-text">{current.optionB}</span>
        </button>
      </div>

      <div className="actions">
        <button
          type="button"
          className="link"
          onClick={back}
          disabled={step === 0 || navigating}
        >
          ← Back
        </button>
        <span className="progress" style={{ margin: 0 }}>
          {navigating ? "Loading your results…" : `${answers.filter(Boolean).length}/${total} answered`}
        </span>
      </div>
    </div>
  );
}
