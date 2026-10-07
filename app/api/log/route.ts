import { NextResponse } from "next/server";
import { isValidPattern, QUESTION_COUNT, type Choice } from "@/lib/patterns";
import { getOutcome } from "@/lib/outcomes";
import { postToSheetWithRetry } from "@/lib/sheet";
import { tallyTuned } from "@/lib/tally";
import type { LogPayload } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Headroom for the retry loop in lib/sheet.ts: worst case is 4 attempts x 6s
// timeout plus ~2.5s of backoff (~26.5s), comfortably under this.
export const maxDuration = 30;

const CHOICE = new Set(["A", "B"]);

function validate(body: unknown): { ok: true; data: LogPayload } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Body must be a JSON object." };
  const b = body as Record<string, unknown>;

  const answers = b.answers;
  if (!Array.isArray(answers) || answers.length !== QUESTION_COUNT || !answers.every((a) => CHOICE.has(a as string))) {
    return { ok: false, error: `"answers" must be ${QUESTION_COUNT} entries of "A"/"B".` };
  }

  const pattern = b.pattern;
  if (typeof pattern !== "string" || !isValidPattern(pattern)) {
    return { ok: false, error: `"pattern" is not a valid 5-char A/B pattern.` };
  }
  if (pattern !== (answers as string[]).join("")) {
    return { ok: false, error: `"pattern" does not match "answers".` };
  }

  const followups = b.followups;
  if (!Array.isArray(followups) || followups.length !== 3 || !followups.every((f) => CHOICE.has(f as string))) {
    return { ok: false, error: `"followups" must be 3 entries of "A"/"B".` };
  }

  const submittedAt = typeof b.submittedAt === "string" && b.submittedAt ? b.submittedAt : new Date().toISOString();

  // Optional — only present for respondents who arrived via a Prolific link.
  const optStr = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 100) : "");

  return {
    ok: true,
    data: {
      answers: answers as LogPayload["answers"],
      pattern,
      followups: followups as LogPayload["followups"],
      submittedAt,
      prolificPid: optStr(b.prolificPid),
      studyId: optStr(b.studyId),
      sessionId: optStr(b.sessionId),
    },
  };
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const result = validate(json);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const data = result.data;

  // Derive tuned-vs-regular server-side from the outcome key so the client
  // can't influence what gets logged.
  const outcome = getOutcome(data.pattern);
  const tally = outcome
    ? tallyTuned(outcome, data.followups as Choice[])
    : { pickedTypes: ["", "", ""] as string[], tunedCount: "", variant: "" };

  // Flat record — one row per response. Column order here is the sheet column order.
  const row = {
    submittedAt: data.submittedAt,
    receivedAt: new Date().toISOString(),
    pattern: data.pattern,
    q1: data.answers[0],
    q2: data.answers[1],
    q3: data.answers[2],
    q4: data.answers[3],
    q5: data.answers[4],
    followup1: data.followups[0],
    followup2: data.followups[1],
    followup3: data.followups[2],
    pickedType1: tally.pickedTypes[0],
    pickedType2: tally.pickedTypes[1],
    pickedType3: tally.pickedTypes[2],
    tunedCount: tally.tunedCount,
    resultVariant: tally.variant,
    prolificPid: data.prolificPid ?? "",
    studyId: data.studyId ?? "",
    sessionId: data.sessionId ?? "",
  };

  const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;

  if (!webhookUrl) {
    // No sheet configured (e.g. local dev without .env). Don't lose the data
    // silently and don't hard-fail the respondent — record it to the server log.
    console.warn(
      "[api/log] GOOGLE_SHEET_WEBHOOK_URL not set — response not sent to a sheet:",
      JSON.stringify(row)
    );
    return NextResponse.json({ ok: true, sink: "server-log" });
  }

  const sheetResult = await postToSheetWithRetry(webhookUrl, row);
  if (!sheetResult.ok) {
    return NextResponse.json({ error: sheetResult.message }, { status: 502 });
  }
  return NextResponse.json({ ok: true, sink: "google-sheet" });
}

