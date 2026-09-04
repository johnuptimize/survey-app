/**
 * Build-time / startup validation of the content files:
 *   - data/outcomes.json   — all 32 pattern keys, correct shape
 *   - data/questions.json   — intro + exactly QUESTION_COUNT questions, correct shape
 *
 * Fails the process (non-zero exit) on any problem. Wired into `npm run build`
 * (prebuild) and `npm run dev` (predev), after scripts/pull-content.mjs. Vercel
 * runs `npm run build`, so broken content can never deploy.
 *
 * (Also available as `npm run check:outcomes` for backwards compatibility.)
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const OUTCOMES_PATH = join(DATA_DIR, "outcomes.json");
const QUESTIONS_PATH = join(DATA_DIR, "questions.json");

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

function fail(title, lines) {
  console.error(`\n✗ ${title}\n`);
  for (const l of lines) console.error("  - " + l);
  console.error("");
  process.exit(1);
}

function readJson(path, label) {
  if (!existsSync(path)) {
    fail(`${label} not found`, [`expected at ${path}`]);
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    fail(`${label} is not valid JSON`, [e.message]);
  }
}

// ---- questions.json -------------------------------------------------------
{
  const data = readJson(QUESTIONS_PATH, "questions.json");
  const errors = [];

  if (!data || typeof data !== "object") errors.push("root is not an object");
  const intro = data?.intro;
  if (!intro || typeof intro !== "object") {
    errors.push('missing "intro" object');
  } else {
    for (const f of ["title", "description"]) {
      if (typeof intro[f] !== "string" || intro[f].trim() === "") {
        errors.push(`intro.${f} missing/empty`);
      }
    }
  }

  const questions = data?.questions;
  if (!Array.isArray(questions)) {
    errors.push('"questions" is not an array');
  } else {
    if (questions.length !== QUESTION_COUNT) {
      errors.push(
        `expected exactly ${QUESTION_COUNT} questions, got ${questions.length}`
      );
    }
    const ids = new Set();
    questions.forEach((q, i) => {
      const at = `questions[${i}]`;
      if (!q || typeof q !== "object") {
        errors.push(`${at}: not an object`);
        return;
      }
      for (const f of ["id", "text", "optionA", "optionB"]) {
        if (typeof q[f] !== "string" || q[f].trim() === "") {
          errors.push(`${at}: missing/empty "${f}"`);
        }
      }
      if (typeof q.id === "string") {
        if (ids.has(q.id)) errors.push(`${at}: duplicate id "${q.id}"`);
        ids.add(q.id);
      }
    });
  }

  if (errors.length) fail("questions.json validation failed", errors);
  console.log(
    `✓ questions.json OK — intro + ${questions.length} question(s).`
  );
}

// ---- outcomes.json ------------------------------------------------------
{
  const data = readJson(OUTCOMES_PATH, "outcomes.json");
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

  if (errors.length) fail("outcomes.json validation failed", errors);
  console.log(
    `✓ outcomes.json OK — all ${expected.length} patterns present and valid.`
  );
}
