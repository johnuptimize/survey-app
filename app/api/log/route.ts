import { NextResponse } from "next/server";
import { isValidPattern, QUESTION_COUNT } from "@/lib/patterns";
import type { LogPayload } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  return {
    ok: true,
    data: {
      answers: answers as LogPayload["answers"],
      pattern,
      followups: followups as LogPayload["followups"],
      submittedAt,
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
    });

    const text = await res.text();
    let parsed: { ok?: boolean; error?: string } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      /* Apps Script returned HTML (often an auth/deploy problem). */
    }

    if (!res.ok || parsed.error || parsed.ok !== true) {
      console.error(
        "[api/log] sheet webhook problem:",
        res.status,
        text.slice(0, 500)
      );
      return NextResponse.json(
        { error: "Logging service rejected the request." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, sink: "google-sheet" });
  } catch (err) {
    console.error("[api/log] failed to reach sheet webhook:", err);
    return NextResponse.json({ error: "Could not reach the logging service." }, { status: 502 });
  }
}
