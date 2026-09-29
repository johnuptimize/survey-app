import { NextResponse } from "next/server";
import { isValidPattern, QUESTION_COUNT, type Choice } from "@/lib/patterns";
import { getOutcome } from "@/lib/outcomes";
import { tallyTuned } from "@/lib/tally";
import type { LogPayload } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Headroom for the retry loop below: worst case is 4 attempts x 6s timeout
// plus ~2.5s of backoff (~26.5s), comfortably under this.
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

/**
 * Posts one response row to the Apps Script webhook, retrying on transient
 * failures (network errors, non-2xx, or an error body — e.g. the sheet's
 * LockService timing out under a burst of concurrent submissions). This
 * absorbs brief spikes — many people submitting within the same few seconds,
 * as tends to happen right after a study goes live — without the respondent
 * ever seeing a failure. Not retried: an "unauthorized" response, since that
 * means the shared secret is misconfigured and will never succeed on retry.
 */
async function postToSheetWithRetry(
  webhookUrl: string,
  row: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; message: string }> {
  const MAX_ATTEMPTS = 4;
  const BACKOFF_MS = [300, 700, 1500]; // gaps before attempts 2, 3, 4
  const ATTEMPT_TIMEOUT_MS = 6000; // per-attempt cap; keeps the worst case well under maxDuration

  let lastMessage = "Could not reach the logging service.";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);

    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: process.env.GOOGLE_SHEET_WEBHOOK_SECRET ?? "",
          row,
        }),
        // Apps Script web apps 302-redirect to googleusercontent.com; fetch follows it.
        redirect: "follow",
        signal: controller.signal,
      });

      const text = await res.text();
      let parsed: { ok?: boolean; error?: string } = {};
      try {
        parsed = JSON.parse(text);
      } catch {
        /* Apps Script returned HTML (often an auth/deploy problem). */
      }

      if (res.ok && parsed.ok === true) {
        return { ok: true };
      }

      if (parsed.error === "unauthorized") {
        console.error("[api/log] sheet webhook rejected: unauthorized (SECRET mismatch)");
        return { ok: false, message: "Logging service rejected the request." };
      }

      console.warn(
        `[api/log] sheet webhook attempt ${attempt}/${MAX_ATTEMPTS} failed:`,
        res.status,
        text.slice(0, 300)
      );
      lastMessage = "Logging service rejected the request.";
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "AbortError";
      console.warn(
        `[api/log] sheet webhook attempt ${attempt}/${MAX_ATTEMPTS} ` +
          `${timedOut ? "timed out" : "threw"}:`,
        timedOut ? `${ATTEMPT_TIMEOUT_MS}ms` : err
      );
      lastMessage = "Could not reach the logging service.";
    } finally {
      clearTimeout(timeout);
    }

    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt - 1]));
    }
  }

  console.error(`[api/log] sheet webhook failed after ${MAX_ATTEMPTS} attempts.`);
  return { ok: false, message: lastMessage };
}
