/**
 * Pulls survey content (intro + 5 questions + 32 outcomes) from the Google Sheet
 * and writes data/questions.json and data/outcomes.json.
 *
 * Source: the same Apps Script web app used for response logging. Its doGet
 * handler returns the content as JSON when called with ?content=all. So the
 * source URL is normally identical to GOOGLE_SHEET_WEBHOOK_URL.
 *
 * Behaviour:
 *   - No source URL configured  -> do nothing, keep the committed data/*.json.
 *     (Lets you develop locally, or run without a sheet, using the checked-in copy.)
 *   - Source URL configured, fetch OK -> overwrite the two JSON files.
 *   - Source URL configured, fetch fails -> exit non-zero (fail the build rather
 *     than silently deploy stale or empty content).
 *
 * The deep validation (all 32 patterns, correct shape, exactly 5 questions) is
 * done afterwards by scripts/check-content.mjs, which prebuild runs next.
 *
 * Run manually:  npm run pull:content
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

const sourceUrl =
  process.env.CONTENT_SOURCE_URL || process.env.GOOGLE_SHEET_WEBHOOK_URL || "";

if (!sourceUrl) {
  console.log(
    "[pull-content] no CONTENT_SOURCE_URL / GOOGLE_SHEET_WEBHOOK_URL set — " +
      "keeping committed data/questions.json and data/outcomes.json."
  );
  process.exit(0);
}

const endpoint =
  sourceUrl + (sourceUrl.includes("?") ? "&" : "?") + "content=all";

async function fetchContent(attempt = 1) {
  const MAX = 3;
  try {
    const res = await fetch(endpoint, { redirect: "follow" });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(
        `expected JSON, got: ${text.slice(0, 200)} ` +
          `(is the web app deployed with "Who has access: Anyone"?)`
      );
    }
    if (json.error) throw new Error(`sheet returned error: ${json.error}`);
    return json;
  } catch (err) {
    if (attempt < MAX) {
      const waitMs = 1000 * attempt;
      console.warn(
        `[pull-content] attempt ${attempt} failed (${
          err?.message || err
        }); retrying in ${waitMs}ms…`
      );
      await new Promise((r) => setTimeout(r, waitMs));
      return fetchContent(attempt + 1);
    }
    throw err;
  }
}

let payload;
try {
  payload = await fetchContent();
} catch (err) {
  console.error("\n[pull-content] could not load content from the sheet:");
  console.error("  " + (err?.message || err));
  console.error("\n  URL: " + endpoint + "\n");
  process.exit(1);
}

const q = payload.questions;
if (!q || typeof q !== "object" || !Array.isArray(q.questions) || !q.intro) {
  console.error("[pull-content] response is missing a valid `questions` object.");
  process.exit(1);
}
if (!payload.outcomes || typeof payload.outcomes !== "object") {
  console.error("[pull-content] response is missing a valid `outcomes` object.");
  process.exit(1);
}

writeFileSync(
  join(DATA_DIR, "questions.json"),
  JSON.stringify(q, null, 2) + "\n",
  "utf8"
);
writeFileSync(
  join(DATA_DIR, "outcomes.json"),
  JSON.stringify(payload.outcomes, null, 2) + "\n",
  "utf8"
);

console.log(
  `[pull-content] updated: ${q.questions.length} questions, ` +
    `${Object.keys(payload.outcomes).length} outcomes.`
);
