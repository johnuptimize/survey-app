/**
 * Build-time / startup validation of data/outcomes.json.
 *
 * Fails the process (non-zero exit) if:
 *   - the file is missing or not valid JSON
 *   - any of the 32 pattern keys is missing
 *   - there are unexpected / malformed keys
 *   - any outcome is structurally wrong (title, exactly 3 prompts, A/B options)
 *
 * Wired into `npm run build` (prebuild) and `npm run dev` (predev). Vercel runs
 * `npm run build`, so a broken mapping table can never deploy.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTCOMES_PATH = join(__dirname, "..", "data", "outcomes.json");

const QUESTION_COUNT = 5;

function allPatterns() {
  const out = [];
  const total = 1 << QUESTION_COUNT;
  for (let i = 0; i < total; i++) {
    let p = "";
    for (let bit = QUESTION_COUNT - 1; bit >= 0; bit--) {
      p += (i >> bit) & 1 ? "B" : "A";
    }
    out.push(p);
  }
  return out;
}

function fail(lines) {
  console.error("\n✗ outcomes.json validation failed:\n");
  for (const l of lines) console.error("  - " + l);
  console.error("");
  process.exit(1);
}

if (!existsSync(OUTCOMES_PATH)) {
  fail([`file not found at ${OUTCOMES_PATH}`, "run: npm run generate:outcomes"]);
}

let data;
try {
  data = JSON.parse(readFileSync(OUTCOMES_PATH, "utf8"));
} catch (e) {
  fail([`file is not valid JSON: ${e.message}`]);
}

const errors = [];
const expected = allPatterns();
const expectedSet = new Set(expected);
const actualKeys = Object.keys(data ?? {});
const actualSet = new Set(actualKeys);

for (const key of expected) {
  if (!actualSet.has(key)) errors.push(`missing key: "${key}"`);
}
for (const key of actualKeys) {
  if (!expectedSet.has(key)) errors.push(`unexpected key: "${key}"`);
}

const PATTERN_RE = /^[AB]{5}$/;
for (const key of actualKeys) {
  if (!PATTERN_RE.test(key)) errors.push(`malformed key: "${key}"`);
  const o = data[key];
  if (!o || typeof o !== "object") {
    errors.push(`"${key}": not an object`);
    continue;
  }
  if (typeof o.title !== "string" || o.title.trim() === "") {
    errors.push(`"${key}": missing/empty "title"`);
  }
  if (!Array.isArray(o.prompts) || o.prompts.length !== 3) {
    errors.push(`"${key}": "prompts" must be an array of exactly 3 items`);
    continue;
  }
  o.prompts.forEach((p, i) => {
    const at = `"${key}".prompts[${i}]`;
    if (!p || typeof p !== "object") {
      errors.push(`${at}: not an object`);
      return;
    }
    for (const field of ["text", "optionA", "optionB"]) {
      if (typeof p[field] !== "string" || p[field].trim() === "") {
        errors.push(`${at}: missing/empty "${field}"`);
      }
    }
  });
}

if (errors.length) fail(errors);

console.log(`✓ outcomes.json OK — all ${expected.length} patterns present and valid.`);
