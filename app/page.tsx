import questionsData from "@/data/questions.json";
import { QUESTION_COUNT } from "@/lib/patterns";
import SurveyClient from "./SurveyClient";

// Fail fast if the question set and the pattern length ever drift apart.
if (questionsData.questions.length !== QUESTION_COUNT) {
  throw new Error(
    `questions.json has ${questionsData.questions.length} questions but the app ` +
      `expects ${QUESTION_COUNT}. Update QUESTION_COUNT in lib/patterns.ts and ` +
      `regenerate outcomes.json (npm run generate:outcomes) if the count changed.`
  );
}

export default function Page() {
  return (
    <SurveyClient
      intro={questionsData.intro}
      questions={questionsData.questions}
    />
  );
}
