import { NextResponse } from "next/server";
import { isValidPattern, type Choice } from "@/lib/patterns";
import { getOutcome } from "@/lib/outcomes";
import { postToSheetWithRetry } from "@/lib/sheet";
import { tallyTuned } from "@/lib/tally";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Headroom for the retry loop in lib/sheet.ts (~26.5s worst case).
export const maxDuration = 30;

const CHOICE = new Set(["A", "B"]);

// Optional, free-form identifiers from Prolific — trimmed and length-capped.
const optStr = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 100) : "");

/**
 * Records one click on the results-page call-to-action ("Join Frequency") as a
 * row in the sheet's Clicks tab. The browser fires this and doesn't wait for
 * it, and the button links straight to its destination, so a failure here can
 * never get in the respondent's way.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body must be a JSON object." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const pattern = b.pattern;
  if (typeof pattern !== "string" || !isValidPattern(pattern)) {
    return NextResponse.json({ error: `"pattern" is not a valid pattern.` }, { status: 400 });
  }
  const followups = b.followups;
  if (
    !Array.isArray(followups) ||
    followups.length !== 3 ||
    !followups.every((f) => CHOICE.has(f as string))
  ) {
    return NextResponse.json({ error: `"followups" must be 3 entries of "A"/"B".` }, { status: 400 });
  }

  // Re-derive the result server-side from the outcome key, as /api/log does.
  const outcome = getOutcome(pattern);
  const tally = outcome ? tallyTuned(outcome, followups as Choice[]) : null;

  const row = {
    clickedAt: typeof b.clickedAt === "string" && b.clickedAt ? b.clickedAt : new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    prolificPid: optStr(b.prolificPid),
    studyId: optStr(b.studyId),
    sessionId: optStr(b.sessionId),
    pattern,
    resultVariant: tally?.variant ?? "",
    tunedCount: tally?.tunedCount ?? "",
  };

  const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn(
      "[api/cta] GOOGLE_SHEET_WEBHOOK_URL not set — click not sent to a sheet:",
      JSON.stringify(row)
    );
    return NextResponse.json({ ok: true, sink: "server-log" });
  }

  const result = await postToSheetWithRetry(webhookUrl, row, "click");
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 502 });
  }
  return NextResponse.json({ ok: true, sink: "google-sheet" });
}
