/**
 * Server-side helper for posting a row to the Google Apps Script webhook
 * (google-apps-script/Code.gs). Shared by /api/log (survey responses) and
 * /api/cta (clicks on the results-page call-to-action).
 */

export type SheetKind = "response" | "click";

/**
 * Posts one row to the Apps Script webhook, retrying on transient failures
 * (network errors, non-2xx, or an error body — e.g. the sheet's LockService
 * timing out under a burst of concurrent submissions). This absorbs brief
 * spikes — many people submitting within the same few seconds, as tends to
 * happen right after a study goes live — without the respondent ever seeing
 * a failure. Not retried: an "unauthorized" response, since that means the
 * shared secret is misconfigured and will never succeed on retry.
 *
 * Worst case is 4 attempts x 6s timeout plus ~2.5s of backoff (~26.5s), which
 * the calling routes' `maxDuration` must leave headroom for.
 *
 * `kind` tells the script which tab to append to. Responses omit it, so the
 * request body stays identical to what older deployed scripts expect.
 */
export async function postToSheetWithRetry(
  webhookUrl: string,
  row: Record<string, unknown>,
  kind: SheetKind = "response"
): Promise<{ ok: true } | { ok: false; message: string }> {
  const MAX_ATTEMPTS = 4;
  const BACKOFF_MS = [300, 700, 1500]; // gaps before attempts 2, 3, 4
  const ATTEMPT_TIMEOUT_MS = 6000; // per-attempt cap; keeps the worst case bounded

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
          ...(kind === "response" ? {} : { kind }),
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
        console.error("[sheet] webhook rejected: unauthorized (SECRET mismatch)");
        return { ok: false, message: "Logging service rejected the request." };
      }

      console.warn(
        `[sheet] ${kind} webhook attempt ${attempt}/${MAX_ATTEMPTS} failed:`,
        res.status,
        text.slice(0, 300)
      );
      lastMessage = "Logging service rejected the request.";
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "AbortError";
      console.warn(
        `[sheet] ${kind} webhook attempt ${attempt}/${MAX_ATTEMPTS} ` +
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

  console.error(`[sheet] ${kind} webhook failed after ${MAX_ATTEMPTS} attempts.`);
  return { ok: false, message: lastMessage };
}
